import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ErrorBoundary from "../ErrorBoundary";

/**
 * 始终抛错的组件：用于稳定触发 ErrorBoundary。
 */
function AlwaysThrow() {
  throw new Error("渲染炸了");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("catches render errors and shows fallback UI", async () => {
    render(
      <ErrorBoundary>
        <AlwaysThrow />
      </ErrorBoundary>,
    );

    expect(await screen.findByText("应用发生错误")).toBeInTheDocument();
    expect(screen.getByText("渲染炸了")).toBeInTheDocument();
  });

  it("re-renders children after user clicks retry", async () => {
    const user = userEvent.setup();

    function RecoverableDemo() {
      const [fixed, setFixed] = useState(false);

      return (
        <>
          {/* 按钮放在 ErrorBoundary 外部，保证报错后仍然可点击修复状态。 */}
          <button type="button" onClick={() => setFixed(true)}>
            修复组件
          </button>
          <ErrorBoundary>
            {fixed ? <div>恢复成功</div> : <AlwaysThrow />}
          </ErrorBoundary>
        </>
      );
    }

    render(<RecoverableDemo />);

    // 第一步：先把“子组件报错”状态切到“已修复”。
    await user.click(await screen.findByRole("button", { name: "修复组件" }));
    // 第二步：点 ErrorBoundary 里的“重试”，触发重新渲染子组件。
    const retryButton = await screen.findByRole("button", { name: "重试" });
    await user.click(retryButton);

    expect(await screen.findByText("恢复成功")).toBeInTheDocument();
  });

  it("renders custom fallback when provided", async () => {
    render(
      <ErrorBoundary fallback={<div>自定义兜底</div>}>
        <AlwaysThrow />
      </ErrorBoundary>,
    );

    expect(await screen.findByText("自定义兜底")).toBeInTheDocument();
  });
});
