import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipboardSnapshot } from "@/shared/lib/tauri";

const api = vi.hoisted(() => ({
  listClipboard: vi.fn(),
  copyClipboardItem: vi.fn(),
  toggleClipboardPin: vi.fn(),
  deleteClipboardItem: vi.fn(),
  clearClipboard: vi.fn(),
  setClipboardEnabled: vi.fn(),
  subscribeClipboardChanged: vi.fn(() => () => undefined),
  getAccessibilityInfo: vi.fn(),
  requestAccessibility: vi.fn(),
  openAccessibilitySettings: vi.fn(),
  revealAccessibilityApp: vi.fn(),
  getCloudAsrStatus: vi.fn(),
  saveCloudAsr: vi.fn(),
  testCloudAsr: vi.fn(),
  getAsrUsageStats: vi.fn(),
  clearAsrUsage: vi.fn(),
  normalizeError: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));

vi.mock("@/shared/lib/tauri", () => api);

import { useClipboardStore } from "@/desktop/features/clipboard/clipboard-store";
import { useCloudAsrStore } from "@/desktop/features/models/cloud-asr-store";
import type { DesktopNav } from "@/desktop/lib/desktop-nav";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import { SettingsPage } from "./settings-page";

const snapshot: ClipboardSnapshot = {
  enabled: true,
  path: "/tmp/clipboard.json",
  maxItems: 100,
  items: [
    {
      id: "1",
      text: "一段被复制过的文字",
      kind: "text",
      createdAt: 1_800_000_000_000,
      lastUsedAt: 1_800_000_000_000,
      pinned: false,
    },
  ],
};

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

beforeEach(() => {
  useClipboardStore.setState({ snapshot: null, loading: false, error: null });
  useCloudAsrStore.setState({ status: null });
  vi.clearAllMocks();
  api.listClipboard.mockResolvedValue(snapshot);
  api.setClipboardEnabled.mockResolvedValue({ ...snapshot, enabled: false });
  api.clearClipboard.mockResolvedValue({ ...snapshot, items: [] });
  api.getCloudAsrStatus.mockResolvedValue({ configured: false });
});

afterEach(cleanup);

describe("SettingsPage 设置", () => {
  it("设置首页只有一张列表，每项一个短值", async () => {
    render(
      <SettingsPage
        connection={makeConnection()}
        section="root"
        onSectionChange={vi.fn()}
        nav={makeNav()}
      />,
    );

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("记录中 · 1 条")).toBeInTheDocument());

    for (const label of [
      "外观",
      "自动输入",
      "手机连接",
      "语音输入",
      "AI 联动",
      "剪贴板",
      "关于本机",
      "消息通道",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("192.168.1.23:47810")).toBeInTheDocument();
  });

  it("点「手机连接」进二级页，返回回到设置", () => {
    const onSectionChange = vi.fn();
    render(
      <SettingsPage
        connection={makeConnection()}
        section="root"
        onSectionChange={onSectionChange}
        nav={makeNav()}
      />,
    );

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

  it("剪贴板二级页可以暂停记录与清空", async () => {
    render(
      <SettingsPage
        connection={makeConnection()}
        section="clipboard"
        onSectionChange={vi.fn()}
        nav={makeNav()}
      />,
    );

    await waitFor(() => expect(screen.getByText("1 / 100 条")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("switch", { name: /记录剪贴板/ }));
    expect(api.setClipboardEnabled).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "清空历史" }));
    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    expect(api.clearClipboard).toHaveBeenCalled();
  });
});
