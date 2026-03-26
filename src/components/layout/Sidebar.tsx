import { useState } from "react";
import { Settings, PenTool, Layers, Zap, Activity, Maximize2, Minimize2, Cpu } from "lucide-react";
import type { IpcLog, SessionDiagnostics } from "../../types";
import IpcConsole from "../workspace/IpcConsole";
import SettingsModal from "./SettingsModal";
import SessionDiagnosticsModal from "./SessionDiagnosticsModal";

interface SidebarProps {
  currentView: "workspace" | "frameworks";
  onViewChange: (view: "workspace" | "frameworks") => void;
  ipcLogs?: IpcLog[];
  diagnostics?: SessionDiagnostics;
}

export default function Sidebar({
  currentView,
  onViewChange,
  ipcLogs = [],
  diagnostics,
}: SidebarProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isIpcExpanded, setIsIpcExpanded] = useState(false);

  const menuItems = [
    { id: "workspace" as const, label: "推演工作台", icon: PenTool },
    { id: "frameworks" as const, label: "思维框架库", icon: Layers },
  ];

  return (
    <>
      <aside
        className="flex flex-col h-full w-[300px] p-2"
        style={{
          background: "var(--bg-secondary)",
          borderRight: "2px solid var(--border-color)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 h-12"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
          >
            <Cpu size={16} className="text-[var(--text-primary)]" />
          </div>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            顶级思维
          </span>
        </div>

        {/* Navigation */}
        <div className="flex-1 px-2 py-3 flex flex-col min-h-0">
          <div className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer"
                  style={{
                    background: isActive ? "var(--bg-hover)" : "transparent",
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  <Icon size={16} style={{ color: isActive ? "var(--accent-blue)" : "var(--text-muted)" }} />
                  <span className="text-[13px] font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-color)" }}>
            <button
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <Settings size={16} style={{ color: "var(--text-muted)" }} />
              <span className="text-[13px] font-medium">本地配置</span>
            </button>
            <button
              onClick={() => setShowDiagnostics(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <Activity size={16} style={{ color: "var(--text-muted)" }} />
              <span className="text-[13px] font-medium">会话诊断</span>
            </button>
          </div>

          {/* IPC Console */}
          <div className="mt-3 flex-1 min-h-0">
            <IpcConsole
              logs={ipcLogs}
              className="h-full flex flex-col rounded-lg overflow-hidden"
              bodyClassName="flex-1 min-h-0 p-2 space-y-0.5"
              headerActions={
                <button
                  onClick={() => setIsIpcExpanded(true)}
                  className="p-1 rounded transition-colors cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Maximize2 size={12} />
                </button>
              }
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2 px-4 h-9"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <div className="relative flex items-center justify-center">
            <span
              className="absolute w-3.5 h-3.5 rounded-full opacity-20"
              style={{
                background: "var(--accent-green)",
                animation: "pulse-ring 2s ease-out infinite",
              }}
            />
            <span
              className="relative w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--accent-green)" }}
            />
          </div>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            IPC 服务在线
          </span>
          <Zap size={12} style={{ color: "var(--accent-orange)", marginLeft: "auto" }} />
        </div>
      </aside>

      {/* Expanded IPC Modal */}
      {isIpcExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.75)" }}
          onClick={() => setIsIpcExpanded(false)}
        >
          <div
            className="w-full max-w-5xl h-[85vh] rounded-xl overflow-hidden"
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <IpcConsole
              logs={ipcLogs}
              className="h-full flex flex-col"
              bodyClassName="flex-1 min-h-0 p-3 space-y-0.5"
              headerActions={
                <button
                  onClick={() => setIsIpcExpanded(false)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs cursor-pointer"
                  style={{
                    color: "var(--text-secondary)",
                    background: "var(--bg-hover)",
                  }}
                >
                  <Minimize2 size={12} />
                  还原
                </button>
              }
            />
          </div>
        </div>
      )}

      {showDiagnostics && (
        <SessionDiagnosticsModal
          diagnostics={diagnostics}
          onClose={() => setShowDiagnostics(false)}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
