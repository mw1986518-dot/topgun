//! LLM Client module
//!
//! Handles communication with LLM APIs, including:
//! - HTTP client setup with retry logic
//! - Streaming SSE responses
//! - Exponential backoff for rate limiting

mod tests;

use crate::error::{AppError, AppResult};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio_stream::StreamExt;

/// LLM message structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

impl Message {
    pub fn new(role: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: role.into(),
            content: content.into(),
        }
    }

    pub fn system(content: impl Into<String>) -> Self {
        Self::new("system", content)
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self::new("user", content)
    }

    pub fn assistant(content: impl Into<String>) -> Self {
        Self::new("assistant", content)
    }
}

/// LLM request structure
#[derive(Debug, Serialize)]
pub struct LLMRequest {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

/// LLM response structure
#[derive(Debug, Deserialize)]
pub struct LLMResponse {
    pub id: Option<String>,
    pub choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
pub struct Choice {
    pub index: u32,
    pub message: Option<Message>,
    pub delta: Option<Delta>,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Delta {
    pub role: Option<String>,
    pub content: Option<String>,
}

/// LLM client configuration
#[derive(Debug, Clone)]
pub struct LLMClientConfig {
    pub base_url: String,
    pub api_key: String,
    pub timeout_seconds: u64,
    pub enable_retry: bool,
    pub max_retries: u32,
    pub retry_delay_ms: u64,
}

impl Default for LLMClientConfig {
    fn default() -> Self {
        Self {
            base_url: String::new(),
            api_key: String::new(),
            timeout_seconds: 60,
            enable_retry: true,
            max_retries: 3,
            retry_delay_ms: 1000,
        }
    }
}

impl From<&crate::config::AppConfig> for LLMClientConfig {
    fn from(config: &crate::config::AppConfig) -> Self {
        let active_base_url = config
            .selected_provider()
            .map(|p| p.base_url.clone())
            .unwrap_or_default();
        let active_api_key = config
            .selected_provider()
            .map(|p| p.api_key.clone())
            .unwrap_or_default();
            
        Self {
            base_url: active_base_url,
            api_key: active_api_key,
            timeout_seconds: config.timeout_seconds,
            enable_retry: config.enable_retry,
            max_retries: config.max_retries,
            retry_delay_ms: config.retry_delay_ms,
        }
    }
}

/// LLM Client
pub struct LLMClient {
    client: Client,
    config: LLMClientConfig,
}

impl LLMClient {
    /// Create a new LLM client
    pub fn new(config: LLMClientConfig) -> AppResult<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(config.timeout_seconds))
            .build()
            .map_err(|e| AppError::HttpClientBuild(e.to_string()))?;

        Ok(Self { client, config })
    }

    /// Build endpoint URL from a specific base URL.
    fn build_url_for_base(base_url: &str, endpoint: &str) -> String {
        let base = base_url.trim_end_matches('/');
        let path_to_append = endpoint.trim_start_matches('/');

        if base.ends_with(path_to_append) {
            base.to_string()
        } else if base.ends_with("v1") && path_to_append.starts_with("v1/") {
            format!("{}/{}", base, &path_to_append[3..])
        } else if base.contains("generativelanguage.googleapis.com") {
            // Gemini 原生 API URL 结构特殊，后续会再做专门处理。
            base.to_string()
        } else {
            format!("{}/{}", base, path_to_append)
        }
    }

    /// Backward-compatible wrapper for existing tests.
    fn build_url(&self, endpoint: &str) -> String {
        Self::build_url_for_base(&self.config.base_url, endpoint)
    }

    /// Whether this base URL should use Gemini protocol.
    fn is_gemini_base(base_url: &str) -> bool {
        (base_url.contains("generativelanguage.googleapis.com") || base_url.contains("gemini"))
            && !base_url.contains("chat/completions")
            && !base_url.ends_with("/v1")
    }

    /// Execute one provider + one model request path (with retry/backoff).
    #[allow(clippy::too_many_arguments)]
    async fn generate_content_once(
        &self,
        base_url: &str,
        api_key: &str,
        model: &str,
        messages: Vec<Message>,
        temperature: Option<f32>,
        max_tokens: Option<u32>,
        allow_internal_retry: bool,
    ) -> AppResult<LLMResponse> {
        let is_gemini = Self::is_gemini_base(base_url);

        let request_body = if is_gemini {
            // 把通用消息格式映射到 Gemini 原生 JSON 结构。
            let mut gemini_contents = Vec::new();
            let mut system_parts = Vec::new();

            for msg in messages {
                if msg.role == "system" {
                    system_parts.push(serde_json::json!({ "text": msg.content }));
                } else {
                    let role = if msg.role == "assistant" {
                        "model"
                    } else {
                        "user"
                    };
                    gemini_contents.push(serde_json::json!({
                        "role": role,
                        "parts": [{ "text": msg.content }]
                    }));
                }
            }

            let mut body = serde_json::json!({
                "contents": gemini_contents,
            });

            if !system_parts.is_empty() {
                body["systemInstruction"] = serde_json::json!({
                    "parts": system_parts
                });
            }

            let mut gen_config = serde_json::Map::new();
            if let Some(t) = temperature {
                gen_config.insert("temperature".to_string(), serde_json::json!(t));
            }
            if let Some(mt) = max_tokens {
                gen_config.insert("maxOutputTokens".to_string(), serde_json::json!(mt));
            }
            if !gen_config.is_empty() {
                body["generationConfig"] = serde_json::Value::Object(gen_config);
            }

            body
        } else {
            serde_json::to_value(LLMRequest {
                model: model.to_string(),
                messages,
                temperature,
                max_tokens,
                stream: Some(false),
            })
            .unwrap_or(serde_json::json!({}))
        };

        let mut attempts = 0;
        let max_attempts = if allow_internal_retry && self.config.enable_retry {
            self.config.max_retries + 1
        } else {
            1
        };

        let mut url = Self::build_url_for_base(base_url, "v1/chat/completions");

        if is_gemini && !url.contains("/models/") && !url.ends_with("chat/completions") {
            let api_version = if url.contains("v1beta") {
                ""
            } else {
                "/v1beta"
            };
            url = format!(
                "{}{}/models/{}:generateContent?key={}",
                base_url.trim_end_matches('/'),
                api_version,
                model,
                api_key
            );
        }

        loop {
            attempts += 1;

            let mut request_builder = self.client.post(&url);
            if !url.contains("?key=") {
                request_builder =
                    request_builder.header("Authorization", format!("Bearer {}", api_key));
            }

            let response = request_builder
                .header("Content-Type", "application/json")
                .json(&request_body)
                .send()
                .await;

            match response {
                Ok(resp) => {
                    let status = resp.status();

                    if status.is_success() {
                        if is_gemini {
                            let gemini_resp: serde_json::Value =
                                resp.json().await.map_err(|e| {
                                    AppError::LlmParse(format!(
                                        "Failed to parse Gemini response: {}",
                                        e
                                    ))
                                })?;

                            let content = gemini_resp["candidates"][0]["content"]["parts"][0]
                                ["text"]
                                .as_str()
                                .unwrap_or("")
                                .to_string();

                            return Ok(LLMResponse {
                                id: Some("gemini-req".to_string()),
                                choices: vec![Choice {
                                    index: 0,
                                    message: Some(Message::assistant(content)),
                                    delta: None,
                                    finish_reason: Some("stop".to_string()),
                                }],
                            });
                        }

                        let llm_response: LLMResponse = resp.json().await.map_err(|e| {
                            AppError::LlmParse(format!("Failed to parse response: {}", e))
                        })?;
                        return Ok(llm_response);
                    }

                    if status.as_u16() == 429 && attempts < max_attempts {
                        let delay = self.calculate_backoff_delay(attempts);
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                        continue;
                    }

                    let error_text = resp
                        .text()
                        .await
                        .unwrap_or_else(|_| "Unknown error".to_string());
                    return Err(AppError::LlmRequest {
                        model: model.to_string(),
                        reason: format!("API error ({}): {}", status, error_text),
                    });
                }
                Err(e) => {
                    if attempts < max_attempts && e.is_timeout() {
                        let delay = self.calculate_backoff_delay(attempts);
                        tokio::time::sleep(Duration::from_millis(delay)).await;
                        continue;
                    }
                    return Err(AppError::LlmRequest {
                        model: model.to_string(),
                        reason: format!("Request failed: {}", e),
                    });
                }
            }
        }
    }

    /// Call a specific provider/model directly.
    /// Used by "connectivity test" so users can independently verify each provider.
    pub async fn generate_content_with_provider(
        &self,
        base_url: &str,
        api_key: &str,
        model: &str,
        messages: Vec<Message>,
        temperature: Option<f32>,
        max_tokens: Option<u32>,
    ) -> AppResult<LLMResponse> {
        self.generate_content_once(
            base_url,
            api_key,
            model,
            messages,
            temperature,
            max_tokens,
            true,
        )
        .await
    }

    /// Generate content through currently selected provider/model.
    pub async fn generate_content(
        &self,
        model: &str,
        messages: Vec<Message>,
        temperature: Option<f32>,
        max_tokens: Option<u32>,
    ) -> AppResult<LLMResponse> {
        self.generate_content_once(
            &self.config.base_url,
            &self.config.api_key,
            model,
            messages,
            temperature,
            max_tokens,
            true,
        )
        .await
    }

    /// Calculate exponential backoff delay
    fn calculate_backoff_delay(&self, attempt: u32) -> u64 {
        let base_delay = self.config.retry_delay_ms;
        let multiplier = 2u64.pow(attempt - 1);
        base_delay * multiplier
    }

    /// Generate streaming content
    pub async fn generate_stream(
        &self,
        model: &str,
        messages: Vec<Message>,
        temperature: Option<f32>,
        max_tokens: Option<u32>,
    ) -> AppResult<impl futures::Stream<Item = AppResult<String>>> {
        let request = LLMRequest {
            model: model.to_string(),
            messages,
            temperature,
            max_tokens,
            stream: Some(true),
        };

        let response = self
            .client
            .post(self.build_url("v1/chat/completions"))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::LlmRequest {
                model: model.to_string(),
                reason: format!("Request failed: {}", e),
            })?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(AppError::LlmRequest {
                model: model.to_string(),
                reason: format!("API error ({}): {}", status, error_text),
            });
        }

        let stream_model = model.to_string();
        let stream = response
            .bytes_stream()
            .map(move |chunk_result| match chunk_result {
                Ok(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    // Parse SSE format
                    for line in text.lines() {
                        if let Some(data) = line.strip_prefix("data: ") {
                            if data == "[DONE]" {
                                continue;
                            }
                            if let Ok(parsed) = serde_json::from_str::<LLMResponse>(data) {
                                if let Some(choice) = parsed.choices.first() {
                                    if let Some(delta) = &choice.delta {
                                        if let Some(content) = &delta.content {
                                            return Ok(content.clone());
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Ok(String::new())
                }
                Err(e) => Err(AppError::LlmRequest {
                    model: stream_model.clone(),
                    reason: format!("Stream error: {}", e),
                }),
            });

        Ok(stream)
    }
}
