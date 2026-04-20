import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Code2, FileCheck2, Loader2, Send, Sparkles } from "lucide-react";
import type { ProblemBriefMessage } from "../../types";

interface ProblemBriefDialoguePanelProps {
  messages: ProblemBriefMessage[];
  submitting: boolean;
  generating: boolean;
  completed: boolean;
  onSend: (message: string) => Promise<void>;
  onGenerateBrief: () => Promise<void>;
}

/**
 * 阶段二对话面板：
 * 1) 默认只做"需求解构与问题界定"的追问；
 * 2) 只有用户主动点击"生成专家级问题简报"按钮，才允许收口。
 */
export default function ProblemBriefDialoguePanel({
  messages,
  submitting,
  generating,
  completed,
  onSend,
  onGenerateBrief,
}: ProblemBriefDialoguePanelProps) {
  const { t } = useTranslation("workspace");
  const [draft, setDraft] = useState("");

  // 只展示 user / assistant 消息，避免把系统提示词直接展示给用户。
  const visibleMessages = useMemo(
    () => messages.filter((item) => item.role === "assistant" || item.role === "user"),
    [messages],
  );

  async function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed || submitting || generating || completed) return;
    await onSend(trimmed);
    setDraft("");
  }

  async function handleGenerateBrief() {
    if (submitting || generating || completed) return;
    await onGenerateBrief();
  }

  return (
    <div
      className="rounded-2xl p-0 overflow-hidden animate-fade-in-up glass flex flex-col"
      style={{ height: "calc(100vh - 120px)" }}
    >
      <div
        className="px-6 py-4 border-b shrink-0"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-bg-secondary)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(96, 165, 250, 0.16)",
              color: "#60A5FA",
            }}
          >
            <Sparkles size={18} />
          </div>
          <div>
            <h3
              className="text-xl font-bold tracking-tight"
              style={{ color: "var(--color-text-primary)" }}
            >
              {t("problemBrief.title")}
            </h3>
            <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
              {t("problemBrief.description")}
            </p>
          </div>
        </div>
      </div>

      <div
        className="px-6 py-4 space-y-4 overflow-y-auto custom-scrollbar"
        style={{ flex: 2, background: "var(--color-bg-primary)" }}
      >
        {visibleMessages.length === 0 && (
          <div
            className="rounded-xl p-4 text-sm"
            style={{
              background: "rgba(148, 163, 184, 0.08)",
              border: "1px dashed var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            {t("problemBrief.waitingFirst")}
          </div>
        )}

        {visibleMessages.map((item, index) => {
          const isUser = item.role === "user";
          return (
            <div
              key={`${item.role}-${index}-${item.content.slice(0, 12)}`}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className="max-w-[88%] rounded-2xl px-5 py-3.5 whitespace-pre-wrap leading-relaxed text-[15px] shadow-sm"
                style={
                  isUser
                    ? {
                        background: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text-primary)",
                      }
                    : {
                        background: "var(--color-bg-secondary)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text-primary)",
                      }
                }
              >
                {item.content}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="px-6 py-4 border-t flex flex-col gap-3"
        style={{
          flex: 1,
          borderColor: "var(--color-border)",
          background: "var(--color-bg-secondary)",
        }}
      >
        {completed && (
          <div
            className="rounded-lg px-4 py-3 flex items-center gap-2 text-sm"
            style={{
              background: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "#86EFAC",
            }}
          >
            <Code2 size={16} />
            {t("problemBrief.identified")}
          </div>
        )}

        {!completed && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              background: "rgba(56, 189, 248, 0.1)",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              color: "#BAE6FD",
            }}
          >
            {t("problemBrief.tip")}
          </div>
        )}

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            completed
              ? t("problemBrief.briefGenerated")
              : t("problemBrief.inputPlaceholder")
          }
          disabled={submitting || generating || completed}
          className="w-full px-4 py-3 rounded-xl focus:outline-none resize-none flex-1 transition-colors custom-scrollbar"
          style={{
            background: "var(--color-bg-tertiary)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-primary)",
          }}
        />

        <div className="flex justify-end gap-3">
          <button
            onClick={handleGenerateBrief}
            disabled={submitting || generating || completed}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-[var(--text-primary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            style={{
              background: "var(--bg-hover)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t("generating", { ns: "common" })}
              </>
            ) : (
              <>
                <FileCheck2 size={16} />
                {t("problemBrief.generateBrief")}
              </>
            )}
          </button>

          <button
            onClick={handleSend}
            disabled={!draft.trim() || submitting || generating || completed}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-[var(--text-primary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            style={{
              background: "var(--bg-hover)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {t("sending", { ns: "common" })}
              </>
            ) : (
              <>
                <Send size={16} />
                {t("send", { ns: "common" })}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
