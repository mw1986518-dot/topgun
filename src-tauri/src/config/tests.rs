#![allow(clippy::module_inception, clippy::field_reassign_with_default)]

#[cfg(test)]
mod tests {
    use crate::config::*;

    #[test]
    fn test_app_config_new() {
        let config = AppConfig::new();
        assert_eq!(config.timeout_seconds, 60);
        assert!(config.enable_retry);
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.retry_delay_ms, 1000);
        assert_eq!(config.providers.len(), 1);
        assert_eq!(config.selected_provider_id, "provider_1");
        // Provider fields are empty by default
        assert!(config.providers[0].base_url.is_empty());
        assert!(config.providers[0].api_key.is_empty());
        assert!(config.providers[0].model.is_empty());
    }

    #[test]
    fn test_app_config_default() {
        let config = AppConfig::default();
        assert_eq!(config.providers.len(), 1);
        assert_eq!(config.selected_provider_id, "provider_1");
    }

    #[test]
    fn test_app_config_validate_empty_base_url() {
        let mut config = AppConfig::default();
        config.providers[0].base_url = String::new();
        config.providers[0].api_key = "test-key".to_string();
        config.providers[0].model = "gpt-4o-mini".to_string();
        assert!(config.validate().is_err());
        assert!(config
            .validate()
            .unwrap_err()
            .to_string()
            .contains("Base URL is required"));
    }

    #[test]
    fn test_app_config_validate_empty_api_key() {
        let mut config = AppConfig::default();
        config.providers[0].base_url = "https://api.example.com".to_string();
        config.providers[0].api_key = String::new();
        config.providers[0].model = "gpt-4o-mini".to_string();
        assert!(config.validate().is_err());
        assert!(config
            .validate()
            .unwrap_err()
            .to_string()
            .contains("API Key is required"));
    }

    #[test]
    fn test_app_config_validate_zero_timeout() {
        let mut config = AppConfig::default();
        config.timeout_seconds = 0;
        config.providers[0].base_url = "https://api.example.com".to_string();
        config.providers[0].api_key = "test-key".to_string();
        config.providers[0].model = "gpt-4o-mini".to_string();
        assert!(config.validate().is_err());
        assert!(config
            .validate()
            .unwrap_err()
            .to_string()
            .contains("Timeout must be greater than 0"));
    }

    #[test]
    fn test_app_config_validate_max_retries_exceeded() {
        let mut config = AppConfig::default();
        config.max_retries = 11;
        config.providers[0].base_url = "https://api.example.com".to_string();
        config.providers[0].api_key = "test-key".to_string();
        config.providers[0].model = "gpt-4o-mini".to_string();
        assert!(config.validate().is_err());
        assert!(config
            .validate()
            .unwrap_err()
            .to_string()
            .contains("Max retries cannot exceed 10"));
    }

    #[test]
    fn test_app_config_validate_success() {
        let mut config = AppConfig::default();
        config.providers[0].base_url = "https://api.example.com".to_string();
        config.providers[0].api_key = "test-key".to_string();
        config.providers[0].model = "gpt-4o-mini".to_string();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_app_config_validate_selected_provider_must_exist() {
        let mut config = AppConfig::default();
        config.providers[0].base_url = "https://api.example.com".to_string();
        config.providers[0].api_key = "test-key".to_string();
        config.providers[0].model = "gpt-4o-mini".to_string();
        config.selected_provider_id = "missing_provider".to_string();
        assert!(config.validate().is_err());
        assert!(config
            .validate()
            .unwrap_err()
            .to_string()
            .contains("Selected provider does not exist"));
    }

    #[test]
    fn test_app_config_validate_allows_incomplete_non_selected_provider() {
        let mut config = AppConfig::default();
        config.providers[0].base_url = "https://api.example.com".to_string();
        config.providers[0].api_key = "test-key".to_string();
        config.providers[0].model = "gpt-4o-mini".to_string();
        config.providers.push(LlmProviderConfig {
            id: "provider_2".to_string(),
            name: "待配置供应商".to_string(),
            base_url: String::new(),
            api_key: String::new(),
            model: String::new(),
        });
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_app_config_validate_rejects_duplicate_provider_id() {
        let mut config = AppConfig::default();
        config.providers[0].base_url = "https://api.example.com".to_string();
        config.providers[0].api_key = "test-key".to_string();
        config.providers[0].model = "gpt-4o-mini".to_string();
        config.providers.push(LlmProviderConfig {
            id: "provider_1".to_string(),
            name: "重复ID".to_string(),
            base_url: "https://api.dup.com".to_string(),
            api_key: "dup-key".to_string(),
            model: "dup-model".to_string(),
        });
        assert!(config.validate().is_err());
        assert!(config
            .validate()
            .unwrap_err()
            .to_string()
            .contains("Duplicate provider id"));
    }

    #[test]
    fn test_app_config_serialization() {
        let config = AppConfig {
            timeout_seconds: 120,
            enable_retry: false,
            max_retries: 5,
            retry_delay_ms: 2000,
            max_iterations: 3,
            selected_provider_id: "provider_openai".to_string(),
            providers: vec![
                LlmProviderConfig {
                    id: "provider_openai".to_string(),
                    name: "OpenAI".to_string(),
                    base_url: "https://api.example.com".to_string(),
                    api_key: "test-key".to_string(),
                    model: "gpt-4o-mini".to_string(),
                },
                LlmProviderConfig {
                    id: "provider_backup".to_string(),
                    name: "Backup".to_string(),
                    base_url: "https://backup.example.com".to_string(),
                    api_key: "backup-key".to_string(),
                    model: "backup-model".to_string(),
                },
            ],
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: AppConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.timeout_seconds, 120);
        assert!(!deserialized.enable_retry);
        assert_eq!(deserialized.max_retries, 5);
        assert_eq!(deserialized.retry_delay_ms, 2000);
        assert_eq!(deserialized.providers.len(), 2);
        assert_eq!(deserialized.selected_provider_id, "provider_openai");
        assert_eq!(
            deserialized.providers[0].base_url,
            "https://api.example.com"
        );
        assert_eq!(deserialized.providers[0].api_key, "test-key");
        assert_eq!(deserialized.providers[0].model, "gpt-4o-mini");
    }

    #[test]
    fn test_secret_encrypt_decrypt_roundtrip() {
        let plain = "super-secret-token";
        let encrypted = encrypt_for_storage(plain).expect("encrypt_for_storage should succeed");
        assert_ne!(encrypted, plain);
        let decrypted =
            decrypt_from_storage(&encrypted).expect("decrypt_from_storage should succeed");
        assert_eq!(decrypted, plain);
    }

    #[test]
    fn test_secret_decrypt_plaintext_compatibility() {
        let plain = "legacy-plain-text";
        let decrypted =
            decrypt_from_storage(plain).expect("decrypt_from_storage should keep plaintext");
        assert_eq!(decrypted, plain);
    }

    #[test]
    fn test_ensure_provider_integrity_adds_default_when_empty() {
        let mut config = AppConfig {
            timeout_seconds: 60,
            enable_retry: true,
            max_retries: 3,
            retry_delay_ms: 1000,
            max_iterations: 3,
            providers: vec![],
            selected_provider_id: String::new(),
        };
        config.ensure_provider_integrity();
        assert_eq!(config.providers.len(), 1);
        assert_eq!(config.selected_provider_id, "provider_1");
    }

    #[test]
    fn test_ensure_provider_integrity_fixes_invalid_selected_id() {
        let mut config = AppConfig::default();
        config.selected_provider_id = "nonexistent".to_string();
        config.ensure_provider_integrity();
        assert_eq!(config.selected_provider_id, "provider_1");
    }

    #[test]
    fn test_get_active_model() {
        let mut config = AppConfig::default();
        config.providers[0].model = "gpt-4".to_string();
        assert_eq!(config.get_active_model(), "gpt-4");
    }

    #[test]
    fn test_find_provider() {
        let mut config = AppConfig::default();
        config.providers.push(LlmProviderConfig {
            id: "provider_2".to_string(),
            name: "Second".to_string(),
            base_url: "https://api2.example.com".to_string(),
            api_key: "key2".to_string(),
            model: "model2".to_string(),
        });
        assert!(config.find_provider("provider_1").is_some());
        assert!(config.find_provider("provider_2").is_some());
        assert!(config.find_provider("nonexistent").is_none());
    }
}
