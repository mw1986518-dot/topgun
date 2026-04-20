import { useTranslation } from "react-i18next";
import { Loader2, Maximize2, X } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Agent, AgentStatus, Framework } from "../../types";
import { useTypewriter } from "../../hooks/useTypewriter";

export type { Agent, AgentStatus };

interface AgentCardProps {
  agent: Agent;
  framework: Framework | undefined;
}

const statusStyles: Record<AgentStatus, { color: string; bg: string }> = {
  idle: { color: "#71717a", bg: "rgba(113, 113, 122, 0.15)" },
  thinking: { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" },
  pass: { color: "#22c55e", bg: "rgba(34, 197, 94, 0.15)" },
  objection: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" },
  patching: { color: "#f97316", bg: "rgba(249, 115, 22, 0.15)" },
  complete: { color: "#22c55e", bg: "rgba(34, 197, 94, 0.15)" },
};

export default function AgentCard({ agent, framework }: AgentCardProps) {
  const { t } = useTranslation("agent");
  const [isExpanded, setIsExpanded] = useState(false);
  const statusStyle = statusStyles[agent.status];
  const statusLabel = t(`status.${agent.status}`);
  const typedContent = useTypewriter(agent.content, 5, 12);

  return (
    <>
      <div
        className="group relative rounded-xl overflow-hidden cursor-pointer transition-all"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
        onClick={() => agent.content && setIsExpanded(true)}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--border-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-color)";
        }}
      >
        {/* Status bar */}
        <div className="h-0.5" style={{ background: statusStyle.color }} />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base flex-shrink-0">
              {framework?.icon || "\u{1F9E0}"}
            </span>
            <span
              className="text-[13px] font-medium truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {framework?.name || agent.framework_id}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {agent.status === "thinking" && (
              <Loader2
                size={12}
                className="animate-spin"
                style={{ color: statusStyle.color }}
              />
            )}
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{ background: statusStyle.bg, color: statusStyle.color }}
            >
              <div
                className="w-1 h-1 rounded-full"
                style={{ background: statusStyle.color }}
              />
              {statusLabel}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-3">
          {agent.content ? (
            <div
              className="text-xs leading-relaxed h-[88px] overflow-hidden mask-bottom prose prose-invert prose-sm max-w-none"
              style={{ color: "var(--text-secondary)" }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{typedContent}</ReactMarkdown>
            </div>
          ) : (
            <div
              className="flex items-center justify-center h-[88px] text-xs rounded-lg"
              style={{
                color: "var(--text-muted)",
                background: "var(--bg-tertiary)",
              }}
            >
              {agent.status === "thinking" ? (
                <span className="animate-shimmer">{t("thinking")}</span>
              ) : (
                t("waitingAwakening")
              )}
            </div>
          )}
        </div>

        {/* Objections */}
        {agent.objections.length > 0 && (
          <div className="px-4 pb-3">
            <div
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: "var(--accent-red)" }}
            >
              <div
                className="w-1 h-1 rounded-full"
                style={{ background: "var(--accent-red)" }}
              />
              {t("objectionsPending", { count: agent.objections.length })}
            </div>
          </div>
        )}

        {/* Expand button */}
        {agent.content && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
            className="absolute top-2.5 right-3 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            style={{
              color: "var(--text-muted)",
              background: "var(--bg-tertiary)",
            }}
          >
            <Maximize2 size={12} />
          </button>
        )}
      </div>

      {/* Expanded Modal */}
      {isExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.8)" }}
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="w-full max-w-3xl h-[85vh] rounded-xl flex flex-col overflow-hidden"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{framework?.icon || "\u{1F9E0}"}</span>
                <span
                  className="text-[15px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {framework?.name || agent.framework_id}
                </span>
                <div
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ background: statusStyle.bg, color: statusStyle.color }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: statusStyle.color }}
                  />
                  {statusLabel}
                </div>
              </div>
              <button
                className="p-1.5 rounded-lg transition-colors cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                onClick={() => setIsExpanded(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div
              className="flex-1 p-5 overflow-y-auto text-sm leading-relaxed prose prose-invert max-w-none"
              style={{ background: "var(--bg-primary)" }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {agent.content || t("noContent")}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
