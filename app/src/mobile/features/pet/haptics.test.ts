import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  haptic: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  haptic: tauri.haptic,
}));

import { createHaptics } from "./haptics";

beforeEach(() => {
  tauri.haptic.mockReset();
  tauri.haptic.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createHaptics", () => {
  it("四种语义各自调用原生命令", () => {
    const haptics = createHaptics();

    haptics.light();
    haptics.medium();
    haptics.success();
    haptics.error();

    expect(tauri.haptic.mock.calls.map(([style]) => style)).toEqual([
      "light",
      "medium",
      "success",
      "error",
    ]);
  });

  it("enabled 返回 false 时不触发", () => {
    const haptics = createHaptics({ enabled: () => false });

    haptics.light();
    haptics.medium();

    expect(tauri.haptic).not.toHaveBeenCalled();
  });

  it("原生命令不可用时退回 Web Vibration API，且不抛错", async () => {
    tauri.haptic.mockRejectedValue(new Error("unsupported"));
    const vibrate = vi.fn(() => true);

    const haptics = createHaptics({ vibrate });
    haptics.light();

    await Promise.resolve();
    expect(vibrate).toHaveBeenCalledWith(10);
  });
});
