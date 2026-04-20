import { useTranslation } from "react-i18next";
import { Activity, Timer, AlertTriangle, LifeBuoy } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionDiagnostics } from "../../types";

interface SessionDiagnosticsCardProps {
  diagnostics?: SessionDiagnostics;
  showHeader?: boolean;
}

const EMPTY_DIAGNOSTICS: SessionDiagnostics = {
  phase_durations_ms: {
    divergence_ms: 0,
    examination_ms: 0,
    patch_ms: 0,
    consensus_ms: 0,
    total_ms: 0,
  },
  failure_counts: {
    divergence: 0,
    examination: 0,
    patch: 0,
    consensus: 0,
    total: 0,
  },
  fallback_counts: {
    examination_parser_repair: 0,
    examination_text_fallback: 0,
    consensus_synthesizer_fallback: 0,
    total: 0,
  },
  reasoning_runs: 0,
};

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "--";
  if (ms < 1000) return `${ms} ms`;

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value?: number): string {
  if (!value) return "--";
  try {
    return new Date(value).toLocaleString("zh-CN");
  } catch {
    return "--";
  }
}

/**
 * 会话诊断卡片：
 * 把后端结构化指标直接展示给用户，方便快速看出“慢在哪、失败在哪、降级在哪”。
 */
export default function SessionDiagnosticsCard({
  diagnostics,
  showHeader = true,
}: SessionDiagnosticsCardProps) {
  const { t } = useTranslation("workspace");
  // 如果历史快照是旧版本（没有 diagnostics），这里自动给默认值，保证 UI 不崩。
  const data = diagnostics ?? EMPTY_DIAGNOSTICS;
  const [historyEntryCount, setHistoryEntryCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadHistoryCount() {
      try {
        const result = await invoke<unknown>("get_history_entries");
        if (!mounted) return;

        if (Array.isArray(result)) {
          setHistoryEntryCount(result.length);
          return;
        }

        setHistoryEntryCount(0);
      } catch {
        if (!mounted) return;
        setHistoryEntryCount(null);
      }
    }

    void loadHistoryCount();

    return () => {
      mounted = false;
    };
  }, [data.reasoning_runs, data.last_run_completed_at]);

  const phaseRows = [
    {
      labelKey: "diagnostics.phases.divergence",
      value: data.phase_durations_ms.divergence_ms,
    },
    {
      labelKey: "diagnostics.phases.examination",
      value: data.phase_durations_ms.examination_ms,
    },
    { labelKey: "diagnostics.phases.patch", value: data.phase_durations_ms.patch_ms },
    {
      labelKey: "diagnostics.phases.consensus",
      value: data.phase_durations_ms.consensus_ms,
    },
  ];

  return (
    <div
      className="rounded-xl p-4 space-y-4"
      style={{
        background: "var(--color-bg-secondary)",
        border: "1px solid var(--color-border)",
      }}
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity size={16} style={{ color: "var(--color-accent)" }} />
            <h4
              className="text-sm font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {t("diagnostics.title")}
            </h4>
          </div>
          <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {t("diagnostics.lastRunCompleted", {
              date: formatDate(data.last_run_completed_at),
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--color-bg-primary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            <Timer size={14} />
            {t("diagnostics.totalTime")}
          </div>
          <div
            className="mt-1 text-base font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {formatDuration(data.phase_durations_ms.total_ms)}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {t("diagnostics.reasoningRuns", { count: data.reasoning_runs })}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {t("diagnostics.historyCount", { count: historyEntryCount ?? "--" })}
          </div>
        </div>

        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--color-bg-primary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            <AlertTriangle size={14} />
            {t("diagnostics.failureCount")}
          </div>
          <div
            className="mt-1 text-base font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {data.failure_counts.total}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {t("diagnostics.failureBreakdown", {
              divergence: data.failure_counts.divergence,
              examination: data.failure_counts.examination,
              patch: data.failure_counts.patch,
              consensus: data.failure_counts.consensus,
            })}
          </div>
        </div>

        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--color-bg-primary)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            <LifeBuoy size={14} />
            {t("diagnostics.fallbackCount")}
          </div>
          <div
            className="mt-1 text-base font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            {data.fallback_counts.total}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--color-text-muted)" }}>
            {t("diagnostics.fallbackBreakdown", {
              parserRepair: data.fallback_counts.examination_parser_repair,
              textFallback: data.fallback_counts.examination_text_fallback,
              consensusFallback: data.fallback_counts.consensus_synthesizer_fallback,
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {phaseRows.map((row) => (
          <div
            key={row.labelKey}
            className="rounded-md px-3 py-2"
            style={{
              background: "var(--color-bg-primary)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              {t(
                row.labelKey as
                  | "diagnostics.phases.divergence"
                  | "diagnostics.phases.examination"
                  | "diagnostics.phases.patch"
                  | "diagnostics.phases.consensus",
              )}
            </div>
            <div
              className="text-sm font-medium mt-0.5"
              style={{ color: "var(--color-text-secondary)" }}
            >
              {formatDuration(row.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
