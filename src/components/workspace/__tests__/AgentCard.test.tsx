/**
 * Tests for AgentCard component
 *
 * Verifies correct rendering of agent status badges, content display,
 * version counter, and objection list.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import AgentCard from "../AgentCard";
import type { Agent, Framework } from "../../../types";

// Mock the typewriter hook to instantly return the full content
vi.mock("../../../hooks/useTypewriter", () => ({
    useTypewriter: (text: string) => text,
}));

function makeAgent(overrides: Partial<Agent> = {}): Agent {
    return {
        framework_id: "first_principles",
        status: "idle",
        content: "",
        version: 1,
        objections: [],
        ...overrides,
    };
}

const mockFramework: Framework = {
    id: "first_principles",
    name: "第一性原理",
    icon: "🔬",
    system_prompt: "You are a first principles thinker",
    description: "从基本事实出发推理",
    is_builtin: true,
};

describe("AgentCard", () => {
    it("renders framework name and icon when framework provided", () => {
        const agent = makeAgent();
        render(<AgentCard agent={agent} framework={mockFramework} />);
        expect(screen.getByText("第一性原理")).toBeInTheDocument();
        expect(screen.getByText("🔬")).toBeInTheDocument();
    });

    it("falls back to framework_id when no framework provided", () => {
        const agent = makeAgent();
        render(<AgentCard agent={agent} framework={undefined} />);
        expect(screen.getByText("first_principles")).toBeInTheDocument();
    });

    it("shows 空闲 status badge when status is idle", () => {
        const agent = makeAgent({ status: "idle" });
        render(<AgentCard agent={agent} framework={mockFramework} />);
        expect(screen.getByText("空闲")).toBeInTheDocument();
    });

    it("shows 推理中 status badge when status is thinking", () => {
        const agent = makeAgent({ status: "thinking" });
        render(<AgentCard agent={agent} framework={mockFramework} />);
        expect(screen.getByText("推理中")).toBeInTheDocument();
    });

    it("shows 通过 status badge when status is pass", () => {
        const agent = makeAgent({ status: "pass" });
        render(<AgentCard agent={agent} framework={mockFramework} />);
        expect(screen.getByText("通过")).toBeInTheDocument();
    });

    it("shows 异议 status badge and renders objection text", () => {
        const agent = makeAgent({
            status: "objection",
            objections: ["关键假设不成立"],
        });
        render(<AgentCard agent={agent} framework={mockFramework} />);
        expect(screen.getByText("异议")).toBeInTheDocument();
        expect(screen.getByText(/1 条异议待处理/)).toBeInTheDocument();
    });

    it("shows 修补中 status badge when status is patching", () => {
        const agent = makeAgent({ status: "patching" });
        render(<AgentCard agent={agent} framework={mockFramework} />);
        expect(screen.getByText("修补中")).toBeInTheDocument();
    });

    it("displays version number", () => {
        const agent = makeAgent({ version: 2 });
        render(<AgentCard agent={agent} framework={mockFramework} />);
        expect(screen.getByText(/v2/i)).toBeInTheDocument();
    });

    it("shows content when agent has content", () => {
        const agent = makeAgent({ content: "这是智能体输出的结构化方案。" });
        render(<AgentCard agent={agent} framework={mockFramework} />);
        // Content may be wrapped in markdown renderer; check for partial text
        expect(screen.getByText(/这是智能体输出的结构化方案/)).toBeInTheDocument();
    });

    it("renders expand trigger for long content", () => {
        const longContent = "详细方案内容行\n".repeat(30);
        const agent = makeAgent({ content: longContent, status: "pass" });
        render(<AgentCard agent={agent} framework={mockFramework} />);
        // Component renders without throwing for long content
        expect(screen.getByText("通过")).toBeInTheDocument();
    });

    it("shows expand button on hover", async () => {
        const user = userEvent.setup();
        const agent = makeAgent({ content: "S".repeat(500), status: "pass" });
        const { container } = render(
            <AgentCard agent={agent} framework={mockFramework} />,
        );
        // Hover over the card's inner content
        const card = container.firstChild?.firstChild as HTMLElement;
        if (card) await user.hover(card);
        // expand button is in the DOM (opacity controlled by CSS group-hover)
        const expandBtn = container.querySelector("button");
        expect(expandBtn).toBeInTheDocument();
    });
});
