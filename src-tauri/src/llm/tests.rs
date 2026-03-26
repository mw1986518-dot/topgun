#![allow(clippy::module_inception)]

#[cfg(test)]
mod tests {
    use crate::llm::*;
    use crate::llm::{LLMRequest, LLMResponse};

    #[test]
    fn test_message_new() {
        let msg = Message::new("user", "Hello");
        assert_eq!(msg.role, "user");
        assert_eq!(msg.content, "Hello");
    }

    #[test]
    fn test_message_helpers() {
        let system = Message::system("You are helpful");
        assert_eq!(system.role, "system");
        assert_eq!(system.content, "You are helpful");

        let user = Message::user("Hi there");
        assert_eq!(user.role, "user");

        let assistant = Message::assistant("Hello!");
        assert_eq!(assistant.role, "assistant");
    }

    #[test]
    fn test_llm_request_serialization() {
        let request = LLMRequest {
            model: "gpt-4".to_string(),
            messages: vec![Message::user("Hello")],
            temperature: Some(0.7),
            max_tokens: Some(100),
            stream: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"model\":\"gpt-4\""));
        assert!(json.contains("\"temperature\":0.7"));
        assert!(json.contains("\"max_tokens\":100"));
    }

    #[test]
    fn test_llm_request_skip_null_fields() {
        let request = LLMRequest {
            model: "gpt-4".to_string(),
            messages: vec![],
            temperature: None,
            max_tokens: None,
            stream: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(!json.contains("temperature"));
        assert!(!json.contains("max_tokens"));
        assert!(!json.contains("stream"));
    }

    #[test]
    fn test_llm_client_config_default() {
        let config = LLMClientConfig::default();
        assert!(config.base_url.is_empty());
        assert!(config.api_key.is_empty());
        assert_eq!(config.timeout_seconds, 60);
        assert!(config.enable_retry);
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.retry_delay_ms, 1000);
    }

    #[test]
    fn test_llm_client_creation() {
        let config = LLMClientConfig {
            base_url: "https://api.example.com".to_string(),
            api_key: "test-key".to_string(),
            ..Default::default()
        };
        let client = LLMClient::new(config);
        assert!(client.is_ok());
    }

    #[test]
    fn test_calculate_backoff_delay() {
        let config = LLMClientConfig {
            retry_delay_ms: 1000,
            ..Default::default()
        };
        let client = LLMClient::new(config).unwrap();

        // Exponential backoff: 1000 * 2^(attempt-1)
        assert_eq!(client.calculate_backoff_delay(1), 1000);
        assert_eq!(client.calculate_backoff_delay(2), 2000);
        assert_eq!(client.calculate_backoff_delay(3), 4000);
        assert_eq!(client.calculate_backoff_delay(4), 8000);
    }

    #[test]
    fn test_build_url() {
        let config = LLMClientConfig {
            base_url: "https://api.example.com/".to_string(),
            api_key: "test".to_string(),
            ..Default::default()
        };
        let client = LLMClient::new(config).unwrap();
        assert_eq!(
            client.build_url("v1/chat"),
            "https://api.example.com/v1/chat"
        );
    }

    #[test]
    fn test_llm_response_deserialization() {
        let json = r#"{
            "id": "chatcmpl-123",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "Hello!"
                    },
                    "finish_reason": "stop"
                }
            ]
        }"#;

        let response: LLMResponse = serde_json::from_str(json).unwrap();
        assert_eq!(response.id, Some("chatcmpl-123".to_string()));
        assert_eq!(response.choices.len(), 1);
        assert_eq!(response.choices[0].index, 0);
        assert_eq!(
            response.choices[0].message.as_ref().unwrap().content,
            "Hello!"
        );
    }

    #[test]
    fn test_generate_content_uses_single_provider_path() {
        let config = LLMClientConfig {
            base_url: "https://api.example.com".to_string(),
            api_key: "test-key".to_string(),
            enable_retry: false,
            ..Default::default()
        };
        let client = LLMClient::new(config).unwrap();
        let future = client.generate_content("gpt-4o-mini", vec![Message::user("ping")], None, Some(10));
        drop(future);
    }
}
