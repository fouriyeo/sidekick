import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/desktop/pages/content-page", () => ({
  ContentPage: () => <div>content-page</div>,
}));
vi.mock("@/desktop/pages/memo-page", () => ({
  MemoPage: () => <div>memo-page</div>,
}));
vi.mock("@/desktop/pages/usage-page", () => ({
  UsagePage: () => <div>usage-page</div>,
}));
vi.mock("@/desktop/pages/voice-page", () => ({
  VoicePage: () => <div>voice-page</div>,
}));
vi.mock("@/desktop/pages/words-page", () => ({
  WordsPage: () => <div>words-page</div>,
}));
vi.mock("@/desktop/pages/settings-page", () => ({
  SettingsPage: ({ section }: { section: string }) => <div>settings-page:{section}</div>,
}));
vi.mock("@/desktop/features/mic-receiver/mic-status-overlay", () => ({
  MicStatusOverlay: () => null,
}));
vi.mock("@/shared/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/desktop/features/hook/hook-store", () => ({
  useHookStore: {
    getState: () => ({ init: vi.fn(), refresh: vi.fn() }),
  },
}));
// 壳层会预读本地 asr.json 供侧栏「语音」琥珀点；测试里不碰真实 Tauri invoke。
vi.mock("@/desktop/features/models/cloud-asr-store", () => ({
  useCloudAsrStore: Object.assign(() => null, {
    getState: () => ({ load: vi.fn() }),
  }),
}));
// 侧栏「设置」琥珀点读的是自动输入授权；测试里恒为未知（不显示点）。
vi.mock("@/desktop/features/settings/accessibility-store", () => ({
  useAccessibilityStore: Object.assign(() => null, {
    getState: () => ({ refresh: vi.fn() }),
  }),
}));

const connectionMock = vi.hoisted(() => ({
  status: "connected" as "connected" | "error",
  requestFocus: vi.fn(() => true),
}));

vi.mock("./use-desktop-connection", () => ({
  useDesktopConnection: () => ({
    status: connectionMock.status,
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
    requestFocus: connectionMock.requestFocus,
    retry: vi.fn(),
  }),
}));

import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import { DesktopApp } from "./app";

const ASKING_SESSION = {
  id: "s-1",
  title: "检查 Git 忽略配置遗漏",
  source: "dsh" as const,
  state: "asking" as const,
  askKind: "approval" as const,
  lastEventAt: 1_700_000_000_000,
  completedAt: null,
};

beforeEach(() => {
  window.history.pushState({}, "", "/");
  connectionMock.status = "connected";
  connectionMock.requestFocus.mockClear();
  useDesktopStatusStore.getState().reset();
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

function pressShortcut(key: string) {
  fireEvent.keyDown(window, { key, metaKey: true });
}

describe("DesktopApp 简约 iOS 外壳（D143 删概览）", () => {
  it("默认用量（看板块），侧栏 5 个入口 + 底部设置，正常运行时不显示状态行", () => {
    render(<DesktopApp />);

    expect(screen.getByText("usage-page")).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "主导航" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((node) => node.textContent?.trim()),
    ).toEqual(["剪贴板", "备忘录", "用量", "语音", "英语角"]);
    for (const label of ["剪贴板", "备忘录", "用量", "语音", "英语角", "设置"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    // 服务端口 / 手机台数 / AI 工作态都不再常驻（沉默即正常）。
    expect(screen.queryByRole("button", { name: /^服务/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^手机/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^AI/ })).toBeNull();
  });

  it("点击侧栏切换 6 个一级页", () => {
    render(<DesktopApp />);

    fireEvent.click(screen.getByRole("button", { name: "备忘录" }));
    expect(screen.getByText("memo-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "用量" }));
    expect(screen.getByText("usage-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "语音" }));
    expect(screen.getByText("voice-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "英语角" }));
    expect(screen.getByText("words-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByText("settings-page:root")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "剪贴板" }));
    expect(screen.getByText("content-page")).toBeInTheDocument();
  });

  it("⌘1–⌘6 切换一级页，⌘7 无动作", () => {
    render(<DesktopApp />);

    pressShortcut("2");
    expect(screen.getByText("memo-page")).toBeInTheDocument();

    pressShortcut("3");
    expect(screen.getByText("usage-page")).toBeInTheDocument();

    pressShortcut("4");
    expect(screen.getByText("voice-page")).toBeInTheDocument();

    pressShortcut("5");
    expect(screen.getByText("words-page")).toBeInTheDocument();

    pressShortcut("6");
    expect(screen.getByText("settings-page:root")).toBeInTheDocument();

    pressShortcut("1");
    expect(screen.getByText("content-page")).toBeInTheDocument();

    // 一级只有 6 个视图，⌘7 不改变当前页。
    pressShortcut("7");
    expect(screen.getByText("content-page")).toBeInTheDocument();
  });

  it("输入框里不劫持 ⌘数字", () => {
    render(<DesktopApp />);
    const input = document.createElement("input");
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: "2", metaKey: true });

    // 停在默认页（用量），没有跳到 ⌘2 的备忘录。
    expect(screen.getByText("usage-page")).toBeInTheDocument();
    input.remove();
  });

  it("服务连不上时才出现「服务未启动」一行，点进手机连接", () => {
    connectionMock.status = "error";
    render(<DesktopApp />);

    fireEvent.click(screen.getByRole("button", { name: "服务：未启动" }));
    expect(screen.getByText("settings-page:connection")).toBeInTheDocument();
  });

  it("AI 停下等你决定时出现一行，点它直接唤起 DSH 会话", () => {
    useDesktopStatusStore.getState().apply({
      type: "status",
      v: 1,
      source: "dsh",
      state: "asking",
      sessions: 1,
      ts: 1,
      sessionList: [ASKING_SESSION],
    });

    render(<DesktopApp />);

    fireEvent.click(screen.getByRole("button", { name: "AI：等你决定" }));
    expect(connectionMock.requestFocus).toHaveBeenCalledWith("s-1");
  });

  it("AI 在工作中不占状态行（不需要用户出手）", () => {
    useDesktopStatusStore.getState().apply({
      type: "status",
      v: 1,
      source: "dsh",
      state: "working",
      sessions: 1,
      ts: 1,
      sessionList: [{ ...ASKING_SESSION, id: "s-2", state: "working", askKind: null }],
    });

    render(<DesktopApp />);

    expect(screen.queryByRole("button", { name: /^AI/ })).toBeNull();
  });

  it("旧 ?view=overview 与 ?view=sessions 都回默认页用量", () => {
    window.history.pushState({}, "", "/?view=overview");
    render(<DesktopApp />);
    expect(screen.getByText("usage-page")).toBeInTheDocument();

    cleanup();
    window.history.pushState({}, "", "/?view=sessions");
    render(<DesktopApp />);
    expect(screen.getByText("usage-page")).toBeInTheDocument();
  });

  it("开发环境 ?view=memo 落到备忘录一级页", () => {
    window.history.pushState({}, "", "/?view=memo");
    render(<DesktopApp />);
    expect(screen.getByText("memo-page")).toBeInTheDocument();
  });

  it("开发环境 ?view=content&tab=memo 兼容重定向到备忘录", () => {
    window.history.pushState({}, "", "/?view=content&tab=memo");
    render(<DesktopApp />);
    expect(screen.getByText("memo-page")).toBeInTheDocument();
  });

  it("开发环境 ?view=voice 落到语音一级页", () => {
    window.history.pushState({}, "", "/?view=voice");
    render(<DesktopApp />);
    expect(screen.getByText("voice-page")).toBeInTheDocument();
    expect(screen.queryByText("settings-page:voice")).toBeNull();
  });

  it("开发环境 ?view=models 兼容映射到语音一级页", () => {
    window.history.pushState({}, "", "/?view=models");
    render(<DesktopApp />);
    expect(screen.getByText("voice-page")).toBeInTheDocument();
  });

  it("开发环境 ?view=words 落到英语角一级页", () => {
    window.history.pushState({}, "", "/?view=words");
    render(<DesktopApp />);
    expect(screen.getByText("words-page")).toBeInTheDocument();
  });

  it("?view=settings&section=voice 不再有效，按设置根页处理", () => {
    window.history.pushState({}, "", "/?view=settings&section=voice");
    render(<DesktopApp />);
    expect(screen.getByText("settings-page:root")).toBeInTheDocument();
    expect(screen.queryByText("settings-page:voice")).toBeNull();
  });
});
