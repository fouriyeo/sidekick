import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDesktopActivityStore } from "@/desktop/lib/desktop-activity-store";
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
  useDesktopClientsStore.getState().reset();
  useDesktopActivityStore.getState().reset();
  useDesktopVoiceStore.getState().reset();
});

afterEach(cleanup);

describe("OverviewPage 现在卡", () => {
  it("工作中显示会话标题与 D78 工具动作，主行动是查看会话", () => {
    const session = makeSession({ state: "working", tool: "bash" });
    applyStatus(makeStatus({ state: "working", sessionList: [session] }));
    useDesktopClientsStore.setState({ clients: 2 });

    render(<OverviewPage connection={makeConnection()} nav={makeNav()} />);

    expect(screen.getByText("工作中")).toBeInTheDocument();
    expect(screen.getByText("重构登录模块")).toBeInTheDocument();
    expect(screen.getByText(/正在运行命令/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "查看会话" }).length).toBeGreaterThan(0);
  });

  it("工具类别为 null 时显示「正在思考」", () => {
    applyStatus(makeStatus({ sessionList: [makeSession({ tool: null })] }));
    render(<OverviewPage connection={makeConnection()} nav={makeNav()} />);

    expect(screen.getByText(/正在思考/)).toBeInTheDocument();
  });

  it("等你决定时唯一主按钮跳到会话页", () => {
    const session = makeSession({
      state: "asking",
      askKind: "approval",
      tool: null,
      title: "修改登录页错误文案",
    });
    applyStatus(makeStatus({ state: "asking", sessionList: [session] }));
    const nav = makeNav();

    render(<OverviewPage connection={makeConnection()} nav={nav} />);

    expect(screen.getByText(/等你审批/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "去看是谁在等" }));
    expect(nav.go).toHaveBeenCalledWith("sessions");
  });

  it("空闲时写「现在没有要处理的事」，不造按钮", () => {
    applyStatus(makeStatus({ state: "idle", sessions: 0, sessionList: [] }));
    render(<OverviewPage connection={makeConnection()} nav={makeNav()} />);

    expect(screen.getByText("现在没有要处理的事")).toBeInTheDocument();
    expect(screen.getByText("空闲")).toBeInTheDocument();
  });

  it("未收到 AI 状态且手机没连上时，先引导连接手机", () => {
    const nav = makeNav();
    render(<OverviewPage connection={makeConnection()} nav={nav} />);

    expect(screen.getByText("先连接手机，AI 状态和语音输入才能到手机")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "连接手机" })[0]);
    expect(nav.goSystem).toHaveBeenCalledWith("connection");
  });

  it("服务异常时显示重试而不是空态", () => {
    const connection = makeConnection({ status: "error", info: null, error: "boom" });
    render(<OverviewPage connection={connection} nav={makeNav()} />);

    expect(screen.getByText("电脑服务没连上")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(connection.retry).toHaveBeenCalled();
  });
});

describe("OverviewPage 语音 / 事件 / 这台电脑", () => {
  it("最近一次语音显示文本、结果与字数", () => {
    applyStatus(makeStatus({ state: "idle", sessions: 0, sessionList: [] }));
    useDesktopVoiceStore.getState().record({
      text: "帮我把登录模块的报错提示改成中文。",
      outcome: "inserted",
      reason: null,
      at: Date.now() - 60_000,
    });

    render(<OverviewPage connection={makeConnection()} nav={makeNav()} />);

    expect(screen.getByText(/帮我把登录模块的报错提示改成中文/)).toBeInTheDocument();
    expect(screen.getByText("已输入")).toBeInTheDocument();
    expect(screen.getByText("已输入到当前窗口")).toBeInTheDocument();
  });

  it("最近事件只显示最新 5 条", () => {
    applyStatus(makeStatus({ state: "idle", sessions: 0, sessionList: [] }));
    for (let index = 1; index <= 6; index += 1) {
      useDesktopActivityStore.getState().record({
        kind: "ai",
        title: `事件 ${index}`,
      });
    }

    render(<OverviewPage connection={makeConnection()} nav={makeNav()} />);

    expect(screen.getByText("事件 6")).toBeInTheDocument();
    expect(screen.getByText("事件 2")).toBeInTheDocument();
    expect(screen.queryByText("事件 1")).toBeNull();
  });

  it("这台电脑显示真实地址、UDP 端口与设备近似值", () => {
    useDesktopClientsStore.setState({ clients: 2 });
    render(<OverviewPage connection={makeConnection()} nav={makeNav()} />);

    expect(screen.getByText("192.168.1.23:47810")).toBeInTheDocument();
    expect(screen.getByText("47820 · 监听中")).toBeInTheDocument();
    expect(screen.getByText("1 台设备（近似值）")).toBeInTheDocument();
  });
});
