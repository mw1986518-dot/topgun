#![allow(clippy::module_inception)]

#[cfg(test)]
mod tests {
    use crate::state::Phase;
    use crate::state::*;

    #[test]
    fn test_phase_next() {
        assert_eq!(Phase::Input.next(), Some(Phase::FrameworkSelection));
        assert_eq!(Phase::FrameworkSelection.next(), Some(Phase::Divergence));
        assert_eq!(Phase::Divergence.next(), Some(Phase::Examination));
        assert_eq!(Phase::Examination.next(), Some(Phase::Patch));
        assert_eq!(Phase::Patch.next(), Some(Phase::Consensus));
        assert_eq!(Phase::Consensus.next(), None);
    }

    #[test]
    fn test_phase_can_go_back() {
        assert!(!Phase::Input.can_go_back());
        assert!(Phase::FrameworkSelection.can_go_back());
        assert!(Phase::Consensus.can_go_back());
    }

    #[test]
    fn test_phase_display_name() {
        assert_eq!(Phase::Input.display_name(), "需求深挖期");
        assert_eq!(Phase::FrameworkSelection.display_name(), "框架推荐期");
        assert_eq!(Phase::Consensus.display_name(), "共识统一期");
    }

    #[test]
    fn test_agent_state_new() {
        let state = AgentState::new("test-framework");
        assert_eq!(state.framework_id, "test-framework");
        assert_eq!(state.status, AgentStatus::Idle);
        assert!(state.content.is_empty());
        assert_eq!(state.version, 1);
        assert!(state.objections.is_empty());
    }

    #[test]
    fn test_clarification_question() {
        let q = ClarificationQuestion::new("q1", "What is your goal?");
        assert_eq!(q.id, "q1");
        assert_eq!(q.question, "What is your goal?");
        assert!(q.answer.is_none());
    }

    #[test]
    fn test_ipc_log_entry() {
        let entry = IpcLogEntry::info("TestSource", "Test message");
        assert_eq!(entry.level, "info");
        assert_eq!(entry.source, "TestSource");
        assert_eq!(entry.message, "Test message");
        assert!(entry.timestamp > 0);
    }

    #[test]
    fn test_ipc_log_entry_levels() {
        let warn = IpcLogEntry::warn("Src", "Warn");
        assert_eq!(warn.level, "warn");

        let error = IpcLogEntry::error("Src", "Error");
        assert_eq!(error.level, "error");
    }

    #[test]
    fn test_state_machine_new() {
        let sm = StateMachine::new();
        assert_eq!(sm.current_phase, Phase::Input);
        assert!(sm.topic.is_empty());
        assert!(sm.clarifications.is_empty());
        assert!(sm.selected_frameworks.is_empty());
        assert!(sm.agents.is_empty());
        assert_eq!(sm.iteration_count, 0);
        assert!(!sm.is_reasoning_running);
        assert_eq!(sm.max_iterations, 3);
        assert_eq!(sm.diagnostics.reasoning_runs, 0);
        assert_eq!(sm.diagnostics.phase_durations_ms.total_ms, 0);
        assert_eq!(sm.diagnostics.failure_counts.total, 0);
        assert_eq!(sm.diagnostics.fallback_counts.total, 0);
    }

    #[test]
    fn test_state_machine_start_session() {
        let mut sm = StateMachine::new();
        sm.record_phase_duration(Phase::Divergence, 1200);
        sm.record_phase_failure(Phase::Patch);
        sm.record_consensus_fallback();
        sm.start_session("Test topic");

        assert_eq!(sm.topic, "Test topic");
        assert_eq!(sm.current_phase, Phase::Input);
        assert!(sm.clarifications.is_empty());
        assert_eq!(sm.diagnostics.phase_durations_ms.total_ms, 0);
        assert_eq!(sm.diagnostics.failure_counts.total, 0);
        assert_eq!(sm.diagnostics.fallback_counts.total, 0);
    }

    #[test]
    fn test_state_machine_diagnostics_metrics() {
        let mut sm = StateMachine::new();
        sm.mark_reasoning_started();
        sm.record_phase_duration(Phase::Divergence, 100);
        sm.record_phase_duration(Phase::Examination, 200);
        sm.record_phase_failure(Phase::Examination);
        sm.record_examination_parser_repair();
        sm.record_examination_text_fallback();
        sm.record_consensus_fallback();
        sm.mark_reasoning_completed();

        assert_eq!(sm.diagnostics.reasoning_runs, 1);
        assert_eq!(sm.diagnostics.phase_durations_ms.divergence_ms, 100);
        assert_eq!(sm.diagnostics.phase_durations_ms.examination_ms, 200);
        assert_eq!(sm.diagnostics.phase_durations_ms.total_ms, 300);
        assert_eq!(sm.diagnostics.failure_counts.examination, 1);
        assert_eq!(sm.diagnostics.failure_counts.total, 1);
        assert_eq!(sm.diagnostics.fallback_counts.examination_parser_repair, 1);
        assert_eq!(sm.diagnostics.fallback_counts.examination_text_fallback, 1);
        assert_eq!(
            sm.diagnostics
                .fallback_counts
                .consensus_synthesizer_fallback,
            1
        );
        assert_eq!(sm.diagnostics.fallback_counts.total, 3);
        assert!(sm.diagnostics.last_run_started_at.is_some());
        assert!(sm.diagnostics.last_run_completed_at.is_some());
    }

    #[test]
    fn test_state_machine_set_clarifications() {
        let mut sm = StateMachine::new();
        let questions = vec![
            ClarificationQuestion::new("q1", "Q1"),
            ClarificationQuestion::new("q2", "Q2"),
        ];
        sm.set_clarifications(questions);

        assert_eq!(sm.clarifications.len(), 2);
    }

    #[test]
    fn test_state_machine_answer_clarification() {
        let mut sm = StateMachine::new();
        sm.set_clarifications(vec![ClarificationQuestion::new("q1", "Question")]);

        assert!(sm.answer_clarification("q1", "Answer"));
        assert_eq!(sm.clarifications[0].answer, Some("Answer".to_string()));
        assert!(!sm.answer_clarification("nonexistent", "Answer"));
    }

    #[test]
    fn test_state_machine_select_frameworks() {
        let mut sm = StateMachine::new();
        sm.select_frameworks(vec!["fw1".to_string(), "fw2".to_string()]);

        assert_eq!(sm.selected_frameworks.len(), 2);
        assert_eq!(sm.agents.len(), 2);
        assert!(sm.agents.contains_key("fw1"));
        assert!(sm.agents.contains_key("fw2"));
    }

    #[test]
    fn test_state_machine_advance_phase() {
        let mut sm = StateMachine::new();

        assert!(sm.advance_phase());
        assert_eq!(sm.current_phase, Phase::FrameworkSelection);

        assert!(sm.advance_phase());
        assert_eq!(sm.current_phase, Phase::Divergence);

        // Advance to end
        sm.current_phase = Phase::Consensus;
        assert!(!sm.advance_phase());
    }

    #[test]
    fn test_state_machine_update_agent_status() {
        let mut sm = StateMachine::new();
        sm.select_frameworks(vec!["fw1".to_string()]);

        sm.update_agent_status("fw1", AgentStatus::Thinking);
        assert_eq!(sm.agents.get("fw1").unwrap().status, AgentStatus::Thinking);
    }

    #[test]
    fn test_state_machine_add_objection() {
        let mut sm = StateMachine::new();
        sm.select_frameworks(vec!["fw1".to_string()]);

        sm.add_objection("fw1", "This is wrong");
        assert_eq!(sm.agents.get("fw1").unwrap().objections.len(), 1);
    }

    #[test]
    fn test_state_machine_iteration() {
        let mut sm = StateMachine::new();
        sm.max_iterations = 3;

        assert!(sm.increment_iteration());
        assert_eq!(sm.iteration_count, 1);

        sm.iteration_count = 2;
        assert!(!sm.increment_iteration()); // Should hit max
    }

    #[test]
    fn test_state_machine_tolerated_risks() {
        let mut sm = StateMachine::new();
        sm.add_tolerated_risk(ToleratedRiskItem::new(
            "fw1",
            "Risk 1",
            "Risk 1 evidence",
            "Fix 1",
        ));
        sm.add_tolerated_risk(ToleratedRiskItem::new(
            "fw2",
            "Risk 2",
            "Risk 2 evidence",
            "Fix 2",
        ));

        assert_eq!(sm.tolerated_risks.len(), 2);
    }

    #[test]
    fn test_tolerated_risk_legacy_string_can_deserialize() {
        let legacy_json = r#"{
            "current_phase":"input",
            "topic":"",
            "clarifications":[],
            "clarification_round":1,
            "selected_frameworks":[],
            "recommended_frameworks":[],
            "reframed_issue":null,
            "recommended_experts_panel":null,
            "problem_brief_messages":[],
            "problem_brief_ready":false,
            "custom_user_prompt":null,
            "agents":{},
            "ipc_logs":[],
            "iteration_count":0,
            "is_reasoning_running":false,
            "max_iterations":3,
            "consensus_output":null,
            "tolerated_risks":["[fw_x] unresolved objection after max iterations: risk detail text"],
            "diagnostics":{
                "phase_durations_ms":{"divergence_ms":0,"examination_ms":0,"patch_ms":0,"consensus_ms":0,"total_ms":0},
                "failure_counts":{"divergence":0,"examination":0,"patch":0,"consensus":0,"total":0},
                "fallback_counts":{"examination_parser_repair":0,"examination_text_fallback":0,"consensus_synthesizer_fallback":0,"total":0},
                "reasoning_runs":0,
                "last_run_started_at":null,
                "last_run_completed_at":null
            }
        }"#;

        let sm: StateMachine =
            serde_json::from_str(legacy_json).expect("legacy snapshot should be readable");
        assert_eq!(sm.tolerated_risks.len(), 1);
        assert_eq!(sm.tolerated_risks[0].framework_id, "fw_x");
        assert!(sm.tolerated_risks[0].evidence.contains("risk detail"));
    }

    #[test]
    fn test_state_machine_consensus() {
        let mut sm = StateMachine::new();
        sm.set_consensus("Final output");

        assert_eq!(sm.consensus_output, Some("Final output".to_string()));
    }

    #[test]
    fn test_state_machine_all_agents_complete() {
        let mut sm = StateMachine::new();
        sm.select_frameworks(vec!["fw1".to_string(), "fw2".to_string()]);

        sm.update_agent_status("fw1", AgentStatus::Pass);
        sm.update_agent_status("fw2", AgentStatus::Complete);

        assert!(sm.all_agents_complete());

        sm.update_agent_status("fw1", AgentStatus::Thinking);
        assert!(!sm.all_agents_complete());
    }

    #[test]
    fn test_state_machine_has_objections() {
        let mut sm = StateMachine::new();
        sm.select_frameworks(vec!["fw1".to_string()]);

        assert!(!sm.has_objections());

        sm.update_agent_status("fw1", AgentStatus::Objection);
        assert!(sm.has_objections());
    }

    #[test]
    fn test_state_machine_get_all_objections() {
        let mut sm = StateMachine::new();
        sm.select_frameworks(vec!["fw1".to_string()]);
        sm.add_objection("fw1", "Objection 1");
        sm.add_objection("fw1", "Objection 2");

        let objections = sm.get_all_objections();
        assert_eq!(objections.len(), 2);
    }

    #[test]
    fn test_state_machine_ipc_logs() {
        let mut sm = StateMachine::new();
        sm.log_info("Test", "Info message");
        sm.log_warn("Test", "Warn message");
        sm.log_error("Test", "Error message");

        assert_eq!(sm.ipc_logs.len(), 3);
    }

    // ========== Action Plan Tests ==========

    #[test]
    fn test_action_plan_question_new() {
        let q = ActionPlanQuestion::new(
            "budget",
            "月薪范围是多少？",
            "薪酬计算需要具体数字",
            "激励重构",
        );
        assert_eq!(q.key, "budget");
        assert_eq!(q.question, "月薪范围是多少？");
        assert_eq!(q.reason, "薪酬计算需要具体数字");
        assert_eq!(q.related_action, "激励重构");
    }

    #[test]
    fn test_state_machine_start_action_plan() {
        let mut sm = StateMachine::new();

        let questions = vec![
            ActionPlanQuestion::new("budget", "月薪范围？", "薪酬计算", "激励重构"),
            ActionPlanQuestion::new("team_size", "团队几人？", "SOP分工", "SOP降维"),
        ];

        sm.start_action_plan(questions);

        assert!(sm.action_plan_in_progress);
        assert_eq!(sm.action_plan_questions.len(), 2);
        assert_eq!(sm.current_action_plan_question_index, 0);
        assert!(sm.action_plan_answers.is_empty());
        assert!(sm.action_plan.is_none());
    }

    #[test]
    fn test_state_machine_answer_action_plan_question() {
        let mut sm = StateMachine::new();
        let questions = vec![
            ActionPlanQuestion::new("budget", "月薪范围？", "薪酬计算", "激励重构"),
            ActionPlanQuestion::new("team_size", "团队几人？", "SOP分工", "SOP降维"),
        ];
        sm.start_action_plan(questions);

        // 回答第一个问题
        let next = sm.answer_action_plan_question("budget".to_string(), "8000元".to_string());
        assert!(next.is_some());
        assert_eq!(sm.action_plan_answers.get("budget"), Some(&"8000元".to_string()));
        assert_eq!(sm.current_action_plan_question_index, 1);

        // 回答第二个问题
        let next = sm.answer_action_plan_question("team_size".to_string(), "3人".to_string());
        assert!(next.is_none()); // 所有问题已回答
        assert_eq!(sm.action_plan_answers.len(), 2);
        assert_eq!(sm.current_action_plan_question_index, 2);
    }

    #[test]
    fn test_state_machine_set_action_plan() {
        let mut sm = StateMachine::new();
        sm.start_action_plan(vec![]);

        sm.set_action_plan("落地方案内容".to_string());

        assert!(!sm.action_plan_in_progress);
        assert_eq!(sm.action_plan, Some("落地方案内容".to_string()));
    }

    #[test]
    fn test_state_machine_cancel_action_plan() {
        let mut sm = StateMachine::new();
        sm.start_action_plan(vec![ActionPlanQuestion::new("test", "Test?", "Reason", "Action")]);

        assert!(sm.action_plan_in_progress);

        sm.cancel_action_plan();
        assert!(!sm.action_plan_in_progress);
    }

    #[test]
    fn test_state_machine_get_current_action_plan_question() {
        let mut sm = StateMachine::new();
        let questions = vec![
            ActionPlanQuestion::new("q1", "问题1", "原因1", "行动1"),
            ActionPlanQuestion::new("q2", "问题2", "原因2", "行动2"),
        ];
        sm.start_action_plan(questions);

        let current = sm.get_current_action_plan_question();
        assert!(current.is_some());
        assert_eq!(current.unwrap().key, "q1");

        sm.answer_action_plan_question("q1".to_string(), "答案1".to_string());

        let current = sm.get_current_action_plan_question();
        assert!(current.is_some());
        assert_eq!(current.unwrap().key, "q2");

        sm.answer_action_plan_question("q2".to_string(), "答案2".to_string());

        let current = sm.get_current_action_plan_question();
        assert!(current.is_none());
    }

    #[test]
    fn test_state_machine_is_action_plan_questions_complete() {
        let mut sm = StateMachine::new();

        // 没有问题时，不认为完成
        assert!(!sm.is_action_plan_questions_complete());

        let questions = vec![
            ActionPlanQuestion::new("q1", "问题1", "原因1", "行动1"),
        ];
        sm.start_action_plan(questions);

        // 还没回答，不完成
        assert!(!sm.is_action_plan_questions_complete());

        // 回答后，完成
        sm.answer_action_plan_question("q1".to_string(), "答案".to_string());
        assert!(sm.is_action_plan_questions_complete());
    }

    #[test]
    fn test_state_machine_get_action_plan_progress() {
        let mut sm = StateMachine::new();
        let questions = vec![
            ActionPlanQuestion::new("q1", "问题1", "原因1", "行动1"),
            ActionPlanQuestion::new("q2", "问题2", "原因2", "行动2"),
            ActionPlanQuestion::new("q3", "问题3", "原因3", "行动3"),
        ];
        sm.start_action_plan(questions);

        let (answered, total) = sm.get_action_plan_progress();
        assert_eq!(answered, 0);
        assert_eq!(total, 3);

        sm.answer_action_plan_question("q1".to_string(), "A1".to_string());
        let (answered, total) = sm.get_action_plan_progress();
        assert_eq!(answered, 1);
        assert_eq!(total, 3);

        sm.answer_action_plan_question("q2".to_string(), "A2".to_string());
        sm.answer_action_plan_question("q3".to_string(), "A3".to_string());
        let (answered, total) = sm.get_action_plan_progress();
        assert_eq!(answered, 3);
        assert_eq!(total, 3);
    }

    #[test]
    fn test_state_machine_start_session_clears_action_plan() {
        let mut sm = StateMachine::new();
        sm.start_action_plan(vec![ActionPlanQuestion::new("test", "Test?", "Reason", "Action")]);
        sm.action_plan_answers.insert("key".to_string(), "value".to_string());
        sm.set_action_plan("方案".to_string());

        sm.start_session("新话题");

        assert!(sm.action_plan_questions.is_empty());
        assert!(sm.action_plan_answers.is_empty());
        assert_eq!(sm.current_action_plan_question_index, 0);
        assert!(sm.action_plan.is_none());
        assert!(!sm.action_plan_in_progress);
    }
}
