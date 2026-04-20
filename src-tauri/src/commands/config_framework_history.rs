//! Tauri command handlers for settings, framework management,
//! history management, and file export.

use crate::config::{load_config, save_config, AppConfig};
use crate::error::AppError;
use crate::framework::{
    get_all_frameworks_with_custom, get_builtin_frameworks, load_custom_frameworks,
    save_custom_frameworks, Framework,
};
use crate::history::{self, SessionHistoryEntry};
use crate::llm::{LLMClient, LLMClientConfig, Message};
use crate::state::StateMachine;
use crate::utils::file_timestamp;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

/// Get application settings.
#[tauri::command]
pub async fn get_settings() -> Result<AppConfig, String> {
    load_config().map_err(Into::into)
}

/// Save application settings.
#[tauri::command]
pub async fn save_settings(config: AppConfig) -> Result<(), String> {
    config.validate().map_err(String::from)?;
    save_config(&config).map_err(Into::into)
}

/// Test LLM connection with a fast timeout.
#[tauri::command]
pub async fn test_llm_connection(
    config: AppConfig,
    provider_id: Option<String>,
) -> Result<String, String> {
    config.validate_provider_catalog().map_err(String::from)?;

    let requested_id = provider_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .unwrap_or(&config.selected_provider_id);
    let provider = config
        .find_provider(requested_id)
        .ok_or_else(|| AppError::ConfigValidation("指定供应商不存在".to_string()))
        .map_err(String::from)?;
    provider
        .validate_connection_fields()
        .map_err(String::from)?;

    let mut llm_config = LLMClientConfig::from(&config);
    llm_config.timeout_seconds = 15;
    llm_config.enable_retry = false;
    llm_config.max_retries = 0;
    llm_config.retry_delay_ms = 0;

    let client = LLMClient::new(llm_config)?;
    let messages = vec![Message::user("Hello")];

    match client
        .generate_content_with_provider(
            &provider.base_url,
            &provider.api_key,
            &provider.model,
            messages,
            None,
            Some(10),
        )
        .await
    {
        Ok(_) => Ok(format!("供应商「{}」连通性测试成功", provider.name)),
        Err(e) => Err(format!("供应商「{}」连通性测试失败: {}", provider.name, e)),
    }
}

/// Get all frameworks (built-in + custom).
#[tauri::command]
pub async fn get_frameworks() -> Result<Vec<Framework>, String> {
    Ok(get_all_frameworks_with_custom())
}

/// Add a custom framework.
#[tauri::command]
pub async fn add_custom_framework(framework: Framework) -> Result<(), String> {
    let mut custom = load_custom_frameworks();
    let framework_id = framework.id.clone();

    if custom.iter().any(|f| f.id == framework_id)
        || get_builtin_frameworks()
            .iter()
            .any(|f| f.id == framework_id)
    {
        return Err(AppError::FrameworkDuplicate { id: framework_id }.into());
    }

    custom.push(framework);
    save_custom_frameworks(&custom).map_err(Into::into)
}

/// Update a custom framework.
#[tauri::command]
pub async fn update_custom_framework(framework: Framework) -> Result<(), String> {
    let mut custom = load_custom_frameworks();

    if let Some(existing) = custom.iter_mut().find(|f| f.id == framework.id) {
        *existing = framework;
        save_custom_frameworks(&custom).map_err(Into::into)
    } else {
        Err(AppError::FrameworkNotFound {
            id: framework.id.clone(),
        }
        .into())
    }
}

/// Delete a custom framework.
#[tauri::command]
pub async fn delete_custom_framework(id: String) -> Result<(), String> {
    let mut custom = load_custom_frameworks();
    let len_before = custom.len();
    custom.retain(|f| f.id != id);

    if custom.len() == len_before {
        return Err(AppError::FrameworkNotFound { id }.into());
    }

    save_custom_frameworks(&custom).map_err(Into::into)
}

/// List completed session history.
#[tauri::command]
pub async fn get_history_entries() -> Result<Vec<SessionHistoryEntry>, String> {
    history::load_history_entries().map_err(Into::into)
}

/// Load a history snapshot into current workspace state.
#[tauri::command]
pub async fn load_history_entry(app: AppHandle, id: String) -> Result<StateMachine, String> {
    let entry = history::find_history_entry(&id)
        .map_err(String::from)?
        .ok_or_else(|| AppError::HistoryEntryNotFound { id: id.clone() })
        .map_err(String::from)?;

    let state_machine = app.state::<tokio::sync::Mutex<StateMachine>>();
    let mut sm = state_machine.lock().await;
    *sm = entry.state;
    sm.log_info("History", &format!("Loaded history entry {}", id));
    app.emit("state-update", &*sm)
        .map_err(|e| String::from(AppError::EventEmit(e.to_string())))?;
    Ok(sm.clone())
}

/// Delete one history snapshot.
#[tauri::command]
pub async fn delete_history_entry(id: String) -> Result<(), String> {
    history::delete_history_entry(&id).map_err(Into::into)
}

/// Clear all history snapshots.
#[tauri::command]
pub async fn clear_history_entries() -> Result<(), String> {
    history::clear_history_entries().map_err(Into::into)
}

/// Export consensus markdown via native save dialog.
#[tauri::command]
pub async fn export_consensus_markdown(app: AppHandle, content: String) -> Result<String, String> {
    if content.trim().is_empty() {
        return Err(AppError::other("导出内容为空").into());
    }

    let default_name = format!("consensus-{}.md", file_timestamp());

    let file_path = app
        .dialog()
        .file()
        .set_title("导出 Markdown")
        .set_file_name(&default_name)
        .add_filter("Markdown", &["md"])
        .blocking_save_file()
        .ok_or(AppError::ExportCancelled)
        .map_err(String::from)?;

    let path = file_path
        .as_path()
        .ok_or_else(|| AppError::other("无效的保存路径"))
        .map_err(String::from)?
        .to_path_buf();

    std::fs::write(&path, content)
        .map_err(|e| String::from(AppError::ExportWrite(e.to_string())))?;

    Ok(path.to_string_lossy().to_string())
}
