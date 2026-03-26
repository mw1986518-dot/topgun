//! State Machine module
//!
//! Manages the multi-phase reasoning workflow:
//! Phase -1: Requirement deep-dive
//! Phase 0: Framework recommendation
//! Phase 1-3: Parallel reasoning, critique, and patch
//! Phase 4: Consensus synthesis

mod tests;

use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

/// Phase of the reasoning process
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    /// Initial input phase
    #[default]
    Input = -1,
    /// Framework recommendation phase
    FrameworkSelection = 0,
    /// Parallel divergence phase
    Divergence = 1,
    /// Cross-examination phase
    Examination = 2,
    /// Patch and iteration phase
    Patch = 3,
    /// Consensus synthesis phase
    Consensus = 4,
}

impl Phase {
    /// Get the next phase
    pub fn next(&self) -> Option<Phase> {
        match self {
            Phase::Input => Some(Phase::FrameworkSelection),
            Phase::FrameworkSelection => Some(Phase::Divergence),
            Phase::Divergence => Some(Phase::Examination),
            Phase::Examination => Some(Phase::Patch),
            Phase::Patch => Some(Phase::Consensus),
            Phase::Consensus => None,
        }
    }

    /// Check if this phase allows going back
    pub fn can_go_back(&self) -> bool {
        !matches!(self, Phase::Input)
    }

    /// Get phase display name
    pub fn display_name(&self) -> &'static str {
        match self {
            Phase::Input => "需求深挖期",
            Phase::FrameworkSelection => "框架推荐期",
            Phase::Divergence => "并发发散期",
            Phase::Examination => "交叉质询期",
            Phase::Patch => "方案修补期",
            Phase::Consensus => "共识统一期",
        }
    }
}

/// Agent status during reasoning
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Idle,
    Thinking,
    Pass,
    Objection,
    Patching,
    Complete,
}

/// Individual agent state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentState {
    pub framework_id: String,
    pub status: AgentStatus,
    pub content: String,
    pub version: u32,
    pub objections: Vec<String>,
}

impl AgentState {
    pub fn new(framework_id: impl Into<String>) -> Self {
        Self {
            framework_id: framework_id.into(),
            status: AgentStatus::Idle,
            content: String::new(),
            version: 1,
            objections: Vec::new(),
        }
    }
}

/// Clarification question
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClarificationQuestion {
    pub id: String,
    pub question: String,
    pub answer: Option<String>,
}

impl ClarificationQuestion {
    pub fn new(id: impl Into<String>, question: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            question: question.into(),
            answer: None,
        }
    }
}

/// 阶段二（Problem Definer）对话消息。
/// role 使用 openai/gemini 常见约定：system / user / assistant。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProblemBriefMessage {
    pub role: String,
    pub content: String,
}

impl ProblemBriefMessage {
    pub fn new(role: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: role.into(),
            content: content.into(),
        }
    }
}

/// 落地方案相关问题。
/// 用于收集生成落地方案所需的关键参数。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionPlanQuestion {
    /// 参数标识
    pub key: String,
    /// 问用户的文字
    pub question: String,
    /// 为什么需要这个参数
    pub reason: String,
    /// 关联的共识行动项
    pub related_action: String,
}

impl ActionPlanQuestion {
    pub fn new(
        key: impl Into<String>,
        question: impl Into<String>,
        reason: impl Into<String>,
        related_action: impl Into<String>,
    ) -> Self {
        Self {
            key: key.into(),
            question: question.into(),
            reason: reason.into(),
            related_action: related_action.into(),
        }
    }
}

/// IPC log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcLogEntry {
    pub timestamp: u64,
    pub level: String,
    pub source: String,
    pub message: String,
}

impl IpcLogEntry {
    pub fn new(
        level: impl Into<String>,
        source: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            timestamp: current_millis(),
            level: level.into(),
            source: source.into(),
            message: message.into(),
        }
    }

    pub fn info(source: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new("info", source, message)
    }

    pub fn warn(source: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new("warn", source, message)
    }

    pub fn error(source: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new("error", source, message)
    }
}

/// Metrics for phase durations.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PhaseDiagnostics {
    #[serde(default)]
    pub divergence_ms: u64,
    #[serde(default)]
    pub examination_ms: u64,
    #[serde(default)]
    pub patch_ms: u64,
    #[serde(default)]
    pub consensus_ms: u64,
    #[serde(default)]
    pub total_ms: u64,
}

/// Metrics for failed model calls.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FailureDiagnostics {
    #[serde(default)]
    pub divergence: u32,
    #[serde(default)]
    pub examination: u32,
    #[serde(default)]
    pub patch: u32,
    #[serde(default)]
    pub consensus: u32,
    #[serde(default)]
    pub total: u32,
}

/// Metrics for fallback paths.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FallbackDiagnostics {
    /// Examination output was parsed by the repaired JSON branch.
    #[serde(default)]
    pub examination_parser_repair: u32,
    /// Examination output fell back to weak text parsing.
    #[serde(default)]
    pub examination_text_fallback: u32,
    /// Consensus used built-in markdown fallback instead of model synthesis.
    #[serde(default)]
    pub consensus_synthesizer_fallback: u32,
    #[serde(default)]
    pub total: u32,
}

/// Structured diagnostics attached to each session snapshot.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionDiagnostics {
    #[serde(default)]
    pub phase_durations_ms: PhaseDiagnostics,
    #[serde(default)]
    pub failure_counts: FailureDiagnostics,
    #[serde(default)]
    pub fallback_counts: FallbackDiagnostics,
    #[serde(default)]
    pub reasoning_runs: u32,
    #[serde(default)]
    pub last_run_started_at: Option<u64>,
    #[serde(default)]
    pub last_run_completed_at: Option<u64>,
}

impl SessionDiagnostics {
    pub fn mark_reasoning_started(&mut self) {
        self.reasoning_runs = self.reasoning_runs.saturating_add(1);
        self.last_run_started_at = Some(current_millis());
    }

    pub fn mark_reasoning_completed(&mut self) {
        self.last_run_completed_at = Some(current_millis());
    }

    pub fn add_phase_duration(&mut self, phase: Phase, duration_ms: u64) {
        let safe_duration = duration_ms;
        match phase {
            Phase::Divergence => {
                self.phase_durations_ms.divergence_ms = self
                    .phase_durations_ms
                    .divergence_ms
                    .saturating_add(safe_duration);
            }
            Phase::Examination => {
                self.phase_durations_ms.examination_ms = self
                    .phase_durations_ms
                    .examination_ms
                    .saturating_add(safe_duration);
            }
            Phase::Patch => {
                self.phase_durations_ms.patch_ms = self
                    .phase_durations_ms
                    .patch_ms
                    .saturating_add(safe_duration);
            }
            Phase::Consensus => {
                self.phase_durations_ms.consensus_ms = self
                    .phase_durations_ms
                    .consensus_ms
                    .saturating_add(safe_duration);
            }
            Phase::Input | Phase::FrameworkSelection => {}
        }
        self.phase_durations_ms.total_ms = self
            .phase_durations_ms
            .total_ms
            .saturating_add(safe_duration);
    }

    pub fn increment_failure(&mut self, phase: Phase) {
        match phase {
            Phase::Divergence => {
                self.failure_counts.divergence = self.failure_counts.divergence.saturating_add(1);
            }
            Phase::Examination => {
                self.failure_counts.examination = self.failure_counts.examination.saturating_add(1);
            }
            Phase::Patch => {
                self.failure_counts.patch = self.failure_counts.patch.saturating_add(1);
            }
            Phase::Consensus => {
                self.failure_counts.consensus = self.failure_counts.consensus.saturating_add(1);
            }
            Phase::Input | Phase::FrameworkSelection => {}
        }
        self.failure_counts.total = self.failure_counts.total.saturating_add(1);
    }

    pub fn increment_examination_parser_repair(&mut self) {
        self.fallback_counts.examination_parser_repair = self
            .fallback_counts
            .examination_parser_repair
            .saturating_add(1);
        self.fallback_counts.total = self.fallback_counts.total.saturating_add(1);
    }

    pub fn increment_examination_text_fallback(&mut self) {
        self.fallback_counts.examination_text_fallback = self
            .fallback_counts
            .examination_text_fallback
            .saturating_add(1);
        self.fallback_counts.total = self.fallback_counts.total.saturating_add(1);
    }

    pub fn increment_consensus_fallback(&mut self) {
        self.fallback_counts.consensus_synthesizer_fallback = self
            .fallback_counts
            .consensus_synthesizer_fallback
            .saturating_add(1);
        self.fallback_counts.total = self.fallback_counts.total.saturating_add(1);
    }
}

/// A temporarily accepted unresolved risk.
///
/// 这类风险不是“最终已解决风险”，而是：
/// - 已达到最大迭代次数；
/// - 仍存在关键异议；
/// - 当前为了继续决策先“临时挂起”。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ToleratedRiskItem {
    /// Which framework raised this unresolved objection.
    pub framework_id: String,
    /// One-line risk summary (for quick scanning in UI).
    pub risk_summary: String,
    /// Evidence / details that explain why this risk exists.
    pub evidence: String,
    /// Why this risk is temporarily accepted.
    pub temporary_reason: String,
    /// Suggested follow-up action to close this risk later.
    pub next_action: String,
}

impl ToleratedRiskItem {
    /// Build a normalized tolerated risk item.
    pub fn new(
        framework_id: impl Into<String>,
        risk_summary: impl Into<String>,
        evidence: impl Into<String>,
        next_action: impl Into<String>,
    ) -> Self {
        Self {
            framework_id: framework_id.into(),
            risk_summary: risk_summary.into(),
            evidence: evidence.into(),
            temporary_reason: "达到最大迭代次数后仍未收敛，当前作为临时容忍项保留。".to_string(),
            next_action: next_action.into(),
        }
    }

    /// Convert old string-based snapshots into the new structured shape.
    ///
    /// 这样旧版本 history.json 仍然可以被当前版本安全读取。
    pub fn from_legacy_text(raw: &str) -> Self {
        let framework_id =
            extract_framework_id_from_legacy(raw).unwrap_or_else(|| "unknown".into());
        let evidence = normalize_legacy_evidence(&extract_detail_from_legacy(raw));
        let risk_summary = build_legacy_risk_summary(&evidence);

        Self::new(
            framework_id,
            risk_summary,
            evidence,
            "补充关键证据并指定责任人，下一轮优先复核该风险后再推进执行。",
        )
    }
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ToleratedRiskCompat {
    Structured(ToleratedRiskItem),
    LegacyString(String),
}

fn extract_framework_id_from_legacy(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let start = trimmed.find('[')?;
    let end = trimmed[start + 1..].find(']')?;
    let framework = trimmed[start + 1..start + 1 + end].trim();
    if framework.is_empty() {
        None
    } else {
        Some(framework.to_string())
    }
}

fn extract_detail_from_legacy(raw: &str) -> String {
    let trimmed = raw.trim();

    if let Some((_, tail)) = trimmed.split_once("max iterations:") {
        return tail.trim().to_string();
    }
    if let Some((_, tail)) = trimmed.split_once("最大迭代后仍未收敛：") {
        return tail.trim().to_string();
    }
    if let Some((_, tail)) = trimmed.split_once("：") {
        if trimmed.contains("max iterations") || trimmed.contains("最大迭代") {
            return tail.trim().to_string();
        }
    }
    if let Some((_, tail)) = trimmed.split_once(']') {
        let cleaned = tail
            .trim()
            .trim_start_matches(':')
            .trim_start_matches('：')
            .trim();
        if !cleaned.is_empty() {
            return cleaned.to_string();
        }
    }

    trimmed.to_string()
}

fn extract_legacy_objection_items(detail: &str) -> Vec<String> {
    let markers = ["objection_items", "objectionItems", "objections"];
    for marker in markers {
        let Some(marker_start) = detail.find(marker) else {
            continue;
        };
        let marker_tail = &detail[marker_start..];
        let Some(left_bracket_rel) = marker_tail.find('[') else {
            continue;
        };

        let array_start = marker_start + left_bracket_rel + 1;
        let array_tail = &detail[array_start..];
        let array_end_rel = array_tail.find(']').unwrap_or(array_tail.len());
        let array_inner = &array_tail[..array_end_rel];

        let mut out = Vec::new();
        let mut in_quotes = false;
        let mut escape = false;
        let mut buf = String::new();

        for ch in array_inner.chars() {
            if !in_quotes {
                if ch == '"' {
                    in_quotes = true;
                    buf.clear();
                }
                continue;
            }

            if escape {
                buf.push(ch);
                escape = false;
                continue;
            }

            if ch == '\\' {
                escape = true;
                continue;
            }

            if ch == '"' {
                let text = buf.trim();
                if !text.is_empty() {
                    out.push(text.to_string());
                }
                in_quotes = false;
                continue;
            }

            buf.push(ch);
        }

        if !out.is_empty() {
            out.sort();
            out.dedup();
            return out;
        }
    }

    Vec::new()
}

fn normalize_legacy_evidence(detail: &str) -> String {
    let compact = detail.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() {
        return compact;
    }

    let extracted = extract_legacy_objection_items(&compact);
    if !extracted.is_empty() {
        return extracted.join("；");
    }

    compact
}

fn build_legacy_risk_summary(detail: &str) -> String {
    let compact = detail.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.is_empty() {
        return "存在未收敛风险（旧版记录自动迁移）".to_string();
    }

    let mut summary = String::new();
    for ch in compact.chars().take(36) {
        summary.push(ch);
    }
    if compact.chars().count() > 36 {
        summary.push_str("...");
    }
    summary
}

fn deserialize_tolerated_risks<'de, D>(deserializer: D) -> Result<Vec<ToleratedRiskItem>, D::Error>
where
    D: Deserializer<'de>,
{
    let raw_items =
        Option::<Vec<ToleratedRiskCompat>>::deserialize(deserializer)?.unwrap_or_default();
    let normalized = raw_items
        .into_iter()
        .map(|item| match item {
            ToleratedRiskCompat::Structured(structured) => structured,
            ToleratedRiskCompat::LegacyString(text) => ToleratedRiskItem::from_legacy_text(&text),
        })
        .collect::<Vec<_>>();
    Ok(normalized)
}

/// Main state machine for the reasoning process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateMachine {
    /// Current phase
    pub current_phase: Phase,
    /// Original topic/question
    pub topic: String,
    /// Clarification questions and answers
    pub clarifications: Vec<ClarificationQuestion>,
    /// Clarification round counter (1 or 2)
    pub clarification_round: u32,
    /// Selected frameworks
    pub selected_frameworks: Vec<String>,
    /// Recommended framework IDs from the LLM based on user inputs
    pub recommended_frameworks: Vec<String>,
    /// Reframed and synthesized high-quality issue
    pub reframed_issue: Option<String>,
    /// Stage-2 expert recommendation panel markdown extracted from final output.
    /// `serde(default)` keeps old snapshots backward compatible.
    #[serde(default)]
    pub recommended_experts_panel: Option<String>,
    /// Stage-2 Problem Definer conversational history (Gemini-like UI).
    /// `serde(default)` keeps old snapshots backward compatible.
    #[serde(default)]
    pub problem_brief_messages: Vec<ProblemBriefMessage>,
    /// Whether stage-2 dialogue has already produced final brief code block.
    /// `serde(default)` keeps old snapshots backward compatible.
    #[serde(default)]
    pub problem_brief_ready: bool,
    /// Optional user-edited prompt text that overrides default divergence user message.
    /// `serde(default)` keeps old snapshots compatible.
    #[serde(default)]
    pub custom_user_prompt: Option<String>,
    /// Agent states
    pub agents: HashMap<String, AgentState>,
    /// IPC logs
    pub ipc_logs: Vec<IpcLogEntry>,
    /// Current iteration count (for circuit breaker)
    pub iteration_count: u32,
    /// Whether the reasoning engine is currently running.
    /// `serde(default)` keeps backward compatibility with old snapshots.
    #[serde(default)]
    pub is_reasoning_running: bool,
    /// Maximum iterations allowed
    pub max_iterations: u32,
    /// Final consensus output
    pub consensus_output: Option<String>,
    /// Tolerated risks (temporary accepted unresolved issues after max iterations).
    ///
    /// 兼容性说明：
    /// - 新版本以结构化对象存储；
    /// - 旧版本可能是字符串数组，反序列化时会自动迁移。
    #[serde(default, deserialize_with = "deserialize_tolerated_risks")]
    pub tolerated_risks: Vec<ToleratedRiskItem>,
    /// Structured diagnostics for observability and history replay.
    /// `serde(default)` keeps old snapshots backward compatible.
    #[serde(default)]
    pub diagnostics: SessionDiagnostics,

    // ========== 落地方案生成相关字段 ==========

    /// 落地方案相关问题列表
    #[serde(default)]
    pub action_plan_questions: Vec<ActionPlanQuestion>,
    /// 已收集的参数答案
    #[serde(default)]
    pub action_plan_answers: HashMap<String, String>,
    /// 当前追问索引
    #[serde(default)]
    pub current_action_plan_question_index: usize,
    /// 生成的落地方案
    #[serde(default)]
    pub action_plan: Option<String>,
    /// 是否正在落地方案流程中
    #[serde(default)]
    pub action_plan_in_progress: bool,
}

impl StateMachine {
    /// Create a new state machine
    pub fn new() -> Self {
        Self {
            current_phase: Phase::Input,
            topic: String::new(),
            clarifications: Vec::new(),
            clarification_round: 1,
            selected_frameworks: Vec::new(),
            recommended_frameworks: Vec::new(),
            reframed_issue: None,
            recommended_experts_panel: None,
            problem_brief_messages: Vec::new(),
            problem_brief_ready: false,
            custom_user_prompt: None,
            agents: HashMap::new(),
            ipc_logs: Vec::new(),
            iteration_count: 0,
            is_reasoning_running: false,
            max_iterations: 3,
            consensus_output: None,
            tolerated_risks: Vec::new(),
            diagnostics: SessionDiagnostics::default(),
            // 落地方案相关
            action_plan_questions: Vec::new(),
            action_plan_answers: HashMap::new(),
            current_action_plan_question_index: 0,
            action_plan: None,
            action_plan_in_progress: false,
        }
    }

    /// Start a new reasoning session
    pub fn start_session(&mut self, topic: impl Into<String>) {
        self.topic = topic.into();
        self.current_phase = Phase::Input;
        self.clarifications.clear();
        self.clarification_round = 1;
        self.selected_frameworks.clear();
        self.recommended_frameworks.clear();
        self.reframed_issue = None;
        self.recommended_experts_panel = None;
        self.problem_brief_messages.clear();
        self.problem_brief_ready = false;
        self.custom_user_prompt = None;
        self.agents.clear();
        self.ipc_logs.clear();
        self.iteration_count = 0;
        self.is_reasoning_running = false;
        self.consensus_output = None;
        self.tolerated_risks.clear();
        self.diagnostics = SessionDiagnostics::default();
        // 清理落地方案相关状态
        self.action_plan_questions.clear();
        self.action_plan_answers.clear();
        self.current_action_plan_question_index = 0;
        self.action_plan = None;
        self.action_plan_in_progress = false;
        self.log_info("StateMachine", "Session started");
    }

    /// Set clarification questions
    pub fn set_clarifications(&mut self, questions: Vec<ClarificationQuestion>) {
        self.clarifications = questions;
        self.log_info("StateMachine", "Clarification questions set");
    }

    /// Answer a clarification question
    pub fn answer_clarification(&mut self, id: &str, answer: impl Into<String>) -> bool {
        if let Some(q) = self.clarifications.iter_mut().find(|q| q.id == id) {
            q.answer = Some(answer.into());
            self.log_info("StateMachine", &format!("Question {} answered", id));
            true
        } else {
            false
        }
    }

    /// Select frameworks for reasoning
    pub fn select_frameworks(&mut self, framework_ids: Vec<String>) {
        self.selected_frameworks = framework_ids.clone();
        for id in &framework_ids {
            self.agents.insert(id.clone(), AgentState::new(id.clone()));
        }
        self.log_info(
            "StateMachine",
            &format!("Selected {} frameworks", framework_ids.len()),
        );
    }

    /// Advance to the next phase
    pub fn advance_phase(&mut self) -> bool {
        if let Some(next) = self.current_phase.next() {
            self.current_phase = next;
            self.log_info("StateMachine", &format!("Advanced to phase: {:?}", next));
            true
        } else {
            false
        }
    }

    /// Update agent status
    pub fn update_agent_status(&mut self, framework_id: &str, status: AgentStatus) {
        if let Some(agent) = self.agents.get_mut(framework_id) {
            agent.status = status;
            self.log_info("Agent", &format!("{} status: {:?}", framework_id, status));
        }
    }

    /// Update agent content
    pub fn update_agent_content(&mut self, framework_id: &str, content: impl Into<String>) {
        if let Some(agent) = self.agents.get_mut(framework_id) {
            agent.content = content.into();
        }
    }

    /// Add objection to an agent
    pub fn add_objection(&mut self, framework_id: &str, objection: impl Into<String>) {
        if let Some(agent) = self.agents.get_mut(framework_id) {
            agent.objections.push(objection.into());
            self.log_warn(
                "Arbitrator",
                &format!("Objection added to {}", framework_id),
            );
        }
    }

    /// Increment iteration count
    pub fn increment_iteration(&mut self) -> bool {
        self.iteration_count += 1;
        if self.iteration_count >= self.max_iterations {
            self.log_warn(
                "StateMachine",
                "Max iterations reached - circuit breaker triggered",
            );
            false
        } else {
            true
        }
    }

    /// Add tolerated risk
    pub fn add_tolerated_risk(&mut self, risk: ToleratedRiskItem) {
        self.tolerated_risks.push(risk);
        self.log_warn("RiskManager", "Risk added to tolerance list");
    }

    /// Set consensus output
    pub fn set_consensus(&mut self, output: impl Into<String>) {
        self.consensus_output = Some(output.into());
        self.log_info("Synthesizer", "Consensus reached");
    }

    /// Mark one reasoning run as started.
    pub fn mark_reasoning_started(&mut self) {
        self.diagnostics.mark_reasoning_started();
    }

    /// Mark one reasoning run as completed.
    pub fn mark_reasoning_completed(&mut self) {
        self.diagnostics.mark_reasoning_completed();
    }

    /// Record elapsed time for one phase.
    pub fn record_phase_duration(&mut self, phase: Phase, duration_ms: u64) {
        self.diagnostics.add_phase_duration(phase, duration_ms);
    }

    /// Record one model call failure in a phase.
    pub fn record_phase_failure(&mut self, phase: Phase) {
        self.diagnostics.increment_failure(phase);
    }

    /// Record repaired JSON parsing in examination stage.
    pub fn record_examination_parser_repair(&mut self) {
        self.diagnostics.increment_examination_parser_repair();
    }

    /// Record weak text fallback parsing in examination stage.
    pub fn record_examination_text_fallback(&mut self) {
        self.diagnostics.increment_examination_text_fallback();
    }

    /// Record consensus synthesizer fallback.
    pub fn record_consensus_fallback(&mut self) {
        self.diagnostics.increment_consensus_fallback();
    }

    /// Add IPC log entry
    pub fn log(&mut self, entry: IpcLogEntry) {
        self.ipc_logs.push(entry);
    }

    /// Add info log
    pub fn log_info(&mut self, source: &str, message: &str) {
        self.log(IpcLogEntry::info(source, message));
    }

    /// Add warning log
    pub fn log_warn(&mut self, source: &str, message: &str) {
        self.log(IpcLogEntry::warn(source, message));
    }

    /// Add error log
    pub fn log_error(&mut self, source: &str, message: &str) {
        self.log(IpcLogEntry::error(source, message));
    }

    /// Check if all agents have completed the current step
    pub fn all_agents_complete(&self) -> bool {
        self.agents
            .values()
            .all(|a| matches!(a.status, AgentStatus::Pass | AgentStatus::Complete))
    }

    /// Check if there are any objections
    pub fn has_objections(&self) -> bool {
        self.agents
            .values()
            .any(|a| a.status == AgentStatus::Objection)
    }

    /// Get all objections from all agents
    pub fn get_all_objections(&self) -> Vec<(String, String)> {
        self.agents
            .iter()
            .flat_map(|(id, agent)| agent.objections.iter().map(|o| (id.clone(), o.clone())))
            .collect()
    }

    // ========== 落地方案相关方法 ==========

    /// 开始落地方案流程
    pub fn start_action_plan(&mut self, questions: Vec<ActionPlanQuestion>) {
        self.action_plan_questions = questions;
        self.action_plan_answers.clear();
        self.current_action_plan_question_index = 0;
        self.action_plan = None;
        self.action_plan_in_progress = true;
        self.log_info("ActionPlan", "Started action plan generation");
    }

    /// 回答落地方案问题
    /// 返回下一个问题（如果有）
    pub fn answer_action_plan_question(
        &mut self,
        key: String,
        answer: String,
    ) -> Option<&ActionPlanQuestion> {
        self.action_plan_answers.insert(key, answer);
        self.current_action_plan_question_index = self
            .current_action_plan_question_index
            .saturating_add(1);

        if self.current_action_plan_question_index < self.action_plan_questions.len() {
            self.action_plan_questions.get(self.current_action_plan_question_index)
        } else {
            self.log_info("ActionPlan", "All questions answered");
            None
        }
    }

    /// 设置落地方案
    pub fn set_action_plan(&mut self, plan: String) {
        self.action_plan = Some(plan);
        self.action_plan_in_progress = false;
        self.log_info("ActionPlan", "Action plan generated");
    }

    /// 取消落地方案流程
    pub fn cancel_action_plan(&mut self) {
        self.action_plan_in_progress = false;
        self.log_info("ActionPlan", "Action plan cancelled");
    }

    /// 获取当前落地方案问题
    pub fn get_current_action_plan_question(&self) -> Option<&ActionPlanQuestion> {
        if self.action_plan_in_progress
            && self.current_action_plan_question_index < self.action_plan_questions.len()
        {
            self.action_plan_questions.get(self.current_action_plan_question_index)
        } else {
            None
        }
    }

    /// 检查是否所有问题都已回答
    pub fn is_action_plan_questions_complete(&self) -> bool {
        self.current_action_plan_question_index >= self.action_plan_questions.len()
            && !self.action_plan_questions.is_empty()
    }

    /// 获取落地方案进度（已回答/总数）
    pub fn get_action_plan_progress(&self) -> (usize, usize) {
        (self.current_action_plan_question_index, self.action_plan_questions.len())
    }
}

impl Default for StateMachine {
    fn default() -> Self {
        Self::new()
    }
}

fn current_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
