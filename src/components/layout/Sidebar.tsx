import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Settings, PenTool, Layers, Activity, Maximize2, Minimize2, Cpu, Globe } from "lucide-react";
import type { IpcLog, SessionDiagnostics } from "../../types";
import IpcConsole from "../workspace/IpcConsole";
import SettingsModal from "./SettingsModal";
import SessionDiagnosticsModal from "./SessionDiagnosticsModal";
import { supportedLanguages, languageNames, type SupportedLanguage } from "../../i18n";

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
  const { t: tSidebar, i18n } = useTranslation("sidebar");
  const [showSettings, setShowSettings] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [isIpcExpanded, setIsIpcExpanded] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  const menuItems = [
    { id: "workspace" as const, label: tSidebar("workspace"), icon: PenTool },
    { id: "frameworks" as const, label: tSidebar("frameworkLibrary"), icon: Layers },
  ];

  const changeLanguage = (lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
    setShowLangMenu(false);
  };

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
            {tSidebar("appName")}
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
              <span className="text-[13px] font-medium">{tSidebar("localConfig")}</span>
            </button>
            <button
              onClick={() => setShowDiagnostics(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              <Activity size={16} style={{ color: "var(--text-muted)" }} />
              <span className="text-[13px] font-medium">{tSidebar("sessionDiagnostics")}</span>
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
          className="flex flex-col gap-1 px-4 py-2"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          {/* Language Switcher */}
          <div className="relative flex items-center justify-center">
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="flex items-center gap-2 px-3 py-1 rounded transition-colors cursor-pointer"
              style={{ color: "var(--text-muted)" }}
            >
              <Globe size={18} />
              <span className="text-[16px] font-medium">{languageNames[i18n.language as SupportedLanguage] || i18n.language}</span>
            </button>
            {showLangMenu && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 rounded-lg overflow-hidden shadow-lg"
                style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  minWidth: "80px"
                }}
              >
                {supportedLanguages.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => changeLanguage(lang)}
                    className="w-full px-4 py-2 text-left text-[16px] font-medium transition-colors cursor-pointer"
                    style={{
                      color: i18n.language === lang ? "var(--text-primary)" : "var(--text-secondary)",
                      background: i18n.language === lang ? "var(--bg-hover)" : "transparent"
                    }}
                  >
                    {languageNames[lang]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* IPC Status */}
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className="relative flex items-center justify-center">
              <span
                className="absolute w-5 h-5 rounded-full opacity-20"
                style={{
                  background: "var(--accent-green)",
                  animation: "pulse-ring 2s ease-out infinite",
                }}
              />
              <span
                className="relative w-3 h-3 rounded-full"
                style={{ background: "var(--accent-green)" }}
              />
            </div>
            <span className="text-[16px] font-medium" style={{ color: "var(--text-muted)" }}>
              {tSidebar("ipcOnline")}
            </span>
          </div>
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
                  {tSidebar("restore")}
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