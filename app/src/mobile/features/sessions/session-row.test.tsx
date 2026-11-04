import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary, SessionTool } from "@/protocol/messages";
import { visibleSessions } from "@/shared/lib/sessions";
import { SessionRow } from "./session-row";
import { useSessionStore } from "./session-store";

afterEach(() => {
  cleanup();
});

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

describe("SessionRow 方向 B 视觉结构", () => {
  it("会话行 48px 高，asking 是 1 格琥珀信号 + 琥珀左边条", () => {
    const { container } = renderRow(row({ state: "asking", askKind: "question" }));

    const item = container.querySelector("li");
    expect(item?.className).toContain("min-h-12");
    expect(item?.className).toContain("border-decide");
    const bars = container.querySelector("[data-signal-bars]");
    if (!(bars instanceof HTMLElement)) throw new Error("信号格未渲染");
    expect(bars).toHaveAttribute("data-signal-bars", "1");
    expect(bars.className).toContain("text-decide");
  });

  it("working 2 格信号、completed 3 格完成绿", () => {
    const { container: working } = renderRow(row({ state: "working" }));
    const workingBars = working.querySelector("[data-signal-bars]");
    expect(workingBars).toHaveAttribute("data-signal-bars", "2");
    expect(workingBars?.className).toContain("text-signal");
    cleanup();

    const { container: completed } = renderRow(
      row({ state: "idle", completedAt: Date.now() - 1000 }),
    );
    const completedBars = completed.querySelector("[data-signal-bars]");
    expect(completedBars).toHaveAttribute("data-signal-bars", "3");
    expect(completedBars?.className).toContain("text-success");
  });

  it("清除按钮保持 44px 触控目标", () => {
    renderRow();

    expect(screen.getByRole("button", { name: "清除会话 修复登录" }).className).toContain(
      "size-11",
    );
  });
});

describe("SessionRow 工作中工具动作（D78）", () => {
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

  it.each(TOOL_CASES)("working + %s 显示中文动作「%s」", (tool, text) => {
    renderRow(row({ state: "working", tool }));

    expect(screen.getByText(`${text} ·`)).toBeInTheDocument();
    // 工作时行第二行不再展示「工作中」，避免和动作重复。
    expect(screen.queryByText("工作中")).toBeNull();
    expect(screen.getByText(/2 分钟前/)).toBeInTheDocument();
  });

  it("working 行显示 spinner，时间仍保留在行尾", () => {
    const { container } = renderRow(row({ state: "working", tool: "bash" }));

    const item = container.querySelector("li");
    expect(item).toHaveAttribute("data-session-tool", "bash");
    expect(item?.textContent).toBe("修复登录正在运行命令 ·2 分钟前");

    const spinner = container.querySelector("[data-session-spinner]");
    if (!(spinner instanceof HTMLElement)) throw new Error("spinner 未渲染");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner.className).toContain("size-2.5");
    expect(spinner.className).toContain("animate-spin");
    expect(spinner.className).toContain("rounded-full");
    expect(spinner.className).toContain("border-current");
    expect(spinner.className).toContain("border-t-transparent");
    // WebView 103 不支持 CSS translate 属性；spinner 只做旋转。
    expect(spinner.className).not.toContain("translate");
    expect(spinner.parentElement?.className).toContain("text-signal");
  });

  it("working 没有工具类别时显示「正在思考」", () => {
    const { container } = renderRow(row({ state: "working", tool: null }));

    expect(screen.getByText("正在思考 ·")).toBeInTheDocument();
    expect(container.querySelector("[data-session-spinner]")).not.toBeNull();
    expect(container.querySelector("li")).toHaveAttribute("data-session-tool", "none");
  });

  it("asking / completed 行保持原状态文案，不显示工具动作与 spinner", () => {
    const { container } = renderRow(row({ state: "asking", askKind: "question" }));
    expect(screen.getByText(/等你决定 ·/)).toBeInTheDocument();
    expect(container.querySelector("[data-session-spinner]")).toBeNull();
    cleanup();

    const { container: completed } = renderRow(
      row({ title: "写完了", state: "idle", completedAt: Date.now() - 1000 }),
    );
    expect(screen.getByText(/已完成 ·/)).toBeInTheDocument();
    expect(completed.querySelector("[data-session-spinner]")).toBeNull();
    expect(screen.queryByText(/正在/)).toBeNull();
  });

  it("working 行缺省 tool 字段时回退「正在思考」", () => {
    const { container } = renderRow(row({ state: "working" }));
    expect(screen.getByText("正在思考 ·")).toBeInTheDocument();
    expect(container.querySelector("li")).toHaveAttribute("data-session-tool", "none");
  });
});

describe("SessionRow 交互", () => {
  it("asking 行点按请求电脑打开 DSH", () => {
    const onOpen = vi.fn();
    renderRow(row({ state: "asking", askKind: "question" }), { onOpen });

    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 修复登录" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("compact 变体用于宠物页最近会话，不出现清除按钮", () => {
    renderRow(row(), { variant: "compact" });

    expect(screen.getByRole("button", { name: "最近会话 修复登录" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /清除会话/ })).toBeNull();
  });

  it("只读行不渲染主按钮，但清除仍可用", () => {
    const onClear = vi.fn();
    const { container } = render(
      <ul>
        <SessionRow row={row()} onClear={onClear} />
      </ul>,
    );

    expect(container.querySelector("li button")?.getAttribute("aria-label")).toContain("清除会话");
    fireEvent.click(screen.getByRole("button", { name: "清除会话 修复登录" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().raw).toEqual([]);
  });

  it("pendingFocus / pendingClear 显示进行中状态", () => {
    const { container } = renderRow(row({ state: "asking" }), {
      pendingFocus: true,
      pendingClear: true,
    });

    expect(container.querySelectorAll(".animate-spin").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "确认清除会话 修复登录" })).toBeInTheDocument();
    expect(screen.getByText("再点一次")).toBeInTheDocument();
  });
});
