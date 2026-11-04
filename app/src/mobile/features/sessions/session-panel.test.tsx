import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import type { SessionSummary, SessionTool } from "@/protocol/messages";
import { SessionPanel } from "./session-panel";
import { useSessionStore, visibleSessions } from "./session-store";

const tauri = vi.hoisted(() => ({
  sendFocusRequest: vi.fn(async () => undefined),
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  sendFocusRequest: tauri.sendFocusRequest,
}));

vi.mock("./session-storage", () => ({
  loadCleared: async () => ({}),
  saveCleared: async () => undefined,
}));

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s-1",
    title: "修复登录",
    source: "dsh",
    state: "working",
    askKind: null,
    lastEventAt: 1000,
    completedAt: null,
    ...overrides,
  };
}

function seed(list: SessionSummary[], expanded = false) {
  useSessionStore.setState({
    raw: list,
    cleared: {},
    hydrated: true,
    expanded,
    notice: null,
    noticeId: 0,
    pendingFocusId: null,
    pendingRequestId: null,
    pendingClearId: null,
    lastAskingIds: list.filter((item) => item.state === "asking").map((item) => item.id),
    seenSnapshot: true,
  });
}

beforeEach(() => {
  useSessionStore.getState().clearAll();
  seed([session()]);
  tauri.sendFocusRequest.mockReset();
  tauri.sendFocusRequest.mockResolvedValue(undefined);
  useConnectionStore.setState({ status: "connected" });
});

afterEach(() => {
  cleanup();
  clearBackHandlers();
});

describe("SessionPanel", () => {
  it("renders nothing when there are no visible sessions", () => {
    seed([]);
    const { container } = render(<SessionPanel active />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on the chat page", () => {
    const { container } = render(<SessionPanel active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("collapsed shows only the highest-priority session", () => {
    seed([
      session({ id: "s-1", title: "工作中", state: "working" }),
      session({ id: "s-2", title: "等你决定", state: "asking", askKind: "question" }),
    ]);
    render(<SessionPanel active />);

    expect(screen.getByText("等你决定")).toBeInTheDocument();
    expect(screen.queryByText("工作中")).toBeNull();
    expect(screen.queryByText("会话")).toBeNull();
  });

  it("clicking a non-asking collapsed row expands the list", () => {
    render(<SessionPanel active />);
    fireEvent.click(screen.getByRole("button", { name: "会话 修复登录" }));
    expect(useSessionStore.getState().expanded).toBe(true);
    expect(screen.getByText("会话")).toBeInTheDocument();
  });

  it("clicking an asking row asks the computer to open DSH", () => {
    seed([session({ state: "asking", askKind: "question" })]);
    render(<SessionPanel active />);

    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 修复登录" }));
    expect(tauri.sendFocusRequest).toHaveBeenCalledWith("dsh", "s-1", expect.any(String));
  });

  it("clears a finished session immediately", () => {
    seed([session({ state: "idle", completedAt: 900 })]);
    render(<SessionPanel active />);

    fireEvent.click(screen.getByRole("button", { name: "清除会话 修复登录" }));
    expect(
      visibleSessions(useSessionStore.getState().raw, useSessionStore.getState().cleared),
    ).toEqual([]);
    expect(screen.getByRole("status").textContent).toContain("已清除");
  });

  it("requires a second tap before clearing an asking session", () => {
    seed([session({ state: "asking" })]);
    render(<SessionPanel active />);

    fireEvent.click(screen.getByRole("button", { name: "清除会话 修复登录" }));
    expect(useSessionStore.getState().cleared).toEqual({});
    expect(screen.getByText("再点一次")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认清除会话 修复登录" }));
    expect(useSessionStore.getState().cleared["s-1"]?.through).toBe(1000);
  });

  it("expanded list shows all sessions and the summary", () => {
    seed(
      [
        session({ id: "s-1", title: "工作中", state: "working" }),
        session({ id: "s-2", title: "等你决定", state: "asking", askKind: "approval" }),
      ],
      true,
    );
    render(<SessionPanel active />);

    expect(screen.getByText("工作中")).toBeInTheDocument();
    expect(screen.getByText("等你决定")).toBeInTheDocument();
    expect(screen.getByText(/2 个 · 1 个等你决定/)).toBeInTheDocument();
    expect(screen.getByText(/等你审批/)).toBeInTheDocument();
  });

  it("collapses on the system back key while expanded", () => {
    seed([session()], true);
    render(<SessionPanel active />);

    expect(handleBack()).toBe(true);
    expect(useSessionStore.getState().expanded).toBe(false);
  });

  it("shows a focus result notice", () => {
    seed([session({ state: "asking" })]);
    render(<SessionPanel active />);
    act(() => {
      useSessionStore.getState().handleFocusResult({
        type: "focus.result",
        v: 1,
        requestId: "none",
        source: "dsh",
        ok: true,
        error: null,
        ts: 1,
      });
    });
    // requestId 不匹配：不提示。
    expect(screen.queryByRole("status")).toBeNull();

    useSessionStore.setState({ pendingRequestId: "f-1" });
    act(() => {
      useSessionStore.getState().handleFocusResult({
        type: "focus.result",
        v: 1,
        requestId: "f-1",
        source: "dsh",
        ok: true,
        error: null,
        ts: 1,
      });
    });
    expect(screen.getByRole("status").textContent).toContain("已在电脑上打开");
  });
});

describe("SessionPanel 方向 B 视觉结构", () => {
  it("会话行 48px 高，asking 是 1 格琥珀信号", () => {
    seed([session({ id: "s-1", title: "写周报", state: "asking", askKind: "question" })]);
    const { container } = render(<SessionPanel active />);

    const row = container.querySelector("li");
    expect(row?.className).toContain("min-h-12");
    const bars = container.querySelector("[data-signal-bars]");
    if (!(bars instanceof HTMLElement)) throw new Error("信号格未渲染");
    expect(bars).toHaveAttribute("data-signal-bars", "1");
    expect(bars.className).toContain("text-pet-ask");
    expect(bars.querySelectorAll("i")).toHaveLength(3);
    expect(bars.className).not.toContain("text-pet-coral");
  });

  it("working 2 格信号、completed 3 格完成绿", () => {
    seed(
      [
        session({ id: "s-1", title: "重构鉴权", state: "working" }),
        session({ id: "s-2", title: "写周报", state: "idle", completedAt: 900 }),
      ],
      true,
    );
    const { container } = render(<SessionPanel active />);

    const bars = [...container.querySelectorAll("[data-signal-bars]")];
    expect(bars[0]).toHaveAttribute("data-signal-bars", "2");
    expect(bars[0]?.className).toContain("text-pet-signal");
    expect(bars[1]).toHaveAttribute("data-signal-bars", "3");
    expect(bars[1]?.className).toContain("text-pet-success");
  });

  it("清除与展开按钮保持 44px 触控目标", () => {
    seed([session({ id: "s-1", title: "修复登录", state: "working" })]);
    render(<SessionPanel active />);

    expect(screen.getByRole("button", { name: "清除会话 修复登录" }).className).toContain(
      "size-11",
    );
    expect(screen.getByRole("button", { name: "展开会话列表" }).className).toContain("size-11");
  });
});

describe("SessionPanel 工作中工具动作", () => {
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
    seed([session({ state: "working", tool })]);
    render(<SessionPanel active />);

    expect(screen.getByText(`${text} ·`)).toBeInTheDocument();
    // 工作时行第二行不再展示「工作中」，避免和动作重复。
    expect(screen.queryByText("工作中")).toBeNull();
  });

  it("working 行显示 spinner 与 pet-signal，时间仍保留在行尾", () => {
    seed([session({ state: "working", tool: "bash", lastEventAt: Date.now() - 2 * 60 * 1000 })]);
    const { container } = render(<SessionPanel active />);

    const row = container.querySelector("li");
    if (!(row instanceof HTMLElement)) throw new Error("会话行未渲染");
    expect(row).toHaveAttribute("data-session-tool", "bash");
    expect(row.textContent).toBe("修复登录正在运行命令 ·2 分钟前");

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
    // 动作与 spinner 共用 pet-signal 语义色。
    expect(spinner.parentElement?.className).toContain("text-pet-signal");
  });

  it("working 没有工具类别时显示「正在思考」", () => {
    seed([session({ state: "working", tool: null })]);
    const { container } = render(<SessionPanel active />);

    expect(screen.getByText("正在思考 ·")).toBeInTheDocument();
    expect(container.querySelector("[data-session-spinner]")).not.toBeNull();
    expect(container.querySelector("li")).toHaveAttribute("data-session-tool", "none");
  });

  it("asking / completed 行保持原状态文案，不显示工具动作与 spinner", () => {
    seed(
      [
        session({ id: "s-1", title: "等你决定", state: "asking", askKind: "question", tool: null }),
        session({
          id: "s-2",
          title: "写完了",
          state: "idle",
          completedAt: Date.now() - 1000,
          tool: null,
        }),
      ],
      true,
    );
    const { container } = render(<SessionPanel active />);

    expect(screen.getByText(/等你决定 ·/)).toBeInTheDocument();
    expect(screen.getByText(/已完成 ·/)).toBeInTheDocument();
    expect(screen.queryByText(/正在/)).toBeNull();
    expect(container.querySelector("[data-session-spinner]")).toBeNull();
  });

  it("展开态里 working 行同样显示动作与 spinner", () => {
    seed(
      [
        session({ id: "s-1", title: "等你决定", state: "asking", askKind: "question" }),
        session({ id: "s-2", title: "重构鉴权", state: "working", tool: "edit" }),
      ],
      true,
    );
    const { container } = render(<SessionPanel active />);

    expect(screen.getByText("正在修改文件 ·")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-session-spinner]")).toHaveLength(1);
    expect(container.querySelector('li[data-session-tool="edit"]')).not.toBeNull();
  });

  it("working 行缺省 tool 字段时回退「正在思考」", () => {
    seed([session({ state: "working" })]);
    const { container } = render(<SessionPanel active />);

    expect(screen.getByText("正在思考 ·")).toBeInTheDocument();
    expect(container.querySelector("li")).toHaveAttribute("data-session-tool", "none");
  });
});
