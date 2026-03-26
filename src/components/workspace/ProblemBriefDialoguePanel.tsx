import { useMemo, useState } from "react";
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
 * 1) 默认只做“需求解构与问题界定”的追问；
 * 2) 只有用户主动点击“生成专家级问题简报”按钮，才允许收口。
 */
export default function ProblemBriefDialoguePanel({
  messages,
  submitting,
  generating,
  completed,
  onSend,
  onGenerateBrief,
}: ProblemBriefDialoguePanelProps) {
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
      style={{ height: 'calc(100vh - 120px)' }}
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
              阶段 2：问题重塑对话
            </h3>
            <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
              这一阶段只做需求解构与问题界定，不直接给结论方案。完成澄清后，请手动点击“生成专家级问题简报”。
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
            等待 Problem Definer 发起第一轮追问...
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
            已识别“专家级问题简报 + 推荐专家”双代码块，可以进入下一步框架选择。
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
            提示：系统不会自动收口。请先通过对话补齐目标、约束、红线和盲区，再手动生成“专家级问题简报”。
          </div>
        )}

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            completed
              ? "简报已生成，输入框已禁用。"
              : "继续补充你的上下文、约束和真实目标..."
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
            style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
          >
            {generating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <FileCheck2 size={16} />
                生成专家级问题简报
              </>
            )}
          </button>

          <button
            onClick={handleSend}
            disabled={!draft.trim() || submitting || generating || completed}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-[var(--text-primary)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                发送中...
              </>
            ) : (
              <>
                <Send size={16} />
                发送
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

