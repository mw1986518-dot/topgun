import { useState } from "react";
import { X } from "lucide-react";
import type { CSSProperties } from "react";
import { useSettingsModalState } from "../../hooks/useSettingsModalState";
import SettingsAdvancedSection from "./settings/SettingsAdvancedSection";
import SettingsApiSection from "./settings/SettingsApiSection";
import SettingsFeedbackMessages from "./settings/SettingsFeedbackMessages";
import SettingsFooterActions from "./settings/SettingsFooterActions";

interface SettingsModalProps {
  onClose: () => void;
}

const inputStyle: CSSProperties = {
  background: "var(--color-bg-tertiary)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text-primary)",
};

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    config,
    setConfig,
    loading,
    saving,
    testing,
    testingMode,
    error,
    success,
    testResult,
    handleSave,
    handleTestConnection,
  } = useSettingsModalState();

  // 这个状态只影响“密码明文/密文切换”，属于纯 UI 状态，留在组件层最直观。
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in-up"
        style={{
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <h2 className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
            系统配置
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="text-center py-8" style={{ color: "var(--color-text-muted)" }}>
              加载中...
            </div>
          ) : (
            <>
              <SettingsApiSection
                config={config}
                setConfig={setConfig}
                showApiKey={showApiKey}
                setShowApiKey={setShowApiKey}
                inputStyle={inputStyle}
              />

              <SettingsAdvancedSection
                config={config}
                setConfig={setConfig}
                inputStyle={inputStyle}
              />

              <SettingsFeedbackMessages
                error={error}
                testResult={testResult}
                success={success}
              />
            </>
          )}
        </div>

        <SettingsFooterActions
          saving={saving}
          testing={testing}
          testingMode={testingMode}
          onClose={onClose}
          onTestConnection={handleTestConnection}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
