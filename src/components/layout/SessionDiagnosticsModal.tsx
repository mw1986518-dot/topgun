import { X } from "lucide-react";
import type { SessionDiagnostics } from "../../types";
import SessionDiagnosticsCard from "../workspace/SessionDiagnosticsCard";

interface SessionDiagnosticsModalProps {
  diagnostics?: SessionDiagnostics;
  onClose: () => void;
}

export default function SessionDiagnosticsModal({
  diagnostics,
  onClose,
}: SessionDiagnosticsModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="rounded-xl shadow-2xl w-full max-w-4xl mx-4 animate-fade-in-up"
        style={{
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <h2
            className="text-xl font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            会话诊断
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="关闭会话诊断弹窗"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/*
            这里复用现有诊断卡片，不重新造一套展示逻辑。
            好处是后续指标字段变化时，只要维护 SessionDiagnosticsCard 一处就够了。
          */}
          <SessionDiagnosticsCard diagnostics={diagnostics} showHeader={false} />
        </div>
      </div>
    </div>
  );
}
