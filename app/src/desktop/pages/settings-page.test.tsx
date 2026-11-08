import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getAccessibilityInfo: vi.fn(),
  requestAccessibility: vi.fn(),
  openAccessibilitySettings: vi.fn(),
  revealAccessibilityApp: vi.fn(),
  normalizeError: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));

vi.mock("@/shared/lib/tauri", () => api);

import { type DesktopNav, initialRoute } from "@/desktop/lib/desktop-nav";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import { SettingsPage } from "./settings-page";

function makeConnection(): DesktopConnection {
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
  };
}

function makeNav(): DesktopNav {
  return { go: vi.fn(), goSettings: vi.fn() };
}

async function renderRoot(onSectionChange = vi.fn()) {
  render(
    <SettingsPage
      connection={makeConnection()}
      section="root"
      onSectionChange={onSectionChange}
      nav={makeNav()}
    />,
  );
  await waitFor(() => expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument());
  return onSectionChange;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("SettingsPage 设置", () => {
  it("设置首页只有一张列表，每项一个短值", async () => {
    await renderRoot();

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();

    for (const label of ["外观", "自动输入", "手机连接", "AI 联动", "关于本机", "消息通道"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // 语音是第 4 个一级页（D104），剪贴板是 ⌘2 一级页（D119）：设置里都没有入口。
    expect(screen.queryByText("语音输入")).toBeNull();
    expect(screen.queryByText("剪贴板")).toBeNull();
    expect(screen.getByText("192.168.1.23:47810")).toBeInTheDocument();
  });

  it("「功能」组只剩手机连接 / AI 联动", async () => {
    await renderRoot();

    const texts = screen.getAllByRole("button").map((node) => node.textContent ?? "");
    const order = ["手机连接", "AI 联动"].map((title) =>
      texts.findIndex((text) => text.startsWith(title)),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((left, right) => left - right));
  });

  it("点「手机连接」进二级页，返回回到设置", async () => {
    const onSectionChange = await renderRoot();

    fireEvent.click(screen.getByRole("button", { name: /手机连接/ }));
    expect(onSectionChange).toHaveBeenCalledWith("connection");
  });

  it("二级页有大标题和返回", () => {
    const onSectionChange = vi.fn();
    render(
      <SettingsPage
        connection={makeConnection()}
        section="about"
        onSectionChange={onSectionChange}
        nav={makeNav()}
      />,
    );

    expect(screen.getByRole("heading", { name: "关于本机" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /设置/ }));
    expect(onSectionChange).toHaveBeenCalledWith("root");
  });

  it("旧的「设置 › 剪贴板」链接落到设置首页，剪贴板链接落到 ⌘2 页（D119）", () => {
    window.history.pushState({}, "", "/?view=settings&section=clipboard");
    expect(initialRoute()).toEqual({ view: "settings", section: "root" });

    window.history.pushState({}, "", "/?view=clipboard");
    expect(initialRoute()).toEqual({ view: "content", section: "root" });

    window.history.pushState({}, "", "/");
  });
});
