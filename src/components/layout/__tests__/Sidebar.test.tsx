import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Sidebar from "../Sidebar";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({
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
    ],
  }),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("点击导航项时会切换视图", async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();

    render(<Sidebar currentView="workspace" onViewChange={onViewChange} />);

    // 关键交互：点击“思维框架库”后，应该把目标视图回调给父组件。
    await user.click(screen.getByText("思维框架库"));
    expect(onViewChange).toHaveBeenCalledWith("frameworks");
  });

  it("点击配置按钮时会打开设置弹窗", async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();

    render(<Sidebar currentView="workspace" onViewChange={onViewChange} />);

    await user.click(screen.getByText("本地配置（API）"));

    // 弹窗标题在 SettingsModal 中，出现它就代表打开成功。
    expect(await screen.findByText("系统配置")).toBeInTheDocument();
  });

  it("会在系统分组下方显示 IPC 日志面板", () => {
    const onViewChange = vi.fn();

    render(
      <Sidebar
        currentView="workspace"
        onViewChange={onViewChange}
        ipcLogs={[
          {
            timestamp: 1_700_000_000_000,
            level: "info",
            source: "state-update",
            message: "收到状态更新事件",
          },
        ]}
      />,
    );

    expect(screen.getByText("系统 IPC 总线日志")).toBeInTheDocument();
    expect(screen.getByText("收到状态更新事件")).toBeInTheDocument();
  });

  it("点击放大按钮后可以进入日志放大视图", async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();

    render(
      <Sidebar
        currentView="workspace"
        onViewChange={onViewChange}
        ipcLogs={[
          {
            timestamp: 1_700_000_000_000,
            level: "info",
            source: "engine",
            message: "放大视图测试日志",
          },
        ]}
      />,
    );

    await user.click(screen.getByLabelText("放大查看日志"));
    expect(screen.getByLabelText("还原日志视图")).toBeInTheDocument();
  });

  it("会话诊断使用弹窗而不是主区域展开文案", async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();

    render(<Sidebar currentView="workspace" onViewChange={onViewChange} />);

    expect(screen.queryByText("点击展开")).not.toBeInTheDocument();

    await user.click(screen.getByText("会话诊断"));
    expect(await screen.findByLabelText("关闭会话诊断弹窗")).toBeInTheDocument();
  });
});
