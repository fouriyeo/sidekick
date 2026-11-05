import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary, SessionTool } from "@/protocol/messages";
import { visibleSessions } from "@/shared/lib/sessions";
import { SessionRow } from "./session-row";

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

describe("SessionRow v16 结构", () => {
  it("标题 15/400，副行 13/400 且合并状态与时间", () => {
    renderRow(row({ state: "working", tool: null }));

    const title = screen.getByText("修复登录");
    expect(title.className).toContain("text-[15px]");
    expect(screen.getByText("正在思考 · 2 分钟前")).toBeInTheDocument();
  });

  it("working 行左侧是 spinner，不再有信号格/左侧竖条", () => {
    const { container } = renderRow(row({ state: "working", tool: "bash" }));

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).not.toBeNull();
    expect(container.querySelector("[data-signal-bars]")).toBeNull();
    expect(container.querySelector(".border-decide")).toBeNull();
    expect(container.querySelector("li")?.className).toContain("bg-[var(--wash)]");
  });

  it("完成行显示 check（无 spinner）", () => {
    const { container } = renderRow(
      row({ title: "写完了", state: "idle", completedAt: Date.now() - 8 * 60 * 60 * 1000 }),
    );

    expect(screen.getByText("已完成 · 8 小时前")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("asking 行用琥珀点 + 外圈，副行是琥珀色", () => {
    const { container } = renderRow(row({ state: "asking", askKind: "question" }));

    expect(container.querySelector(".border-decide")).not.toBeNull();
    const sub = screen.getByText("等你决定 · 2 分钟前");
    expect(sub.className).toContain("text-decide");
  });
});

describe("SessionRow 清除", () => {
  it("清除按钮 28×28 热区，点按回调", () => {
    const onClear = vi.fn();
    renderRow(row(), { onClear });

    const button = screen.getByRole("button", { name: "清除会话 修复登录" });
    expect(button.className).toContain("size-7");
    fireEvent.click(button);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("pendingClear 时显示「再点」并转 destructive", () => {
    renderRow(row(), { pendingClear: true });

    expect(screen.getByRole("button", { name: "确认清除会话 修复登录" })).toBeInTheDocument();
    expect(screen.getByText("再点")).toBeInTheDocument();
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
