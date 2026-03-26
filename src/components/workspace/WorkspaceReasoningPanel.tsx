import { Cpu, FileText, Loader2, Server } from "lucide-react";
import type { Agent, Framework, StateMachine } from "../../types";
import AgentCard from "./AgentCard";
import IterationView from "./IterationView";

interface WorkspaceReasoningPanelProps {
  state: StateMachine;
  frameworks: Framework[];
  currentPhase: number;
  viewOverride: number | null;
  isReasoning: boolean;
  elapsedMs: number;
  activeTab: "agents" | "iteration";
  onTabChange: (tab: "agents" | "iteration") => void;
  formatElapsed: (ms: number) => string;
}

/**
 * 阶段 1~3 的核心可视化区域（沙盘视图 / 迭代视图）。
 *
 * 这块 UI 结构较长，单独拆出来能让 Workspace 主文件更聚焦在流程控制上。
 */
export default function WorkspaceReasoningPanel({
  state,
  frameworks,
  currentPhase,
  viewOverride,
  isReasoning,
  elapsedMs,
  activeTab,
  onTabChange,
  formatElapsed,
}: WorkspaceReasoningPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          <Cpu style={{ color: "var(--color-accent)" }} size={24} />
          <h3 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            阶段 1-3：多智能体推演与仲裁{" "}
            {viewOverride !== null && (
              <span
                className="ml-3 text-sm font-normal px-2 py-1 rounded"
                style={{
                  color: "var(--color-phase-examine)",
                  background: "rgba(245, 158, 11, 0.1)",
                }}
              >
                正在查看历史阶段
              </span>
            )}
          </h3>
        </div>

        <div
          className="flex items-center gap-1 p-1 rounded-lg"
          style={{ background: "var(--color-bg-tertiary)" }}
        >
          {(["agents", "iteration"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${activeTab === tab ? "shadow-sm" : ""
                }`}
              style={{
                background:
                  activeTab === tab ? "var(--color-bg-secondary)" : "transparent",
                color:
                  activeTab === tab
                    ? "var(--color-text-primary)"
                    : "var(--color-text-muted)",
              }}
            >
              {tab === "agents" ? (
                <>
                  <Server size={16} />
                  沙盘视图
                </>
              ) : (
                <>
                  <FileText size={16} />
                  迭代视图
                </>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl flex items-center justify-between px-6 py-4 glass">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-bold" style={{ color: "var(--color-accent)" }}>
            第 {state.iteration_count || 1} 轮：
          </span>
          <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {currentPhase === 1
              ? "发散推演中..."
              : currentPhase === 2
                ? "交叉质询中..."
                : "修补迭代中..."}
          </span>
          {isReasoning && viewOverride === null && (
            <Loader2 size={14} className="animate-spin text-notion-text-light" />
          )}
        </div>
        <span className="text-sm font-mono text-notion-text-light">
          {formatElapsed(elapsedMs)}
        </span>
      </div>

      {activeTab === "agents" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(Object.values(state.agents) as Agent[]).map((agent: Agent) => (
              <AgentCard
                key={agent.framework_id}
                agent={agent}
                framework={frameworks.find((f) => f.id === agent.framework_id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <IterationView state={state} frameworks={frameworks} />
      )}
    </div>
  );
}
