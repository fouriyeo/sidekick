import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDesktopClientsStore } from "@/desktop/lib/desktop-clients-store";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import type { SessionSummary, StatusMessage } from "@/protocol/messages";
import { GlobalStatusBar } from "./global-status-bar";

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

function makeStatus(overrides: Partial<StatusMessage> = {}): StatusMessage {
  return {
    type: "status",
    v: 1,
    source: "dsh",
    state: "working",
    sessions: 1,
    resume: null,
    remainingMs: null,
    sessionList: [makeSession()],
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

beforeEach(() => {
  useDesktopStatusStore.getState().reset();
  useDesktopClientsStore.getState().reset();
});

afterEach(cleanup);

describe("GlobalStatusBar 三段状态", () => {
  it("服务显示真实端口，手机用「台设备」口径，AI 显示聚合态与当前会话标题", () => {
    const status = makeStatus();
    useDesktopStatusStore.setState({
      status,
      sessionList: status.sessionList ?? [],
      updatedAt: Date.now(),
    });
    useDesktopClientsStore.setState({ clients: 2 });

    render(
      <GlobalStatusBar
        connection={makeConnection()}
        onOpenConnection={vi.fn()}
        onOpenSessions={vi.fn()}
      />,
    );

    expect(screen.getByText("服务正常")).toBeInTheDocument();
    expect(screen.getByText("· 局域网直连")).toBeInTheDocument();
    expect(screen.queryByText("· 47810")).toBeNull();
    expect(screen.getByText("已连接")).toBeInTheDocument();
    expect(screen.getByText("· 1 台设备")).toBeInTheDocument();
    expect(screen.getByText("工作中")).toBeInTheDocument();
    expect(screen.getByText("· 重构登录模块")).toBeInTheDocument();
  });

  it("设备数口径注明「客户端总数 − 1」", () => {
    useDesktopClientsStore.setState({ clients: 3 });
    render(
      <GlobalStatusBar
        connection={makeConnection()}
        onOpenConnection={vi.fn()}
        onOpenSessions={vi.fn()}
      />,
    );

    const phone = screen.getByRole("button", { name: /^手机连接/ });
    expect(phone).toHaveAttribute("title", expect.stringContaining("近似值"));
    expect(screen.getByText("· 2 台设备")).toBeInTheDocument();
  });

  it("还没收到客户端数时显示未连接与 0 台设备", () => {
    render(
      <GlobalStatusBar
        connection={makeConnection()}
        onOpenConnection={vi.fn()}
        onOpenSessions={vi.fn()}
      />,
    );

    expect(screen.getByText("未连接")).toBeInTheDocument();
    expect(screen.getByText("· 0 台设备")).toBeInTheDocument();
    expect(screen.getByText("· 还没开启联动")).toBeInTheDocument();
  });

  it("等你决定优先于工作中，并显示对应会话标题", () => {
    const asking = makeSession({
      id: "ask-1",
      title: "修改登录页错误文案",
      state: "asking",
      askKind: "approval",
      tool: null,
    });
    const working = makeSession({ id: "work-1", title: "修复剪贴板去重" });
    const status = makeStatus({ state: "asking", sessionList: [working, asking] });
    useDesktopStatusStore.setState({
      status,
      sessionList: status.sessionList ?? [],
      updatedAt: Date.now(),
    });

    render(
      <GlobalStatusBar
        connection={makeConnection()}
        onOpenConnection={vi.fn()}
        onOpenSessions={vi.fn()}
      />,
    );

    expect(screen.getByText("等你决定")).toBeInTheDocument();
    expect(screen.getByText("· 修改登录页错误文案")).toBeInTheDocument();
  });

  it("三段都可点：服务/手机 → 连接，AI → 会话", () => {
    const onOpenConnection = vi.fn();
    const onOpenSessions = vi.fn();
    render(
      <GlobalStatusBar
        connection={makeConnection()}
        onOpenConnection={onOpenConnection}
        onOpenSessions={onOpenSessions}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^服务状态/ }));
    fireEvent.click(screen.getByRole("button", { name: /^手机连接/ }));
    expect(onOpenConnection).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: /^AI 状态/ }));
    expect(onOpenSessions).toHaveBeenCalledTimes(1);
  });

  it("服务异常时显示「服务没起来」而不是假装正常", () => {
    render(
      <GlobalStatusBar
        connection={makeConnection({ status: "error", info: null, error: "获取连接信息失败" })}
        onOpenConnection={vi.fn()}
        onOpenSessions={vi.fn()}
      />,
    );

    expect(screen.getByText("服务没起来")).toBeInTheDocument();
  });
});
