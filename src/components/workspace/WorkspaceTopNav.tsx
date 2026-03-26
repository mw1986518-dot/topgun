import {
  Target,
  Boxes,
  Zap,
  Flag,
  History,
  Square,
  ChevronRight,
  Play,
} from "lucide-react";

interface WorkspaceTopNavProps {
  currentPhase: number;
  displayPhase: number;
  busy: boolean;
  canRunReasoning: boolean;
  isReasoning: boolean;
  backendReasoningRunning: boolean;
  onStepClick: (stepId: number) => void;
  onRunReasoning: () => void;
  onOpenHistory: () => void;
  onReset: () => void | Promise<void>;
}

const steps = [
  { id: -1, label: "0. 议题输入", icon: Target },
  { id: 0, label: "1. 问题重塑对话", icon: Boxes },
  { id: 2, label: "2. 多智能体推演", icon: Zap },
  { id: 4, label: "3. 共识输出", icon: Flag },
] as const;

export default function WorkspaceTopNav({
  currentPhase,
  displayPhase,
  busy,
  canRunReasoning,
  isReasoning,
  backendReasoningRunning,
  onStepClick,
  onRunReasoning,
  onOpenHistory,
  onReset,
}: WorkspaceTopNavProps) {
  return (
    <div
      className="sticky top-0 z-30 flex items-center justify-between border-b px-6 overflow-x-auto whitespace-nowrap glass"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center h-16 space-x-1">
        {steps.map((step, index) => {
          const Icon = step.icon;

          let isActive = false;
          if (step.id === -1 && displayPhase <= -1) isActive = true;
          if (step.id === 0 && displayPhase === 0) isActive = true;
          if (step.id === 2 && displayPhase >= 1 && displayPhase <= 3) isActive = true;
          if (step.id === 4 && displayPhase === 4) isActive = true;

          let isClickable = false;
          if (step.id === -1) isClickable = true;
          if (step.id === 0 && currentPhase >= 0) isClickable = true;
          if (step.id === 2 && currentPhase >= 1) isClickable = true;
          if (step.id === 4 && currentPhase >= 4) isClickable = true;

          return (
            <div
              key={step.id}
              className={`flex items-center ${isClickable ? "cursor-pointer" : ""}`}
              onClick={() => {
                if (busy || !isClickable) return;
                onStepClick(step.id);
              }}
            >
              <div
                className={`flex items-center gap-2 px-4 py-2 font-medium transition-colors ${isActive
                    ? "text-[var(--color-accent)]"
                    : isClickable
                      ? "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-muted)]"
                  }`}
              >
                <Icon size={16} />
                <span className="text-sm">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <ChevronRight size={16} style={{ color: "var(--color-text-muted)" }} />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 px-2">
        {currentPhase >= 1 && currentPhase <= 3 && (
          <button
            onClick={onRunReasoning}
            disabled={!canRunReasoning}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-[var(--text-primary)] rounded-lg disabled:opacity-50 transition-all cursor-pointer glow-accent"
            style={{
              background: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-primary)",
            }}
          >
            <Play size={16} fill="currentColor" />
            {isReasoning || backendReasoningRunning ? "推演进行中..." : "开始推演"}
          </button>
        )}
        <button
          onClick={onOpenHistory}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ color: "var(--color-text-secondary)" }}
          disabled={busy}
          title="打开历史记录"
        >
          <History size={16} />
          历史记录
        </button>
        <div className="w-px h-4 mx-1" style={{ background: "var(--color-border)" }} />
        <button
          onClick={onReset}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          <Square size={14} fill="currentColor" />
          重置
        </button>
      </div>
    </div>
  );
}

