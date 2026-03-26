import { Download, Copy, Check, AlertCircle, Loader2, ArrowRight, FileText, ClipboardList } from "lucide-react";
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Framework, ToleratedRiskItem, ActionPlanQuestion } from "../../types";
import ActionPlanDialoguePanel from "./ActionPlanDialoguePanel";

interface ConsensusOutputProps {
  content: string;
  toleratedRisks: ToleratedRiskItem[];
  frameworks?: Framework[];
  actionPlan?: string;
  actionPlanInProgress?: boolean;
  actionPlanQuestions?: ActionPlanQuestion[];
  actionPlanAnswers?: Record<string, string>;
  currentActionPlanQuestionIndex?: number;
  onStateUpdate?: () => void;
}

type ExportStatus = "idle" | "exporting" | "success" | "error";
type ViewMode = "consensus" | "actionPlan";

export default function ConsensusOutput({
  content,
  toleratedRisks,
  frameworks = [],
  actionPlan,
  actionPlanInProgress = false,
  actionPlanQuestions = [],
  actionPlanAnswers = {},
  currentActionPlanQuestionIndex = 0,
  onStateUpdate,
}: ConsensusOutputProps) {
  const [copied, setCopied] = useState(false);
  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("consensus");

  const [isStartingActionPlan, setIsStartingActionPlan] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [localQuestions, setLocalQuestions] = useState<ActionPlanQuestion[]>([]);
  const [localCurrentIndex, setLocalCurrentIndex] = useState(0);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [localActionPlan, setLocalActionPlan] = useState<string | null>(null);
  const [actionPlanError, setActionPlanError] = useState<string | null>(null);

  void actionPlanInProgress;

  useEffect(() => {
    setLocalQuestions(actionPlanQuestions);
    setLocalCurrentIndex(currentActionPlanQuestionIndex);
    setLocalAnswers(actionPlanAnswers);
    setLocalActionPlan(actionPlan || null);
  }, [actionPlanQuestions, currentActionPlanQuestionIndex, actionPlanAnswers, actionPlan]);

  useEffect(() => {
    if (localActionPlan) setViewMode("actionPlan");
  }, [localActionPlan]);

  async function handleCopy() {
    const text = viewMode === "consensus" ? content : (localActionPlan || "");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownload() {
    const text = viewMode === "consensus" ? content : (localActionPlan || "");
    if (!text.trim()) {
      setExportStatus("error");
      setExportMessage("当前没有可导出的内容");
      return;
    }
    setExportStatus("exporting");
    try {
      const path = await invoke<string>("export_consensus_markdown", { content: text });
      setExportStatus("success");
      setExportMessage("已导出到：" + path);
      setTimeout(() => { setExportStatus("idle"); setExportMessage(""); }, 2500);
    } catch (error) {
      if (String(error).includes("已取消")) {
        setExportStatus("idle");
        return;
      }
      setExportStatus("error");
      setExportMessage(String(error));
    }
  }

  async function handleStartActionPlan() {
    setIsStartingActionPlan(true);
    setActionPlanError(null);
    try {
      const questions = await invoke<ActionPlanQuestion[]>("start_action_plan");
      setLocalQuestions(questions);
      setLocalCurrentIndex(0);
      setLocalAnswers({});
      setLocalActionPlan(null);
    } catch (error) {
      setActionPlanError(String(error));
    } finally {
      setIsStartingActionPlan(false);
    }
  }

  async function handleAnswerQuestion(key: string, answer: string) {
    setIsSubmittingAnswer(true);
    setActionPlanError(null);
    try {
      const next = await invoke<ActionPlanQuestion | null>("answer_action_plan_question", { key, answer });
      setLocalAnswers((prev) => ({ ...prev, [key]: answer }));
      if (next) {
        setLocalCurrentIndex((prev) => prev + 1);
      } else {
        const plan = await invoke<string>("generate_action_plan");
        setLocalActionPlan(plan);
        onStateUpdate?.();
      }
    } catch (error) {
      setActionPlanError(String(error));
    } finally {
      setIsSubmittingAnswer(false);
    }
  }

  async function handleCancelActionPlan() {
    try {
      await invoke("cancel_action_plan");
      setLocalQuestions([]);
      setLocalCurrentIndex(0);
      setLocalAnswers({});
      setActionPlanError(null);
      onStateUpdate?.();
    } catch (error) {
      console.error(error);
    }
  }

  function getFrameworkName(id: string): string {
    return frameworks.find((f) => f.id === id)?.name ?? id;
  }

  const showDialogue = localQuestions.length > 0 && !localActionPlan;
  const showToggle = localActionPlan !== null;

  return (
    <div className="space-y-4">
      {/* Toggle */}
      {showToggle && (
        <div className="inline-flex rounded-lg p-1" style={{ background: "var(--bg-secondary)" }}>
          <button
            onClick={() => setViewMode("consensus")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer"
            style={{
              background: viewMode === "consensus" ? "var(--accent-blue)" : "transparent",
              color: viewMode === "consensus" ? "white" : "var(--text-secondary)",
            }}
          >
            <FileText size={14} />
            共识报告
          </button>
          <button
            onClick={() => setViewMode("actionPlan")}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer"
            style={{
              background: viewMode === "actionPlan" ? "var(--accent-green)" : "transparent",
              color: viewMode === "actionPlan" ? "white" : "var(--text-secondary)",
            }}
          >
            <ClipboardList size={14} />
            落地方案
          </button>
        </div>
      )}

      {/* Dialogue */}
      {showDialogue && (
        <ActionPlanDialoguePanel
          questions={localQuestions}
          currentIndex={localCurrentIndex}
          answers={localAnswers}
          submitting={isSubmittingAnswer}
          generating={false}
          onAnswer={handleAnswerQuestion}
          onCancel={handleCancelActionPlan}
        />
      )}

      {/* Error */}
      {actionPlanError && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
          style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--accent-red)" }}
        >
          <AlertCircle size={14} />
          {actionPlanError}
        </div>
      )}

      {/* Main Content */}
      {!showDialogue && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: "1px solid var(--border-color)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: viewMode === "consensus"
                    ? "rgba(6, 182, 212, 0.15)"
                    : "rgba(34, 197, 94, 0.15)",
                  color: viewMode === "consensus" ? "var(--accent-cyan)" : "var(--accent-green)",
                }}
              >
                {viewMode === "consensus" ? <Check size={16} /> : <ClipboardList size={16} />}
              </div>
              <span className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
                {viewMode === "consensus" ? "阶段 4：最终共识与交付" : "落地方案"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {viewMode === "consensus" && !localActionPlan && (
                <button
                  onClick={handleStartActionPlan}
                  disabled={isStartingActionPlan}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
                  style={{ background: "var(--accent-green)", color: "white" }}
                >
                  {isStartingActionPlan ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ArrowRight size={14} />
                  )}
                  {isStartingActionPlan ? "分析中..." : "生成落地方案"}
                </button>
              )}
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer"
                style={{
                  color: copied ? "var(--accent-green)" : "var(--text-secondary)",
                  background: copied ? "rgba(34, 197, 94, 0.1)" : "transparent",
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "已复制" : "复制"}
              </button>
              <button
                onClick={handleDownload}
                disabled={exportStatus === "exporting"}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer disabled:opacity-50"
                style={{ color: "var(--text-secondary)" }}
              >
                {exportStatus === "exporting" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                {exportStatus === "exporting" ? "导出中..." : "导出"}
              </button>
            </div>
          </div>

          {/* Export Status */}
          {exportMessage && (
            <div
              className="flex items-start gap-2 mx-5 mt-3 px-3 py-2 rounded-lg text-sm"
              style={{
                background: exportStatus === "success"
                  ? "rgba(34, 197, 94, 0.1)"
                  : "rgba(239, 68, 68, 0.1)",
                color: exportStatus === "success" ? "var(--accent-green)" : "var(--accent-red)",
              }}
            >
              {exportStatus === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
              {exportMessage}
            </div>
          )}

          {/* Content */}
          <div
            className="p-5 prose prose-invert max-w-none leading-relaxed text-sm"
            style={{ background: "var(--bg-primary)" }}
          >
            {viewMode === "consensus" ? (
              content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              ) : (
                <p style={{ color: "var(--text-muted)" }}>引擎正在生成最终报告...</p>
              )
            ) : localActionPlan ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{localActionPlan}</ReactMarkdown>
            ) : (
              <p style={{ color: "var(--text-muted)" }}>正在生成落地方案...</p>
            )}
          </div>

          {/* Risks */}
          {viewMode === "consensus" && toleratedRisks.length > 0 && (
            <div
              className="px-5 py-4"
              style={{ borderTop: "1px solid var(--border-color)" }}
            >
              <h4
                className="text-xs font-medium mb-3"
                style={{ color: "var(--accent-orange)" }}
              >
                容忍风险清单（临时接受，非最终共识）
              </h4>
              <div className="space-y-2">
                {toleratedRisks.map((risk, i) => (
                  <div
                    key={`${risk.framework_id}-${i}`}
                    className="rounded-lg p-3"
                    style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
                  >
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span style={{ color: "var(--text-secondary)" }}>
                        来源框架：{getFrameworkName(risk.framework_id)}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded"
                        style={{ background: "rgba(249, 115, 22, 0.15)", color: "var(--accent-orange)" }}
                      >
                        临时容忍项
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                      <strong>风险摘要：</strong>{risk.risk_summary}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
