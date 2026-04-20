import { useTranslation } from "react-i18next";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import type { AppConfig, LlmProviderConfig } from "../../../types";
import { ensureProviderConfig } from "../../../utils/providerConfig";
import { ProviderForm } from "./ProviderForm";
import { ProviderSelector } from "./ProviderSelector";

interface SettingsApiSectionProps {
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
  showApiKey: boolean;
  setShowApiKey: Dispatch<SetStateAction<boolean>>;
  inputStyle: CSSProperties;
}

function buildProviderId(): string {
  return `provider_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export default function SettingsApiSection({
  config,
  setConfig,
  showApiKey,
  setShowApiKey,
  inputStyle,
}: SettingsApiSectionProps) {
  const { t } = useTranslation("settings");
  const normalizedConfig = ensureProviderConfig(config);
  const selectedProvider =
    normalizedConfig.providers.find(
      (item) => item.id === normalizedConfig.selected_provider_id,
    ) ?? normalizedConfig.providers[0];

  const updateSelectedProviderId = (providerId: string) => {
    setConfig((previous) => ({
      ...ensureProviderConfig(previous),
      selected_provider_id: providerId,
    }));
  };

  const updateSelectedProvider = <K extends keyof LlmProviderConfig>(
    key: K,
    value: LlmProviderConfig[K],
  ) => {
    setConfig((previous) => {
      const normalized = ensureProviderConfig(previous);
      const providers = normalized.providers.map((provider) =>
        provider.id === normalized.selected_provider_id
          ? { ...provider, [key]: value }
          : provider,
      );
      return {
        ...normalized,
        providers,
      };
    });
  };

  const addProvider = () => {
    const newProvider: LlmProviderConfig = {
      id: buildProviderId(),
      name: `${t("provider.label")} ${normalizedConfig.providers.length + 1}`,
      base_url: "",
      api_key: "",
      model: "",
    };
    setConfig((previous) => {
      const normalized = ensureProviderConfig(previous);
      return {
        ...normalized,
        providers: [...normalized.providers, newProvider],
        selected_provider_id: newProvider.id,
      };
    });
  };

  const removeSelectedProvider = () => {
    setConfig((previous) => {
      const normalized = ensureProviderConfig(previous);
      if (normalized.providers.length <= 1) {
        return normalized;
      }
      const providers = normalized.providers.filter(
        (provider) => provider.id !== normalized.selected_provider_id,
      );
      const nextSelected = providers[0];
      return {
        ...normalized,
        providers,
        selected_provider_id: nextSelected.id,
      };
    });
  };

  if (!selectedProvider) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3
        className="text-sm font-medium tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        {t("llmConfig")}
      </h3>

      <ProviderSelector
        config={normalizedConfig}
        onChangeId={updateSelectedProviderId}
        onAdd={addProvider}
        onRemove={removeSelectedProvider}
        inputStyle={inputStyle}
      />

      <ProviderForm
        provider={selectedProvider}
        onChangeField={updateSelectedProvider}
        showApiKey={showApiKey}
        setShowApiKey={setShowApiKey}
        inputStyle={inputStyle}
      />

      <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
        {t("singleProviderNote")}
      </p>
    </div>
  );
}
