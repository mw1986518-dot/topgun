import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, Box, Flag } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { StateMachine, Framework } from "../../types";

interface IterationViewProps {
  state: StateMachine;
  frameworks: Framework[];
}

interface VersionEntry {
  id: string;
  label: string;
  desc: string;
  dotColor: string;
}

export default function IterationView({ state, frameworks }: IterationViewProps) {
  const { t } = useTranslation("workspace");
  const versions = useMemo<VersionEntry[]>(() => {
    const list: VersionEntry[] = [
      {
        id: "0.1",
        label: t("iterationView.versions.v01Label"),
        desc: t("iterationView.versions.v01Desc"),
        dotColor: "var(--color-text-muted)",
      },
      {
        id: "1.0",
        label: t("iterationView.versions.v10Label"),
        desc: t("iterationView.versions.v10Desc"),
        dotColor: "var(--color-phase-diverge)",
      },
    ];

    const agentKeys = state?.agents ? Object.keys(state.agents) : [];
    let maxVersion = 1;
    for (const key of agentKeys) {
      const version = state.agents[key]?.version || 1;
      if (version > maxVersion) maxVersion = version;
    }

    for (let i = 2; i <= maxVersion; i++) {
      list.push({
        id: `${i}.0`,
        label: t("iterationView.versions.patchLabel", { version: i }),
        desc: t("iterationView.versions.patchDesc", { round: i - 1 }),
        dotColor: "var(--color-phase-patch)",
      });
    }

    if (state?.consensus_output) {
      list.push({
        id: "final",
        label: t("iterationView.versions.finalLabel"),
        desc: t("iterationView.versions.finalDesc"),
        dotColor: "var(--color-phase-consensus)",
      });
    }

    return list;
  }, [state, t]);

  const [activeVersion, setActiveVersion] = useState("1.0");

  const agentKeys = state?.agents ? Object.keys(state.agents) : [];
  const hasAgentsData = agentKeys.length > 0 && !!state.agents[agentKeys[0]]?.content;

  const renderContent = () => {
    if (activeVersion === "0.1") {
      return (
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {state?.reframed_issue || state?.topic || t("iterationView.waitingTopic")}
          </ReactMarkdown>
        </div>
      );
    }

    if (activeVersion === "1.0") {
      if (!hasAgentsData) {
        return (
          <div
            className="flex items-center justify-center p-10"
            style={{ color: "var(--color-text-muted)" }}
          >
            {t("iterationView.noDivergenceOutput")}
          </div>
        );
      }

      return (
        <div className="space-y-4">
          {agentKeys.map((key) => {
            const agent = state.agents[key];
            const framework = frameworks?.find((item) => item.id === key);
            const displayName = framework ? framework.name : key;
            return (
              <div
                key={key}
                className="rounded-xl p-5"
                style={{
                  background: "var(--color-bg-tertiary)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div
                  className="font-bold flex items-center gap-2 mb-3 text-sm"
                  style={{ color: "var(--color-accent)" }}
                >
                  <Box size={14} /> {displayName}
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-[13px] leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {agent.content || t("iterationView.noContent")}
                  </ReactMarkdown>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (activeVersion.endsWith(".0") && activeVersion !== "1.0") {
      const targetVersion = parseInt(activeVersion, 10);
      if (!hasAgentsData) {
        return (
          <div
            className="flex items-center justify-center p-10"
            style={{ color: "var(--color-text-muted)" }}
          >
            {t("iterationView.patchNotComplete")}
          </div>
        );
      }

      const matchingAgents = agentKeys.filter(
        (key) => (state.agents[key]?.version || 1) >= targetVersion,
      );

      if (matchingAgents.length === 0) {
        return (
          <div
            className="flex items-center justify-center p-10"
            style={{ color: "var(--color-text-muted)" }}
          >
            {t("iterationView.noFrameworkCompletedPatch", { round: targetVersion - 1 })}
          </div>
        );
      }

      return (
        <div className="space-y-4">
          {matchingAgents.map((key) => {
            const agent = state.agents[key];
            const framework = frameworks?.find((item) => item.id === key);
            const displayName = framework ? framework.name : key;
            return (
              <div
                key={key}
                className="rounded-xl p-5"
                style={{
                  background: "var(--color-bg-tertiary)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div
                  className="font-bold flex items-center gap-2 mb-3 text-sm"
                  style={{ color: "var(--color-phase-patch)" }}
                >
                  <Box size={14} /> {displayName}
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded ml-auto"
                    style={{
                      background: "var(--color-bg-secondary)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    v{agent.version}
                  </span>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-[13px] leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {agent.content || t("iterationView.noContent")}
                  </ReactMarkdown>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (activeVersion === "final") {
      return (
        <div className="prose prose-invert prose-sm max-w-none leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {state?.consensus_output || t("iterationView.consensusGenerating")}
          </ReactMarkdown>
        </div>
      );
    }

    return null;
  };

  const currentEntry = versions.find((item) => item.id === activeVersion);

  return (
    <div
      className="flex rounded-2xl overflow-hidden min-h-[600px] h-[75vh] animate-fade-in-up"
      style={{
        background: "var(--color-bg-secondary)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        className="w-1/3 max-w-[260px] flex flex-col shrink-0"
        style={{
          borderRight: "1px solid var(--color-border)",
          background: "var(--color-bg-primary)",
        }}
      >
        <div
          className="p-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <span
            className="font-bold text-sm"
            style={{ color: "var(--color-text-primary)" }}
          >
            {t("iterationView.historyTitle")}
          </span>
          <GitBranch size={14} style={{ color: "var(--color-text-muted)" }} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 relative space-y-2 custom-scrollbar">
          <div
            className="absolute left-[25px] top-6 bottom-6 w-[2px]"
            style={{ background: "var(--color-border)" }}
          />

          {versions.map((version) => {
            const isActive = activeVersion === version.id;
            return (
              <div
                key={version.id}
                className="relative pl-9 z-10 cursor-pointer"
                onClick={() => setActiveVersion(version.id)}
              >
                <div
                  className="absolute left-[19px] top-3 w-3 h-3 rounded-full transition-all"
                  style={{
                    background: isActive ? version.dotColor : "var(--color-bg-tertiary)",
                    border: `2px solid ${isActive ? version.dotColor : "var(--color-border)"}`,
                    transform: isActive ? "scale(1.3)" : "scale(1)",
                    boxShadow: isActive ? `0 0 8px ${version.dotColor}40` : "none",
                  }}
                />

                <div
                  className="rounded-lg px-3 py-2.5 transition-all text-left"
                  style={{
                    background: isActive ? "var(--color-bg-tertiary)" : "transparent",
                    borderLeft: isActive
                      ? `3px solid ${version.dotColor}`
                      : "3px solid transparent",
                  }}
                >
                  <div
                    className="font-semibold text-[13px]"
                    style={{
                      color: isActive
                        ? "var(--color-text-primary)"
                        : "var(--color-text-secondary)",
                    }}
                  >
                    {version.label}
                  </div>
                  <div
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {version.desc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div
          className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            {activeVersion === "final" && (
              <Flag size={16} style={{ color: "var(--color-phase-consensus)" }} />
            )}
            <h3
              className="font-bold tracking-tight text-base"
              style={{ color: "var(--color-text-primary)" }}
            >
              {currentEntry?.label || ""}
            </h3>
          </div>
          <span
            className="px-2 py-1 rounded-md text-[11px] font-mono font-bold tracking-wider"
            style={{
              background: "var(--color-bg-tertiary)",
              color: "var(--color-text-muted)",
            }}
          >
            {activeVersion === "final"
              ? t("iterationView.versionFinal")
              : t("iterationView.version", { version: activeVersion })}
          </span>
        </div>
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
