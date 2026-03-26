import { Activity } from "lucide-react";

interface SettingsFooterActionsProps {
  saving: boolean;
  testing: boolean;
  testingMode: "provider" | null;
  onClose: () => void;
  onTestConnection: () => Promise<void>;
  onSave: () => Promise<void>;
}

/**
 * 底部操作区（测试按钮 + 保存按钮）。
 */
export default function SettingsFooterActions({
  saving,
  testing,
  testingMode,
  onClose,
  onTestConnection,
  onSave,
}: SettingsFooterActionsProps) {
  return (
    <div
      className="flex justify-between items-center gap-3 px-6 py-4 flex-wrap"
      style={{ borderTop: "1px solid var(--color-border)" }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => void onTestConnection()}
          disabled={testing || saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg disabled:opacity-50 cursor-pointer transition-colors"
          style={{
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          <Activity size={18} />
          {testing && testingMode === "provider" ? "测试中..." : "测试当前供应商"}
        </button>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg cursor-pointer transition-colors"
          style={{
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          取消
        </button>
        <button
          onClick={() => void onSave()}
          disabled={saving || testing}
          className="px-4 py-2 rounded-lg text-[var(--text-primary)] disabled:opacity-50 cursor-pointer transition-all glow-accent"
          style={{ background: "var(--bg-hover)", border: "1px solid var(--border-color)", color: "var(--text-primary)" }}
        >
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>
    </div>
  );
}

