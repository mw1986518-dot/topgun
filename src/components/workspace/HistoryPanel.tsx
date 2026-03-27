import { useTranslation } from "react-i18next";
import {
  History,
  Loader2,
  Search,
  RefreshCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { SessionHistoryEntry } from "../../types";

interface HistoryPanelProps {
  open: boolean;
  loading: boolean;
  items: SessionHistoryEntry[];
  loadingEntryId: string | null;
  deletingEntryId: string | null;
  clearing: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

function formatDate(value: number) {
  try {
    return new Date(value).toLocaleString("zh-CN");
  } catch {
    return "-";
  }
}

function formatDuration(ms: number | undefined): string {
  if (!ms || ms <= 0) return "--";
  if (ms < 1000) return `${ms}ms`;

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function HistoryPanel({
  open,
  loading,
  items,
  loadingEntryId,
  deletingEntryId,
  clearing,
  onClose,
  onRefresh,
  onLoad,
  onDelete,
  onClear,
}: HistoryPanelProps) {
  const { t } = useTranslation("history");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  function toPreview(content: string | undefined) {
    if (!content) return t("noConsensus", { defaultValue: "暂无共识内容" });
    const oneLine = content.replace(/\s+/g, " ").trim();
    if (oneLine.length <= 140) return oneLine;
    return `${oneLine.slice(0, 140)}...`;
  }

  const filteredItems = useMemo(() => {
    if (!normalizedQuery) return items;
    return items.filter((entry) => {
      const topic = entry.state.topic?.toLowerCase() || "";
      const model = entry.model?.toLowerCase() || "";
      const preview = (entry.state.consensus_output || "").toLowerCase();
      return (
        topic.includes(normalizedQuery) ||
        model.includes(normalizedQuery) ||
        preview.includes(normalizedQuery)
      );
    });
  }, [items, normalizedQuery]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0, 0, 0, 0.45)" }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-xl h-full flex flex-col"
        style={{
          background: "var(--color-bg-secondary)",
          borderLeft: "1px solid var(--color-border)",
        }}
      >
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            <History size={18} style={{ color: "var(--color-accent)" }} />
            <h3
              className="font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              {t("title")}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-2 rounded-lg cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
              title={t("refresh", { ns: "common" })}
            >
              <RefreshCcw size={16} />
            </button>
            <button
              onClick={onClear}
              disabled={items.length === 0 || clearing}
              className="p-2 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: "#F87171" }}
              title={t("clear", { ns: "common" })}
            >
              {clearing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Trash2 size={16} />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
              title={t("close", { ns: "common" })}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div
          className="px-5 py-3"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{
              background: "var(--color-bg-primary)",
              border: "1px solid var(--color-border)",
            }}
          >
            <Search size={15} style={{ color: "var(--color-text-muted)" }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full bg-transparent outline-none text-sm"
              style={{ color: "var(--color-text-primary)" }}
            />
          </div>
          <div
            className="mt-2 text-xs"
            style={{ color: "var(--color-text-muted)" }}
          >
            {t("count", { current: filteredItems.length, total: items.length })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading && (
            <div
              className="rounded-xl p-6 flex items-center justify-center gap-2"
              style={{
                background: "var(--color-bg-primary)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">{t("loading")}</span>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div
              className="rounded-xl p-6 text-sm"
              style={{
                background: "var(--color-bg-primary)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              {t("noHistory")}
            </div>
          )}

          {!loading && filteredItems.length === 0 && items.length > 0 && (
            <div
              className="rounded-xl p-6 text-sm"
              style={{
                background: "var(--color-bg-primary)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-secondary)",
              }}
            >
              {t("noMatch")}
            </div>
          )}

          {!loading &&
            filteredItems.map((entry) => {
              const busyLoad = loadingEntryId === entry.id;
              const busyDelete = deletingEntryId === entry.id;
              const state = entry.state;
              const totalDuration =
                state.diagnostics?.phase_durations_ms?.total_ms ?? 0;
              const totalFailures =
                state.diagnostics?.failure_counts?.total ?? 0;
              const totalFallbacks =
                state.diagnostics?.fallback_counts?.total ?? 0;

              return (
                <div
                  key={entry.id}
                  className="rounded-xl p-4 space-y-3"
                  style={{
                    background: "var(--color-bg-primary)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div className="space-y-1">
                    <div
                      className="text-sm font-semibold line-clamp-1"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {state.topic || t("unnamed")}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {formatDate(entry.created_at)} · {t("meta.model", { name: entry.model })} ·
                      {t("meta.frameworks", { count: state.selected_frameworks.length })} ·
                      {t("meta.rounds", { count: state.iteration_count || 1 })}
                    </div>
                    <div
                      className="text-xs"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {t("meta.duration", { duration: formatDuration(totalDuration) })} ·
                      {t("meta.failures", { count: totalFailures })} ·
                      {t("meta.fallbacks", { count: totalFallbacks })}
                    </div>
                  </div>

                  <div
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {toPreview(state.consensus_output)}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onLoad(entry.id)}
                      disabled={busyLoad || busyDelete}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: "rgba(34, 197, 94, 0.15)",
                        color: "#86EFAC",
                      }}
                    >
                      {busyLoad ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      {t("load")}
                    </button>
                    <button
                      onClick={() => onDelete(entry.id)}
                      disabled={busyLoad || busyDelete}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: "rgba(239, 68, 68, 0.15)",
                        color: "#FCA5A5",
                      }}
                    >
                      {busyDelete ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                      {t("delete")}
                    </button>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}