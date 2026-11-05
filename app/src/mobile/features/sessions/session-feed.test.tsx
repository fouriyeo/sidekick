import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/protocol/messages";
import { type SessionRow, visibleSessions } from "@/shared/lib/sessions";
import { SessionFeed } from "./session-feed";

afterEach(() => {
  cleanup();
});

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s-1",
    title: "会话 1",
    source: "dsh",
    state: "working",
    askKind: null,
    lastEventAt: Date.now() - 60_000,
    completedAt: null,
    ...overrides,
  };
}

/** 按可见排序构造 N 行；标题/时间固定，便于断言。 */
function rows(count: number, overrides: Partial<SessionSummary> = {}): SessionRow[] {
  return visibleSessions(
    Array.from({ length: count }, (_, index) =>
      session({
        id: `s-${index + 1}`,
        title: `会话 ${index + 1}`,
        lastEventAt: Date.now() - (index + 1) * 60_000,
        ...overrides,
      }),
    ),
    {},
  );
}

describe("SessionFeed 折叠与展开", () => {
  it("折叠只展示 1 行，header 显示计数，footer 显示「还有 N 条」", () => {
    render(<SessionFeed rows={rows(3)} onClear={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("会话 1")).toBeInTheDocument();
    expect(screen.queryByText("会话 2")).toBeNull();
    expect(screen.getByText("还有 2 条")).toBeInTheDocument();
  });

  it("点 header 展开全部行，footer 变「收起」；再点收起", () => {
    render(<SessionFeed rows={rows(3)} onClear={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("会话 3")).toBeInTheDocument();
    expect(screen.getByText("收起")).toBeInTheDocument();
    expect(screen.queryByText("还有 2 条")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "收起会话列表" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("还有 2 条")).toBeInTheDocument();
  });

  it("展开最多 5 行，header 计数仍是全部条数", () => {
    render(<SessionFeed rows={rows(7)} onClear={vi.fn()} />);

    expect(screen.getByText("7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText("会话 6")).toBeNull();
  });

  it("只有 1 条会话时不渲染折叠/展开入口", () => {
    render(<SessionFeed rows={rows(1)} onClear={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /会话列表/ })).toBeNull();
    expect(screen.queryByText(/还有/)).toBeNull();
  });
});

describe("SessionFeed 清除", () => {
  it("每行 × 回调会话 id", () => {
    const onClear = vi.fn();
    render(<SessionFeed rows={rows(2)} onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: "清除会话 会话 1" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledWith("s-1");
  });

  it("pendingClearId 命中时显示「再点」并变 destructive", () => {
    render(<SessionFeed rows={rows(1)} pendingClearId="s-1" onClear={vi.fn()} />);

    const clear = screen.getByRole("button", { name: "确认清除会话 会话 1" });
    expect(clear).toHaveTextContent("再点");
    expect(clear.className).toContain("text-destructive");
  });
});

describe("SessionFeed 行交互", () => {
  it("asking 行可点开，其它行只读", () => {
    const onOpenAsking = vi.fn();
    const list = visibleSessions(
      [
        session({ id: "s-ask", title: "等你决定的事", state: "asking", askKind: "question" }),
        session({ id: "s-work", title: "正在做的事", state: "working", tool: "bash" }),
      ],
      {},
    );

    render(<SessionFeed rows={list} onOpenAsking={onOpenAsking} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));

    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 等你决定的事" }));
    expect(onOpenAsking).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "会话 正在做的事" })).toBeNull();
  });

  it("空列表整卡不渲染", () => {
    const { container } = render(<SessionFeed rows={[]} onClear={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
