import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopNav } from "@/desktop/lib/desktop-nav";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import type { SessionSummary, StatusMessage } from "@/protocol/messages";
import { SessionsPage } from "./sessions-page";

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "session-1",
    title: "重构登录模块",
    source: "dsh",
    state: "working",
    askKind: null,
    tool: "bash",
    lastEventAt: Date.now() - 60_000,
    completedAt: null,
    ...overrides,
  };
}

const asking = makeSession({
  id: "ask-1",
  title: "重构登录模块",
  state: "asking",
  askKind: "approval",
  tool: null,
  lastEventAt: Date.now() - 120_000,
});

const working = makeSession({
  id: "work-1",
  title: "修复剪贴板去重",
  state: "working",
  tool: "bash",
  lastEventAt: Date.now() - 240_000,
});

const completed = makeSession({
  id: "done-1",
  title: "统一连接状态文案",
  state: "idle",
  tool: null,
  completedAt: Date.now() - 300_000,
  lastEventAt: Date.now() - 300_000,
});

const idle = makeSession({
  id: "idle-1",
  title: "接口错误码对齐",
  state: "idle",
  tool: null,
  lastEventAt: Date.now() - 600_000,
});

function makeStatus(overrides: Partial<StatusMessage> = {}): StatusMessage {
  return {
    type: "status",
    v: 1,
    source: "dsh",
    state: "asking",
    sessions: 1,
    resume: null,
    remainingMs: null,
    sessionList: [asking, working, completed, idle],
    ts: Date.now(),
    ...overrides,
  };
}

function makeConnection(overrides: Partial<DesktopConnection> = {}): DesktopConnection {
  return {
    status: "connected",
    info: {
      ip: "192.168.1.23",
      port: 47810,
      url: "http://192.168.1.23:47810",
      discoveryPort: 47820,
    },
    error: null,
    sendText: vi.fn(),
    cancelMic: vi.fn(),
    requestStatus: vi.fn(),
    requestFocus: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function makeNav(): DesktopNav {
  return { go: vi.fn(), goSystem: vi.fn() };
}

function applyStatus(status: StatusMessage) {
  useDesktopStatusStore.setState({
    status,
    sessionList: status.sessionList ?? [],
    updatedAt: Date.now(),
  });
}

beforeEach(() => {
  useDesktopStatusStore.getState().reset();
});

afterEach(cleanup);

describe("SessionsPage 会话列表", () => {
  it("asking 置顶，工作行显示「正在<动作>」+ spinner，完成态保留", () => {
    applyStatus(makeStatus());
    render(<SessionsPage connection={makeConnection()} nav={makeNav()} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("重构登录模块");
    expect(rows[0]).toHaveTextContent("等你审批");

    expect(screen.getByText("修复剪贴板去重")).toBeInTheDocument();
    expect(screen.getByText("正在运行命令")).toBeInTheDocument();
    expect(screen.getByTestId("session-working-action")).toBeInTheDocument();
    // D78：工作行不再重复「工作中」状态词，只保留动态动作。
    expect(rows[1]).not.toHaveTextContent("工作中");
    expect(rows[2]).toHaveTextContent("已完成");
  });

  it("筛选：点是筛选，再点取消；只显示对应状态", () => {
    applyStatus(makeStatus());
    render(<SessionsPage connection={makeConnection()} nav={makeNav()} />);

    fireEvent.click(screen.getByRole("button", { name: /^等你决定/ }));
    expect(screen.getByText("重构登录模块")).toBeInTheDocument();
    expect(screen.queryByText("修复剪贴板去重")).toBeNull();
    expect(screen.queryByText("统一连接状态文案")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^等你决定/ }));
    expect(screen.getByText("修复剪贴板去重")).toBeInTheDocument();
  });

  it("「在 DSH 打开」经本地 WS 发 focus.request（交给 connection）", () => {
    applyStatus(makeStatus());
    const connection = makeConnection();
    render(<SessionsPage connection={connection} nav={makeNav()} />);

    const openButtons = screen.getAllByRole("button", { name: "在 DSH 打开" });
    expect(openButtons).toHaveLength(2);

    fireEvent.click(openButtons[0]);
    expect(connection.requestFocus).toHaveBeenCalledWith("ask-1");
  });

  it("页头「处理第一个」直接处理 asking 会话", () => {
    applyStatus(makeStatus());
    const connection = makeConnection();
    render(<SessionsPage connection={connection} nav={makeNav()} />);

    fireEvent.click(screen.getByRole("button", { name: "处理第一个" }));
    expect(connection.requestFocus).toHaveBeenCalledWith("ask-1");
  });

  it("断线时保留最后一次快照并标注可能过期", () => {
    applyStatus(makeStatus());
    const connection = makeConnection({ status: "disconnected" });
    render(<SessionsPage connection={connection} nav={makeNav()} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("连接断了，下面是最后一次快照");
    expect(screen.getByText("重构登录模块")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新连接" }));
    expect(connection.retry).toHaveBeenCalled();
  });

  it("未开启联动时给「去开启 AI 联动」空态", () => {
    const nav = makeNav();
    render(<SessionsPage connection={makeConnection()} nav={nav} />);

    expect(screen.getByText("还没有会话快照")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "去开启 AI 联动" }));
    expect(nav.goSystem).toHaveBeenCalledWith("hook");
  });

  it("有快照但没有会话时写「现在没有会话」", () => {
    applyStatus(makeStatus({ state: "idle", sessions: 0, sessionList: [] }));
    render(<SessionsPage connection={makeConnection()} nav={makeNav()} />);

    expect(screen.getByText("现在没有会话")).toBeInTheDocument();
  });
});
