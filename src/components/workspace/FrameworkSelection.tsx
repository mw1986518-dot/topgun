import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Maximize2, X, Zap } from "lucide-react";
import type { Framework } from "../../types";

interface FrameworkSelectionProps {
  frameworks: Framework[];
  recommended: string[];
  topic?: string;
  reframedIssue?: string;
  initialUserPrompt?: string;
  onSelect: (frameworkIds: string[], customUserPrompt?: string) => void;
}

/**
 * 组织"可编辑重塑议题正文"。
 *
 * 你可以把它理解成一个模板拼接器：
 * - 先放原始问题；
 * - 再放 AI 生成的重塑议题；
 *
 * 后续锁定框架时，发给各 Agent 的就是这里这段文本。
 */
function buildEditableReframedContext(
  topic: string,
  reframedIssue: string | undefined,
): string {
  const blocks: string[] = [
    `原始问题：\n${topic.trim() || "(暂无原始问题)"}`,
    `AI 生成的重塑议题：\n${reframedIssue?.trim() || "(暂无重塑议题)"}`,
  ];

  return blocks.join("\n\n");
}

/**
 * 兼容老版本 custom_user_prompt：
 * 旧版里可能有你不想要的"请你严格基于以下上下文..."说明段，
 * 这里会自动抽取核心内容，转成新的三段结构，避免旧内容继续污染 UI。
 */
function normalizeInitialEditableContext(
  initialUserPrompt: string | undefined,
  fallback: string,
): string {
  const raw = initialUserPrompt?.trim();
  if (!raw) return fallback;

  if (!raw.includes("请你严格基于以下上下文输出结构化方案。")) {
    return raw;
  }

  const originalLabel = "Original topic:";
  const briefLabel = "Problem Brief:";

  const originalStart = raw.indexOf(originalLabel);
  const briefStart = raw.indexOf(briefLabel);

  const originalTopic =
    originalStart >= 0 && briefStart > originalStart
      ? raw.slice(originalStart + originalLabel.length, briefStart).trim()
      : "";

  const reframedContent =
    briefStart >= 0
      ? raw
        .slice(
          briefStart + briefLabel.length,
          raw.length,
        )
        .trim()
      : "";

  return buildEditableReframedContext(originalTopic, reframedContent);
}

export default function FrameworkSelection({
  frameworks,
  recommended = [],
  topic = "",
  reframedIssue,
  initialUserPrompt,
  onSelect,
}: FrameworkSelectionProps) {
  const { t } = useTranslation("workspace");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [expandedFramework, setExpandedFramework] = useState<Framework | null>(null);
  const [editingReframedContext, setEditingReframedContext] = useState(false);

  const validFrameworkIds = useMemo(
    () => new Set(frameworks.map((framework) => framework.id)),
    [frameworks],
  );

  useEffect(() => {
    const initialIds = recommended.filter((id) => validFrameworkIds.has(id));
    setSelected(new Set(initialIds));
  }, [recommended, validFrameworkIds]);

  const selectedIds = useMemo(
    () => Array.from(selected).filter((id) => validFrameworkIds.has(id)),
    [selected, validFrameworkIds],
  );

  const defaultEditableContext = useMemo(
    () => buildEditableReframedContext(topic, reframedIssue),
    [topic, reframedIssue],
  );

  const [editableReframedContext, setEditableReframedContext] = useState<string>(
    normalizeInitialEditableContext(initialUserPrompt, defaultEditableContext),
  );

  // 当后端状态变化（例如重新生成了重塑议题）时，自动刷新文本框内容。
  // 如果后端保存过用户自定义内容，这里会优先恢复那份内容。
  useEffect(() => {
    setEditableReframedContext(
      normalizeInitialEditableContext(initialUserPrompt, defaultEditableContext),
    );
  }, [initialUserPrompt, defaultEditableContext]);

  function toggleFramework(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSelect(selectedIds, editableReframedContext.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl p-6 sm:p-8 space-y-6 animate-fade-in-up glass">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-full"
          style={{
            background: "rgba(34, 197, 94, 0.15)",
            color: "var(--color-accent)",
          }}
        >
          <Zap size={16} />
        </div>
        <h3
          className="text-xl font-bold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("frameworkSelection.title")}
        </h3>
      </div>

      <p className="text-[15px]" style={{ color: "var(--color-text-secondary)" }}>
        {t("frameworkSelection.description")}
      </p>

      {reframedIssue && (
        <div
          className="p-5 rounded-xl mb-6"
          style={{
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.2)",
          }}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2" style={{ color: "#F59E0B" }}>
              <Check size={18} />
              <h4 className="font-bold">{t("frameworkSelection.reshapedProblem").replace("：", "")}</h4>
            </div>
            <button
              type="button"
              onClick={() => setEditingReframedContext((prev) => !prev)}
              className="text-xs px-2.5 py-1 rounded-md cursor-pointer"
              style={{
                color: "var(--color-text-secondary)",
                border: "1px solid rgba(245, 158, 11, 0.35)",
              }}
            >
              {editingReframedContext ? t("confirm", { ns: "common" }) : t("frameworkSelection.clickToModify")}
            </button>
          </div>

          <p className="text-xs mb-3" style={{ color: "var(--color-text-muted)" }}>
            {t("frameworkSelection.editHint", { defaultValue: "这里只保留原始问题和 AI 重塑议题。修改后会直接用于后续推演。" })}
          </p>

          {editingReframedContext ? (
            <textarea
              value={editableReframedContext}
              onChange={(event) => setEditableReframedContext(event.target.value)}
              rows={14}
              className="w-full px-3 py-2 rounded-lg focus:outline-none resize-y text-sm leading-relaxed"
              style={{
                background: "var(--color-bg-tertiary)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text-primary)",
              }}
            />
          ) : (
            <div className="text-sm text-notion-text leading-relaxed whitespace-pre-wrap pl-1 font-medium">
              {editableReframedContext}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {frameworks.map((framework) => {
          const isSelected = selected.has(framework.id);
          const isRecommended = recommended.includes(framework.id);

          return (
            <div
              key={framework.id}
              onClick={() => toggleFramework(framework.id)}
              className={`
                relative p-5 rounded-2xl border text-left cursor-pointer transition-all duration-300 group hover:-translate-y-1
                ${isSelected ? "shadow-md" : "hover:shadow-lg"}
              `}
              style={{
                background: isSelected
                  ? "var(--color-bg-card-hover)"
                  : "var(--color-bg-secondary)",
                borderColor: isSelected ? "var(--color-accent)" : "var(--color-border)",
                boxShadow: isSelected ? "0 4px 20px var(--color-accent-glow)" : undefined,
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{framework.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-notion-text truncate">
                      {framework.name}
                    </h4>
                    {isRecommended && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider"
                        style={{
                          background: "rgba(34, 197, 94, 0.15)",
                          color: "var(--color-accent)",
                          border: "1px solid rgba(34, 197, 94, 0.3)",
                        }}
                      >
                        {t("frameworkSelection.recommended")}
                      </span>
                    )}
                    {isSelected && (
                      <Check size={16} className="text-phase-0-border flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-notion-text-gray mt-1 line-clamp-2 pr-4">
                    {framework.description}
                  </p>
                </div>
              </div>

              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setExpandedFramework(framework);
                }}
                className="absolute bottom-2 right-2 p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                style={{ color: "var(--color-text-muted)" }}
              >
                <Maximize2 size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <div
        className="flex items-center justify-between pt-4"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <span
          className="text-[15px] font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {t("frameworkSelection.selected", { count: selectedIds.length })}
        </span>

        <button
          onClick={handleSubmit}
          disabled={selectedIds.length === 0 || submitting}
          className="
            flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-[var(--text-primary)]
            shadow-md active:scale-[0.98] transition-all cursor-pointer glow-accent
            disabled:opacity-50 disabled:cursor-not-allowed
          "
          style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {t("submitting", { ns: "common" })}
            </>
          ) : (
            <>
              <Check size={18} />
              {t("frameworkSelection.lockAndRun")}
            </>
          )}
        </button>
      </div>

      {expandedFramework && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 md:p-8"
          onClick={() => setExpandedFramework(null)}
        >
          <div
            className="bg-[#2D2D2D] w-full max-w-3xl h-[70vh] rounded-xl shadow-2xl flex flex-col border border-white/10 overflow-hidden relative"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#1A1A1A]">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{expandedFramework.icon}</span>
                <span className="font-semibold text-lg text-[var(--text-primary)]">
                  {expandedFramework.name}
                </span>
                <span className="text-[var(--text-primary)]/40 font-mono text-sm ml-2">
                  [{expandedFramework.id}]
                </span>
                {recommended.includes(expandedFramework.id) && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-900/40 text-yellow-500 border border-yellow-500/30 tracking-wider">
                    {t("frameworkSelection.recommended")}
                  </span>
                )}
              </div>
              <button
                className="text-[var(--text-primary)]/50 hover:text-[var(--text-primary)] bg-[var(--bg-hover)]/5 hover:bg-[var(--bg-hover)]/10 p-2 rounded-md transition-colors"
                onClick={() => setExpandedFramework(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 p-6 md:p-8 overflow-y-auto text-[#E0E0E0] font-mono whitespace-pre-wrap text-sm leading-relaxed custom-scrollbar selection:bg-yellow-500/30">
              <div className="text-yellow-500/50 mb-4"># System Prompt</div>
              <p className="mt-2 text-[var(--text-primary)]/80 leading-relaxed bg-[#1A1A1A] p-4 rounded border border-white/5 whitespace-pre-wrap font-mono text-xs">
                {expandedFramework.system_prompt}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}