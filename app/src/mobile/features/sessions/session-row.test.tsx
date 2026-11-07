import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { SessionSummary, SessionTool } from "@/protocol/messages";
import { visibleSessions } from "@/shared/lib/sessions";
import { SessionRow } from "./session-row";

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

function contentOf(container: HTMLElement): HTMLElement {
  const element = container.querySelector<HTMLElement>("[data-swipe-content]");
  if (!element) throw new Error("会话行内容未渲染");
  return element;
}

function row(overrides: Partial<SessionSummary> = {}) {
  const [first] = visibleSessions(
    [
      {
        id: "s-1",
        title: "修复登录",
        source: "dsh",
        state: "working",
        askKind: null,
        lastEventAt: Date.now() - 2 * 60 * 1000,
        completedAt: null,
        ...overrides,
      },
    ],
    {},
  );
  if (!first) throw new Error("会话行未构造出来");
  return first;
}

function renderRow(data = row(), props: Partial<Parameters<typeof SessionRow>[0]> = {}) {
  return render(
    <ul>
      <SessionRow row={data} onOpen={vi.fn()} onClear={vi.fn()} {...props} />
    </ul>,
  );
}

describe("SessionRow v18 结构（D107）", () => {
  it("标题 13/18、副行 11.5/16 且合并状态与时间", () => {
    renderRow(row({ state: "working", tool: null }));

    const title = screen.getByText("修复登录");
    expect(title.className).toContain("text-[13px]");
    expect(title.className).toContain("leading-[18px]");
    expect(title.className).toContain("font-normal");
    expect(screen.getByText("正在思考 · 2 分钟前")).toBeInTheDocument();
  });

  it("working 行左侧是轨道弧，不再有信号格/左侧竖条", () => {
    const { container } = renderRow(row({ state: "working", tool: "bash" }));

    const spinner = container.querySelector(".sk-orbit");
    expect(spinner).not.toBeNull();
    expect(container.querySelector("[data-signal-bars]")).toBeNull();
    expect(container.querySelector(".border-decide")).toBeNull();
    expect(contentOf(container).className).toContain("bg-[var(--wash)]");
  });

  it("完成行显示描线对勾（无轨道弧）", () => {
    const { container } = renderRow(
      row({ title: "写完了", state: "idle", completedAt: Date.now() - 8 * 60 * 60 * 1000 }),
    );

    expect(screen.getByText("已完成")).toHaveClass("text-signal");
    expect(screen.getByText(/8 小时前/)).toBeInTheDocument();
    expect(container.querySelector(".sk-orbit")).toBeNull();
    expect(container.querySelector(".sk-check__mark")).not.toBeNull();
  });

  it("asking 行用琥珀涟漪，副行是琥珀色", () => {
    const { container } = renderRow(row({ state: "asking", askKind: "question" }));

    const ask = container.querySelector(".sk-ask");
    expect(ask).not.toBeNull();
    expect(ask?.className).toContain("text-decide");
    const sub = screen.getByText("等你决定 · 2 分钟前");
    expect(sub.className).toContain("text-decide");
  });
});

describe("SessionRow 左滑清除", () => {
  it("清除按钮 72×52 常驻，点按回调", () => {
    const onClear = vi.fn();
    renderRow(row(), { onClear });

    const button = screen.getByRole("button", { name: "清除会话 修复登录" });
    expect(button.className).toContain("w-[72px]");
    fireEvent.click(button);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("左滑超过阈值展开到 -72px，并回调 onOpenChange(true)", () => {
    const onOpenChange = vi.fn();
    const { container } = renderRow(row(), { onOpenChange });

    swipe(contentOf(container));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(contentOf(container).style.transform).toBe("translate3d(-72px, 0, 0)");
  });

  it("左滑不足阈值回弹到 0", () => {
    const onOpenChange = vi.fn();
    const { container } = renderRow(row(), { onOpenChange });

    swipe(contentOf(container), 240, 220);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(contentOf(container).style.transform).toBe("translate3d(0px, 0, 0)");
  });

  it("展开时点行内容只收起，不触发打开", () => {
    const onOpen = vi.fn();
    const onOpenChange = vi.fn();
    renderRow(row({ state: "asking", askKind: "question" }), { open: true, onOpen, onOpenChange });

    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 修复登录" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("聚焦清除按钮时自动展开（读屏/键盘兜底）", () => {
    const onOpenChange = vi.fn();
    renderRow(row(), { onOpenChange });

    fireEvent.focus(screen.getByRole("button", { name: "清除会话 修复登录" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("展开时点按行内容先收起", () => {
    const onOpenChange = vi.fn();
    const { container } = renderRow(row(), { open: true, onOpenChange });
    const content = contentOf(container);

    fireEvent.pointerDown(content, {
      pointerId: 1,
      clientX: 120,
      clientY: 20,
      pointerType: "touch",
    });
    fireEvent.pointerUp(content, { pointerId: 1, clientX: 120, clientY: 20, pointerType: "touch" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("点行外收起", () => {
    const onOpenChange = vi.fn();
    renderRow(row(), { open: true, onOpenChange });

    fireEvent.pointerDown(document.body, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      pointerType: "touch",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("滑动后的 click 被吞掉，不误触发 asking 跳转", () => {
    const onOpen = vi.fn();
    const { container } = renderRow(row({ state: "asking", askKind: "question" }), { onOpen });

    swipe(contentOf(container));
    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 修复登录" }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("SessionRow 工具动作", () => {
  const TOOL_CASES: Array<[SessionTool, string]> = [
    ["bash", "正在运行命令"],
    ["read", "正在阅读文件"],
    ["edit", "正在修改文件"],
    ["search", "正在搜索代码"],
    ["web", "正在查资料"],
    ["agent", "正在处理子任务"],
    ["plan", "正在整理计划"],
    ["tool", "正在使用工具"],
  ];

  it.each(TOOL_CASES)("working + %s 显示「%s」", (tool, text) => {
    renderRow(row({ state: "working", tool }));

    expect(screen.getByText(`${text} · 2 分钟前`)).toBeInTheDocument();
  });

  it("只有 asking 行提供打开动作，且 aria 文案是「在电脑上打开」", () => {
    const onOpen = vi.fn();
    renderRow(row({ state: "asking", askKind: "question" }), { onOpen });

    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 修复登录" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("只读行不渲染主按钮，但清除仍可用", () => {
    const onClear = vi.fn();
    render(
      <ul>
        <SessionRow row={row()} onClear={onClear} />
      </ul>,
    );

    expect(screen.queryByRole("button", { name: "会话 修复登录" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "清除会话 修复登录" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
