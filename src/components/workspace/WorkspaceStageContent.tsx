import type { Framework, StateMachine } from "../../types";
import ConsensusOutput from "./ConsensusOutput";
import FrameworkSelection from "./FrameworkSelection";
import ProblemBriefDialoguePanel from "./ProblemBriefDialoguePanel";
import TopicInput from "./TopicInput";
import WorkspaceReasoningPanel from "./WorkspaceReasoningPanel";

interface WorkspaceStageContentProps {
  state: StateMachine | null;
  frameworks: Framework[];
  displayPhase: number;
  currentPhase: number;
  busy: boolean;
  isProblemBriefChatting: boolean;
  isProblemBriefGenerating: boolean;
  isReasoning: boolean;
  elapsedMs: number;
  activeTab: "agents" | "iteration";
  viewOverride: number | null;
  onTabChange: (tab: "agents" | "iteration") => void;
  onStartSession: (topic: string) => Promise<void>;
  onProblemBriefDialogue: (message: string) => Promise<void>;
  onGenerateProblemBrief: () => Promise<void>;
  onFrameworkSelect: (frameworkIds: string[], customUserPrompt?: string) => Promise<void>;
  formatElapsed: (ms: number) => string;
}

/**
 * 把“按阶段渲染不同内容”的逻辑集中到一个组件。
 *
 * 对新手来说可以这样理解：
 * - `displayPhase` 就像路由状态；
 * - 每个 `if` 就是一个页面分支；
 * - 这样主容器不会被大量 JSX 条件分支淹没。
 */
export default function WorkspaceStageContent({
  state,
  frameworks,
  displayPhase,
  currentPhase,
  busy,
  isProblemBriefChatting,
  isProblemBriefGenerating,
  isReasoning,
  elapsedMs,
  activeTab,
  viewOverride,
  onTabChange,
  onStartSession,
  onProblemBriefDialogue,
  onGenerateProblemBrief,
  onFrameworkSelect,
  formatElapsed,
}: WorkspaceStageContentProps) {
  const hasProblemBrief =
    Boolean(state?.reframed_issue?.trim()) &&
    Boolean(state?.recommended_experts_panel?.trim());

  return (
    <>
      {(!state || displayPhase === -1) && (
        <TopicInput onSubmit={onStartSession} disabled={busy} />
      )}

      {state && displayPhase === 0 && !hasProblemBrief && (
        <ProblemBriefDialoguePanel
          messages={state.problem_brief_messages || []}
          submitting={isProblemBriefChatting}
          generating={isProblemBriefGenerating}
          completed={Boolean(state.problem_brief_ready)}
          onSend={onProblemBriefDialogue}
          onGenerateBrief={onGenerateProblemBrief}
        />
      )}

      {state &&
        hasProblemBrief &&
        (displayPhase === 0 ||
          (displayPhase === 1 &&
            state.agents &&
            Object.keys(state.agents).length === 0)) && (
          <FrameworkSelection
            frameworks={frameworks}
            recommended={state.recommended_frameworks || []}
            topic={state.topic}
            reframedIssue={state.reframed_issue}
            initialUserPrompt={state.custom_user_prompt}
            onSelect={onFrameworkSelect}
          />
        )}

      {state &&
        displayPhase >= 1 &&
        displayPhase <= 3 &&
        state.agents &&
        Object.keys(state.agents).length > 0 && (
          <WorkspaceReasoningPanel
            state={state}
            frameworks={frameworks}
            currentPhase={currentPhase}
            viewOverride={viewOverride}
            isReasoning={isReasoning}
            elapsedMs={elapsedMs}
            activeTab={activeTab}
            onTabChange={onTabChange}
            formatElapsed={formatElapsed}
          />
        )}

      {state && displayPhase === 4 && (
        <ConsensusOutput
          content={state.consensus_output || ""}
          toleratedRisks={state.tolerated_risks}
          frameworks={frameworks}
          actionPlan={state.action_plan}
          actionPlanInProgress={state.action_plan_in_progress}
          actionPlanQuestions={state.action_plan_questions}
          actionPlanAnswers={state.action_plan_answers}
          currentActionPlanQuestionIndex={state.current_action_plan_question_index}
        />
      )}
    </>
  );
}
