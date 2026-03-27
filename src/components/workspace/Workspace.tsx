import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHistory } from "../../hooks/useHistory";
import { useReasoningTimer } from "../../hooks/useReasoningTimer";
import { useWorkspaceState } from "../../hooks/useWorkspaceState";
import type { IpcLog, SessionDiagnostics } from "../../types";
import HistoryPanel from "./HistoryPanel";
import WorkspaceAlerts from "./WorkspaceAlerts";
import WorkspaceStageContent from "./WorkspaceStageContent";
import WorkspaceTopNav from "./WorkspaceTopNav";

interface WorkspaceProps {
  onIpcLogsChange?: (logs: IpcLog[]) => void;
  onDiagnosticsChange?: (diagnostics: SessionDiagnostics | undefined) => void;
}

const phaseMap: Record<string, number> = {
  input: -1,
  frameworkselection: 0,
  divergence: 1,
  examination: 2,
  patch: 3,
  consensus: 4,
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function Workspace({
  onIpcLogsChange,
  onDiagnosticsChange,
}: WorkspaceProps) {
  const { t } = useTranslation();
  const {
    state,
    setState,
    frameworks,
    loading,
    busy,
    backendReasoningRunning,
    isReasoning,
    isProblemBriefChatting,
    isProblemBriefGenerating,
    uiError,
    setUiError,
    actionTip,
    showActionTip,
    loadData,
    handleStartSession,
    handleProblemBriefDialogue,
    handleGenerateProblemBrief,
    handleFrameworkSelect,
    handleRunReasoning,
    handleReset,
  } = useWorkspaceState();

  const [activeTab, setActiveTab] = useState<"agents" | "iteration">("agents");
  const [viewOverride, setViewOverride] = useState<number | null>(null);
  const { elapsedMs } = useReasoningTimer(isReasoning);

  const history = useHistory(setState, setUiError, showActionTip);

  const currentPhase: number = state
    ? typeof state.current_phase === "string"
      ? (phaseMap[state.current_phase] ?? -1)
      : (state.current_phase as unknown as number)
    : -1;

  const displayPhase = viewOverride !== null ? viewOverride : currentPhase;

  const canRunReasoning =
    !busy &&
    currentPhase >= 1 &&
    currentPhase <= 3 &&
    !!state?.agents &&
    Object.keys(state.agents).length > 0;

  // 每次真正阶段变化时，自动退出“历史阶段查看模式”，避免用户看到旧画面误判状态。
  useEffect(() => {
    setViewOverride(null);
  }, [state?.current_phase]);

  // 每当后端推送新的 IPC 日志时，把最新日志交给父组件（App），
  // 这样侧边栏就能在“系统”下方空白区域实时显示日志。
  useEffect(() => {
    onIpcLogsChange?.(state?.ipc_logs ?? []);
  }, [state?.ipc_logs, onIpcLogsChange]);

  // 同步诊断数据给父组件：
  // Sidebar 打开“会话诊断”弹窗时，直接用最新数据渲染，不需要再去主区找卡片。
  useEffect(() => {
    onDiagnosticsChange?.(state?.diagnostics);
  }, [state?.diagnostics, onDiagnosticsChange]);

  const handleStepClick = (stepId: number) => {
    if (busy) return;

    let isClickable = false;
    if (stepId === -1) isClickable = true;
    if (stepId === 0 && currentPhase >= 0) isClickable = true;
    if (stepId === 2 && currentPhase >= 1) isClickable = true;
    if (stepId === 4 && currentPhase >= 4) isClickable = true;

    if (!isClickable) return;

    if (stepId !== currentPhase) {
      if (stepId === 2) {
        setViewOverride(currentPhase >= 3 ? 3 : currentPhase);
      } else {
        setViewOverride(stepId);
      }
      return;
    }

    setViewOverride(null);
  };

  const handleTopNavReset = async () => {
    await handleReset();
    setViewOverride(null);
    setActiveTab("agents");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-notion-text-gray">{t("loading", { ns: "common" })}</div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full relative"
      style={{ background: "var(--color-bg-primary)" }}
    >
      <WorkspaceTopNav
        currentPhase={currentPhase}
        displayPhase={displayPhase}
        busy={busy}
        canRunReasoning={canRunReasoning}
        isReasoning={isReasoning}
        backendReasoningRunning={backendReasoningRunning}
        onStepClick={handleStepClick}
        onRunReasoning={handleRunReasoning}
        onOpenHistory={history.handleOpenHistory}
        onReset={handleTopNavReset}
      />

      <div className="flex-1 overflow-hidden">
        <div
          className="h-full overflow-y-auto p-4 space-y-4 max-w-6xl mx-auto w-full"
          style={{ background: "var(--color-bg-primary)" }}
        >
          <WorkspaceAlerts uiError={uiError} actionTip={actionTip} onRetry={loadData} />

          <WorkspaceStageContent
            state={state}
            frameworks={frameworks}
            displayPhase={displayPhase}
            currentPhase={currentPhase}
            busy={busy}
            isProblemBriefChatting={isProblemBriefChatting}
            isProblemBriefGenerating={isProblemBriefGenerating}
            isReasoning={isReasoning}
            elapsedMs={elapsedMs}
            activeTab={activeTab}
            viewOverride={viewOverride}
            onTabChange={setActiveTab}
            onStartSession={handleStartSession}
            onProblemBriefDialogue={handleProblemBriefDialogue}
            onGenerateProblemBrief={handleGenerateProblemBrief}
            onFrameworkSelect={handleFrameworkSelect}
            formatElapsed={formatElapsed}
          />
        </div>
      </div>

      <HistoryPanel
        open={history.historyVisible}
        loading={history.historyLoading}
        items={history.historyItems}
        loadingEntryId={history.historyLoadingId}
        deletingEntryId={history.historyDeletingId}
        clearing={history.historyClearing}
        onClose={() => history.setHistoryVisible(false)}
        onRefresh={history.loadHistoryEntries}
        onLoad={history.handleLoadHistory}
        onDelete={history.handleDeleteHistory}
        onClear={history.handleClearHistory}
      />
    </div>
  );
}
