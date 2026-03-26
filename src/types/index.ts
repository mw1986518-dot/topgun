/**
 * Shared type definitions for the Idea Refinery frontend.
 * All types mirror the Rust backend structs (state/mod.rs, framework/mod.rs, config/mod.rs).
 */

// ─── Framework ───────────────────────────────────────────────

export interface Framework {
  id: string;
  name: string;
  icon: string;
  system_prompt: string;
  description: string;
  is_builtin: boolean;
}

// ─── Agent & Status ──────────────────────────────────────────

export type AgentStatus =
  | "idle"
  | "thinking"
  | "pass"
  | "objection"
  | "patching"
  | "complete";

export interface Agent {
  framework_id: string;
  status: AgentStatus;
  content: string;
  version: number;
  objections: string[];
}

// ─── Clarification ───────────────────────────────────────────

export interface ClarificationQuestion {
  id: string;
  question: string;
  answer?: string;
}

export interface ProblemBriefMessage {
  role: "system" | "user" | "assistant" | string;
  content: string;
}

// ─── IPC Logs ────────────────────────────────────────────────

export interface IpcLog {
  timestamp: number;
  level: string;
  source: string;
  message: string;
}

// ─── Session Diagnostics ─────────────────────────────────────

export interface PhaseDiagnostics {
  divergence_ms: number;
  examination_ms: number;
  patch_ms: number;
  consensus_ms: number;
  total_ms: number;
}

export interface FailureDiagnostics {
  divergence: number;
  examination: number;
  patch: number;
  consensus: number;
  total: number;
}

export interface FallbackDiagnostics {
  examination_parser_repair: number;
  examination_text_fallback: number;
  consensus_synthesizer_fallback: number;
  total: number;
}

export interface SessionDiagnostics {
  phase_durations_ms: PhaseDiagnostics;
  failure_counts: FailureDiagnostics;
  fallback_counts: FallbackDiagnostics;
  reasoning_runs: number;
  last_run_started_at?: number;
  last_run_completed_at?: number;
}

export interface ToleratedRiskItem {
  framework_id: string;
  risk_summary: string;
  evidence: string;
  temporary_reason: string;
  next_action: string;
}

// ─── Action Plan (落地方案) ───────────────────────────────────

export interface ActionPlanQuestion {
  key: string;
  question: string;
  reason: string;
  related_action: string;
}

export interface ActionPlanState {
  in_progress: boolean;
  questions: ActionPlanQuestion[];
  current_index: number;
  answers: Record<string, string>;
  action_plan: string | null;
}

// ─── Application Config ─────────────────────────────────────

export interface AppConfig {
  timeout_seconds: number;
  enable_retry: boolean;
  max_retries: number;
  retry_delay_ms: number;
  providers: LlmProviderConfig[];
  selected_provider_id: string;
}

export interface LlmProviderConfig {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
}

// ─── State Machine (mirrors Rust StateMachine) ──────────────

export type Phase =
  | "input"
  | "frameworkselection"
  | "divergence"
  | "examination"
  | "patch"
  | "consensus";

export interface StateMachine {
  current_phase: Phase;
  topic: string;
  clarifications: ClarificationQuestion[];
  clarification_round: number;
  selected_frameworks: string[];
  agents: Record<string, Agent>;
  iteration_count: number;
  is_reasoning_running: boolean;
  max_iterations: number;
  consensus_output?: string;
  tolerated_risks: ToleratedRiskItem[];
  ipc_logs: IpcLog[];
  recommended_frameworks: string[];
  reframed_issue?: string;
  recommended_experts_panel?: string;
  problem_brief_messages?: ProblemBriefMessage[];
  problem_brief_ready?: boolean;
  custom_user_prompt?: string;
  diagnostics?: SessionDiagnostics;
  // 落地方案相关
  action_plan_questions?: ActionPlanQuestion[];
  action_plan_answers?: Record<string, string>;
  current_action_plan_question_index?: number;
  action_plan?: string;
  action_plan_in_progress?: boolean;
}

export interface SessionHistoryEntry {
  id: string;
  created_at: number;
  model: string;
  state: StateMachine;
}
