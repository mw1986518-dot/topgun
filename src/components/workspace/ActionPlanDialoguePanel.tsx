import { useState } from "react";
import { ArrowRight, Loader2, Send, X, HelpCircle } from "lucide-react";
import type { ActionPlanQuestion } from "../../types";

interface ActionPlanDialoguePanelProps {
  questions: ActionPlanQuestion[];
  currentIndex: number;
  answers: Record<string, string>;
  submitting: boolean;
  generating: boolean;
  onAnswer: (key: string, answer: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * 落地方案参数收集对话面板
 * 用于收集生成落地方案所需的关键参数
 */
export default function ActionPlanDialoguePanel({
  questions,
  currentIndex,
  answers,
  submitting,
  generating,
  onAnswer,
  onCancel,
}: ActionPlanDialoguePanelProps) {
  const [input, setInput] = useState("");

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const answeredCount = currentIndex;

  if (!currentQuestion) return null;

  async function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || submitting || generating) return;
    await onAnswer(currentQuestion.key, trimmed);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div
      className="rounded-2xl p-0 overflow-hidden animate-fade-in-up glass"
      style={{ minHeight: 400 }}
    >
      {/* 头部 */}
      <div
        className="px-6 py-5 border-b"
        style={{
          borderColor: "var(--color-border)",
          background:
            "radial-gradient(circle at 0% 0%, rgba(34,197,94,0.22), rgba(2,6,23,0) 42%)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(34, 197, 94, 0.16)",
                color: "#22C55E",
              }}
            >
              <ArrowRight size={18} />
            </div>
            <div>
              <h3
                className="text-xl font-bold tracking-tight"
                style={{ color: "var(--color-text-primary)" }}
              >
                生成落地方案
              </h3>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
                回答以下问题，帮助我们生成可执行的落地方案
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)]/5"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* 进度条 */}
      <div className="px-6 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between text-sm mb-2">
          <span style={{ color: "var(--color-text-secondary)" }}>进度</span>
          <span style={{ color: "var(--color-text-primary)" }}>
            {answeredCount} / {totalQuestions} 个问题
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: "var(--color-bg-tertiary)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${(answeredCount / totalQuestions) * 100}%`,
              background: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-primary)",
            }}
          />
        </div>
      </div>

      {/* 当前问题 */}
      <div className="px-6 py-6" style={{ background: "var(--color-bg-primary)" }}>
        <div
          className="rounded-xl p-5 mb-4"
          style={{
            background: "rgba(34, 197, 94, 0.08)",
            border: "1px solid rgba(34, 197, 94, 0.2)",
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{
                background: "rgba(34, 197, 94, 0.16)",
                color: "#22C55E",
              }}
            >
              <HelpCircle size={14} />
            </div>
            <div>
              <p
                className="text-lg font-medium mb-2"
                style={{ color: "var(--color-text-primary)" }}
              >
                {currentQuestion.question}
              </p>
              <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                <span style={{ color: "#22C55E" }}>关联行动：</span>
                {currentQuestion.related_action}
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-tertiary)" }}>
                {currentQuestion.reason}
              </p>
            </div>
          </div>
        </div>

        {/* 已回答的问题（可选展示） */}
        {answeredCount > 0 && (
          <div className="mb-4 space-y-2">
            {questions.slice(0, answeredCount).map((q) => (
              <div
                key={q.key}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
                style={{
                  background: "var(--color-bg-tertiary)",
                  color: "var(--color-text-secondary)",
                }}
              >
                <span style={{ color: "#22C55E" }}>✓</span>
                <span>{q.question}</span>
                <span style={{ color: "var(--color-text-tertiary)" }}>
                  → {answers[q.key] || ""}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 输入区域 */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的回答..."
            disabled={submitting || generating}
            className="flex-1 px-4 py-3 rounded-xl text-base outline-none transition-all"
            style={{
              background: "var(--color-bg-tertiary)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-primary)",
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || submitting || generating}
            className="px-5 py-3 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            style={{
              background: "var(--bg-hover)", border: "1px solid var(--border-color)",
              color: "white",
            }}
          >
            {submitting || generating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                处理中
              </>
            ) : (
              <>
                <Send size={18} />
                发送
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
