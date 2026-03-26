import { AlertCircle, CheckCircle2, RefreshCcw } from "lucide-react";
import type { UiError } from "../../hooks/useWorkspaceState";

interface WorkspaceAlertsProps {
  uiError: UiError | null;
  actionTip: string | null;
  onRetry: () => void;
}

/**
 * 统一承载“错误提示 + 成功提示”两个横幅。
 *
 * 这样拆出来后，Workspace 主文件只保留流程编排逻辑，
 * 不需要再关心每个提示框的具体样式细节。
 */
export default function WorkspaceAlerts({
  uiError,
  actionTip,
  onRetry,
}: WorkspaceAlertsProps) {
  return (
    <>
      {uiError && (
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#FCA5A5",
          }}
        >
          <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">{uiError.title}</div>
            <div className="text-sm mt-1 break-all">{uiError.message}</div>
          </div>
          {uiError.type === "load" && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm cursor-pointer"
              style={{
                border: "1px solid rgba(239, 68, 68, 0.5)",
                color: "#FCA5A5",
              }}
            >
              <RefreshCcw size={14} />
              重试
            </button>
          )}
        </div>
      )}

      {actionTip && (
        <div
          className="rounded-lg px-4 py-2.5 inline-flex items-center gap-2"
          style={{
            background: "rgba(34, 197, 94, 0.1)",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            color: "#86EFAC",
          }}
        >
          <CheckCircle2 size={16} />
          <span className="text-sm font-medium">{actionTip}</span>
        </div>
      )}
    </>
  );
}
