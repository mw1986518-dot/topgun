//! Tauri command handlers for action plan generation.
//!
//! Covers:
//! - start_action_plan: 分析全量上下文，生成问题列表
//! - answer_action_plan_question: 回答问题
//! - generate_action_plan: 生成落地方案
//! - cancel_action_plan: 取消流程

use crate::config::load_config;
use crate::error::{AppError, AppResult};
use crate::llm::{LLMClient, LLMClientConfig, Message};
use crate::state::{ActionPlanQuestion, StateMachine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{Emitter, Manager, Window};

// ========== 命令实现 ==========

/// 开始落地方案流程 - 分析全量上下文，生成问题列表
#[tauri::command]
pub async fn start_action_plan(window: Window) -> Result<Vec<ActionPlanQuestion>, String> {
    let app = window.app_handle();
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();

    // 1. 收集全量上下文
    let context = {
        let sm = state_machine.lock().await;
        ActionPlanContext {
            original_topic: sm.topic.clone(),
            problem_brief_messages: sm.problem_brief_messages.clone(),
            reframed_issue: sm.reframed_issue.clone(),
            recommended_experts_panel: sm.recommended_experts_panel.clone(),
            consensus_output: sm.consensus_output.clone(),
        }
    };

    // 检查是否有共识输出
    if context.consensus_output.is_none() || context.consensus_output.as_ref().unwrap().is_empty()
    {
        return Err("请先生成共识报告后再生成落地方案。".to_string());
    }

    // 2. 调用 LLM 分析并生成问题
    let config = load_config()?;
    let llm_config = LLMClientConfig::from(&config);
    let client = LLMClient::new(llm_config)?;

    let questions = analyze_and_generate_questions(&client, &config.get_active_model(), &context)
        .await
        .map_err(|e| format!("分析全量上下文失败: {}", e))?;

    // 3. 更新状态
    {
        let mut sm = state_machine.lock().await;
        sm.start_action_plan(questions.clone());
        sm.log_info("ActionPlan", &format!("Generated {} questions", questions.len()));
        window
            .emit("state-update", &*sm)
            .map_err(|e| AppError::EventEmit(e.to_string()))?;
    }

    Ok(questions)
}

/// 回答问题
#[tauri::command]
pub async fn answer_action_plan_question(
    window: Window,
    key: String,
    answer: String,
) -> Result<Option<ActionPlanQuestion>, String> {
    let app = window.app_handle();
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();

    let (next_question, state_snapshot) = {
        let mut sm = state_machine.lock().await;
        sm.action_plan_answers.insert(key.clone(), answer.clone());
        sm.current_action_plan_question_index = sm.current_action_plan_question_index.saturating_add(1);
        sm.log_info(
            "ActionPlan",
            &format!("Answered question '{}': {}", key, answer),
        );

        let next = if sm.current_action_plan_question_index < sm.action_plan_questions.len() {
            sm.action_plan_questions.get(sm.current_action_plan_question_index).cloned()
        } else {
            sm.log_info("ActionPlan", "All questions answered");
            None
        };

        (next, sm.clone())
    };

    let _ = window.emit("state-update", state_snapshot);

    Ok(next_question)
}

/// 生成落地方案
#[tauri::command]
pub async fn generate_action_plan(window: Window) -> Result<String, String> {
    let app = window.app_handle();
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();

    // 1. 收集全量上下文和答案
    let (context, answers) = {
        let sm = state_machine.lock().await;
        let context = ActionPlanContext {
            original_topic: sm.topic.clone(),
            problem_brief_messages: sm.problem_brief_messages.clone(),
            reframed_issue: sm.reframed_issue.clone(),
            recommended_experts_panel: sm.recommended_experts_panel.clone(),
            consensus_output: sm.consensus_output.clone(),
        };
        let answers = sm.action_plan_answers.clone();
        (context, answers)
    };

    if answers.is_empty() {
        return Err("请先回答问题后再生成落地方案。".to_string());
    }

    // 2. 调用 LLM 生成落地方案
    let config = load_config()?;
    let llm_config = LLMClientConfig::from(&config);
    let client = LLMClient::new(llm_config)?;

    let action_plan = generate_action_plan_content(&client, &config.get_active_model(), &context, &answers)
        .await
        .map_err(|e| format!("生成落地方案失败: {}", e))?;

    // 3. 更新状态
    {
        let mut sm = state_machine.lock().await;
        sm.set_action_plan(action_plan.clone());
        sm.log_info("ActionPlan", "Action plan generated successfully");
        window
            .emit("state-update", &*sm)
            .map_err(|e| AppError::EventEmit(e.to_string()))?;
    }

    Ok(action_plan)
}

/// 获取落地方案状态
#[tauri::command]
pub async fn get_action_plan_state(window: Window) -> Result<ActionPlanState, String> {
    let app = window.app_handle();
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();

    let sm = state_machine.lock().await;
    Ok(ActionPlanState {
        in_progress: sm.action_plan_in_progress,
        questions: sm.action_plan_questions.clone(),
        current_index: sm.current_action_plan_question_index,
        answers: sm.action_plan_answers.clone(),
        action_plan: sm.action_plan.clone(),
    })
}

/// 取消落地方案流程
#[tauri::command]
pub async fn cancel_action_plan(window: Window) -> Result<(), String> {
    let app = window.app_handle();
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();

    let mut sm = state_machine.lock().await;
    sm.cancel_action_plan();
    sm.log_info("ActionPlan", "Action plan generation cancelled");

    window
        .emit("state-update", &*sm)
        .map_err(|e| AppError::EventEmit(e.to_string()))?;

    Ok(())
}

// ========== 辅助结构体 ==========

/// 全量上下文
#[derive(Debug, Clone)]
struct ActionPlanContext {
    original_topic: String,
    problem_brief_messages: Vec<crate::state::ProblemBriefMessage>,
    reframed_issue: Option<String>,
    recommended_experts_panel: Option<String>,
    consensus_output: Option<String>,
}

/// 落地方案状态（返回给前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionPlanState {
    pub in_progress: bool,
    pub questions: Vec<ActionPlanQuestion>,
    pub current_index: usize,
    pub answers: HashMap<String, String>,
    pub action_plan: Option<String>,
}

// ========== LLM 调用 ==========

/// 分析全量上下文并生成问题列表
async fn analyze_and_generate_questions(
    client: &LLMClient,
    model: &str,
    context: &ActionPlanContext,
) -> AppResult<Vec<ActionPlanQuestion>> {
    let system_prompt = build_question_generation_system_prompt();
    let user_prompt = build_question_generation_user_prompt(context);

    let response = client
        .generate_content(
            model,
            vec![Message::system(system_prompt), Message::user(user_prompt)],
            Some(0.7),
            Some(2000),
        )
        .await?;

    let content = response
        .choices
        .first()
        .and_then(|c| c.message.as_ref())
        .map(|m| m.content.clone())
        .unwrap_or_default();

    parse_questions_from_response(&content)
}

/// 生成落地方案内容
async fn generate_action_plan_content(
    client: &LLMClient,
    model: &str,
    context: &ActionPlanContext,
    answers: &HashMap<String, String>,
) -> AppResult<String> {
    let system_prompt = build_action_plan_system_prompt();
    let user_prompt = build_action_plan_user_prompt(context, answers);

    let response = client
        .generate_content(
            model,
            vec![Message::system(system_prompt), Message::user(user_prompt)],
            Some(0.7),
            Some(4000),
        )
        .await?;

    let content = response
        .choices
        .first()
        .and_then(|c| c.message.as_ref())
        .map(|m| m.content.clone())
        .unwrap_or_default();

    Ok(content)
}

// ========== Prompt 构建 ==========

fn build_question_generation_system_prompt() -> String {
    r#"你是落地执行顾问。你需要分析用户的完整决策过程，识别生成落地方案所需的关键信息。

## 任务

分析提供的全量上下文，回答：
1. 用户真正想解决什么问题？
2. 共识输出提出了哪些行动方案？
3. 这些行动方案要落地执行，还缺少哪些关键信息？

## 输出格式

请严格按照以下 JSON 格式输出：

```json
{
  "user_goal": "用户的核心目标（一句话）",
  "actions_to_implement": [
    {
      "action": "行动项名称",
      "description": "行动项描述",
      "missing_info": ["缺失信息1", "缺失信息2"]
    }
  ],
  "questions": [
    {
      "key": "参数标识（英文小写下划线）",
      "question": "问用户的具体问题",
      "reason": "为什么需要这个参数",
      "related_action": "关联的行动项名称"
    }
  ]
}
```

## 要求

1. 每个问题必须关联到具体的行动项
2. 只问对落地执行有实质性影响的问题
3. 问题数量根据实际需求决定，不设固定范围
4. 问题要具体、易懂、好回答
5. 利用全量上下文已有的信息，不重复询问"#
        .to_string()
}

fn build_question_generation_user_prompt(context: &ActionPlanContext) -> String {
    let mut prompt = String::new();

    prompt.push_str("## 原始问题\n\n");
    prompt.push_str(&context.original_topic);
    prompt.push_str("\n\n");

    if !context.problem_brief_messages.is_empty() {
        prompt.push_str("## 问题重塑对话记录\n\n");
        for msg in &context.problem_brief_messages {
            prompt.push_str(&format!("- {} ({}): {}\n", msg.role, msg.role, msg.content));
        }
        prompt.push_str("\n");
    }

    if let Some(ref reframed) = context.reframed_issue {
        prompt.push_str("## 专家级问题简报\n\n");
        prompt.push_str(reframed);
        prompt.push_str("\n\n");
    }

    if let Some(ref consensus) = context.consensus_output {
        prompt.push_str("## 共识输出\n\n");
        prompt.push_str(consensus);
        prompt.push_str("\n\n");
    }

    prompt.push_str("请分析以上全量上下文，生成落地所需的问题列表。");
    prompt
}

fn build_action_plan_system_prompt() -> String {
    r#"你是落地执行顾问。根据全量上下文和用户提供的参数，生成可直接执行的落地方案。

## 与共识报告的关系

共识报告回答"做什么、为什么"——确定了战略方向和决策依据。
落地方案回答"怎么做、谁来做、何时做完"——将共识转化为可执行的行动项。

**重要**：落地方案必须与共识报告的战略方向保持一致，只在执行层面进行细化，不得偏离或推翻共识确定的原则。

## 输出格式

生成一份可直接执行的落地方案，使用 Markdown 格式：

### 📋 落地方案

#### 一、方案概述
- 一句话说明本方案要达成什么目标（呼应共识报告的"一句话结论"）
- 简述本方案与共识核心原则的对应关系

#### 二、行动清单

| 序号 | 行动项 | 具体内容 | 负责人 | 时间节点 | 验收标准 |
|------|--------|----------|--------|----------|----------|
| 1 | ... | ... | ... | ... | ... |

#### 三、风险兜底

| 风险项 | 触发条件 | 兜底方案 | 截止日期 |
|--------|----------|----------|----------|
| ... | ... | ... | ... |

#### 四、资源需求
- 人力：...
- 预算：...
- 工具：...

#### 五、下一步立即行动
- 今天就可以做的第一件事：...

## 要求

1. 所有数字必须具体（不出现"约"、"大概"等模糊词）
2. 所有时间必须明确日期或相对时间
3. 每个行动项必须有负责人和验收标准
4. 风险必须有触发条件和截止日期
5. 保持战略方向不变，只细化执行细节
6. 行动项要能追溯到共识报告的核心原则"#
        .to_string()
}

fn build_action_plan_user_prompt(
    context: &ActionPlanContext,
    answers: &HashMap<String, String>,
) -> String {
    let mut prompt = String::new();

    prompt.push_str("## 全量上下文\n\n");

    prompt.push_str("### 原始问题\n");
    prompt.push_str(&context.original_topic);
    prompt.push_str("\n\n");

    if let Some(ref reframed) = context.reframed_issue {
        prompt.push_str("### 问题简报\n");
        prompt.push_str(reframed);
        prompt.push_str("\n\n");
    }

    if let Some(ref consensus) = context.consensus_output {
        prompt.push_str("### 共识输出\n");
        prompt.push_str(consensus);
        prompt.push_str("\n\n");
    }

    prompt.push_str("## 用户提供的参数\n\n");
    for (key, value) in answers {
        prompt.push_str(&format!("- {}: {}\n", key, value));
    }
    prompt.push_str("\n");

    prompt.push_str("请根据以上信息生成可执行的落地方案。");
    prompt
}

// ========== 响应解析 ==========

#[derive(Debug, Deserialize)]
struct QuestionGenerationResponse {
    #[serde(default)]
    user_goal: String,
    #[serde(default)]
    actions_to_implement: Vec<ActionToImplement>,
    #[serde(default)]
    questions: Vec<ActionPlanQuestion>,
}

#[derive(Debug, Deserialize)]
struct ActionToImplement {
    #[serde(default)]
    action: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    missing_info: Vec<String>,
}

fn parse_questions_from_response(content: &str) -> AppResult<Vec<ActionPlanQuestion>> {
    // 尝试提取 JSON 块
    let json_content = extract_json_from_markdown(content).unwrap_or_else(|| content.to_string());

    // 尝试解析 JSON
    if let Ok(response) = serde_json::from_str::<QuestionGenerationResponse>(&json_content) {
        if !response.questions.is_empty() {
            return Ok(response.questions);
        }
    }

    // Fallback: 尝试从文本中提取问题
    Ok(extract_questions_from_text(content))
}

fn extract_json_from_markdown(content: &str) -> Option<String> {
    // 查找 ```json ... ``` 块
    let start_marker = "```json";
    let end_marker = "```";

    let start = content.find(start_marker)?;
    let content_after_start = &content[start + start_marker.len()..];
    let end = content_after_start.find(end_marker)?;
    let json = content_after_start[..end].trim();

    Some(json.to_string())
}

fn extract_questions_from_text(content: &str) -> Vec<ActionPlanQuestion> {
    // 简单的文本解析 fallback
    let mut questions = Vec::new();
    let mut key_counter = 0;

    for line in content.lines() {
        let line = line.trim();
        // 查找类似 "问题：" 或 "Q:" 开头的行
        if line.starts_with("问题：") || line.starts_with("问：") || line.starts_with("Q:") {
            let question_text = line
                .trim_start_matches("问题：")
                .trim_start_matches("问：")
                .trim_start_matches("Q:")
                .trim();

            if !question_text.is_empty() {
                key_counter += 1;
                questions.push(ActionPlanQuestion::new(
                    format!("param_{}", key_counter),
                    question_text,
                    "用于生成落地方案",
                    "综合方案",
                ));
            }
        }
    }

    // 如果没有找到任何问题，返回默认问题
    if questions.is_empty() {
        questions.push(ActionPlanQuestion::new(
            "default_budget",
            "预期的预算范围是多少？",
            "确定资源分配",
            "资源规划",
        ));
    }

    questions
}