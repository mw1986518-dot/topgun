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
        let future =
            client.generate_content("gpt-4o-mini", vec![Message::user("ping")], None, Some(10));
        drop(future);
    }

    #[test]
    fn test_is_anthropic_base() {
        assert!(LLMClient::is_anthropic_base("https://api.kimi.com/coding/"));
        assert!(LLMClient::is_anthropic_base("https://api.anthropic.com/v1"));
        assert!(!LLMClient::is_anthropic_base("https://api.openai.com/v1"));
        assert!(!LLMClient::is_anthropic_base(
            "https://api.kimi.com/v1/chat/completions"
        ));
    }

    #[test]
    fn test_build_anthropic_body() {
        let messages = vec![
            Message::system("You are a helpful assistant."),
            Message::user("Hello!"),
            Message::assistant("Hi there!"),
        ];
        let body =
            LLMClient::build_anthropic_body("kimi-for-coding", messages, Some(0.7), Some(1024));

        assert_eq!(body["model"], "kimi-for-coding");
        let temp = body["temperature"].as_f64().unwrap();
        assert!((temp - 0.7).abs() < 0.001);
        assert_eq!(body["max_tokens"], 1024);
        assert_eq!(body["system"], "You are a helpful assistant.");

        let anthropic_messages = body["messages"].as_array().unwrap();
        assert_eq!(anthropic_messages.len(), 2);
        assert_eq!(anthropic_messages[0]["role"], "user");
        assert_eq!(anthropic_messages[0]["content"], "Hello!");
        assert_eq!(anthropic_messages[1]["role"], "assistant");
        assert_eq!(anthropic_messages[1]["content"], "Hi there!");
    }

    #[test]
    fn test_build_anthropic_body_default_max_tokens() {
        let messages = vec![Message::user("Ping")];
        let body = LLMClient::build_anthropic_body("claude-3-5-sonnet", messages, None, None);
        assert_eq!(body["max_tokens"], 4096);
        assert!(!body.as_object().unwrap().contains_key("temperature"));
    }

    #[test]
    fn test_parse_anthropic_response() {
        let json = serde_json::json!({
            "id": "msg_01AbCdEfGhIjKlMnOpQrStUv",
            "type": "message",
            "role": "assistant",
            "content": [
                {
                    "type": "text",
                    "text": "Hello! How can I help you today?"
                }
            ],
            "model": "kimi-for-coding",
            "stop_reason": "end_turn"
        });

        let response = LLMClient::parse_anthropic_response(&json).unwrap();
        assert_eq!(response.id, Some("msg_01AbCdEfGhIjKlMnOpQrStUv".to_string()));
        assert_eq!(response.choices.len(), 1);
        assert_eq!(
            response.choices[0].message.as_ref().unwrap().content,
            "Hello! How can I help you today?"
        );
        assert_eq!(response.choices[0].finish_reason, Some("end_turn".to_string()));
    }

    #[test]
    fn test_parse_anthropic_response_empty_content() {
        let json = serde_json::json!({
            "id": "msg_empty",
            "type": "message",
            "role": "assistant",
            "content": [],
            "model": "kimi-for-coding",
            "stop_reason": null
        });

        let response = LLMClient::parse_anthropic_response(&json).unwrap();
        assert_eq!(
            response.choices[0].message.as_ref().unwrap().content,
            ""
        );
    }
}
