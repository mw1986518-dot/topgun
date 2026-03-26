//! Application configuration module
//!
//! Handles loading, saving, and managing application settings.
//! All settings are stored locally in the Windows %APPDATA% directory.

mod tests;

use crate::error::{AppError, AppResult};
use crate::utils::{atomic_write_text_file, move_corrupt_file};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

const SECRET_PREFIX: &str = "enc::v1::";
const SECRET_SCHEME_DPAPI: &str = "dpapi";
const SECRET_SCHEME_B64: &str = "b64";

/// Application configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    /// Request timeout in seconds
    pub timeout_seconds: u64,
    /// Enable exponential backoff retry
    pub enable_retry: bool,
    /// Maximum retry attempts
    pub max_retries: u32,
    /// Initial retry delay in milliseconds
    pub retry_delay_ms: u64,
    /// All available providers users can switch/test individually.
    pub providers: Vec<LlmProviderConfig>,
    /// Currently selected provider id.
    pub selected_provider_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmProviderConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

impl LlmProviderConfig {
    fn new_default() -> Self {
        Self {
            id: "provider_1".to_string(),
            name: "默认供应商".to_string(),
            base_url: String::new(),
            api_key: String::new(),
            model: String::new(),
        }
    }

    fn label(&self) -> &str {
        let name = self.name.trim();
        if name.is_empty() {
            self.id.trim()
        } else {
            name
        }
    }

    fn validate_identity(&self) -> AppResult<()> {
        if self.id.trim().is_empty() {
            return Err(AppError::ConfigValidation(
                "Provider id is required".to_string(),
            ));
        }
        if self.name.trim().is_empty() {
            return Err(AppError::ConfigValidation(format!(
                "Provider name is required for id {}",
                self.id.trim()
            )));
        }
        Ok(())
    }

    pub fn validate_connection_fields(&self) -> AppResult<()> {
        if self.base_url.trim().is_empty() {
            return Err(AppError::ConfigValidation(format!(
                "Base URL is required for provider {}",
                self.label()
            )));
        }
        if self.api_key.trim().is_empty() {
            return Err(AppError::ConfigValidation(format!(
                "API Key is required for provider {}",
                self.label()
            )));
        }
        if self.model.trim().is_empty() {
            return Err(AppError::ConfigValidation(format!(
                "Model is required for provider {}",
                self.label()
            )));
        }
        Ok(())
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self::new()
    }
}

impl AppConfig {
    /// Create a new AppConfig with default values
    pub fn new() -> Self {
        Self {
            timeout_seconds: 60,
            enable_retry: true,
            max_retries: 3,
            retry_delay_ms: 1000,
            providers: vec![LlmProviderConfig::new_default()],
            selected_provider_id: "provider_1".to_string(),
        }
    }

    pub fn ensure_provider_integrity(&mut self) {
        if self.providers.is_empty() {
            self.providers.push(LlmProviderConfig::new_default());
        }

        if self.selected_provider_id.trim().is_empty()
            || !self
                .providers
                .iter()
                .any(|item| item.id == self.selected_provider_id)
        {
            self.selected_provider_id = self.providers[0].id.clone();
        }
    }

    pub fn find_provider(&self, provider_id: &str) -> Option<&LlmProviderConfig> {
        self.providers
            .iter()
            .find(|item| item.id.trim() == provider_id.trim())
    }

    pub fn selected_provider(&self) -> Option<&LlmProviderConfig> {
        self.find_provider(&self.selected_provider_id)
    }

    pub fn validate_provider_catalog(&self) -> AppResult<()> {
        if self.providers.is_empty() {
            return Err(AppError::ConfigValidation(
                "At least one provider is required".to_string(),
            ));
        }
        if self.selected_provider_id.trim().is_empty() {
            return Err(AppError::ConfigValidation(
                "Selected provider is required".to_string(),
            ));
        }

        let mut ids = HashSet::new();
        for provider in &self.providers {
            provider.validate_identity()?;
            let normalized_id = provider.id.trim().to_string();
            if !ids.insert(normalized_id.clone()) {
                return Err(AppError::ConfigValidation(format!(
                    "Duplicate provider id is not allowed: {}",
                    normalized_id
                )));
            }
        }

        if self.selected_provider().is_none() {
            return Err(AppError::ConfigValidation(
                "Selected provider does not exist".to_string(),
            ));
        }

        Ok(())
    }

    pub fn get_active_model(&self) -> String {
        self.selected_provider().map(|p| p.model.clone()).unwrap_or_default()
    }

    /// Validate the configuration
    pub fn validate(&self) -> AppResult<()> {
        if self.timeout_seconds == 0 {
            return Err(AppError::ConfigValidation(
                "Timeout must be greater than 0".to_string(),
            ));
        }
        if self.max_retries > 10 {
            return Err(AppError::ConfigValidation(
                "Max retries cannot exceed 10".to_string(),
            ));
        }
        self.validate_provider_catalog()?;
        let selected = self.selected_provider().ok_or_else(|| {
            AppError::ConfigValidation("Selected provider does not exist".to_string())
        })?;
        selected.validate_connection_fields()?;
        Ok(())
    }
}

fn is_secret_encrypted(value: &str) -> bool {
    value.starts_with(SECRET_PREFIX)
}

pub(crate) fn encrypt_for_storage(value: &str) -> AppResult<String> {
    if value.trim().is_empty() || is_secret_encrypted(value) {
        return Ok(value.to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let protected = protect_bytes_windows(value.as_bytes())?;
        let encoded = BASE64_STANDARD.encode(protected);
        Ok(format!(
            "{}{}:{}",
            SECRET_PREFIX, SECRET_SCHEME_DPAPI, encoded
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let encoded = BASE64_STANDARD.encode(value.as_bytes());
        Ok(format!(
            "{}{}:{}",
            SECRET_PREFIX, SECRET_SCHEME_B64, encoded
        ))
    }
}

pub(crate) fn decrypt_from_storage(value: &str) -> AppResult<String> {
    if value.trim().is_empty() || !is_secret_encrypted(value) {
        return Ok(value.to_string());
    }

    let payload = &value[SECRET_PREFIX.len()..];
    let (scheme, encoded) = payload
        .split_once(':')
        .ok_or_else(|| AppError::ConfigCrypto("Invalid secret payload format".to_string()))?;

    let bytes = BASE64_STANDARD
        .decode(encoded)
        .map_err(|e| AppError::ConfigCrypto(format!("Invalid base64 secret payload: {}", e)))?;

    match scheme {
        SECRET_SCHEME_DPAPI => {
            #[cfg(target_os = "windows")]
            {
                let plain = unprotect_bytes_windows(&bytes)?;
                String::from_utf8(plain).map_err(|e| {
                    AppError::ConfigCrypto(format!("Decoded secret is not UTF-8: {}", e))
                })
            }

            #[cfg(not(target_os = "windows"))]
            {
                Err(AppError::ConfigCrypto(
                    "DPAPI secret cannot be decrypted on non-Windows platform".to_string(),
                ))
            }
        }
        SECRET_SCHEME_B64 => String::from_utf8(bytes)
            .map_err(|e| AppError::ConfigCrypto(format!("Decoded secret is not UTF-8: {}", e))),
        _ => Err(AppError::ConfigCrypto(format!(
            "Unknown secret encryption scheme: {}",
            scheme
        ))),
    }
}

#[cfg(target_os = "windows")]
fn protect_bytes_windows(data: &[u8]) -> AppResult<Vec<u8>> {
    use std::ptr::null;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    let ok = unsafe {
        CryptProtectData(
            &in_blob,
            null(),
            null(),
            null(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
    };
    if ok == 0 {
        return Err(AppError::ConfigCrypto(
            "Windows DPAPI encryption failed".to_string(),
        ));
    }

    let output =
        unsafe { std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize) }.to_vec();
    unsafe {
        LocalFree(out_blob.pbData.cast());
    }
    Ok(output)
}

#[cfg(target_os = "windows")]
fn unprotect_bytes_windows(data: &[u8]) -> AppResult<Vec<u8>> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };

    let ok = unsafe {
        CryptUnprotectData(
            &in_blob,
            null_mut(),
            null(),
            null(),
            null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        )
    };
    if ok == 0 {
        return Err(AppError::ConfigCrypto(
            "Windows DPAPI decryption failed".to_string(),
        ));
    }

    let output =
        unsafe { std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize) }.to_vec();
    unsafe {
        LocalFree(out_blob.pbData.cast());
    }
    Ok(output)
}

/// Get the configuration directory path
pub fn get_config_dir() -> PathBuf {
    let app_data = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(app_data).join("IdeaRefinery")
}

/// Get the configuration file path
pub fn get_config_path() -> PathBuf {
    get_config_dir().join("config.json")
}

/// Load configuration from file
pub fn load_config() -> AppResult<AppConfig> {
    let path = get_config_path();

    if !path.exists() {
        return Ok(AppConfig::new());
    }

    let content = fs::read_to_string(&path).map_err(AppError::ConfigIo)?;

    if content.trim().is_empty() {
        return Ok(AppConfig::new());
    }

    let mut config: AppConfig = match serde_json::from_str(&content) {
        Ok(parsed) => parsed,
        Err(err) => {
            let _ = move_corrupt_file(&path, "config-json");
            eprintln!(
                "Config JSON is invalid and has been moved to backup: {}",
                err
            );
            return Ok(AppConfig::new());
        }
    };

    for provider in &mut config.providers {
        provider.api_key = match decrypt_from_storage(&provider.api_key) {
            Ok(value) => value,
            Err(err) => {
                let _ = move_corrupt_file(&path, "config-secret");
                eprintln!(
                    "Provider config secret decode failed and file has been moved to backup: {}",
                    err
                );
                return Ok(AppConfig::new());
            }
        };
    }

    // Compatibility: old config only has base_url/api_key/model without providers.
    if config.providers.is_empty() {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            let old_base = val.get("base_url").and_then(|v| v.as_str()).unwrap_or("");
            let old_api = val.get("api_key").and_then(|v| v.as_str()).unwrap_or("");
            let old_model = val.get("model").and_then(|v| v.as_str()).unwrap_or("");
            
            if !old_base.is_empty() || !old_api.is_empty() || !old_model.is_empty() {
                let decrypted_api = decrypt_from_storage(old_api).unwrap_or_else(|_| old_api.to_string());
                config.providers.push(LlmProviderConfig {
                    id: "provider_1".to_string(),
                    name: "默认供应商".to_string(),
                    base_url: old_base.to_string(),
                    api_key: decrypted_api,
                    model: old_model.to_string(),
                });
                config.selected_provider_id = "provider_1".to_string();
            }
        }
    }
    config.ensure_provider_integrity();

    Ok(config)
}

/// Save configuration to file
pub fn save_config(config: &AppConfig) -> AppResult<()> {
    let dir = get_config_dir();

    // Create directory if it doesn't exist
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(AppError::ConfigIo)?;
    }

    let path = get_config_path();
    let mut persisted = config.clone();
    persisted.ensure_provider_integrity();
    for provider in &mut persisted.providers {
        provider.api_key = encrypt_for_storage(&provider.api_key)?;
    }

    let content = serde_json::to_string_pretty(&persisted).map_err(AppError::ConfigJson)?;

    atomic_write_text_file(&path, &content).map_err(AppError::ConfigIo)?;

    Ok(())
}
