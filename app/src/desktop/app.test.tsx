import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/desktop/pages/overview-page", () => ({
  OverviewPage: () => <div>overview-page</div>,
}));
vi.mock("@/desktop/pages/sessions-page", () => ({
  SessionsPage: () => <div>sessions-page</div>,
}));
vi.mock("@/desktop/pages/content-page", () => ({
  ContentPage: () => <div>content-page</div>,
}));
vi.mock("@/desktop/pages/usage-page", () => ({
  UsagePage: () => <div>usage-page</div>,
}));
vi.mock("@/desktop/pages/system-page", () => ({
  SystemPage: ({ section }: { section: string }) => <div>system-page:{section}</div>,
}));
vi.mock("@/desktop/pages/settings-page", () => ({
  SettingsPage: () => <div>settings-page</div>,
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
vi.mock("./use-desktop-connection", () => ({
  useDesktopConnection: () => ({
    status: "connected",
    info: null,
    error: null,
    sendText: vi.fn(),
    cancelMic: vi.fn(),
    requestStatus: vi.fn(),
    requestFocus: vi.fn(),
    retry: vi.fn(),
  }),
}));

import { DesktopApp } from "./app";

beforeEach(() => {
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
});

function pressShortcut(key: string) {
  fireEvent.keyDown(window, { key, metaKey: true });
}

describe("DesktopApp 指挥舱外壳", () => {
  it("默认总览，一级导航 6 项", () => {
    render(<DesktopApp />);

    expect(screen.getByText("overview-page")).toBeInTheDocument();
    for (const label of ["总览", "会话", "内容", "用量", "系统", "设置"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}（`) })).toBeInTheDocument();
    }
    expect(screen.queryByText("sessions-page")).toBeNull();
    expect(screen.queryByText("content-page")).toBeNull();
  });

  it("点击导航切换总览 / 会话 / 内容 / 用量 / 系统 / 设置", () => {
    render(<DesktopApp />);

    fireEvent.click(screen.getByRole("button", { name: /^会话（/ }));
    expect(screen.getByText("sessions-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^内容（/ }));
    expect(screen.getByText("content-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^用量（/ }));
    expect(screen.getByText("usage-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^系统（/ }));
    expect(screen.getByText("system-page:connection")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^设置（/ }));
    expect(screen.getByText("settings-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^总览（/ }));
    expect(screen.getByText("overview-page")).toBeInTheDocument();
  });

  it("⌘1–⌘6 切换一级页", () => {
    render(<DesktopApp />);

    pressShortcut("2");
    expect(screen.getByText("sessions-page")).toBeInTheDocument();

    pressShortcut("3");
    expect(screen.getByText("content-page")).toBeInTheDocument();

    pressShortcut("4");
    expect(screen.getByText("usage-page")).toBeInTheDocument();

    pressShortcut("5");
    expect(screen.getByText("system-page:connection")).toBeInTheDocument();

    pressShortcut("6");
    expect(screen.getByText("settings-page")).toBeInTheDocument();

    pressShortcut("1");
    expect(screen.getByText("overview-page")).toBeInTheDocument();
  });

  it("输入框里不劫持 ⌘数字", () => {
    render(<DesktopApp />);
    const input = document.createElement("input");
    document.body.appendChild(input);

    fireEvent.keyDown(input, { key: "2", metaKey: true });

    expect(screen.getByText("overview-page")).toBeInTheDocument();
    input.remove();
  });

  it("状态条三段可点：服务/手机 → 系统 › 连接，AI → 会话", () => {
    render(<DesktopApp />);

    fireEvent.click(screen.getByRole("button", { name: /^服务状态/ }));
    expect(screen.getByText("system-page:connection")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^AI 状态/ }));
    expect(screen.getByText("sessions-page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^手机连接/ }));
    expect(screen.getByText("system-page:connection")).toBeInTheDocument();
  });

  it("开发环境 ?view=models 映射到「系统 › 语音」", () => {
    window.history.pushState({}, "", "/?view=models");
    render(<DesktopApp />);
    expect(screen.getByText("system-page:voice")).toBeInTheDocument();
  });
});
