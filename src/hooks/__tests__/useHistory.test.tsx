/**
 * Tests for useHistory hook
 *
 * Verifies loading, opening, loading entries, deleting,
 * and clearing history with proper loading states.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHistory } from "../useHistory";
import type { SessionHistoryEntry, StateMachine } from "../../types";

const mockInvoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("useHistory", () => {
  const mockSetState = vi.fn();
  const mockSetUiError = vi.fn();
  const mockShowActionTip = vi.fn();

  const mockEntries: SessionHistoryEntry[] = [
    { id: "1", topic: "测试主题1", created_at: 1700000000000 },
    { id: "2", topic: "测试主题2", created_at: 1700000001000 },
  ];

  const mockState: StateMachine = {
    current_phase: "consensus",
    topic: "测试主题",
    agents: {},
    ipc_logs: [],
    iteration_count: 0,
    max_iterations: 3,
    consensus_output: "共识内容",
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with closed panel and empty items", () => {
    const { result } = renderHook(() =>
      useHistory(mockSetState, mockSetUiError, mockShowActionTip),
    );

    expect(result.current.historyVisible).toBe(false);
    expect(result.current.historyItems).toEqual([]);
    expect(result.current.historyLoading).toBe(false);
    expect(result.current.historyLoadingId).toBeNull();
    expect(result.current.historyDeletingId).toBeNull();
    expect(result.current.historyClearing).toBe(false);
  });

  it("loads history entries on open", async () => {
    mockInvoke.mockResolvedValueOnce(mockEntries);

    const { result } = renderHook(() =>
      useHistory(mockSetState, mockSetUiError, mockShowActionTip),
    );

    await act(async () => {
      await result.current.handleOpenHistory();
    });

    expect(result.current.historyVisible).toBe(true);
    expect(result.current.historyItems).toEqual(mockEntries);
    expect(mockInvoke).toHaveBeenCalledWith("get_history_entries");
  });

  it("sets error when loading history fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("磁盘错误"));

    const { result } = renderHook(() =>
      useHistory(mockSetState, mockSetUiError, mockShowActionTip),
    );

    await act(async () => {
      await result.current.handleOpenHistory();
    });

    expect(mockSetUiError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "action",
        title: "加载历史失败",
        message: "磁盘错误",
      }),
    );
  });

  it("loads a history entry and sets state", async () => {
    mockInvoke.mockResolvedValueOnce(mockEntries);
    mockInvoke.mockResolvedValueOnce(mockState);

    const { result } = renderHook(() =>
      useHistory(mockSetState, mockSetUiError, mockShowActionTip),
    );

    await act(async () => {
      await result.current.handleOpenHistory();
    });

    await act(async () => {
      await result.current.handleLoadHistory("1");
    });

    expect(result.current.historyLoadingId).toBeNull();
    expect(mockSetState).toHaveBeenCalledWith(mockState);
    expect(result.current.historyVisible).toBe(false);
    expect(mockShowActionTip).toHaveBeenCalledWith("历史快照已加载");
  });

  it("shows error when loading a single entry fails", async () => {
    mockInvoke.mockResolvedValueOnce(mockEntries);
    mockInvoke.mockRejectedValueOnce(new Error("不存在"));

    const { result } = renderHook(() =>
      useHistory(mockSetState, mockSetUiError, mockShowActionTip),
    );

    await act(async () => {
      await result.current.handleOpenHistory();
    });

    await act(async () => {
      await result.current.handleLoadHistory("99");
    });

    expect(mockSetUiError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "action",
        title: "加载历史失败",
        message: "不存在",
      }),
    );
    expect(result.current.historyLoadingId).toBeNull();
  });

  it("deletes a history entry and updates list", async () => {
    mockInvoke.mockResolvedValueOnce(mockEntries);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useHistory(mockSetState, mockSetUiError, mockShowActionTip),
    );

    await act(async () => {
      await result.current.handleOpenHistory();
    });

    await act(async () => {
      await result.current.handleDeleteHistory("1");
    });

    expect(result.current.historyDeletingId).toBeNull();
    expect(result.current.historyItems).toHaveLength(1);
    expect(result.current.historyItems[0].id).toBe("2");
    expect(mockShowActionTip).toHaveBeenCalledWith("历史记录已删除");
  });

  it("shows error when delete fails", async () => {
    mockInvoke.mockResolvedValueOnce(mockEntries);
    mockInvoke.mockRejectedValueOnce(new Error("权限不足"));

    const { result } = renderHook(() =>
      useHistory(mockSetState, mockSetUiError, mockShowActionTip),
    );

    await act(async () => {
      await result.current.handleOpenHistory();
    });

    await act(async () => {
      await result.current.handleDeleteHistory("1");
    });

    expect(mockSetUiError).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "action",
        title: "删除历史失败",
        message: "权限不足",
      }),
    );
  });

  it("clears all history entries when confirmed", async () => {
    vi.stubGlobal("confirm", () => true);
    mockInvoke.mockResolvedValueOnce(mockEntries);
    mockInvoke.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useHistory(mockSetState, mockSetUiError, mockShowActionTip),
    );

    await act(async () => {
      await result.current.handleOpenHistory();
    });

    await act(async () => {
      await result.current.handleClearHistory();
    });

    expect(result.current.historyClearing).toBe(false);
    expect(result.current.historyItems).toEqual([]);
    expect(mockShowActionTip).toHaveBeenCalledWith("历史记录已清空");

    vi.unstubAllGlobals();
  });

  it("does nothing when clear is cancelled", async () => {
    vi.stubGlobal("confirm", () => false);
    mockInvoke.mockResolvedValueOnce(mockEntries);

    const { result } = renderHook(() =>
      useHistory(mockSetState, mockSetUiError, mockShowActionTip),
    );

    await act(async () => {
      await result.current.handleOpenHistory();
    });

    await act(async () => {
      await result.current.handleClearHistory();
    });

    expect(result.current.historyItems).toEqual(mockEntries);
    expect(mockInvoke).toHaveBeenCalledTimes(1); // only get_history_entries

    vi.unstubAllGlobals();
  });
});
