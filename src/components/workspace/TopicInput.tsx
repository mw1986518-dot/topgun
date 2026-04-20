import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Wand2, Paperclip } from "lucide-react";

interface TopicInputProps {
  onSubmit: (topic: string) => void;
  disabled?: boolean;
}

export default function TopicInput({ onSubmit, disabled }: TopicInputProps) {
  const { t } = useTranslation("workspace");
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
          {t("topicInput.title")}
        </h2>
        <p
          className="text-[1.05rem] mt-2 leading-relaxed max-w-2xl"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {t("topicInput.description")}
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
          placeholder={t("topicInput.placeholder")}
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
              {t("topicInput.attachment")}
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
              {t("submit", { ns: "common" })}
            </span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!topic.trim() || disabled || submitting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[var(--text-primary)] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] cursor-pointer glow-accent"
            style={{
              background: "var(--bg-hover)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            {submitting ? (
              t("processing", { ns: "common" })
            ) : (
              <>
                <Wand2 size={18} />
                {t("topicInput.startAnalysis")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
