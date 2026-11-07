import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/protocol/messages";
import { type SessionRow, visibleSessions } from "@/shared/lib/sessions";
import {
  SESSION_FEED_FOOTER_H,
  SESSION_FEED_HEADER_H,
  SESSION_FEED_MAX_ROWS,
  SESSION_FEED_TOP_GAP,
  SESSION_ROW_H,
  SessionFeed,
  sessionFeedReserveHeight,
} from "./session-feed";

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

type HarnessProps = Omit<ComponentProps<typeof SessionFeed>, "expanded" | "onExpandedChange"> & {
  initialExpanded?: boolean;
};

/** 受控展开态的测试壳：展开/收起状态由测试壳持有，组件本身不再自己存。 */
function Harness({ initialExpanded = false, ...props }: HarnessProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  return <SessionFeed {...props} expanded={expanded} onExpandedChange={setExpanded} />;
}

function sectionOf(container: HTMLElement): HTMLElement {
  const section = container.querySelector("section");
  if (!(section instanceof HTMLElement)) throw new Error("会话卡未渲染");
  return section;
}

describe("SessionFeed 折叠与展开", () => {
  it("折叠只展示 1 行，header 显示计数，footer 显示「还有 N 条」", () => {
    render(<Harness rows={rows(3)} onClear={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("会话 1")).toBeInTheDocument();
    expect(screen.queryByText("会话 2")).toBeNull();
    expect(screen.getByText("还有 2 条")).toBeInTheDocument();
  });

  it("点 header 展开全部行，footer 变「收起」；再点收起", () => {
    render(<Harness rows={rows(3)} onClear={vi.fn()} />);

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
    render(<Harness rows={rows(7)} onClear={vi.fn()} />);

    expect(screen.getByText("7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText("会话 6")).toBeNull();
  });

  it("只有 1 条会话时不渲染折叠/展开入口", () => {
    render(<Harness rows={rows(1)} onClear={vi.fn()} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /会话列表/ })).toBeNull();
    expect(screen.queryByText(/还有/)).toBeNull();
  });
});

describe("SessionFeed 左滑清除", () => {
  it("点清除按钮回调会话 id", () => {
    const onClear = vi.fn();
    render(<Harness rows={rows(2)} onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: "清除会话 会话 1" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onClear).toHaveBeenCalledWith("s-1");
  });

  it("一次只开一行：打开第二行时第一行自动收起", () => {
    const { container } = render(<Harness rows={rows(2)} onClear={vi.fn()} />);
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
    const { container } = render(<Harness rows={rows(3)} onClear={vi.fn()} />);
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

    render(<Harness rows={list} onOpenAsking={onOpenAsking} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));

    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 等你决定的事" }));
    expect(onOpenAsking).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "会话 正在做的事" })).toBeNull();
  });

  it("空列表整卡不渲染", () => {
    const { container } = render(<Harness rows={[]} onClear={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("SessionFeed 浮层尺寸与完成态（D107）", () => {
  it("卡片 maxHeight 按折叠/展开算；宠物舞台预留只取折叠高度", () => {
    const { container } = render(<Harness rows={rows(7)} onClear={vi.fn()} />);
    const collapsed =
      SESSION_FEED_TOP_GAP + SESSION_FEED_HEADER_H + SESSION_ROW_H + SESSION_FEED_FOOTER_H;
    expect(sessionFeedReserveHeight(7)).toBe(collapsed);
    expect(sessionFeedReserveHeight(0)).toBe(0);
    expect(sessionFeedReserveHeight(1)).toBe(
      SESSION_FEED_TOP_GAP + SESSION_FEED_HEADER_H + SESSION_ROW_H,
    );

    const collapsedMax = SESSION_FEED_HEADER_H + SESSION_ROW_H + SESSION_FEED_FOOTER_H + 2;
    expect(sectionOf(container).style.maxHeight).toBe(`${collapsedMax}px`);

    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));
    const expandedMax =
      SESSION_FEED_HEADER_H + SESSION_FEED_MAX_ROWS * SESSION_ROW_H + SESSION_FEED_FOOTER_H + 2;
    expect(sectionOf(container).style.maxHeight).toBe(`${expandedMax}px`);
  });

  it("已完成行可点（onOpenFocus 拿到 id），行尾有 › 提示", () => {
    const onOpenFocus = vi.fn();
    const list = visibleSessions(
      [
        session({
          id: "s-done",
          title: "写完了",
          state: "idle",
          completedAt: Date.now() - 60_000,
          lastEventAt: Date.now() - 60_000,
        }),
      ],
      {},
    );

    const { container } = render(
      <Harness rows={list} onOpenFocus={onOpenFocus} onClear={vi.fn()} />,
    );
    const rowButton = screen.getByRole("button", { name: "在电脑上打开 写完了" });
    expect(container.querySelector(".lucide-chevron-right")).not.toBeNull();

    fireEvent.click(rowButton);
    expect(onOpenFocus).toHaveBeenCalledWith("s-done");
  });

  it("刚完成的行铺薄荷脉冲，其它行不铺", () => {
    const now = Date.now();
    const list = visibleSessions(
      [
        session({ id: "s-work", title: "正在做的事", lastEventAt: now }),
        session({
          id: "s-done",
          title: "刚完成的事",
          state: "idle",
          completedAt: now - 30_000,
          lastEventAt: now - 30_000,
        }),
      ],
      {},
    );

    const { container } = render(<Harness rows={list} freshIds={["s-done"]} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));

    const fresh = contents(container).find((element) =>
      element.textContent?.includes("刚完成的事"),
    );
    const normal = contents(container).find((element) =>
      element.textContent?.includes("正在做的事"),
    );
    expect(fresh?.className).toContain("ms-row-fresh");
    expect(normal?.className).not.toContain("ms-row-fresh");
  });

  it("刚完成行排在前 5 之外时，展开用它替换第 5 位，保证看得见", () => {
    const now = Date.now();
    const working = Array.from({ length: 5 }, (_, index) =>
      session({
        id: `w-${index + 1}`,
        title: `工作 ${index + 1}`,
        lastEventAt: now - index * 60_000,
      }),
    );
    const done = session({
      id: "s-done",
      title: "刚完成的事",
      state: "idle",
      completedAt: now - 30_000,
      lastEventAt: now - 30_000,
    });
    const list = visibleSessions([...working, done], {});
    expect(list[5]?.id).toBe("s-done");

    render(<Harness rows={list} freshIds={["s-done"]} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("刚完成的事")).toBeInTheDocument();
    expect(screen.queryByText("工作 5")).toBeNull();
  });
});
