//! Application-wide structured error types.
//!
//! All modules should use `AppError` variants instead of bare `String` errors.
//! Tauri commands convert `AppError → String` via the `Into<String>` blanket impl
//! so the IPC signature stays `Result<T, String>`.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    // ── LLM / HTTP ─────────────────────────────────────────────────────────
    #[error("HTTP client construction failed: {0}")]
    HttpClientBuild(String),

    #[error("LLM request failed (model={model}): {reason}")]
    LlmRequest { model: String, reason: String },

    #[error("LLM response parsing failed: {0}")]
    LlmParse(String),

    // ── Config ──────────────────────────────────────────────────────────────
    #[error("Config validation error: {0}")]
    ConfigValidation(String),

    #[error("Config file I/O error: {0}")]
    ConfigIo(#[from] std::io::Error),

    #[error("Config JSON serialization error: {0}")]
    ConfigJson(#[from] serde_json::Error),

    #[error("Config secret encryption/decryption error: {0}")]
    ConfigCrypto(String),

    // ── Engine ──────────────────────────────────────────────────────────────
    #[error("Engine is already running — wait for current session to finish")]
    EngineAlreadyRunning,

    #[error("Cannot start engine in phase '{phase}': {reason}")]
    EngineInvalidPhase { phase: String, reason: String },

    #[error("No frameworks selected before starting reasoning")]
    EngineNoFrameworks,

    // ── Framework ──────────────────────────────────────────────────────────
    #[error("Framework '{id}' not found")]
    FrameworkNotFound { id: String },

    #[error("Framework ID '{id}' already exists")]
    FrameworkDuplicate { id: String },

    #[error("Framework storage error: {0}")]
    FrameworkStorage(String),

    // ── History ─────────────────────────────────────────────────────────────
    #[error("History entry '{id}' not found")]
    HistoryEntryNotFound { id: String },

    #[error("History file read error: {0}")]
    HistoryRead(String),

    #[error("History file write error: {0}")]
    HistoryWrite(String),

    // ── Export ──────────────────────────────────────────────────────────────
    #[error("Export cancelled by user")]
    ExportCancelled,

    #[error("Export write failed: {0}")]
    ExportWrite(String),

    // ── Tauri ───────────────────────────────────────────────────────────────
    #[error("Tauri event emit failed: {0}")]
    EventEmit(String),

    // ── Generic ─────────────────────────────────────────────────────────────
    #[error("{0}")]
    Other(String),
}

impl AppError {
    /// Convenience constructor for a plain string error (migration aid).
    pub fn other(msg: impl Into<String>) -> Self {
        Self::Other(msg.into())
    }
}

/// Tauri command handlers return `Result<T, String>`.
/// This blanket conversion lets you use `?` with `AppError` in command fns.
impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

/// Shared result alias used by backend modules.
pub type AppResult<T> = Result<T, AppError>;
