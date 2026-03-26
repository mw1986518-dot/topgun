#![allow(clippy::module_inception)]

#[cfg(test)]
mod tests {
    use crate::engine::parse_examination_response_with_repair;
    use crate::engine::truncate_context;
    use crate::engine::ExaminationParseMode;
    use crate::engine::Synthesizer;
    use crate::engine::MAX_AGENT_CONTENT_CHARS;
    use crate::state::*;

    #[test]
    fn test_truncate_context_short_content() {
        let short = "Hello, world!";
        assert_eq!(truncate_context(short), short);
    }

    #[test]
    fn test_truncate_context_exactly_at_limit() {
        let content = "a".repeat(MAX_AGENT_CONTENT_CHARS);
        assert_eq!(truncate_context(&content), content);
    }

    #[test]
    fn test_truncate_context_exceeds_limit() {
        let content = "a".repeat(MAX_AGENT_CONTENT_CHARS + 200);
        let result = truncate_context(&content);
        assert!(result.len() < content.len());
        assert!(result.contains("content truncated"));
        assert!(result.contains("200"));
    }

    #[test]
    fn test_truncate_context_preserves_head_and_tail() {
        let head = "HEAD_MARKER_".repeat(300);
        let middle = "x".repeat(MAX_AGENT_CONTENT_CHARS);
        let tail = "_TAIL_MARKER".repeat(300);
        let content = format!("{}{}{}", head, middle, tail);

        let result = truncate_context(&content);
        assert!(result.starts_with("HEAD_MARKER_"));
        assert!(result.ends_with("_TAIL_MARKER"));
    }

    #[test]
    fn test_truncate_context_handles_utf8_without_panic() {
        let content = "系统动力学".repeat(MAX_AGENT_CONTENT_CHARS);
        let result = truncate_context(&content);
        assert!(result.len() < content.len());
        assert!(!result.is_empty());
    }

    #[test]
    fn test_full_phase_migration() {
        let mut sm = StateMachine::new();
        assert_eq!(sm.current_phase, Phase::Input);

        sm.advance_phase();
        assert_eq!(sm.current_phase, Phase::FrameworkSelection);

        sm.advance_phase();
        assert_eq!(sm.current_phase, Phase::Divergence);

        sm.advance_phase();
        assert_eq!(sm.current_phase, Phase::Examination);

        sm.advance_phase();
        assert_eq!(sm.current_phase, Phase::Patch);

        sm.advance_phase();
        assert_eq!(sm.current_phase, Phase::Consensus);

        assert!(!sm.advance_phase());
        assert_eq!(sm.current_phase, Phase::Consensus);
    }

    #[test]
    fn test_objection_triggers_correctly() {
        let mut sm = StateMachine::new();
        sm.select_frameworks(vec!["fw1".to_string(), "fw2".to_string()]);

        assert!(!sm.has_objections());
        assert!(sm.get_all_objections().is_empty());

        sm.update_agent_status("fw1", AgentStatus::Objection);
        sm.add_objection("fw1", "Fatal flaw in assumption");
        assert!(sm.has_objections());

        let objections = sm.get_all_objections();
        assert_eq!(objections.len(), 1);
        assert_eq!(objections[0].0, "fw1");
        assert_eq!(objections[0].1, "Fatal flaw in assumption");
    }

    #[test]
    fn test_circuit_breaker_max_iterations() {
        let mut sm = StateMachine::new();
        sm.max_iterations = 3;

        assert!(sm.increment_iteration());
        assert_eq!(sm.iteration_count, 1);
        assert!(sm.increment_iteration());
        assert_eq!(sm.iteration_count, 2);

        assert!(!sm.increment_iteration());
        assert_eq!(sm.iteration_count, 3);
    }

    #[test]
    fn test_unresolved_objections_become_tolerated_risks() {
        let mut sm = StateMachine::new();
        sm.select_frameworks(vec!["fw1".to_string(), "fw2".to_string()]);

        sm.add_objection("fw1", "Security concern unresolved");
        sm.add_objection("fw2", "Performance bottleneck");

        let objections = sm.get_all_objections();
        for (framework_id, objection) in objections {
            sm.add_tolerated_risk(ToleratedRiskItem::new(
                framework_id,
                objection.clone(),
                objection,
                "补充证据并复核后再决策。",
            ));
        }

        assert_eq!(sm.tolerated_risks.len(), 2);
        assert!(sm
            .tolerated_risks
            .iter()
            .any(|r| r.evidence.contains("Security concern")));
        assert!(sm
            .tolerated_risks
            .iter()
            .any(|r| r.evidence.contains("Performance bottleneck")));
    }

    #[test]
    fn test_agent_version_increments_on_patch() {
        let mut sm = StateMachine::new();
        sm.select_frameworks(vec!["fw1".to_string()]);

        let agent = sm.agents.get("fw1").unwrap();
        assert_eq!(agent.version, 1);

        if let Some(agent) = sm.agents.get_mut("fw1") {
            agent.content = "Revised plan v2".to_string();
            agent.version += 1;
            agent.objections.clear();
        }

        let agent = sm.agents.get("fw1").unwrap();
        assert_eq!(agent.version, 2);
        assert_eq!(agent.content, "Revised plan v2");
        assert!(agent.objections.is_empty());
    }

    #[test]
    fn test_full_session_lifecycle() {
        let mut sm = StateMachine::new();

        sm.start_session("How to build a killer AI product");
        assert_eq!(sm.topic, "How to build a killer AI product");
        assert_eq!(sm.current_phase, Phase::Input);

        sm.set_clarifications(vec![
            ClarificationQuestion::new("q1", "Who is the target user?"),
            ClarificationQuestion::new("q2", "What is the budget range?"),
        ]);
        assert_eq!(sm.clarifications.len(), 2);

        sm.answer_clarification("q1", "Startup founders");
        sm.answer_clarification("q2", "Initial budget 1M CNY");

        sm.advance_phase();
        assert_eq!(sm.current_phase, Phase::FrameworkSelection);

        sm.select_frameworks(vec![
            "first_principles".to_string(),
            "systems_thinking".to_string(),
        ]);
        assert_eq!(sm.agents.len(), 2);

        sm.advance_phase();
        assert_eq!(sm.current_phase, Phase::Divergence);

        sm.update_agent_status("first_principles", AgentStatus::Thinking);
        sm.update_agent_content("first_principles", "Plan content");
        sm.update_agent_status("first_principles", AgentStatus::Pass);

        sm.advance_phase();
        assert_eq!(sm.current_phase, Phase::Examination);

        sm.advance_phase();
        assert_eq!(sm.current_phase, Phase::Patch);

        sm.advance_phase();
        assert_eq!(sm.current_phase, Phase::Consensus);

        sm.set_consensus("Final consensus output");
        assert!(sm.consensus_output.is_some());

        assert!(!sm.ipc_logs.is_empty());
    }

    #[test]
    fn test_phase_serde_matches_frontend() {
        let cases = vec![
            (Phase::Input, "\"input\""),
            (Phase::FrameworkSelection, "\"frameworkselection\""),
            (Phase::Divergence, "\"divergence\""),
            (Phase::Examination, "\"examination\""),
            (Phase::Patch, "\"patch\""),
            (Phase::Consensus, "\"consensus\""),
        ];

        for (phase, expected_json) in cases {
            let serialized = serde_json::to_string(&phase).unwrap();
            assert_eq!(
                serialized, expected_json,
                "Phase {:?} serializes incorrectly",
                phase
            );

            let deserialized: Phase = serde_json::from_str(&serialized).unwrap();
            assert_eq!(deserialized, phase);
        }
    }

    #[test]
    fn test_parse_examination_response_strict_json() {
        let raw = r#"{
            "has_major_objection": true,
            "objection_items": ["假设缺少数据验证", "执行路径没有负责人"],
            "review_summary": "存在重大异议"
        }"#;

        let (has_objection, items, parse_mode) = parse_examination_response_with_repair(raw);
        assert!(has_objection);
        assert_eq!(parse_mode, ExaminationParseMode::StrictJson);
        assert_eq!(items.len(), 2);
        assert!(items.iter().any(|item| item.contains("数据验证")));
    }

    #[test]
    fn test_parse_examination_response_repair_json_keys() {
        let raw = r#"{
            "hasMajorObjection": true,
            "objections": [
                {"reason": "缺少预算边界"},
                "里程碑定义不清晰"
            ]
        }"#;

        let (has_objection, items, parse_mode) = parse_examination_response_with_repair(raw);
        assert!(has_objection);
        assert_eq!(parse_mode, ExaminationParseMode::RepairedJson);
        assert_eq!(items.len(), 2);
        assert!(items.iter().any(|item| item.contains("预算边界")));
    }

    #[test]
    fn test_parse_examination_response_text_fallback() {
        let raw = "存在重大异议：当前方案缺少关键验收标准，且资源约束不成立。";
        let (has_objection, items, parse_mode) = parse_examination_response_with_repair(raw);
        assert!(has_objection);
        assert_eq!(parse_mode, ExaminationParseMode::TextFallback);
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn test_parse_examination_response_false_flag_should_not_be_misclassified() {
        let raw = r#"{
            "has_major_objection": false,
            "objection_items": [],
            "review_summary": "方案总体可行，仅建议后续持续监控指标。"
        }"#;

        let (has_objection, items, parse_mode) = parse_examination_response_with_repair(raw);
        assert!(!has_objection);
        assert!(items.is_empty());
        assert_eq!(parse_mode, ExaminationParseMode::StrictJson);
    }

    #[test]
    fn test_parse_examination_response_malformed_json_like_should_extract_objection_items() {
        let raw = r#"{
            "has_major_objection": true,
            "objection_items": [
                "多线并行会造成管理负荷瞬时过载",
                "核心指标来源不稳定，无法形成可复现实验"
        "#;

        let (has_objection, items, _parse_mode) = parse_examination_response_with_repair(raw);
        assert!(has_objection);
        assert!(!items.is_empty());
        assert!(items.iter().any(|item| item.contains("管理负荷瞬时过载")));
        assert!(!items
            .iter()
            .any(|item| item.contains("has_major_objection")));
    }

    #[test]
    fn test_fallback_synthesize_uses_chinese_structured_sections() {
        let md = Synthesizer::fallback_synthesize(
            "## [fw] v1\n\ncontent",
            &[ToleratedRiskItem::new(
                "fw",
                "风险A",
                "风险A证据",
                "先做灰度复核。",
            )],
        );
        assert!(md.contains("### 💡 一句话结论"));
        assert!(md.contains("### 🤝 核心共识"));
        assert!(md.contains("### ⚖️ 主要分歧"));
        assert!(md.contains("### 🚨 风险与缓解对策"));
        assert!(md.contains("### 🗺️ 下一步的行动方案（按需输出）"));
    }
}
