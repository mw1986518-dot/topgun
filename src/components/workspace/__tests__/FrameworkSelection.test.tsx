/**
 * Tests for FrameworkSelection component
 *
 * Verifies framework grid rendering, selection toggling,
 * recommended badge display, and submit behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import FrameworkSelection from "../FrameworkSelection";
import type { Framework } from "../../../types";

const mockFrameworks: Framework[] = [
  {
    id: "first_principles",
    name: "第一性原理",
    icon: "🔬",
    system_prompt: "test",
    description: "从基本事实出发推理",
    is_builtin: true,
  },
  {
    id: "systems_thinking",
    name: "系统思维",
    icon: "🌐",
    system_prompt: "test",
    description: "整体性思维框架",
    is_builtin: true,
  },
  {
    id: "lateral_thinking",
    name: "水平思维",
    icon: "💡",
    system_prompt: "test",
    description: "跳出常规思维",
    is_builtin: true,
  },
];

describe("FrameworkSelection", () => {
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onSelect = vi.fn();
  });

  it("renders all framework cards", () => {
    render(
      <FrameworkSelection
        frameworks={mockFrameworks}
        recommended={[]}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("第一性原理")).toBeInTheDocument();
    expect(screen.getByText("系统思维")).toBeInTheDocument();
    expect(screen.getByText("水平思维")).toBeInTheDocument();
  });

  it("shows recommended badges for recommended frameworks", () => {
    render(
      <FrameworkSelection
        frameworks={mockFrameworks}
        recommended={["first_principles", "systems_thinking"]}
        onSelect={onSelect}
      />,
    );

    const badges = screen.getAllByText("推荐");
    expect(badges.length).toBe(2);
  });

  it("pre-selects recommended frameworks", () => {
    render(
      <FrameworkSelection
        frameworks={mockFrameworks}
        recommended={["first_principles"]}
        onSelect={onSelect}
      />,
    );

    // Counter should show 1 selected
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("toggles framework selection on click", async () => {
    const user = userEvent.setup();

    render(
      <FrameworkSelection
        frameworks={mockFrameworks}
        recommended={[]}
        onSelect={onSelect}
      />,
    );

    // Click on "系统思维" card
    await user.click(screen.getByText("系统思维"));
    expect(screen.getByText("1")).toBeInTheDocument();

    // Click again to deselect
    await user.click(screen.getByText("系统思维"));
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("disables submit when no frameworks selected", () => {
    render(
      <FrameworkSelection
        frameworks={mockFrameworks}
        recommended={[]}
        onSelect={onSelect}
      />,
    );

    const submitButton = screen.getByText("锁定阵容并推演").closest("button");
    expect(submitButton).toBeDisabled();
  });

  it("calls onSelect with selected IDs on submit", async () => {
    const user = userEvent.setup();

    render(
      <FrameworkSelection
        frameworks={mockFrameworks}
        recommended={["first_principles", "systems_thinking"]}
        onSelect={onSelect}
      />,
    );

    const submitButton = screen.getByText("锁定阵容并推演");
    await user.click(submitButton);

    expect(onSelect).toHaveBeenCalledTimes(1);
    const [selectedIds, userPrompt] = onSelect.mock.calls[0];
    expect(selectedIds).toEqual(
      expect.arrayContaining(["first_principles", "systems_thinking"]),
    );
    expect(typeof userPrompt).toBe("string");
    expect(userPrompt).toContain("原始问题：");
    expect(userPrompt).toContain("AI 生成的重塑议题：");
  });

  it("displays reframed issue when provided", () => {
    const reframed = "这是重塑后的议题内容";

    render(
      <FrameworkSelection
        frameworks={mockFrameworks}
        recommended={[]}
        reframedIssue={reframed}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("重塑议题")).toBeInTheDocument();
    expect(screen.getByText(/这是重塑后的议题内容/)).toBeInTheDocument();
  });

  it("点击修改后允许编辑重塑议题正文并提交", async () => {
    const user = userEvent.setup();

    render(
      <FrameworkSelection
        frameworks={mockFrameworks}
        recommended={["first_principles"]}
        topic="如何提高客户续约率"
        reframedIssue="### 重塑议题\n- 聚焦续约阻力与成交路径"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByText("点击修改"));
    const promptBox = screen.getByRole("textbox");
    await user.clear(promptBox);
    await user.type(promptBox, "原始问题：{enter}A{enter}{enter}AI 生成的重塑议题：{enter}B");

    const submitButton = screen.getByText("锁定阵容并推演");
    await user.click(submitButton);

    const [, userPrompt] = onSelect.mock.calls[0];
    expect(userPrompt).toContain("AI 生成的重塑议题");
  });

  it("默认正文不会包含推荐专家板块", async () => {
    const user = userEvent.setup();

    render(
      <FrameworkSelection
        frameworks={mockFrameworks}
        recommended={["first_principles"]}
        topic="如何提高客户续约率"
        reframedIssue="### 重塑议题\n- 聚焦续约阻力与成交路径"
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByText("锁定阵容并推演"));

    const [, userPrompt] = onSelect.mock.calls[0];
    expect(userPrompt).not.toContain("推荐专家（人的身份）：");
    expect(userPrompt).not.toContain("推荐解答专家");
  });
});
