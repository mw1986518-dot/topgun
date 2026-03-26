import { useState } from "react";
import { Wand2, Paperclip } from "lucide-react";

interface TopicInputProps {
  onSubmit: (topic: string) => void;
  disabled?: boolean;
}

export default function TopicInput({ onSubmit, disabled }: TopicInputProps) {
  const [topic, setTopic] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!topic.trim() || disabled) return;

    setSubmitting(true);
    try {
      await onSubmit(topic.trim());
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && event.ctrlKey) {
      handleSubmit();
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h2
          className="text-[2rem] font-bold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          新建推演议题
        </h2>
        <p
          className="text-[1.05rem] mt-2 leading-relaxed max-w-2xl"
          style={{ color: "var(--color-text-secondary)" }}
        >
          输入你的初始问题、业务难点或方案草稿，系统会组织多个思维框架并发推演，输出可执行结论。
        </p>
      </div>

      <div
        className="relative rounded-2xl transition-all focus-within:ring-2"
        style={{
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border)",
        }}
      >
        <textarea
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || submitting}
          placeholder="例如：两个客户都不愿意签年度保底协议，如何在不让利过多的前提下推进成交？"
          rows={6}
          className="w-full px-5 py-4 bg-transparent focus:outline-none resize-none text-[15px] leading-relaxed"
          style={{ color: "var(--color-text-primary)" }}
        />

        <div
          className="flex items-center justify-between px-5 py-4 rounded-b-2xl"
          style={{
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-bg-tertiary)",
          }}
        >
          <div
            className="flex items-center gap-4 text-sm"
            style={{ color: "var(--color-text-muted)" }}
          >
            <button className="flex items-center gap-1.5 hover:opacity-80 transition-opacity font-medium cursor-pointer">
              <Paperclip size={16} />
              支持附件（预留）
            </button>
            <span className="flex items-center gap-1.5">
              <span
                className="rounded-md px-2 py-0.5 text-xs font-mono"
                style={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Ctrl
              </span>
              +
              <span
                className="rounded-md px-2 py-0.5 text-xs font-mono"
                style={{
                  background: "var(--color-bg-card)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Enter
              </span>
              提交
            </span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!topic.trim() || disabled || submitting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[var(--text-primary)] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer glow-accent"
            style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
          >
            {submitting ? (
              <>处理中...</>
            ) : (
              <>
                <Wand2 size={18} />
                开始深度分析
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

