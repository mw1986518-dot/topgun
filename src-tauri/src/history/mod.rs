//! Session history storage.
//!
//! Stores completed reasoning snapshots under the app data directory.

use crate::config::get_config_dir;
use crate::error::{AppError, AppResult};
use crate::state::StateMachine;
use crate::utils::{atomic_write_text_file, move_corrupt_file};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const HISTORY_FILENAME: &str = "history.json";
const MAX_HISTORY_ITEMS: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionHistoryEntry {
    pub id: String,
    pub created_at: u64,
    pub model: String,
    pub state: StateMachine,
}

impl SessionHistoryEntry {
    pub fn new(model: impl Into<String>, state: StateMachine) -> Self {
        let now = current_millis();
        Self {
            id: format!("session-{}", now),
            created_at: now,
            model: model.into(),
            state,
        }
    }
}

fn history_path() -> PathBuf {
    get_config_dir().join(HISTORY_FILENAME)
}

pub fn load_history_entries() -> AppResult<Vec<SessionHistoryEntry>> {
    let path = history_path();
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| AppError::HistoryRead(format!("{} ({})", path.display(), e)))?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut entries: Vec<SessionHistoryEntry> = match serde_json::from_str(&content) {
        Ok(parsed) => parsed,
        Err(e) => {
            let _ = move_corrupt_file(&path, "history-json");
            eprintln!(
                "History JSON is invalid and has been moved to backup: {}",
                e
            );
            return Ok(Vec::new());
        }
    };

    entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(entries)
}

pub fn append_history_entry(entry: SessionHistoryEntry) -> AppResult<()> {
    let mut entries = load_history_entries()?;

    entries.retain(|item| item.id != entry.id);
    entries.insert(0, entry);
    if entries.len() > MAX_HISTORY_ITEMS {
        entries.truncate(MAX_HISTORY_ITEMS);
    }

    save_history_entries(&entries)
}

pub fn find_history_entry(id: &str) -> AppResult<Option<SessionHistoryEntry>> {
    let entries = load_history_entries()?;
    Ok(entries.into_iter().find(|entry| entry.id == id))
}

pub fn delete_history_entry(id: &str) -> AppResult<()> {
    let mut entries = load_history_entries()?;
    let len_before = entries.len();
    entries.retain(|entry| entry.id != id);
    if entries.len() == len_before {
        return Err(AppError::HistoryEntryNotFound { id: id.to_string() });
    }
    save_history_entries(&entries)
}

pub fn clear_history_entries() -> AppResult<()> {
    save_history_entries(&[])
}

fn save_history_entries(entries: &[SessionHistoryEntry]) -> AppResult<()> {
    let dir = get_config_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| AppError::HistoryWrite(format!("{} ({})", dir.display(), e)))?;
    }

    let path = history_path();
    let content = serde_json::to_string_pretty(entries)
        .map_err(|e| AppError::HistoryWrite(format!("serialize history json failed: {}", e)))?;

    atomic_write_text_file(&path, &content)
        .map_err(|e| AppError::HistoryWrite(format!("{} ({})", path.display(), e)))
}

fn current_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
