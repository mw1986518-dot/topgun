//! AI 认知提纯器 (Idea Refinery)
//!
//! 基于 Tauri + React 的多智能体并发推演决策工具。
//!
//! 模块布局：
//! - `commands/`  — 所有 Tauri IPC command handler
//! - `engine/`    — 多智能体并发推演引擎
//! - `config/`    — 本地配置持久化
//! - `framework/` — 内置 & 自定义思维框架
//! - `history/`   — 会话历史快照
//! - `llm/`       — LLM API 客户端（重试 / Fallback / Gemini 适配）
//! - `state/`     — 状态机（Phase / Agent / IpcLog）
//! - `utils/`     — 纯工具函数（文本处理、JSON 提取等）

pub mod commands;
pub mod config;
pub mod engine;
pub mod error;
pub mod framework;
pub mod history;
pub mod llm;
pub mod state;
pub mod utils;

use commands::*;
use state::StateMachine;
use std::sync::atomic::AtomicBool;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(tokio::sync::Mutex::new(StateMachine::new()))
        .manage(AtomicBool::new(false))
        .invoke_handler(tauri::generate_handler![
            // Settings & connection
            get_settings,
            save_settings,
            test_llm_connection,
            // Frameworks
            get_frameworks,
            add_custom_framework,
            update_custom_framework,
            delete_custom_framework,
            // Session lifecycle
            start_session,
            submit_clarifications,
            continue_problem_brief_dialogue,
            generate_problem_brief_delivery,
            select_frameworks,
            run_reasoning,
            get_state,
            reset_session,
            // History
            get_history_entries,
            load_history_entry,
            delete_history_entry,
            clear_history_entries,
            // Export
            export_consensus_markdown,
            // Action Plan (落地方案)
            start_action_plan,
            answer_action_plan_question,
            generate_action_plan,
            get_action_plan_state,
            cancel_action_plan,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
