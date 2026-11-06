import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/tauri", () => ({
  getAccessibilityInfo: vi.fn().mockResolvedValue({
    trusted: true,
    appName: "Sidekick",
    executablePath: "/Applications/Sidekick.app",
    isDev: true,
  }),
}));

import { useDesktopClientsStore } from "@/desktop/lib/desktop-clients-store";
import type { DesktopNav } from "@/desktop/lib/desktop-nav";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import { useDesktopVoiceStore } from "@/desktop/lib/desktop-voice-store";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import type { SessionSummary, StatusMessage } from "@/protocol/messages";
import { OverviewPage } from "./overview-page";

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

function makeNav(): DesktopNav {
  return { go: vi.fn(), goSettings: vi.fn() };
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
  useDesktopClientsStore.getState().reset();
  useDesktopVoiceStore.getState().reset();
});

afterEach(cleanup);

describe("OverviewPage 概览", () => {
  it("三行状态：服务端口 / 手机台数 / AI 状态", () => {
    applyStatus(makeStatus({ state: "working" }));
    useDesktopClientsStore.setState({ clients: 2 });

    render(<OverviewPage connection={makeConnection()} nav={makeNav()} />);

    expect(screen.getByRole("heading", { name: "概览" })).toBeInTheDocument();
    expect(screen.getByText("47810 · 运行中")).toBeInTheDocument();
    expect(screen.getByText("1 台")).toBeInTheDocument();
    expect(screen.getByText("工作中")).toBeInTheDocument();
  });

  it("当前会话只显示一句状态，主行动是在 DSH 打开", () => {
    const session = makeSession({ state: "working", tool: "bash" });
    applyStatus(makeStatus({ state: "working", sessionList: [session] }));
    const connection = makeConnection();

    render(<OverviewPage connection={connection} nav={makeNav()} />);

    expect(screen.getByText("当前会话")).toBeInTheDocument();
    expect(screen.getByText("重构登录模块")).toBeInTheDocument();
    expect(screen.getByText("正在运行命令")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "在 DSH 打开" }));
    expect(connection.requestFocus).toHaveBeenCalledWith("session-1");
  });

  it("等你决定优先于工作中", () => {
    applyStatus(
      makeStatus({
        state: "asking",
        sessionList: [
          makeSession({ id: "w", title: "写测试", state: "working" }),
          makeSession({ id: "a", title: "改配置", state: "asking", tool: null }),
        ],
      }),
    );

    render(<OverviewPage connection={makeConnection()} nav={makeNav()} />);

    expect(screen.getByText("改配置")).toBeInTheDocument();
    expect(screen.getAllByText("等你决定").length).toBeGreaterThan(0);
  });

  it("没有语音记录时只显示一行空态", () => {
    render(<OverviewPage connection={makeConnection()} nav={makeNav()} />);
    expect(screen.getByText("还没有语音记录")).toBeInTheDocument();
  });

  it("最近一次语音输入显示文本与结果", () => {
    useDesktopVoiceStore.setState({
      last: { text: "帮我把这段话发出去", outcome: "inserted", reason: null, at: Date.now() },
    });

    render(<OverviewPage connection={makeConnection()} nav={makeNav()} />);

    expect(screen.getByText("帮我把这段话发出去")).toBeInTheDocument();
    expect(screen.getByText(/已输入/)).toBeInTheDocument();
  });

  it("点状态行进设置对应二级页", () => {
    const nav = makeNav();
    applyStatus(makeStatus());

    render(<OverviewPage connection={makeConnection()} nav={nav} />);

    fireEvent.click(screen.getByRole("button", { name: /服务/ }));
    expect(nav.goSettings).toHaveBeenCalledWith("connection");

    fireEvent.click(screen.getByRole("button", { name: /AI/ }));
    expect(nav.goSettings).toHaveBeenCalledWith("hook");
  });
});
