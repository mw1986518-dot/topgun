//! Multi-agent concurrent reasoning engine.
//!
//! Pipeline:
//! 1) Divergence (parallel)
//! 2) Examination (parallel cross-check)
//! 3) Patching (parallel revise)
//! 4) Consensus (single synthesis)
//! 5) Context truncation to prevent token overflow

mod analysis;
mod pipeline;
mod tests;

use crate::config::{load_config, AppConfig};
use crate::error::{AppError, AppResult};
use crate::framework::{get_all_frameworks_with_custom, Framework};
use crate::llm::LLMClient;
use crate::state::{AgentStatus, Phase, StateMachine, ToleratedRiskItem};
use std::collections::BTreeSet;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, Manager};

use self::analysis::normalize_objection_for_risk_display;
use self::pipeline::{run_consensus, run_divergence, run_examination, run_patching};

#[allow(unused_imports)]
pub(crate) use self::analysis::{
    parse_examination_response_with_repair, truncate_context, ExaminationParseMode,
    MAX_AGENT_CONTENT_CHARS,
};
#[allow(unused_imports)]
pub(crate) use self::pipeline::Synthesizer;

/// Run the full reasoning pipeline (phase 1-4).
pub async fn execute_reasoning(app: AppHandle) -> AppResult<()> {
    let running = app.state::<std::sync::atomic::AtomicBool>();
    if running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(AppError::EngineAlreadyRunning);
    }

    if let Err(error) = set_reasoning_running_state(&app, true).await {
        running.store(false, Ordering::SeqCst);
        return Err(error);
    }

    let result = execute_reasoning_inner(app.clone()).await;
    let clear_state_result = set_reasoning_running_state(&app, false).await;
    running.store(false, Ordering::SeqCst);

    if let Err(error) = clear_state_result {
        if result.is_ok() {
            return Err(error);
        }
    }

    result
}

async fn set_reasoning_running_state(app: &AppHandle, is_running: bool) -> AppResult<()> {
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;

    sm.is_reasoning_running = is_running;
    if is_running {
        sm.mark_reasoning_started();
    } else {
        sm.mark_reasoning_completed();
    }
    sm.log_info(
        "Engine",
        if is_running {
            "Reasoning engine lock acquired"
        } else {
            "Reasoning engine lock released"
        },
    );

    app.emit("state-update", &*sm)
        .map_err(|e| AppError::EventEmit(e.to_string()))?;
    Ok(())
}

async fn execute_reasoning_inner(app: AppHandle) -> AppResult<()> {
    ensure_reasoning_can_start(&app).await?;

    let (prompt_ctx, custom_user_prompt, frameworks, config) = prepare_context(&app).await?;
    let mut llm_config = crate::llm::LLMClientConfig::from(&config);
    llm_config.timeout_seconds = 120;

    let client = std::sync::Arc::new(LLMClient::new(llm_config)?);
    let model_name = config.get_active_model();

    run_divergence(
        &app,
        1,
        &frameworks,
        &client,
        &model_name,
        &prompt_ctx,
        custom_user_prompt.as_deref(),
    )
    .await?;

    // 从配置读取 max_iterations 并应用到状态机
    let max_iterations = {
        let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
        let mut sm = state_machine.lock().await;
        sm.max_iterations = config.max_iterations.clamp(3, 6);
        sm.max_iterations
    };

    for round in 1..=max_iterations {
        set_iteration_round(&app, round).await?;

        let has_objections = run_examination(&app, &frameworks, &client, &model_name).await?;
        if !has_objections {
            break;
        }

        if round >= max_iterations {
            summarize_remaining_objections_as_risks(&app).await?;
            break;
        }

        run_patching(&app, &frameworks, &client, &model_name).await?;
    }

    run_consensus(&app, &client, &model_name).await?;
    Ok(())
}

async fn ensure_reasoning_can_start(app: &AppHandle) -> AppResult<()> {
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let sm = state_machine.lock().await;

    if !matches!(
        sm.current_phase,
        Phase::Divergence | Phase::Examination | Phase::Patch
    ) {
        return Err(AppError::EngineInvalidPhase {
            phase: sm.current_phase.display_name().to_string(),
            reason: "current phase does not allow reasoning".to_string(),
        });
    }

    if sm.agents.is_empty() {
        return Err(AppError::EngineNoFrameworks);
    }

    Ok(())
}

async fn set_iteration_round(app: &AppHandle, round: u32) -> AppResult<()> {
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;

    sm.iteration_count = round;
    sm.log_info("Engine", &format!("Starting iteration round {}", round));

    app.emit("state-update", &*sm)
        .map_err(|e| AppError::EventEmit(e.to_string()))?;
    Ok(())
}

async fn summarize_remaining_objections_as_risks(app: &AppHandle) -> AppResult<()> {
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;

    // 关键改造点：
    // 只汇总“当前状态仍为 Objection”的代理，避免把历史已修补通过的旧异议再次写入容忍风险。
    let unresolved_objections = sm
        .agents
        .iter()
        .filter(|(_, agent)| agent.status == AgentStatus::Objection)
        .flat_map(|(framework_id, agent)| {
            agent
                .objections
                .iter()
                .map(move |objection| (framework_id.clone(), objection.clone()))
        })
        .collect::<Vec<_>>();

    if unresolved_objections.is_empty() {
        return Ok(());
    }

    let mut dedup_keys = BTreeSet::new();
    for (framework_id, objection) in unresolved_objections {
        let items = normalize_objection_for_risk_display(&objection);
        for item in items {
            let dedup_key = format!("{}|{}|{}", framework_id, item.risk_summary, item.evidence);
            if !dedup_keys.insert(dedup_key) {
                continue;
            }

            sm.add_tolerated_risk(ToleratedRiskItem::new(
                framework_id.clone(),
                item.risk_summary,
                item.evidence,
                item.next_action,
            ));
        }
    }

    sm.log_warn(
        "Engine",
        "Reached maximum iterations; remaining objections moved to tolerated risks",
    );

    app.emit("state-update", &*sm)
        .map_err(|e| AppError::EventEmit(e.to_string()))?;
    Ok(())
}

async fn prepare_context(
    app: &AppHandle,
) -> AppResult<(String, Option<String>, Vec<Framework>, AppConfig)> {
    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;

    sm.current_phase = Phase::Divergence;
    sm.log_info("Engine", "Starting phase 1: divergence");
    app.emit("state-update", &*sm)
        .map_err(|e| AppError::EventEmit(e.to_string()))?;

    let all_frameworks = get_all_frameworks_with_custom();
    let frameworks = all_frameworks
        .into_iter()
        .filter(|f| sm.selected_frameworks.contains(&f.id))
        .collect::<Vec<_>>();
    if frameworks.is_empty() {
        return Err(AppError::EngineNoFrameworks);
    }

    let config = load_config()?;

    let mut prompt_ctx = format!("Original topic:\n{}\n\n", sm.topic);
    if let Some(ref reframed) = sm.reframed_issue {
        prompt_ctx = format!("Reframed issue:\n{}\n\n", reframed);
    }

    let clarifications = sm
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
        .join("\n");

    if !clarifications.is_empty() {
        prompt_ctx.push_str(&format!("Clarification context:\n{}", clarifications));
    }

    Ok((
        prompt_ctx,
        sm.custom_user_prompt.clone(),
        frameworks,
        config,
    ))
}
