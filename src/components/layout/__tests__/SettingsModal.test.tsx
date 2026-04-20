import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import SettingsModal from "../SettingsModal";
import type { AppConfig } from "../../../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const mockConfig: AppConfig = {
  base_url: "https://api.openai.com",
  api_key: "sk-test",
  model: "gpt-4o-mini",
  timeout_seconds: 60,
  enable_retry: true,
  max_retries: 3,
  retry_delay_ms: 1000,
  selected_provider_id: "provider_openai",
  providers: [
    {
      id: "provider_openai",
      name: "OpenAI",
      base_url: "https://api.openai.com",
      api_key: "sk-test",
      model: "gpt-4o-mini",
    },
    {
      id: "provider_openrouter",
      name: "OpenRouter",
      base_url: "https://openrouter.ai/api",
      api_key: "sk-openrouter",
      model: "openrouter/auto",
    },
  ],
};

describe("SettingsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("加载时会读取后端配置", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return mockConfig;
      return null;
    });

    render(<SettingsModal onClose={vi.fn()} />);

    expect(await screen.findByDisplayValue("https://api.openai.com")).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("get_settings");
  });

  it("点击保存会调用 save_settings 并传递当前配置", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async (cmd: string, payload?: unknown) => {
      if (cmd === "get_settings") return mockConfig;
      if (cmd === "save_settings") return payload;
      return null;
    });

    render(<SettingsModal onClose={vi.fn()} />);

    const modelInput = await screen.findByDisplayValue("gpt-4o-mini");
    await user.clear(modelInput);
    await user.type(modelInput, "gpt-4.1-mini");

    await user.click(screen.getByText("保存配置"));

    expect(mockInvoke).toHaveBeenCalledWith(
      "save_settings",
      expect.objectContaining({
        config: expect.objectContaining({
          providers: expect.arrayContaining([
            expect.objectContaining({
              id: "provider_openai",
              model: "gpt-4.1-mini",
            }),
          ]),
        }),
      }),
    );
  });

  it("点击测试当前供应商会调用 test_llm_connection 并展示结果", async () => {
    const user = userEvent.setup();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_settings") return mockConfig;
      if (cmd === "test_llm_connection") return "供应商「OpenAI」连通性测试成功";
      return null;
    });

    render(<SettingsModal onClose={vi.fn()} />);
    await screen.findByDisplayValue("https://api.openai.com");

    await user.click(screen.getByText("测试当前供应商"));

    expect(mockInvoke).toHaveBeenCalledWith(
      "test_llm_connection",
      expect.objectContaining({ config: expect.any(Object) }),
    );
    expect(await screen.findByText(/供应商「OpenAI」连通性测试成功/)).toBeInTheDocument();
  });

  it("切换供应商后会测试当前选中的供应商", async () => {
    const user = userEvent.setup();

    mockInvoke.mockImplementation(async (cmd: string, payload?: unknown) => {
      if (cmd === "get_settings") return mockConfig;
      if (cmd === "test_llm_connection") {
        const providerId = (payload as { providerId?: string } | undefined)?.providerId;
        if (providerId === "provider_openrouter") {
          return "供应商「OpenRouter」连通性测试成功";
        }
        return "供应商「OpenAI」连通性测试成功";
      }
      return null;
    });

    render(<SettingsModal onClose={vi.fn()} />);
    await screen.findByDisplayValue("https://api.openai.com");

    // 使用 getByRole 查找 select 元素，避免与供应商名称 input 冲突
    await user.selectOptions(screen.getByRole("combobox"), "provider_openrouter");
    await user.click(screen.getByText("测试当前供应商"));

    expect(mockInvoke).toHaveBeenCalledWith(
      "test_llm_connection",
      expect.objectContaining({
        providerId: "provider_openrouter",
      }),
    );
    expect(
      await screen.findByText(/供应商「OpenRouter」连通性测试成功/),
    ).toBeInTheDocument();
  });
});
