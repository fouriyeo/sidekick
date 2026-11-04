import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  normalizeError: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));

vi.mock("@/shared/lib/tauri", () => api);

import { useClipboardStore } from "@/desktop/features/clipboard/clipboard-store";
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

beforeEach(() => {
  useClipboardStore.setState({ snapshot: null, loading: false, error: null });
  vi.clearAllMocks();
  api.listClipboard.mockResolvedValue(snapshot);
  api.setClipboardEnabled.mockResolvedValue({ ...snapshot, enabled: false });
  api.clearClipboard.mockResolvedValue({ ...snapshot, items: [] });
  api.getAccessibilityInfo.mockResolvedValue({
    trusted: false,
    appName: "Sidekick",
    executablePath: "/Applications/Sidekick.app",
    isDev: true,
  });
  api.requestAccessibility.mockResolvedValue({
    trusted: true,
    appName: "Sidekick",
    executablePath: "/Applications/Sidekick.app",
    isDev: true,
  });
  api.openAccessibilitySettings.mockResolvedValue(undefined);
  api.revealAccessibilityApp.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("SettingsPage", () => {
  it("五组设置齐全，外观三选一，且不做桌面音效试听", async () => {
    render(<SettingsPage />);

    expect(screen.getByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "外观" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "自动输入权限" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "剪贴板历史" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "关于与隐私" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "快捷键" })).toBeInTheDocument();

    for (const label of ["跟随系统", "浅色", "深色"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByText(/音效/)).toBeNull();

    // 自动输入权限状态来自 AccessibilityCard（未授权 → 只会复制）。
    expect(await screen.findByText("未授权，只会复制")).toBeInTheDocument();
  });

  it("剪贴板可暂停与清空（清空需二次确认）", async () => {
    render(<SettingsPage />);
    await waitFor(() => expect(api.listClipboard).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    await waitFor(() => expect(api.setClipboardEnabled).toHaveBeenCalledWith(false));

    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "清空" }));

    await waitFor(() => expect(api.clearClipboard).toHaveBeenCalledTimes(1));
  });

  it("隐私说明是弹层，不占页面主区", async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "隐私说明" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("数据只在本机")).toBeInTheDocument();
    expect(within(dialog).getByText(/阿里云百炼/)).toBeInTheDocument();
  });

  it("快捷键列出一级导航的 ⌘1–⌘5", () => {
    render(<SettingsPage />);

    for (const key of ["⌘1", "⌘2", "⌘3", "⌘4", "⌘5"]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
  });
});
