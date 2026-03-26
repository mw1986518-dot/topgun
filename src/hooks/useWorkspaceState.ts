import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Framework, StateMachine } from "../types";

type UiErrorType = "load" | "action";
const STATE_UPDATE_DEBOUNCE_MS = 80;

export interface UiError {
  type: UiErrorType;
  title: string;
  message: string;
}

export function toErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "发生未知错误";
  }
}

/**
 * 管理工作台状态与核心操作逻辑。
 *
 * 这样 Workspace.tsx 只负责渲染，状态管理与异步调用全部放到这里，
 * 组件会更容易维护和测试。
 */
export function useWorkspaceState() {
  const [state, setState] = useState<StateMachine | null>(null);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [loading, setLoading] = useState(true);

  const [isReasoning, setIsReasoning] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isProblemBriefChatting, setIsProblemBriefChatting] = useState(false);
  const [isProblemBriefGenerating, setIsProblemBriefGenerating] = useState(false);
  const [isSelectingFrameworks, setIsSelectingFrameworks] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [uiError, setUiError] = useState<UiError | null>(null);
  const [actionTip, setActionTip] = useState<string | null>(null);

  // 用 ref 做“动作锁”，防止按钮高频点击导致重复请求。
  const actionLockRef = useRef(false);
  // 保存“最新一帧”状态，避免高频事件导致连续重渲染。
  const pendingStateRef = useRef<StateMachine | null>(null);
  // 保存节流定时器句柄，确保同一时间只会有一个定时任务。
  const stateFlushTimerRef = useRef<number | null>(null);

  // 派生状态：统一判断“界面是否忙碌”。
  const backendReasoningRunning = Boolean(state?.is_reasoning_running);
  const busy =
    backendReasoningRunning ||
    isReasoning ||
    isStartingSession ||
    isProblemBriefChatting ||
    isProblemBriefGenerating ||
    isSelectingFrameworks ||
    isResetting;

  // 统一提示入口：历史加载成功、重置成功等都用这个方法。
  const showActionTip = useCallback((message: string) => {
    setActionTip(message);
    window.setTimeout(() => setActionTip(null), 1800);
  }, []);

  // 首次加载：并行拿 state 与 framework 列表，减少等待时间。
  const loadData = useCallback(async () => {
    setUiError(null);
    setLoading(true);

    try {
      const [stateResult, frameworksResult] = await Promise.all([
        invoke<StateMachine>("get_state"),
        invoke<Framework[]>("get_frameworks"),
      ]);
      setState(stateResult);
      setFrameworks(frameworksResult);
    } catch (error) {
      setUiError({
        type: "load",
        title: "初始化加载失败",
        message: toErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 把缓存的最新状态一次性提交到 React。
   * 这样就算后端在很短时间发了很多次事件，前端也只渲染一次最新结果。
   */
  const flushPendingState = useCallback(() => {
    stateFlushTimerRef.current = null;
    if (!pendingStateRef.current) return;

    setState(pendingStateRef.current);
    pendingStateRef.current = null;
  }, []);

  /**
   * state-update 事件入口：
   * 先覆盖缓存，再用短延迟合并更新，减少渲染压力。
   */
  const scheduleStateUpdate = useCallback(
    (nextState: StateMachine) => {
      pendingStateRef.current = nextState;

      if (stateFlushTimerRef.current !== null) return;

      stateFlushTimerRef.current = window.setTimeout(
        flushPendingState,
        STATE_UPDATE_DEBOUNCE_MS,
      );
    },
    [flushPendingState],
  );

  // 监听后端推送，保证界面状态实时更新。
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let mounted = true;

    (async () => {
      await loadData();

      try {
        const off = await listen<StateMachine>("state-update", (event) => {
          if (!mounted) return;
          scheduleStateUpdate(event.payload);
        });
        unlisten = off;
      } catch (error) {
        if (!mounted) return;
        setUiError({
          type: "action",
          title: "事件监听失败",
          message: toErrorMessage(error),
        });
      }
    })();

    return () => {
      mounted = false;
      if (unlisten) unlisten();
      if (stateFlushTimerRef.current !== null) {
        window.clearTimeout(stateFlushTimerRef.current);
        stateFlushTimerRef.current = null;
      }
      pendingStateRef.current = null;
    };
  }, [loadData, scheduleStateUpdate]);

  /**
   * 通用动作守卫：
   * 1) 防重入
   * 2) 统一设置 loading 标记
   * 3) 统一错误提示
   * 4) 统一成功提示
   */
  const withActionGuard = useCallback(
    async (
      key:
        | "start"
        | "briefchat"
        | "briefgenerate"
        | "select"
        | "reasoning"
        | "reset",
      action: () => Promise<void>,
    ): Promise<boolean> => {
      if (actionLockRef.current || busy) return false;

      actionLockRef.current = true;
      setUiError(null);

      if (key === "start") setIsStartingSession(true);
      if (key === "briefchat") setIsProblemBriefChatting(true);
      if (key === "briefgenerate") setIsProblemBriefGenerating(true);
      if (key === "select") setIsSelectingFrameworks(true);
      if (key === "reasoning") setIsReasoning(true);
      if (key === "reset") setIsResetting(true);

      try {
        await action();
        if (key === "reasoning") showActionTip("推演任务已启动");
        if (key === "reset") showActionTip("会话已重置");
        return true;
      } catch (error) {
        setUiError({
          type: "action",
          title: "操作执行失败",
          message: toErrorMessage(error),
        });
        return false;
      } finally {
        if (key === "start") setIsStartingSession(false);
        if (key === "briefchat") setIsProblemBriefChatting(false);
        if (key === "briefgenerate") setIsProblemBriefGenerating(false);
        if (key === "select") setIsSelectingFrameworks(false);
        if (key === "reasoning") setIsReasoning(false);
        if (key === "reset") setIsResetting(false);
        actionLockRef.current = false;
      }
    },
    [busy, showActionTip],
  );

  const handleStartSession = useCallback(
    async (topic: string) => {
      await withActionGuard("start", async () => {
        await invoke("start_session", { topic });
      });
    },
    [withActionGuard],
  );


  const handleFrameworkSelect = useCallback(
    async (frameworkIds: string[], customUserPrompt?: string) => {
      const selected = await withActionGuard("select", async () => {
        await invoke("select_frameworks", { frameworkIds, customUserPrompt });
      });
      if (!selected) return;

      await withActionGuard("reasoning", async () => {
        await invoke("run_reasoning");
      });
    },
    [withActionGuard],
  );

  const handleProblemBriefDialogue = useCallback(
    async (message: string) => {
      await withActionGuard("briefchat", async () => {
        await invoke("continue_problem_brief_dialogue", { userMessage: message });
      });
    },
    [withActionGuard],
  );

  /**
   * 显式触发“生成专家级问题简报”。
   * 这是阶段二唯一允许收口的入口，避免模型在普通追问中提前给结论。
   */
  const handleGenerateProblemBrief = useCallback(async () => {
    await withActionGuard("briefgenerate", async () => {
      await invoke("generate_problem_brief_delivery");
    });
  }, [withActionGuard]);

  const handleRunReasoning = useCallback(async () => {
    await withActionGuard("reasoning", async () => {
      await invoke("run_reasoning");
    });
  }, [withActionGuard]);

  const handleReset = useCallback(async () => {
    await withActionGuard("reset", async () => {
      await invoke("reset_session");
    });
  }, [withActionGuard]);

  return {
    state,
    setState,
    frameworks,
    loading,
    busy,
    backendReasoningRunning,
    isReasoning,
    isStartingSession,
    isProblemBriefChatting,
    isProblemBriefGenerating,
    isSelectingFrameworks,
    isResetting,
    uiError,
    setUiError,
    actionTip,
    showActionTip,
    loadData,
    handleStartSession,
    handleProblemBriefDialogue,
    handleGenerateProblemBrief,
    handleFrameworkSelect,
    handleRunReasoning,
    handleReset,
  };
}

