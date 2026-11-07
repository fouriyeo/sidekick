import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/desktop/pages/overview-page", () => ({
  OverviewPage: () => <div>overview-page</div>,
}));
vi.mock("@/desktop/pages/content-page", () => ({
  ContentPage: () => <div>content-page</div>,
}));
vi.mock("@/desktop/pages/usage-page", () => ({
  UsagePage: () => <div>usage-page</div>,
}));
vi.mock("@/desktop/pages/voice-page", () => ({
  VoicePage: () => <div>voice-page</div>,
}));
vi.mock("@/desktop/pages/settings-page", () => ({
  SettingsPage: ({ section }: { section: string }) => <div>settings-page:{section}</div>,
}));
vi.mock("@/desktop/features/settings/components/accessibility-hint", () => ({
  AccessibilityHint: () => null,
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
vi.mock("./use-desktop-connection", () => ({
  useDesktopConnection: () => ({
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
  }),
}));

import { useDesktopClientsStore } from "@/desktop/lib/desktop-clients-store";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import { DesktopApp } from "./app";

beforeEach(() => {
  window.history.pushState({}, "", "/");
  useDesktopClientsStore.getState().reset();
  useDesktopStatusStore.getState().reset();
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

function pressShortcut(key: string) {
  fireEvent.keyDown(window, { key, metaKey: true });
}

describe("DesktopApp 简约 iOS 外壳（语音升为一级页）", () => {
  it("默认概览，侧栏 4 个入口（语音在用量下）+ 底部设置 + 三行状态摘要", () => {
    useDesktopClientsStore.setState({ clients: 2 });

    render(<DesktopApp />);

    expect(screen.getByText("overview-page")).toBeInTheDocument();
    // 侧栏上半顺序：概览 / 内容 / 用量 / 语音；设置固定底部。
    const nav = screen.getByRole("navigation", { name: "主导航" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((node) => node.textContent?.trim()),
    ).toEqual(["概览", "内容", "用量", "语音"]);
    for (const label of ["概览", "内容", "用量", "语音", "设置"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText("服务")).toBeInTheDocument();
    expect(screen.getByText("手机")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText("1 台")).toBeInTheDocument();
  });

  it("点击侧栏切换 5 个一级页", () => {
    render(<DesktopApp />);

    fireEvent.click(screen.getByRole("button", { name: "内容" }));
    expect(screen.getByText("content-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "用量" }));
    expect(screen.getByText("usage-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "语音" }));
    expect(screen.getByText("voice-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByText("settings-page:root")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "概览" }));
    expect(screen.getByText("overview-page")).toBeInTheDocument();
  });

  it("⌘1–⌘5 切换一级页，⌘6 无动作", () => {
    render(<DesktopApp />);

    pressShortcut("2");
    expect(screen.getByText("content-page")).toBeInTheDocument();

    pressShortcut("3");
    expect(screen.getByText("usage-page")).toBeInTheDocument();

    pressShortcut("4");
    expect(screen.getByText("voice-page")).toBeInTheDocument();

    pressShortcut("5");
    expect(screen.getByText("settings-page:root")).toBeInTheDocument();

    pressShortcut("1");
    expect(screen.getByText("overview-page")).toBeInTheDocument();

    // 一级只有 5 个视图，⌘6 不改变当前页。
    pressShortcut("6");
    expect(screen.getByText("overview-page")).toBeInTheDocument();
  });

  it("输入框里不劫持 ⌘数字", () => {
    render(<DesktopApp />);
    const input = document.createElement("input");
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: "4", metaKey: true });

    expect(screen.getByText("overview-page")).toBeInTheDocument();
    input.remove();
  });

  it("侧栏状态行进入设置的对应二级页", () => {
    render(<DesktopApp />);

    fireEvent.click(screen.getByRole("button", { name: /^服务/ }));
    expect(screen.getByText("settings-page:connection")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^AI/ }));
    expect(screen.getByText("settings-page:hook")).toBeInTheDocument();
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

  it("?view=settings&section=voice 不再有效，按设置根页处理", () => {
    window.history.pushState({}, "", "/?view=settings&section=voice");
    render(<DesktopApp />);
    expect(screen.getByText("settings-page:root")).toBeInTheDocument();
    expect(screen.queryByText("settings-page:voice")).toBeNull();
  });
});
