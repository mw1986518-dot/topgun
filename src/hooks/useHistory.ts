import type { Dispatch, SetStateAction } from "react";
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionHistoryEntry, StateMachine } from "../types";
import { toErrorMessage, type UiError } from "./useWorkspaceState";

/**
 * 管理历史记录面板状态与相关操作。
 */
export function useHistory(
  setState: Dispatch<SetStateAction<StateMachine | null>>,
  setUiError: (err: UiError | null) => void,
  showActionTip: (msg: string) => void,
) {
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<SessionHistoryEntry[]>([]);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [historyDeletingId, setHistoryDeletingId] = useState<string | null>(null);
  const [historyClearing, setHistoryClearing] = useState(false);

  const loadHistoryEntries = useCallback(async () => {
    setHistoryLoading(true);

    try {
      const items = await invoke<SessionHistoryEntry[]>("get_history_entries");
      setHistoryItems(items);
    } catch (error) {
      setUiError({
        type: "action",
        title: "加载历史失败",
        message: toErrorMessage(error),
      });
    } finally {
      setHistoryLoading(false);
    }
  }, [setUiError]);

  const handleOpenHistory = useCallback(async () => {
    setHistoryVisible(true);
    await loadHistoryEntries();
  }, [loadHistoryEntries]);

  const handleLoadHistory = useCallback(
    async (id: string) => {
      setHistoryLoadingId(id);
      setUiError(null);

      try {
        const loaded = await invoke<StateMachine>("load_history_entry", { id });
        setState(loaded);
        setHistoryVisible(false);
        showActionTip("历史快照已加载");
      } catch (error) {
        setUiError({
          type: "action",
          title: "加载历史失败",
          message: toErrorMessage(error),
        });
      } finally {
        setHistoryLoadingId(null);
      }
    },
    [setState, setUiError, showActionTip],
  );

  const handleDeleteHistory = useCallback(
    async (id: string) => {
      setHistoryDeletingId(id);
      setUiError(null);

      try {
        await invoke("delete_history_entry", { id });
        setHistoryItems((prev) => prev.filter((entry) => entry.id !== id));
        showActionTip("历史记录已删除");
      } catch (error) {
        setUiError({
          type: "action",
          title: "删除历史失败",
          message: toErrorMessage(error),
        });
      } finally {
        setHistoryDeletingId(null);
      }
    },
    [setUiError, showActionTip],
  );

  const handleClearHistory = useCallback(async () => {
    if (!window.confirm("确认清空全部历史记录吗？")) return;

    setHistoryClearing(true);
    setUiError(null);

    try {
      await invoke("clear_history_entries");
      setHistoryItems([]);
      showActionTip("历史记录已清空");
    } catch (error) {
      setUiError({
        type: "action",
        title: "清空历史失败",
        message: toErrorMessage(error),
      });
    } finally {
      setHistoryClearing(false);
    }
  }, [setUiError, showActionTip]);

  return {
    historyVisible,
    setHistoryVisible,
    historyLoading,
    historyItems,
    historyLoadingId,
    historyDeletingId,
    historyClearing,
    handleOpenHistory,
    handleLoadHistory,
    handleDeleteHistory,
    handleClearHistory,
    loadHistoryEntries,
  };
}
