import type { AppConfig, LlmProviderConfig } from "../types";

/**
 * 创建一个“空白供应商”模板。
 * 这样新增供应商时，字段结构始终一致，避免到处手写重复对象。
 */
export function createDefaultProvider(
  id = "provider_1",
  name = "默认供应商",
): LlmProviderConfig {
  return {
    id,
    name,
    base_url: "",
    api_key: "",
    model: "",
  };
}

/**
 * 按 id 在供应商列表中查找供应商。
 */
export function findProviderById(
  providers: LlmProviderConfig[],
  providerId: string,
): LlmProviderConfig | undefined {
  return providers.find((provider) => provider.id === providerId);
}

export function ensureProviderConfig(config: AppConfig): AppConfig {
  const providers =
    config.providers.length > 0 ? config.providers : [createDefaultProvider()];
  const selectedExists = providers.some(
    (provider) => provider.id === config.selected_provider_id,
  );
  return {
    ...config,
    providers,
    selected_provider_id: selectedExists ? config.selected_provider_id : providers[0].id,
  };
}
