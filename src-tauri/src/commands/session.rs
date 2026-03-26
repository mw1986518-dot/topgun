//! Tauri command handlers for session management.
//!
//! Covers:
//! - start_session
//! - submit_clarifications (deprecated compatibility command)
//! - continue_problem_brief_dialogue
//! - generate_problem_brief_delivery
//! - select_frameworks
//! - run_reasoning
//! - reset_session

mod parse;
mod prompts;

use self::parse::{
    build_divergence_user_prompt_from_delivery, build_identity_experts_panel_from_frameworks,
    detect_problem_brief_completion,
    generate_framework_recommendations_from_brief, infer_frameworks_from_text,
};
use self::prompts::{
    build_problem_brief_bootstrap_user_prompt, build_problem_brief_context_user_prompt,
    build_problem_brief_dialogue_system_prompt, build_problem_brief_finalize_context_user_prompt,
    build_problem_brief_finalize_user_prompt,
};
use crate::config::load_config;
use crate::engine;
use crate::error::{AppError, AppResult};
use crate::framework::get_all_frameworks_with_custom;
use crate::history;
use crate::history::SessionHistoryEntry;
use crate::llm::{LLMClient, LLMClientConfig, Message};
use crate::state::{ProblemBriefMessage, StateMachine};
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Emitter, Manager, Window};

/// Start a new reasoning session
#[tauri::command]
pub async fn start_session(window: Window, topic: String) -> Result<(), String> {
    let app = window.app_handle();
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();

    {
        let mut sm = state_machine.lock().await;
        sm.start_session(topic.clone());
        sm.log_info("Session", &format!("Started session with topic: {}", topic));
    }

    let config = load_config()?;
    let llm_config = LLMClientConfig::from(&config);
    let client = LLMClient::new(llm_config)?;
    let opening_reply = match client
        .generate_content(
            &config.get_active_model(),
            vec![
                Message::system(build_problem_brief_dialogue_system_prompt().to_string()),
                Message::user(build_problem_brief_bootstrap_user_prompt(&topic, "")),
            ],
            Some(0.7),
            Some(1400),
        )
        .await
    {
        Ok(response) => response
            .choices
            .first()
            .and_then(|c| c.message.as_ref())
            .map(|m| m.content.clone())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| {
                "我先用 4 个关键问题快速校准边界：\n1) 你最想达成的结果是什么（可量化最好）？\n2) 当前最硬的时间、资源、人力约束分别是什么？\n3) 这件事有哪些绝对不能碰的红线？\n4) 如果推进失败，最可能先失控的点在哪里？".to_string()
            }),
        Err(e) => {
            eprintln!(
                "LLM API Request Failed while initializing stage-2 dialogue in start_session: {:?}",
                e
            );
            "我先用 4 个关键问题快速校准边界：\n1) 你最想达成的结果是什么（可量化最好）？\n2) 当前最硬的时间、资源、人力约束分别是什么？\n3) 这件事有哪些绝对不能碰的红线？\n4) 如果推进失败，最可能先失控的点在哪里？".to_string()
        }
    };

    let mut sm_after = state_machine.lock().await;
    sm_after.clarifications.clear();
    sm_after.problem_brief_messages.clear();
    sm_after
        .problem_brief_messages
        .push(ProblemBriefMessage::new("assistant", opening_reply));
    sm_after.problem_brief_ready = false;
    sm_after.reframed_issue = None;
    sm_after.recommended_experts_panel = None;
    sm_after.recommended_frameworks.clear();
    sm_after.custom_user_prompt = None;
    sm_after.advance_phase();
    sm_after.log_info(
        "Session",
        "Skip round-1/2 clarifications and directly enter Gemini-style stage-2 dialogue.",
    );
    window
        .emit("state-update", &*sm_after)
        .map_err(|e| AppError::EventEmit(e.to_string()))?;

    Ok(())
}

/// Deprecated compatibility command.
///
/// 背景：
/// - 旧流程中，前端会调用该命令提交“固定两轮澄清”答案；
/// - 新流程中，阶段二改为持续对话 + 显式点击“生成专家级问题简报”。
///
/// 当前策略：
/// - 保留命令名以兼容旧前端，避免调用方直接报 “command not found”；
/// - 统一返回可读错误，引导升级到新流程；
/// - 计划在 `v0.3.0` 删除该命令。
#[tauri::command]
pub async fn submit_clarifications(
    window: Window,
    _answers: HashMap<String, String>,
) -> Result<(), String> {
    let app = window.app_handle();
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;
    sm.log_warn(
        "Session",
        "[DEPRECATED] submit_clarifications called. This command will be removed in v0.3.0.",
    );

    window
        .emit("state-update", &*sm)
        .map_err(|e| AppError::EventEmit(e.to_string()))?;

    Err("当前版本已取消固定两轮澄清，请直接在阶段二对话区继续补充信息，并在准备好后点击“生成专家级问题简报”。".to_string())
}

/// Continue stage-2 interactive Problem Definer dialogue.
#[tauri::command]
pub async fn continue_problem_brief_dialogue(
    window: Window,
    user_message: String,
) -> Result<(), String> {
    let cleaned_user_message = user_message.trim().to_string();
    if cleaned_user_message.is_empty() {
        return Err("请输入内容后再发送。".to_string());
    }

    let app = window.app_handle();
    let (topic_str, questions_str, prior_messages, already_ready) = {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let sm = state_machine.lock().await;

        if sm.current_phase != crate::state::Phase::FrameworkSelection {
            return Err("当前阶段不支持 Problem Brief 对话。".to_string());
        }

        let questions = sm
            .clarifications
            .iter()
            .map(|q| {
                format!(
                    "Q: {}\nA: {}",
                    q.question,
                    q.answer.as_deref().unwrap_or("(not answered)")
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");

        (
            sm.topic.clone(),
            questions,
            sm.problem_brief_messages.clone(),
            sm.problem_brief_ready,
        )
    };

    if already_ready {
        return Err("简报已生成，你可以直接进入下一步框架选择。".to_string());
    }

    let config = load_config()?;
    let llm_config = LLMClientConfig::from(&config);
    let client = LLMClient::new(llm_config)?;

    // 组装模型输入：固定系统提示 + 稳定上下文 + 历史对话 + 本轮用户消息。
    let mut messages = vec![
        Message::system(build_problem_brief_dialogue_system_prompt().to_string()),
        Message::user(build_problem_brief_context_user_prompt(
            &topic_str,
            &questions_str,
        )),
    ];
    for msg in &prior_messages {
        match msg.role.as_str() {
            "assistant" => messages.push(Message::assistant(msg.content.clone())),
            "user" => messages.push(Message::user(msg.content.clone())),
            _ => {}
        }
    }
    messages.push(Message::user(cleaned_user_message.clone()));

    let response = client
        .generate_content(&config.get_active_model(), messages, Some(0.7), Some(1800))
        .await
        .map_err(|e| format!("阶段二对话调用失败：{}", e))?;
    let assistant_reply = response
        .choices
        .first()
        .and_then(|c| c.message.as_ref())
        .map(|m| m.content.clone())
        .unwrap_or_default();
    if assistant_reply.trim().is_empty() {
        return Err("阶段二对话调用失败：模型返回为空，请重试。".to_string());
    }

    {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        sm.problem_brief_messages
            .push(ProblemBriefMessage::new("user", cleaned_user_message));
        sm.problem_brief_messages
            .push(ProblemBriefMessage::new("assistant", assistant_reply));
        // 关键改造点：普通对话轮次永不自动收口，收口权只交给“显式生成”按钮。
        sm.log_info(
            "Session",
            "Stage2 dialogue turn completed (no auto-finalize; waiting explicit generate action).",
        );

        window
            .emit("state-update", &*sm)
            .map_err(|e| AppError::EventEmit(e.to_string()))?;
    }

    Ok(())
}

/// 显式生成阶段二最终交付（专家级问题简报）。
///
/// 设计意图：
/// 1) 只有用户主动点击“生成专家级问题简报”才允许收口；
/// 2) 普通对话命令不再自动把模型输出当成最终结果，避免提前给结论。
#[tauri::command]
pub async fn generate_problem_brief_delivery(window: Window) -> Result<(), String> {
    let app = window.app_handle();
    let (topic_str, questions_str, prior_messages, already_ready) = {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let sm = state_machine.lock().await;

        if sm.current_phase != crate::state::Phase::FrameworkSelection {
            return Err("当前阶段不支持生成专家级问题简报。".to_string());
        }

        let questions = sm
            .clarifications
            .iter()
            .map(|q| {
                format!(
                    "Q: {}\nA: {}",
                    q.question,
                    q.answer.as_deref().unwrap_or("(not answered)")
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");

        (
            sm.topic.clone(),
            questions,
            sm.problem_brief_messages.clone(),
            sm.problem_brief_ready,
        )
    };

    if already_ready {
        return Err("专家级问题简报已生成，你可以直接进入下一步框架选择。".to_string());
    }

    if prior_messages.is_empty() {
        return Err("请先进行至少一轮问题重塑对话，再生成专家级问题简报。".to_string());
    }

    let config = load_config()?;
    let llm_config = LLMClientConfig::from(&config);
    let client = LLMClient::new(llm_config)?;

    // 组装模型输入：固定系统提示 + 稳定上下文 + 全部历史对话 + 显式“现在收口”指令。
    let mut messages = vec![
        Message::system(build_problem_brief_dialogue_system_prompt().to_string()),
        Message::user(build_problem_brief_finalize_context_user_prompt(
            &topic_str,
            &questions_str,
        )),
    ];
    for msg in &prior_messages {
        match msg.role.as_str() {
            "assistant" => messages.push(Message::assistant(msg.content.clone())),
            "user" => messages.push(Message::user(msg.content.clone())),
            _ => {}
        }
    }
    messages.push(Message::user(
        build_problem_brief_finalize_user_prompt().to_string(),
    ));

    let response = client
        .generate_content(&config.get_active_model(), messages, Some(0.5), Some(2200))
        .await
        .map_err(|e| format!("生成专家级问题简报失败：{}", e))?;
    let assistant_reply = response
        .choices
        .first()
        .and_then(|c| c.message.as_ref())
        .map(|m| m.content.clone())
        .unwrap_or_default();
    if assistant_reply.trim().is_empty() {
        return Err("生成专家级问题简报失败：模型返回为空，请重试。".to_string());
    }

    let delivery = detect_problem_brief_completion(&assistant_reply).ok_or_else(|| {
        "本次输出未满足“专家级问题简报”格式。请先补充关键信息后重试。".to_string()
    })?;

    let valid_framework_ids: HashSet<String> = get_all_frameworks_with_custom()
        .into_iter()
        .map(|f| f.id)
        .collect();
    // 第二次模型调用：专门负责从框架库中推荐最匹配的 3~5 个框架。
    // 这样“问题重塑”和“框架推荐”职责分离，互不污染。
    let mut recommended_frameworks = generate_framework_recommendations_from_brief(
        &client,
        &config.get_active_model(),
        &topic_str,
        &questions_str,
        &delivery.brief_markdown,
        &valid_framework_ids,
    )
    .await;
    if recommended_frameworks.is_empty() {
        // 兜底：如果第二次调用失败，再从简报正文中做一次轻量关键词推断。
        recommended_frameworks = infer_frameworks_from_text(&delivery.brief_markdown, &valid_framework_ids);
    }
    recommended_frameworks.truncate(5);
    let recommended_experts_panel =
        build_identity_experts_panel_from_frameworks(&recommended_frameworks);

    {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;

        // 记录这次“显式收口”的触发动作，方便用户回看历史对话。
        sm.problem_brief_messages.push(ProblemBriefMessage::new(
            "user",
            "[系统操作] 用户点击「生成专家级问题简报」。",
        ));
        sm.problem_brief_messages
            .push(ProblemBriefMessage::new("assistant", assistant_reply));

        sm.problem_brief_ready = true;
        sm.reframed_issue = Some(delivery.brief_markdown.clone());
        sm.recommended_experts_panel = Some(recommended_experts_panel);
        sm.recommended_frameworks = recommended_frameworks;
        // 这里直接写入“可编辑正文”：
        // - 原始问题
        // - AI 重塑议题
        // 不带推荐专家段，避免把专家建议混入后续框架执行提示词。
        sm.custom_user_prompt = Some(build_divergence_user_prompt_from_delivery(
            &topic_str,
            &delivery.brief_markdown,
        ));
        sm.log_info(
            "Session",
            "Stage2 finalized by explicit user action: expert-level problem brief generated.",
        );

        window
            .emit("state-update", &*sm)
            .map_err(|e| AppError::EventEmit(e.to_string()))?;
    }

    Ok(())
}

/// Select frameworks for reasoning
#[tauri::command]
pub async fn select_frameworks(
    window: Window,
    framework_ids: Vec<String>,
    custom_user_prompt: Option<String>,
) -> Result<(), String> {
    let app = window.app_handle();
    let valid_framework_ids: HashSet<String> = get_all_frameworks_with_custom()
        .into_iter()
        .map(|f| f.id)
        .collect();
    let filtered_framework_ids: Vec<String> = framework_ids
        .into_iter()
        .filter(|id| valid_framework_ids.contains(id))
        .collect();
    if filtered_framework_ids.is_empty() {
        return Err(AppError::EngineNoFrameworks.into());
    }

    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;
    if sm.reframed_issue.as_deref().unwrap_or("").trim().is_empty()
        || sm
            .recommended_experts_panel
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
    {
        return Err(
            "请先在阶段二点击“生成专家级问题简报”，完成重塑议题与框架推荐后再锁定框架。"
                .to_string(),
        );
    }
    sm.select_frameworks(filtered_framework_ids.clone());
    // 允许用户在锁定框架前手动编辑“发散阶段 user 指令”。
    // 空字符串按“未设置”处理，避免无意义覆盖。
    sm.custom_user_prompt = custom_user_prompt
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    sm.log_info(
        "Session",
        &format!("Selected {} frameworks", filtered_framework_ids.len()),
    );
    sm.advance_phase();
    window
        .emit("state-update", &*sm)
        .map_err(|e| AppError::EventEmit(e.to_string()))?;

    Ok(())
}

/// Run the reasoning process (Phase 1-4)
#[tauri::command]
pub async fn run_reasoning(app: AppHandle) -> Result<(), String> {
    engine::execute_reasoning(app.clone()).await?;
    if let Err(err) = persist_current_session_history(&app).await {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        sm.log_error(
            "History",
            &format!("Failed to persist session history: {}", err),
        );
        let _ = app.emit("state-update", &*sm);
        return Err(String::from(err));
    }
    Ok(())
}

/// Get current state
#[tauri::command]
pub async fn get_state(app: AppHandle) -> Result<StateMachine, String> {
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let sm = state_machine.lock().await;
    Ok(sm.clone())
}

/// Reset session
#[tauri::command]
pub async fn reset_session(app: AppHandle) -> Result<(), String> {
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;
    *sm = StateMachine::new();
    sm.log_info("Session", "Session reset");
    app.emit("state-update", &*sm)
        .map_err(|e| AppError::EventEmit(e.to_string()))?;
    Ok(())
}

// Internal helpers

async fn persist_current_session_history(app: &AppHandle) -> AppResult<()> {
    let snapshot = {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let sm = state_machine.lock().await;
        if sm
            .consensus_output
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
        {
            return Ok(());
        }
        sm.clone()
    };

    let model = load_config()
        .map(|c| c.get_active_model())
        .unwrap_or_else(|_| "unknown".to_string());
    let entry = SessionHistoryEntry::new(model, snapshot);
    history::append_history_entry(entry)
}
