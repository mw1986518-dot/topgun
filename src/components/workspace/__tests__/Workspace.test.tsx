/**
 * Tests for Workspace state rendering
 *
 * Verifies the Workspace component correctly renders different phases
 * and handles user interactions with proper error feedback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock Tauri APIs before importing components
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { invoke } from "@tauri-apps/api/core";
import Workspace from "../Workspace";
import type { StateMachine, Framework } from "../../../types";

const mockInvoke = vi.mocked(invoke);

function makeDefaultState(overrides: Partial<StateMachine> = {}): StateMachine {
  return {
    current_phase: "input",
    topic: "",
    clarifications: [],
    clarification_round: 1,
    selected_frameworks: [],
    agents: {},
    iteration_count: 0,
    is_reasoning_running: false,
    max_iterations: 3,
    tolerated_risks: [],
    ipc_logs: [],
    recommended_frameworks: [],
    ...overrides,
  };
}

const mockFrameworks: Framework[] = [
  {
    id: "first_principles",
    name: "第一性原理",
    icon: "🔬",
    system_prompt: "You are a first principles thinker",
    description: "从基本事实出发推理",
    is_builtin: true,
  },
  {
    id: "systems_thinking",
    name: "系统思维",
    icon: "🌐",
    system_prompt: "You are a systems thinker",
    description: "整体性思维框架",
    is_builtin: true,
  },
];

describe("Workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders topic input when in input phase", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_state") return makeDefaultState();
      if (cmd === "get_frameworks") return mockFrameworks;
      return null;
    });

    render(<Workspace />);

    // Wait for loading to finish and topic input to appear
    expect(await screen.findByText("新建推演议题")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/例如：两个客户都不愿意签年度保底协议/),
    ).toBeInTheDocument();
  });

  it("does not render clarification panel in new flow", async () => {
    const legacyStateWithQuestions = makeDefaultState({
      clarifications: [
        { id: "q1", question: "目标用户群体是谁？" },
        { id: "q2", question: "预算范围是多少？" },
      ],
    });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_state") return legacyStateWithQuestions;
      if (cmd === "get_frameworks") return mockFrameworks;
      return null;
    });

    render(<Workspace />);

    expect(await screen.findByText("新建推演议题")).toBeInTheDocument();
    expect(screen.queryByText("阶段 1：需求澄清")).not.toBeInTheDocument();
  });

  it("renders framework selection in framework phase", async () => {
    const stateWithFrameworks = makeDefaultState({
      current_phase: "frameworkselection",
      topic: "如何提升产品转化率",
      clarifications: [{ id: "q1", question: "Q?", answer: "A" }],
      reframed_issue: "### 核心问题\n- 测试重塑议题",
      recommended_experts_panel: "### 推荐专家\n- 第一性原理\n- 系统动力学",
      problem_brief_ready: true,
      recommended_frameworks: ["first_principles", "systems_thinking"],
    });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_state") return stateWithFrameworks;
      if (cmd === "get_frameworks") return mockFrameworks;
      return null;
    });

    render(<Workspace />);

    expect(await screen.findByText("阶段 2：框架选择")).toBeInTheDocument();
    expect(screen.getByText("第一性原理")).toBeInTheDocument();
    expect(screen.getByText("系统思维")).toBeInTheDocument();
  });

  it("renders problem brief dialogue before final brief is ready", async () => {
    const stage2DialogueState = makeDefaultState({
      current_phase: "frameworkselection",
      topic: "如何提升产品转化率",
      clarifications: [{ id: "q1", question: "Q?", answer: "A" }],
      problem_brief_messages: [
        {
          role: "assistant",
          content: "先补充一下：你的核心目标和时间窗口分别是什么？",
        },
      ],
      problem_brief_ready: false,
    });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_state") return stage2DialogueState;
      if (cmd === "get_frameworks") return mockFrameworks;
      return null;
    });

    render(<Workspace />);

    expect(await screen.findByText("阶段 2：问题重塑对话")).toBeInTheDocument();
    expect(
      screen.getByText("先补充一下：你的核心目标和时间窗口分别是什么？"),
    ).toBeInTheDocument();
    expect(screen.getByText("生成专家级问题简报")).toBeInTheDocument();
  });

  it("shows error alert when initial load fails", async () => {
    mockInvoke.mockRejectedValue(new Error("Connection refused"));

    render(<Workspace />);

    expect(await screen.findByText("初始化加载失败")).toBeInTheDocument();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
    expect(screen.getByText("重试")).toBeInTheDocument();
  });

  it("renders consensus output when in consensus phase", async () => {
    const consensusState = makeDefaultState({
      current_phase: "consensus",
      topic: "测试议题",
      consensus_output: "## 最终共识\n这是最终报告。",
      agents: {
        first_principles: {
          framework_id: "first_principles",
          status: "complete",
          content: "方案内容",
          version: 2,
          objections: [],
        },
      },
    });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_state") return consensusState;
      if (cmd === "get_frameworks") return mockFrameworks;
      return null;
    });

    render(<Workspace />);

    expect(await screen.findByText("阶段 4：最终共识与交付")).toBeInTheDocument();
    expect(screen.getByText("导出 Markdown")).toBeInTheDocument();
  });

  it("disables submit button when topic is empty", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_state") return makeDefaultState();
      if (cmd === "get_frameworks") return mockFrameworks;
      return null;
    });

    render(<Workspace />);

    const submitButton = await screen.findByText("开始深度分析");
    expect(submitButton.closest("button")).toBeDisabled();
  });

  it("会把 IPC 日志同步给父组件", async () => {
    const stateWithIpcLogs = makeDefaultState({
      ipc_logs: [
        {
          timestamp: 1_700_000_000_000,
          level: "info",
          source: "engine",
          message: "日志同步测试",
        },
      ],
    });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_state") return stateWithIpcLogs;
      if (cmd === "get_frameworks") return mockFrameworks;
      return null;
    });

    const onIpcLogsChange = vi.fn();

    render(<Workspace onIpcLogsChange={onIpcLogsChange} />);

    await screen.findByText("新建推演议题");
    await waitFor(() => {
      expect(onIpcLogsChange).toHaveBeenLastCalledWith(stateWithIpcLogs.ipc_logs);
    });
  });

  it("会把会话诊断数据同步给父组件", async () => {
    const stateWithDiagnostics = makeDefaultState({
      diagnostics: {
        phase_durations_ms: {
          divergence_ms: 1200,
          examination_ms: 800,
          patch_ms: 500,
          consensus_ms: 1500,
          total_ms: 4000,
        },
        failure_counts: {
          divergence: 1,
          examination: 0,
          patch: 0,
          consensus: 0,
          total: 1,
        },
        fallback_counts: {
          examination_parser_repair: 1,
          examination_text_fallback: 0,
          consensus_synthesizer_fallback: 1,
          total: 2,
        },
        reasoning_runs: 2,
        last_run_completed_at: Date.now(),
      },
    });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_state") return stateWithDiagnostics;
      if (cmd === "get_frameworks") return mockFrameworks;
      return null;
    });

    const onDiagnosticsChange = vi.fn();

    render(<Workspace onDiagnosticsChange={onDiagnosticsChange} />);

    await screen.findByText("新建推演议题");
    await waitFor(() => {
      expect(onDiagnosticsChange).toHaveBeenLastCalledWith(
        stateWithDiagnostics.diagnostics,
      );
    });
  });
});
