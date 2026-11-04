import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { useMobileActivityStore } from "@/mobile/features/stream/activity-store";
import { useUiStore } from "@/mobile/ui-store";
import type { SessionSummary, SessionTool } from "@/protocol/messages";
import { StreamPage } from "./stream-page";

const tauri = vi.hoisted(() => ({
  sendFocusRequest: vi.fn(async () => undefined),
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  sendFocusRequest: tauri.sendFocusRequest,
}));

vi.mock("@/mobile/features/sessions/session-storage", () => ({
  loadCleared: async () => ({}),
  saveCleared: async () => undefined,
}));

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s-1",
    title: "重构登录模块",
    source: "dsh",
    state: "working",
    askKind: null,
    lastEventAt: Date.now() - 2 * 60 * 1000,
    completedAt: null,
    ...overrides,
  };
}

function seed(list: SessionSummary[]) {
  useSessionStore.setState({
    raw: list,
    cleared: {},
    hydrated: true,
    notice: null,
    noticeId: 0,
    pendingFocusId: null,
    pendingRequestId: null,
    pendingClearId: null,
  });
}

beforeEach(() => {
  useUiStore.setState({ view: "stream", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({ status: "connected", addr: "192.168.1.5:47810" });
  useSessionStore.getState().clearAll();
  useMobileActivityStore.getState().reset();
  tauri.sendFocusRequest.mockReset();
  tauri.sendFocusRequest.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("StreamPage 会话列表", () => {
  it("按 asking > working > completed 排序，聚合条显示计数", () => {
    seed([
      session({ id: "done", title: "女接口文案", state: "idle", completedAt: 900 }),
      session({ id: "work", title: "接口错误码对齐", state: "working" }),
      session({ id: "ask", title: "修复登录", state: "asking", askKind: "question" }),
    ]);
    render(<StreamPage />);

    const titles = screen
      .getAllByText(/修复登录|接口错误码对齐|女接口文案/)
      .map((node) => node.textContent);
    expect(titles).toEqual(["修复登录", "接口错误码对齐", "女接口文案"]);

    expect(screen.getByText("会话")).toBeInTheDocument();
    expect(screen.getByText(/最多 5 行 · 内部滚动/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "等你决定 1 个，点按查看等你决定" }),
    ).toBeInTheDocument();
  });

  it("会话列表最多 5 行高、内部滚动，不撑破页面", () => {
    seed(
      Array.from({ length: 8 }, (_, index) =>
        session({ id: `s-${index}`, title: `任务 ${index}` }),
      ),
    );
    const { container } = render(<StreamPage />);

    const list = container.querySelector("ul.max-h-\\[260px\\]");
    expect(list).not.toBeNull();
    expect(list?.className).toContain("overflow-y-auto");
  });

  it("asking 行直接发 focus.request（保留 D78）", () => {
    seed([session({ id: "s-1", state: "asking", askKind: "question" })]);
    render(<StreamPage />);

    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 重构登录模块" }));
    expect(tauri.sendFocusRequest).toHaveBeenCalledWith("dsh", "s-1", expect.any(String));
    expect(useSessionStore.getState().pendingFocusId).toBe("s-1");
  });

  it("完成会话可以清除；asking 需要二次确认", () => {
    seed([
      session({ id: "s-1", title: "已完成的事", state: "idle", completedAt: Date.now() - 1000 }),
      session({ id: "s-2", title: "等你决定的事", state: "asking", askKind: "question" }),
    ]);
    render(<StreamPage />);

    fireEvent.click(screen.getByRole("button", { name: "清除会话 已完成的事" }));
    expect(useSessionStore.getState().cleared["s-1"]).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("已清除");

    fireEvent.click(screen.getByRole("button", { name: "清除会话 等你决定的事" }));
    expect(screen.getByText("再点一次")).toBeInTheDocument();
    expect(useSessionStore.getState().cleared["s-2"]).toBeUndefined();
  });

  it("空态给出下一步；未连接时给去连接", () => {
    render(<StreamPage />);

    expect(screen.getByText("还没有 AI 会话")).toBeInTheDocument();
    expect(screen.getByText(/在电脑上开启「AI 联动」后/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "去连接电脑" })).toBeNull();

    cleanup();
    useConnectionStore.setState({ status: "disconnected" });
    render(<StreamPage />);
    fireEvent.click(screen.getByRole("button", { name: "去连接电脑" }));
    expect(useUiStore.getState().view).toBe("offline");
  });

  it("断连时保留最后一次快照并标注", () => {
    useConnectionStore.setState({ status: "disconnected" });
    seed([session({ state: "working", tool: "bash" })]);
    render(<StreamPage />);

    expect(screen.getByText("已断连，AI 状态可能过期。")).toBeInTheDocument();
    expect(screen.getByText("重构登录模块")).toBeInTheDocument();
    expect(screen.getByText(/最后一次快照/)).toBeInTheDocument();
  });
});

describe("StreamPage D78 工作行动作", () => {
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

  it.each(TOOL_CASES)("working + %s → 「%s」+ spinner", (tool, text) => {
    seed([session({ state: "working", tool })]);
    const { container } = render(<StreamPage />);

    expect(screen.getByText(`${text} ·`)).toBeInTheDocument();
    expect(container.querySelector("[data-session-spinner]")).not.toBeNull();
    // 行内第二行只有动作，不再重复「工作中」。
    const row = container.querySelector("li[data-session-tool]");
    expect(row?.textContent).not.toContain("工作中");
  });

  it("working 无工具类别时「正在思考」", () => {
    seed([session({ state: "working", tool: null })]);
    const { container } = render(<StreamPage />);

    expect(screen.getByText("正在思考 ·")).toBeInTheDocument();
    expect(container.querySelector("[data-session-spinner]")).not.toBeNull();
  });
});

describe("StreamPage 最近发生", () => {
  it("展示内存活动流，时间与副行都在", () => {
    act(() => {
      useMobileActivityStore.getState().record({
        kind: "voice",
        title: "语音输入已输入到电脑",
        detail: "18 字",
      });
      useMobileActivityStore.getState().record({
        kind: "ai",
        title: "重构登录模块 进入「等你决定」",
        detail: "手机只负责提醒，到电脑上处理",
      });
    });
    render(<StreamPage />);

    expect(screen.getByText("最近发生")).toBeInTheDocument();
    expect(screen.getByText("只在本机保留")).toBeInTheDocument();
    expect(screen.getByText("语音输入已输入到电脑")).toBeInTheDocument();
    expect(screen.getByText("18 字")).toBeInTheDocument();
    expect(screen.getByText("重构登录模块 进入「等你决定」")).toBeInTheDocument();
  });

  it("没有活动时给出说明，不显示剪贴板内容或 AI 提问正文", () => {
    render(<StreamPage />);

    expect(screen.getByText(/还没有动静/)).toBeInTheDocument();
    expect(screen.queryByText(/剪贴板内容/)).toBeNull();
  });
});
