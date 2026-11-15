import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => {
  const state: { tested: (() => void) | null } = { tested: null };
  return {
    state,
    hotkeyStatus: vi.fn(async () => ({
      enabled: true,
      mode: "toggle",
      label: "按一下 右 Command",
      binding: { kind: "bare", key: "rightCommand" },
      trusted: true,
      listening: true,
      platform: "macos",
      hint: null,
    })),
    hotkeySave: vi.fn(),
    hotkeyTestArm: vi.fn(async () => undefined),
    hotkeyTestDisarm: vi.fn(async () => undefined),
    subscribeHotkeyChanged: () => () => {},
    subscribeHotkeyTested: (handler: () => void) => {
      state.tested = handler;
      return () => {
        state.tested = null;
      };
    },
    requestAccessibility: vi.fn(async () => ({ trusted: true })),
    openAccessibilitySettings: vi.fn(async () => undefined),
    normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  };
});

vi.mock("@/shared/lib/tauri", () => tauri);

import { HotkeyCard } from "./hotkey-card";
import { useHotkeyStore } from "./hotkey-store";

beforeEach(() => {
  useHotkeyStore.setState({ status: null, loading: false, saving: false, error: null });
  vi.resetAllMocks();
  tauri.hotkeyStatus.mockResolvedValue({
    enabled: true,
    mode: "toggle",
    label: "按一下 右 Command",
    binding: { kind: "bare", key: "rightCommand" },
    trusted: true,
    listening: true,
    platform: "macos",
    hint: null,
  });
  tauri.hotkeyTestArm.mockResolvedValue(undefined);
  tauri.hotkeyTestDisarm.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  useHotkeyStore.setState({ status: null, loading: false, saving: false, error: null });
});

describe("HotkeyCard 测试键位", () => {
  it("只检测按键，不启动录音；收到事件后给出明确结果", async () => {
    render(<HotkeyCard />);

    const button = await screen.findByRole("button", { name: "开始测试" });
    fireEvent.click(button);

    await waitFor(() => expect(tauri.hotkeyTestArm).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/现在按一下 右 Command/)).toBeInTheDocument();
    expect(screen.getAllByText(/不会录音/).length).toBeGreaterThan(0);

    act(() => tauri.state.tested?.());

    expect(await screen.findByText(/电脑已收到按键/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再测一次" })).toBeInTheDocument();
  });

  it("快捷键关闭时不能测试", async () => {
    tauri.hotkeyStatus.mockResolvedValueOnce({
      enabled: false,
      mode: "toggle",
      label: "按一下 右 Command",
      binding: { kind: "bare", key: "rightCommand" },
      trusted: true,
      listening: true,
      platform: "macos",
      hint: null,
    });
    render(<HotkeyCard />);

    expect(await screen.findByRole("button", { name: "开始测试" })).toBeDisabled();
  });
});
