import { useEffect, useState } from "react";

interface UseReasoningTimerResult {
  elapsedMs: number;
}

/**
 * 统一管理“推演进行中”的计时逻辑。
 *
 * 设计思路（给初学者）：
 * 1) 当 `isRunning=true` 时记录开始时间；
 * 2) 每秒刷新一次当前耗时；
 * 3) 当 `isRunning=false` 时清零，避免显示旧数据。
 */
export function useReasoningTimer(isRunning: boolean): UseReasoningTimerResult {
  const [startAt, setStartAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setStartAt(null);
      setElapsedMs(0);
      return;
    }

    setStartAt((previous) => previous ?? Date.now());
  }, [isRunning]);

  useEffect(() => {
    if (!startAt) return;

    const tick = () => {
      setElapsedMs(Date.now() - startAt);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [startAt]);

  return { elapsedMs };
}
