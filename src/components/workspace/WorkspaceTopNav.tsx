import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("workspace");

  const steps = [
    { id: -1, label: t("phase.input"), icon: Target },
    { id: 0, label: t("phase.problemReshaping"), icon: Boxes },
    { id: 2, label: t("phase.multiAgent"), icon: Zap },
    { id: 4, label: t("phase.consensus"), icon: Flag },
  ] as const;
  return (
    <div
      className="sticky top-0 z-30 flex items-center justify-between border-b px-6 overflow-x-auto whitespace-nowrap glass"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center h-12">
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
                className={`flex items-center gap-2 px-3 py-2 font-medium transition-colors ${
                  isActive
                    ? "text-[var(--color-accent)]"
                    : isClickable
                      ? "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-muted)]"
                }`}
              >
                <Icon size={20} />
                <span className="text-[18px]">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <ChevronRight
                  size={20}
                  style={{
                    color: "var(--color-text-muted)",
                    marginLeft: "6px",
                    marginRight: "6px",
                  }}
                />
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
              background: "var(--bg-hover)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            <Play size={16} fill="currentColor" />
            {isReasoning || backendReasoningRunning
              ? t("topNav.running")
              : t("topNav.startReasoning")}
          </button>
        )}
        <button
          onClick={onOpenHistory}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ color: "var(--color-text-secondary)" }}
          disabled={busy}
          title={t("topNav.openHistory")}
        >
          <History size={16} />
          {t("topNav.history")}
        </button>
        <div className="w-px h-4 mx-1" style={{ background: "var(--color-border)" }} />
        <button
          onClick={onReset}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          <Square size={14} fill="currentColor" />
          {t("reset", { ns: "common" })}
        </button>
      </div>
    </div>
  );
}
