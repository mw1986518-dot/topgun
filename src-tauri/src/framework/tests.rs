#![allow(clippy::module_inception)]

#[cfg(test)]
mod tests {
    use crate::framework::*;

    #[test]
    fn test_framework_new() {
        let framework = Framework::new(
            "test-id",
            "Test Framework",
            "🧪",
            "Test prompt",
            "Test description",
        );
        assert_eq!(framework.id, "test-id");
        assert_eq!(framework.name, "Test Framework");
        assert_eq!(framework.icon, "🧪");
        assert_eq!(framework.system_prompt, "Test prompt");
        assert!(!framework.is_builtin);
        assert_eq!(framework.description, "Test description");
    }

    #[test]
    fn test_framework_builtin() {
        let framework = Framework::builtin(
            "builtin-id",
            "Builtin Framework",
            "⚙️",
            "Builtin prompt",
            "Builtin description",
        );
        assert!(framework.is_builtin);
    }

    #[test]
    fn test_get_builtin_frameworks() {
        let frameworks = get_builtin_frameworks();
        assert!(!frameworks.is_empty());
        assert!(frameworks.iter().all(|f| f.is_builtin));
    }

    #[test]
    fn test_builtin_frameworks_have_required_fields() {
        let frameworks = get_builtin_frameworks();
        for f in &frameworks {
            assert!(!f.id.is_empty());
            assert!(!f.name.is_empty());
            assert!(!f.icon.is_empty());
            assert!(!f.system_prompt.is_empty());
            assert!(!f.description.is_empty());
        }
    }

    #[test]
    fn test_framework_library_new() {
        let library = FrameworkLibrary::new();
        assert!(!library.get_all_frameworks().is_empty());
    }

    #[test]
    fn test_framework_library_add() {
        let mut library = FrameworkLibrary::new();
        let initial_count = library.get_all_frameworks().len();

        let framework = Framework::new("custom", "Custom", "🎯", "Prompt", "Desc");
        library.add_framework(framework);

        assert_eq!(library.get_all_frameworks().len(), initial_count + 1);
    }

    #[test]
    fn test_framework_library_get() {
        let library = FrameworkLibrary::new();
        let framework = library.get_framework("first_principles");
        assert!(framework.is_some());
        assert_eq!(framework.unwrap().name, "第一性原理");
    }

    #[test]
    fn test_framework_library_remove_builtin_fails() {
        let mut library = FrameworkLibrary::new();
        // Cannot remove built-in framework
        assert!(!library.remove_framework("first_principles"));
    }

    #[test]
    fn test_framework_library_remove_custom() {
        let mut library = FrameworkLibrary::new();
        library.add_framework(Framework::new("custom", "Custom", "🎯", "P", "D"));
        assert!(library.remove_framework("custom"));
        assert!(library.get_framework("custom").is_none());
    }

    #[test]
    fn test_framework_library_update_builtin_fails() {
        let mut library = FrameworkLibrary::new();
        let updated = Framework::new("first_principles", "Updated", "🎯", "P", "D");
        // Cannot update built-in framework
        assert!(!library.update_framework("first_principles", updated));
    }

    #[test]
    fn test_framework_library_update_custom() {
        let mut library = FrameworkLibrary::new();
        library.add_framework(Framework::new("custom", "Custom", "🎯", "P", "D"));

        let updated = Framework::new("custom", "Updated Name", "🔧", "New Prompt", "New Desc");
        assert!(library.update_framework("custom", updated));

        let framework = library.get_framework("custom").unwrap();
        assert_eq!(framework.name, "Updated Name");
        assert_eq!(framework.icon, "🔧");
    }

    #[test]
    fn test_framework_serialization() {
        let framework = Framework::new("test", "Test", "🎯", "Prompt", "Desc");
        let json = serde_json::to_string(&framework).unwrap();
        let deserialized: Framework = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, framework.id);
        assert_eq!(deserialized.name, framework.name);
    }
}
