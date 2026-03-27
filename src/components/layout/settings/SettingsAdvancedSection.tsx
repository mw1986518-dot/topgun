import { useTranslation } from "react-i18next";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import type { AppConfig } from "../../../types";

interface SettingsAdvancedSectionProps {
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
  inputStyle: CSSProperties;
}

export default function SettingsAdvancedSection({
  config,
  setConfig,
  inputStyle,
}: SettingsAdvancedSectionProps) {
  const { t } = useTranslation("settings");

  const updateConfig = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig((previous) => ({ ...previous, [key]: value }));
  };

  return (
    <div className="space-y-4 pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
      <h3 className="text-sm font-medium tracking-wide" style={{ color: "var(--color-text-muted)" }}>
        {t("advanced")}
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("timeout.label")}
          </label>
          <input
            type="number"
            value={config.timeout_seconds}
            onChange={(event) =>
              updateConfig("timeout_seconds", parseInt(event.target.value, 10) || 60)
            }
            min={10}
            max={600}
            className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
            style={
              {
                ...inputStyle,
                "--tw-ring-color": "var(--color-accent)",
              } as CSSProperties
            }
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("maxRetries.label")}
          </label>
          <input
            type="number"
            value={config.max_retries}
            onChange={(event) =>
              updateConfig("max_retries", parseInt(event.target.value, 10) || 3)
            }
            min={0}
            max={10}
            className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
            style={
              {
                ...inputStyle,
                "--tw-ring-color": "var(--color-accent)",
              } as CSSProperties
            }
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {t("maxIterations.label")}
          </label>
          <input
            type="number"
            value={config.max_iterations}
            onChange={(event) =>
              updateConfig("max_iterations", Math.min(6, Math.max(3, parseInt(event.target.value, 10) || 3)))
            }
            min={3}
            max={6}
            className="w-full px-3 py-2 rounded-lg focus:outline-none focus:ring-2"
            style={
              {
                ...inputStyle,
                "--tw-ring-color": "var(--color-accent)",
              } as CSSProperties
            }
          />
          <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
            {t("maxIterations.description")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="enable_retry"
          checked={config.enable_retry}
          onChange={(event) => updateConfig("enable_retry", event.target.checked)}
          className="w-4 h-4 rounded accent-[#22C55E]"
        />
        <label
          htmlFor="enable_retry"
          className="text-sm"
          style={{ color: "var(--color-text-primary)" }}
        >
          {t("enableRetry.label")}
        </label>
      </div>
    </div>
  );
}