import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "../types";
import { createDefaultProvider, ensureProviderConfig } from "../utils/providerConfig";

type TestingMode = "provider" | null;

interface TestResult {
  success: boolean;
  message: string;
}

interface UseSettingsModalStateResult {
  config: AppConfig;
  setConfig: Dispatch<SetStateAction<AppConfig>>;
  loading: boolean;
  saving: boolean;
  testing: boolean;
  testingMode: TestingMode;
  error: string | null;
  success: boolean;
  testResult: TestResult | null;
  handleSave: () => Promise<void>;
  handleTestConnection: () => Promise<void>;
}

function createDefaultConfig(): AppConfig {
  return ensureProviderConfig({
    timeout_seconds: 60,
    enable_retry: true,
    max_retries: 3,
    retry_delay_ms: 1000,
    selected_provider_id: "provider_1",
    providers: [createDefaultProvider()],
  } as AppConfig);
}

/**
 * SettingsModal 的数据层 Hook。
 *
 * 对初学者可以这样理解：
 * - 组件负责“显示 UI”；
 * - 这个 Hook 负责“读写配置 + 调接口”；
 * - 分层后，两个文件都更短，更容易定位问题。
 */
export function useSettingsModalState(): UseSettingsModalStateResult {
  const [config, setConfig] = useState<AppConfig>(createDefaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingMode, setTestingMode] = useState<TestingMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const settings = await invoke<AppConfig>("get_settings");
      setConfig(ensureProviderConfig(settings));
    } catch (err) {
      // 这里保留 console 是为了便于开发者在调试工具中快速定位初始化问题。
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const normalizedConfig = ensureProviderConfig(config);
    setSaving(true);
    setError(null);
    setSuccess(false);
    setTestResult(null);

    try {
      await invoke("save_settings", { config: normalizedConfig });
      setConfig(normalizedConfig);
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    const normalizedConfig = ensureProviderConfig(config);
    setTesting(true);
    setTestingMode("provider");
    setTestResult(null);
    setError(null);
    setSuccess(false);

    try {
      const result = await invoke<string>("test_llm_connection", {
        config: normalizedConfig,
        providerId: normalizedConfig.selected_provider_id,
      });
      setConfig(normalizedConfig);
      setTestResult({ success: true, message: result });
    } catch (err) {
      setTestResult({
        success: false,
        message: String(err),
      });
    } finally {
      setTesting(false);
      setTestingMode(null);
    }
  }

  return {
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
  };
}
