import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import type { LlmProviderConfig } from "../../../types";

interface ProviderFormProps {
  provider: LlmProviderConfig;
  onChangeField: <K extends keyof LlmProviderConfig>(
    key: K,
    value: LlmProviderConfig[K],
  ) => void;
  showApiKey: boolean;
  setShowApiKey: Dispatch<SetStateAction<boolean>>;
  inputStyle: CSSProperties;
}

export function ProviderForm({
  provider,
  onChangeField,
  showApiKey,
  setShowApiKey,
  inputStyle,
}: ProviderFormProps) {
  const { t } = useTranslation("settings");

  return (
    <>
      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {t("name.label")}
        </label>
        <input
          type="text"
          value={provider.name}
          onChange={(event) => onChangeField("name", event.target.value)}
          placeholder={t("name.placeholder")}
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
          {t("baseUrl.label")}
        </label>
        <input
          type="url"
          value={provider.base_url}
          onChange={(event) => onChangeField("base_url", event.target.value)}
          placeholder={t("baseUrl.placeholder")}
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
          {t("model.label")}
        </label>
        <input
          type="text"
          value={provider.model}
          onChange={(event) => onChangeField("model", event.target.value)}
          placeholder={t("model.placeholder")}
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
          {t("apiKey.label")}
        </label>
        <div className="relative">
          <input
            type={showApiKey ? "text" : "password"}
            value={provider.api_key}
            onChange={(event) => onChangeField("api_key", event.target.value)}
            placeholder={t("apiKey.placeholder")}
            className="w-full px-3 py-2 pr-10 rounded-lg focus:outline-none focus:ring-2"
            style={
              {
                ...inputStyle,
                "--tw-ring-color": "var(--color-accent)",
              } as CSSProperties
            }
          />
          <button
            type="button"
            onClick={() => setShowApiKey((previous) => !previous)}
            className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer"
            style={{ color: "var(--color-text-muted)" }}
          >
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    </>
  );
}
