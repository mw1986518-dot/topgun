import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IterationView from "../IterationView";
import type { Framework, StateMachine } from "../../../types";

const frameworks: Framework[] = [
  {
    id: "first_principles",
    name: "第一性原理",
    icon: "🧩",
    system_prompt: "test",
    description: "test",
    is_builtin: true,
  },
];

function makeState(overrides: Partial<StateMachine> = {}): StateMachine {
  return {
    current_phase: "patch",
    topic: "如何提升转化率",
    clarifications: [],
    clarification_round: 1,
    selected_frameworks: ["first_principles"],
    agents: {},
    iteration_count: 2,
    is_reasoning_running: false,
    max_iterations: 3,
    tolerated_risks: [],
    ipc_logs: [],
    recommended_frameworks: [],
    ...overrides,
  };
}

describe("IterationView", () => {
  it("当没有智能体内容时会显示占位提示", () => {
    const state = makeState({ agents: {} });
    render(<IterationView state={state} frameworks={frameworks} />);

    expect(screen.getByText("推演尚未产出内容...")).toBeInTheDocument();
  });

  it("会根据版本和最终共识动态生成版本节点", () => {
    const state = makeState({
      agents: {
        first_principles: {
          framework_id: "first_principles",
          status: "complete",
          content: "v2 内容",
          version: 2,
          objections: [],
        },
      },
      consensus_output: "## 最终报告",
    });

    render(<IterationView state={state} frameworks={frameworks} />);

    expect(screen.getByText("v0.1 议题重塑")).toBeInTheDocument();
    expect(screen.getAllByText("v1.0 发散初稿").length).toBeGreaterThan(0);
    expect(screen.getByText("v2.0 修补版本")).toBeInTheDocument();
    expect(screen.getByText("最终共识")).toBeInTheDocument();
  });

  it("点击最终共识后会显示共识内容", async () => {
    const user = userEvent.setup();
    const state = makeState({
      agents: {
        first_principles: {
          framework_id: "first_principles",
          status: "complete",
          content: "v2 内容",
          version: 2,
          objections: [],
        },
      },
      consensus_output: "这是最终共识内容",
    });

    render(<IterationView state={state} frameworks={frameworks} />);

    await user.click(screen.getByText("最终共识"));
    expect(screen.getByText("这是最终共识内容")).toBeInTheDocument();
  });
});
