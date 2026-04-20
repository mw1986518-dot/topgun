/**
 * Tests for useWorkspaceState hook
 *
 * Verifies initial load, state-update event debouncing,
 * action guard (prevents duplicate calls), error handling,
 * and all action handlers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWorkspaceState, toErrorMessage } from "../useWorkspaceState";
import type { StateMachine, Framework } from "../../types";

const mockInvoke = vi.fn();
const mockListen = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

describe("useWorkspaceState", () => {
  const mockFrameworks: Framework[] = [
    {
      id: "first_principles",
      name: "第一性原理",
      icon: "🔬",
      system_prompt: "You are a first principles thinker",
      description: "从基本事实出发推理",
      is_builtin: true,
    },
  ];

  const mockState: StateMachine = {
    current_phase: "input",
    topic: "测试主题",
    agents: {},
    ipc_logs: [],
    iteration_count: 0,
    max_iterations: 3,
    consensus_output: null,
    tolerated_risks: [],
    diagnostics: {},
    clarifications: [],
    clarification_round: 1,
    selected_frameworks: [],
    recommended_frameworks: [],
    reframed_issue: null,
    recommended_experts_panel: null,
    problem_brief_messages: [],
    problem_brief_ready: false,
    custom_user_prompt: null,
    is_reasoning_running: false,
    action_plan_questions: [],
    action_plan_answers: {},
    current_action_plan_question_index: 0,
    action_plan: null,
    action_plan_in_progress: false,
  };

  let eventHandler: ((event: { payload: StateMachine }) => void) | null = null;
  let unlistenFn: (() => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    mockInvoke.mockReset();
    mockListen.mockReset();

    unlistenFn = vi.fn();
    mockListen.mockImplementation(async (eventName: string, handler: unknown) => {
      if (eventName === "state-update") {
        eventHandler = handler as (event: { payload: StateMachine }) => void;
      }
      return unlistenFn;
    });

    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_state") return mockState;
      if (cmd === "get_frameworks") return mockFrameworks;
      return undefined;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    eventHandler = null;
  });

  it("loads state and frameworks on mount", async () => {
    const { result } = renderHook(() => useWorkspaceState());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.state).toEqual(mockState);
    expect(result.current.frameworks).toEqual(mockFrameworks);
    expect(mockInvoke).toHaveBeenCalledWith("get_state");
    expect(mockInvoke).toHaveBeenCalledWith("get_frameworks");
  });

  it("handles load error and shows uiError", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("连接失败"));

    const { result } = renderHook(() => useWorkspaceState());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.uiError).not.toBeNull();
    expect(result.current.uiError?.message).toBe("连接失败");
  });

  it("debounces state-update events", async () => {
    const { result } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedState = { ...mockState, topic: "更新后主题" };

    act(() => {
      eventHandler?.({ payload: updatedState });
      eventHandler?.({ payload: { ...updatedState, topic: "再次更新" } });
    });

    // Before debounce timeout, state should still be old
    expect(result.current.state?.topic).toBe("测试主题");

    act(() => vi.advanceTimersByTime(100));

    // After debounce, only the latest state should be applied
    expect(result.current.state?.topic).toBe("再次更新");
  });

  it("does not process state-update when unmounted", async () => {
    const { result, unmount } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();

    const updatedState = { ...mockState, topic: "不应被应用" };
    act(() => {
      eventHandler?.({ payload: updatedState });
    });

    act(() => vi.advanceTimersByTime(100));

    expect(unlistenFn).toHaveBeenCalled();
  });

  it("starts a session via handleStartSession", async () => {
    mockInvoke.mockResolvedValueOnce(mockState);
    mockInvoke.mockResolvedValueOnce(mockFrameworks);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleStartSession("新话题");
    });

    expect(mockInvoke).toHaveBeenCalledWith("start_session", { topic: "新话题" });
    expect(result.current.isStartingSession).toBe(false);
  });

  it("prevents duplicate actions via action guard", async () => {
    mockInvoke.mockResolvedValueOnce(mockState);
    mockInvoke.mockResolvedValueOnce(mockFrameworks);

    let resolveStart: (() => void) | null = null;
    mockInvoke.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        resolveStart = resolve;
      });
      return undefined;
    });

    const { result } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Start first call (it will hang)
    act(() => {
      result.current.handleStartSession("话题");
    });

    // Immediately try second call — should be blocked by guard
    await act(async () => {
      await result.current.handleStartSession("话题2");
    });

    expect(result.current.isStartingSession).toBe(true);

    // Resolve the first call
    act(() => resolveStart?.());
  });

  it("handles problem brief dialogue", async () => {
    mockInvoke.mockResolvedValueOnce(mockState);
    mockInvoke.mockResolvedValueOnce(mockFrameworks);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleProblemBriefDialogue("用户消息");
    });

    expect(mockInvoke).toHaveBeenCalledWith("continue_problem_brief_dialogue", {
      userMessage: "用户消息",
    });
  });

  it("handles generate problem brief", async () => {
    mockInvoke.mockResolvedValueOnce(mockState);
    mockInvoke.mockResolvedValueOnce(mockFrameworks);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleGenerateProblemBrief();
    });

    expect(mockInvoke).toHaveBeenCalledWith("generate_problem_brief_delivery");
  });

  it("handles framework select and triggers reasoning", async () => {
    mockInvoke.mockResolvedValueOnce(mockState);
    mockInvoke.mockResolvedValueOnce(mockFrameworks);
    mockInvoke.mockResolvedValueOnce(undefined); // select_frameworks
    mockInvoke.mockResolvedValueOnce(undefined); // run_reasoning

    const { result } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleFrameworkSelect(["first_principles"]);
    });

    expect(mockInvoke).toHaveBeenCalledWith("select_frameworks", {
      frameworkIds: ["first_principles"],
      customUserPrompt: undefined,
    });
    expect(mockInvoke).toHaveBeenCalledWith("run_reasoning");
  });

  it("handles reset session", async () => {
    mockInvoke.mockResolvedValueOnce(mockState);
    mockInvoke.mockResolvedValueOnce(mockFrameworks);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleReset();
    });

    expect(mockInvoke).toHaveBeenCalledWith("reset_session");
    expect(result.current.isResetting).toBe(false);
  });

  it("shows action tip after reasoning starts", async () => {
    mockInvoke.mockResolvedValueOnce(mockState);
    mockInvoke.mockResolvedValueOnce(mockFrameworks);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleRunReasoning();
    });

    expect(result.current.isReasoning).toBe(false);
  });

  it("sets uiError when action fails", async () => {
    mockInvoke.mockResolvedValueOnce(mockState);
    mockInvoke.mockResolvedValueOnce(mockFrameworks);
    mockInvoke.mockRejectedValueOnce(new Error("LLM 超时"));

    const { result } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleStartSession("话题");
    });

    expect(result.current.uiError).not.toBeNull();
    expect(result.current.uiError?.message).toBe("LLM 超时");
  });

  it("busy flag combines backend and frontend loading states", async () => {
    const backendRunningState = { ...mockState, is_reasoning_running: true };
    mockInvoke.mockResolvedValueOnce(backendRunningState);
    mockInvoke.mockResolvedValueOnce(mockFrameworks);

    const { result } = renderHook(() => useWorkspaceState());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.busy).toBe(true);
    expect(result.current.backendReasoningRunning).toBe(true);
  });
});

describe("toErrorMessage", () => {
  it("returns string as-is", () => {
    expect(toErrorMessage("纯文本错误")).toBe("纯文本错误");
  });

  it("extracts message from Error", () => {
    expect(toErrorMessage(new Error("出错了"))).toBe("出错了");
  });

  it("stringifies objects", () => {
    expect(toErrorMessage({ code: 500 })).toBe('{"code":500}');
  });

  it("falls back for circular references", () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const result = toErrorMessage(obj);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
