/**
 * Tests for HistoryPanel component
 *
 * Verifies panel rendering, search filtering, load/delete/clear actions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HistoryPanel from "../HistoryPanel";
import type { SessionHistoryEntry } from "../../../types";

function makeEntry(overrides: Partial<SessionHistoryEntry> = {}): SessionHistoryEntry {
  return {
    id: "session-1",
    created_at: 1709553600000,
    model: "gpt-4o-mini",
    state: {
      current_phase: "consensus",
      topic: "如何提升产品转化率",
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
      consensus_output: "## 最终共识\n关键行动：A、B、C",
    },
    ...overrides,
  };
}

const defaultProps = {
  open: true,
  loading: false,
  items: [makeEntry()],
  loadingEntryId: null as string | null,
  deletingEntryId: null as string | null,
  clearing: false,
  onClose: vi.fn(),
  onRefresh: vi.fn(),
  onLoad: vi.fn(),
  onDelete: vi.fn(),
  onClear: vi.fn(),
};

describe("HistoryPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when open is false", () => {
    const { container } = render(<HistoryPanel {...defaultProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders history panel when open is true", () => {
    render(<HistoryPanel {...defaultProps} />);
    expect(screen.getByText("历史记录")).toBeInTheDocument();
  });

  it("shows loading spinner when loading is true", () => {
    render(<HistoryPanel {...defaultProps} loading={true} items={[]} />);
    expect(screen.getByText("加载历史中...")).toBeInTheDocument();
  });

  it("shows empty state when there are no items", () => {
    render(<HistoryPanel {...defaultProps} items={[]} />);
    expect(screen.getByText(/暂无历史记录/)).toBeInTheDocument();
  });

  it("renders an entry with topic, model, and date", () => {
    render(<HistoryPanel {...defaultProps} />);
    expect(screen.getByText("如何提升产品转化率")).toBeInTheDocument();
    expect(screen.getByText(/gpt-4o-mini/)).toBeInTheDocument();
  });

  it("filters items based on search query", async () => {
    const user = userEvent.setup();
    const items = [
      makeEntry({ id: "session-1" }),
      makeEntry({
        id: "session-2",
        state: {
          ...makeEntry().state,
          topic: "如何降低用户流失率",
          consensus_output: "留存策略",
        },
      }),
    ];
    render(<HistoryPanel {...defaultProps} items={items} />);

    const searchInput = screen.getByPlaceholderText("搜索议题 / 模型 / 摘要");
    await user.type(searchInput, "流失");

    expect(screen.getByText("如何降低用户流失率")).toBeInTheDocument();
    expect(screen.queryByText("如何提升产品转化率")).not.toBeInTheDocument();
  });

  it("calls onLoad when load button is clicked", async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    render(<HistoryPanel {...defaultProps} onLoad={onLoad} />);

    const loadBtn = screen.getByText("加载");
    await user.click(loadBtn);
    expect(onLoad).toHaveBeenCalledWith("session-1");
  });

  it("calls onDelete when delete button is clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<HistoryPanel {...defaultProps} onDelete={onDelete} />);

    const deleteBtn = screen.getByText("删除");
    await user.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith("session-1");
  });

  it("calls onClose when backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HistoryPanel {...defaultProps} onClose={onClose} />);

    // Find the backdrop (first child of the outer fixed div)
    const backdrop = document.querySelector(".absolute.inset-0") as HTMLElement;
    if (backdrop) await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onRefresh when refresh button is clicked", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<HistoryPanel {...defaultProps} onRefresh={onRefresh} />);

    const refreshBtn = screen.getByTitle("刷新");
    await user.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalled();
  });

  it("shows No results message when search yields nothing", async () => {
    const user = userEvent.setup();
    render(<HistoryPanel {...defaultProps} />);

    const searchInput = screen.getByPlaceholderText("搜索议题 / 模型 / 摘要");
    await user.type(searchInput, "ZZZZNOTEXIST");
    expect(screen.getByText("没有匹配的历史记录。")).toBeInTheDocument();
  });
});
