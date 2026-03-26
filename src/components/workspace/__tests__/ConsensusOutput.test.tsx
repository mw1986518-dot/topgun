/**
 * Tests for ConsensusOutput component
 *
 * Verifies markdown content rendering, export button states,
 * risk list display, error feedback, and action plan functionality.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import ConsensusOutput from "../ConsensusOutput";
import type { ToleratedRiskItem, ActionPlanQuestion } from "../../../types";

const mockInvoke = vi.mocked(invoke);

function makeRisk(overrides: Partial<ToleratedRiskItem> = {}): ToleratedRiskItem {
    return {
        framework_id: "first_principles",
        risk_summary: "关键指标口径不一致",
        evidence: "当前样本口径混用，无法比较迭代效果。",
        temporary_reason: "达到最大迭代次数后仍未收敛，当前作为临时容忍项保留。",
        next_action: "补充统一口径样本后再复核。",
        ...overrides,
    };
}

function makeActionPlanQuestion(overrides: Partial<ActionPlanQuestion> = {}): ActionPlanQuestion {
    return {
        key: "budget",
        question: "月薪范围是多少？",
        reason: "薪酬计算需要具体数字",
        related_action: "激励重构",
        ...overrides,
    };
}

describe("ConsensusOutput", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders consensus content as markdown", () => {
        render(
            <ConsensusOutput
                content="这是一份测试报告内容"
                toleratedRisks={[]}
            />,
        );

        expect(screen.getByText("这是一份测试报告内容")).toBeInTheDocument();
    });

    it("shows loading text when content is empty", () => {
        render(<ConsensusOutput content="" toleratedRisks={[]} />);

        expect(screen.getByText("引擎正在生成最终报告...")).toBeInTheDocument();
    });

    it("displays tolerated risks list", () => {
        render(
            <ConsensusOutput
                content="报告内容"
                toleratedRisks={[
                    makeRisk({ framework_id: "security", risk_summary: "安全风险未解决" }),
                    makeRisk({
                        framework_id: "performance",
                        risk_summary: "性能瓶颈待优化",
                        evidence: "峰值时延超过阈值。",
                    }),
                ]}
            />,
        );

        expect(screen.getByText("容忍风险清单（临时接受，非最终共识）")).toBeInTheDocument();
        expect(screen.getByText("安全风险未解决")).toBeInTheDocument();
        expect(screen.getByText("性能瓶颈待优化")).toBeInTheDocument();
        expect(screen.getByText("来源框架：security")).toBeInTheDocument();
    });

    it("shows Chinese framework name when framework list is provided", () => {
        render(
            <ConsensusOutput
                content="报告内容"
                toleratedRisks={[makeRisk({ framework_id: "theory_of_constraints" })]}
                frameworks={[
                    {
                        id: "theory_of_constraints",
                        name: "约束理论",
                        icon: "🗜️",
                        system_prompt: "",
                        description: "",
                        is_builtin: true,
                    },
                ]}
            />,
        );

        expect(screen.getByText("来源框架：约束理论")).toBeInTheDocument();
        expect(screen.queryByText("来源框架：theory_of_constraints")).not.toBeInTheDocument();
    });

    it("hides risk section when there are no risks", () => {
        render(<ConsensusOutput content="报告内容" toleratedRisks={[]} />);

        expect(screen.queryByText("容忍风险清单（临时接受，非最终共识）")).not.toBeInTheDocument();
    });

    it("renders header title", () => {
        render(<ConsensusOutput content="报告" toleratedRisks={[]} />);

        expect(
            screen.getByText("阶段 4：最终共识与交付"),
        ).toBeInTheDocument();
    });

    it("renders copy and export buttons", () => {
        render(<ConsensusOutput content="报告" toleratedRisks={[]} />);

        expect(screen.getByText("复制")).toBeInTheDocument();
        expect(screen.getByText("导出 Markdown")).toBeInTheDocument();
    });

    it("shows export success message after successful export", async () => {
        const user = userEvent.setup();
        mockInvoke.mockResolvedValue("C:\\Users\\test\\consensus.md");

        render(<ConsensusOutput content="报告内容" toleratedRisks={[]} />);

        await user.click(screen.getByText("导出 Markdown"));

        expect(
            await screen.findByText(/已导出到/),
        ).toBeInTheDocument();
    });

    it("shows error when trying to export empty/whitespace content", async () => {
        const user = userEvent.setup();

        render(<ConsensusOutput content="   " toleratedRisks={[]} />);

        await user.click(screen.getByText("导出 Markdown"));

        expect(
            await screen.findByText("当前没有可导出的内容"),
        ).toBeInTheDocument();
    });

    it("renders multiple risks correctly", () => {
        const risks = [
            makeRisk({ framework_id: "fw1", risk_summary: "第一条风险" }),
            makeRisk({ framework_id: "fw2", risk_summary: "第二条风险" }),
            makeRisk({ framework_id: "fw3", risk_summary: "第三条风险" }),
        ];

        render(<ConsensusOutput content="报告" toleratedRisks={risks} />);

        for (const risk of risks) {
            expect(screen.getByText(risk.risk_summary)).toBeInTheDocument();
        }
    });

    // ========== Action Plan Tests ==========

    it("shows '生成落地方案' button", () => {
        render(<ConsensusOutput content="报告内容" toleratedRisks={[]} />);

        expect(screen.getByText("生成落地方案")).toBeInTheDocument();
    });

    it("starts action plan flow when button clicked", async () => {
        const user = userEvent.setup();
        const questions = [
            makeActionPlanQuestion({ key: "budget", question: "月薪范围是多少？" }),
            makeActionPlanQuestion({ key: "team_size", question: "团队几人？" }),
        ];
        mockInvoke.mockResolvedValueOnce(questions);

        render(<ConsensusOutput content="报告内容" toleratedRisks={[]} />);

        await user.click(screen.getByText("生成落地方案"));

        expect(mockInvoke).toHaveBeenCalledWith("start_action_plan");
    });

    it("shows action plan dialogue panel after starting", async () => {
        const user = userEvent.setup();
        const questions = [
            makeActionPlanQuestion({ key: "budget", question: "月薪范围是多少？" }),
        ];
        mockInvoke.mockResolvedValueOnce(questions);

        render(<ConsensusOutput content="报告内容" toleratedRisks={[]} />);

        await user.click(screen.getByText("生成落地方案"));

        expect(await screen.findByText("生成落地方案")).toBeInTheDocument();
        expect(await screen.findByText("月薪范围是多少？")).toBeInTheDocument();
    });

    it("shows toggle buttons when action plan exists", () => {
        render(
            <ConsensusOutput
                content="报告内容"
                toleratedRisks={[]}
                actionPlan="# 落地方案\n\n这是落地方案内容"
            />,
        );

        expect(screen.getByText("共识报告")).toBeInTheDocument();
        expect(screen.getByText("落地方案")).toBeInTheDocument();
    });

    it("displays action plan content when toggle clicked", async () => {
        const user = userEvent.setup();

        render(
            <ConsensusOutput
                content="报告内容"
                toleratedRisks={[]}
                actionPlan="# 落地方案\n\n具体执行步骤"
            />,
        );

        // 默认显示落地方案
        expect(screen.getByText("具体执行步骤")).toBeInTheDocument();

        // 点击共识报告
        await user.click(screen.getByText("共识报告"));

        expect(screen.getByText("报告内容")).toBeInTheDocument();
    });

    it("shows progress indicator in action plan dialogue", async () => {
        const user = userEvent.setup();
        const questions = [
            makeActionPlanQuestion({ key: "q1", question: "问题1" }),
            makeActionPlanQuestion({ key: "q2", question: "问题2" }),
        ];
        mockInvoke.mockResolvedValueOnce(questions);

        render(<ConsensusOutput content="报告内容" toleratedRisks={[]} />);

        await user.click(screen.getByText("生成落地方案"));

        expect(await screen.findByText("0 / 2 个问题")).toBeInTheDocument();
    });
});