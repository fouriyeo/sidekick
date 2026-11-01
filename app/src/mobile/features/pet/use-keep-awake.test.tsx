import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  setKeepScreenOn: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  setKeepScreenOn: tauri.setKeepScreenOn,
}));

import { useKeepAwake } from "./use-keep-awake";

beforeEach(() => {
  tauri.setKeepScreenOn.mockReset();
  tauri.setKeepScreenOn.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
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

  it("原生命令失败时静默降级，不抛出", async () => {
    tauri.setKeepScreenOn.mockRejectedValue(new Error("unsupported"));

    const { unmount } = renderHook(() => useKeepAwake(true));
    unmount();

    await Promise.resolve();
    expect(tauri.setKeepScreenOn).toHaveBeenCalled();
  });
});
