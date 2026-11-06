import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/protocol/messages";
import { type SessionRow, visibleSessions } from "@/shared/lib/sessions";
import { SessionFeed } from "./session-feed";

// jsdom 没有 PointerEvent，用 MouseEvent 顶替（照 mic-button.test.tsx 的写法）。
beforeAll(() => {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: window.MouseEvent,
  });
});

afterEach(() => {
  cleanup();
});

function swipe(element: Element, fromX = 240, toX = 120, durationMs = 200) {
  // 控制 performance.now，让速度可预期（jsdom 里两次事件间隔几乎是 0，会被当成快速滑动）。
  let clock = 1_000;
  const nowSpy = vi.spyOn(performance, "now").mockImplementation(() => clock);
  try {
    fireEvent.pointerDown(element, {
      pointerId: 1,
      clientX: fromX,
      clientY: 20,
      pointerType: "touch",
    });
    clock += durationMs;
    fireEvent.pointerMove(element, {
      pointerId: 1,
      clientX: toX,
      clientY: 20,
      pointerType: "touch",
    });
    fireEvent.pointerUp(element, {
      pointerId: 1,
      clientX: toX,
      clientY: 20,
      pointerType: "touch",
    });
  } finally {
    nowSpy.mockRestore();
  }
}

function contents(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-swipe-content]"));
}

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

describe("SessionFeed 左滑清除", () => {
  it("点清除按钮回调会话 id", () => {
    const onClear = vi.fn();
    render(<SessionFeed rows={rows(2)} onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: "清除会话 会话 1" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledWith("s-1");
  });

  it("一次只开一行：打开第二行时第一行自动收起", () => {
    const { container } = render(<SessionFeed rows={rows(2)} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));

    const [first, second] = contents(container);
    if (!first || !second) throw new Error("会话行未渲染");

    swipe(first);
    expect(first.style.transform).toBe("translate3d(-72px, 0, 0)");

    swipe(second);
    expect(second.style.transform).toBe("translate3d(-72px, 0, 0)");
    expect(first.style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("展开/收起列表时收起已滑开的行", () => {
    const { container } = render(<SessionFeed rows={rows(3)} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));

    const [first] = contents(container);
    if (!first) throw new Error("会话行未渲染");
    swipe(first);
    expect(first.style.transform).toBe("translate3d(-72px, 0, 0)");

    fireEvent.click(screen.getByRole("button", { name: "收起会话列表" }));
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));
    const [firstAgain] = contents(container);
    if (!firstAgain) throw new Error("会话行未渲染");
    expect(firstAgain.style.transform).toBe("translate3d(0px, 0, 0)");
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
