import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  setKeepScreenOn: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  setKeepScreenOn: tauri.setKeepScreenOn,
}));

import { useKeepAwake } from "./use-keep-awake";

beforeEach(() => {
  vi.useFakeTimers();
  tauri.setKeepScreenOn.mockReset();
  tauri.setKeepScreenOn.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useKeepAwake", () => {
  it("宠物页可见时请求常亮，离开或卸载时释放", () => {
    const { rerender, unmount } = renderHook(({ active }) => useKeepAwake(active), {
      initialProps: { active: true },
    });

    expect(tauri.setKeepScreenOn).toHaveBeenCalledTimes(1);
    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(true);

    rerender({ active: false });
    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(false);

    rerender({ active: true });
    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(true);

    unmount();
    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(false);
  });

  it("同值重复渲染不重复调用原生命令", () => {
    const { rerender } = renderHook(({ active }) => useKeepAwake(active), {
      initialProps: { active: true },
    });

    rerender({ active: true });
    rerender({ active: true });

    expect(tauri.setKeepScreenOn).toHaveBeenCalledTimes(1);
  });

  it("超过最长常亮时长后释放，让系统按默认策略熄屏", () => {
    renderHook(() => useKeepAwake(true, 2_000));

    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(true);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(false);
  });

  it("常亮时长设为 null 时不自动释放", () => {
    renderHook(() => useKeepAwake(true, null));

    act(() => {
      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    });

    expect(tauri.setKeepScreenOn).toHaveBeenCalledTimes(1);
    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(true);
  });

  it("原生命令失败时静默降级，不抛出", async () => {
    tauri.setKeepScreenOn.mockRejectedValue(new Error("unsupported"));

    const { unmount } = renderHook(() => useKeepAwake(true));
    unmount();

    await Promise.resolve();
    expect(tauri.setKeepScreenOn).toHaveBeenCalled();
  });
});
