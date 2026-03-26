import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { IpcLog } from "../../types";

interface IpcConsoleProps {
  logs: IpcLog[];
  title?: string;
  className?: string;
  bodyClassName?: string;
  headerActions?: ReactNode;
}

const levelColors = {
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
};

function normalizeInlineText(value: string): string {
  // 把换行和多余空白压成单空格，保证“一条日志只占一行”。
  return value.replace(/\s+/g, " ").trim();
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return (
    date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) +
    "." +
    String(date.getMilliseconds()).padStart(3, "0")
  );
}

export default function IpcConsole({
  logs,
  title = "系统 IPC 总线日志",
  className = "",
  bodyClassName = "h-64 p-4 space-y-1",
  headerActions,
}: IpcConsoleProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // 日志展示策略：最新日志永远排在最上面，旧日志往下沉。
  const visibleLogs = useMemo(() => [...logs.slice(-200)].reverse(), [logs]);

  // 每次日志更新都把视窗重置到顶部，保证用户第一眼看到最新日志。
  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = 0;
  }, [visibleLogs]);

  return (
    <div className={`min-w-0 bg-gray-900 rounded-lg overflow-hidden font-mono text-sm ${className}`}>
      <div className="px-4 py-2 border-b border-gray-700 bg-gray-800 flex items-center justify-between gap-3">
        <span className="text-gray-400">{title}</span>
        {headerActions && <div className="flex items-center gap-2">{headerActions}</div>}
      </div>

      <div
        ref={bodyRef}
        className={`${bodyClassName} overflow-y-auto overflow-x-hidden`}
      >
        {visibleLogs.length === 0 ? (
          <div className="text-gray-500">等待系统日志...</div>
        ) : (
          visibleLogs.map((log, index) => {
            const sourceLabel = `[${normalizeInlineText(log.source)}]`;
            const messageText = normalizeInlineText(log.message);

            return (
              <div key={index} className="flex items-center gap-2 min-w-0 whitespace-nowrap">
                <span className="text-gray-500 shrink-0">{formatTime(log.timestamp)}</span>
                <span
                  className={`uppercase shrink-0 ${levelColors[log.level as keyof typeof levelColors] || "text-gray-400"}`}
                >
                  [{log.level}]
                </span>
                <span className="text-purple-400 shrink-0 max-w-[8rem] truncate" title={sourceLabel}>
                  {sourceLabel}
                </span>
                <span className="text-gray-300 min-w-0 flex-1 truncate" title={log.message}>
                  {messageText}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
