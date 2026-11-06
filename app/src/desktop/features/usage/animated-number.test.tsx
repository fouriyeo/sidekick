import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAnimatedNumber } from "./animated-number";

/**
 * motion 的 reduced-motion 状态在模块加载时初始化一次，
 * 测试里改成可控开关，避免依赖 window.matchMedia 的初始化时机。
 */
const motionFlags = vi.hoisted(() => ({ reduced: false }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => motionFlags.reduced };
});

afterEach(() => {
  cleanup();
  motionFlags.reduced = false;
});

describe("useAnimatedNumber 数值过渡", () => {
  it("首帧直接是最终值，不从 0 数上去", () => {
    const { result } = renderHook(() => useAnimatedNumber(42));
    expect(result.current).toBe(42);
  });

  it("目标值变化后补间到新值", async () => {
    const { result, rerender } = renderHook(({ value }) => useAnimatedNumber(value), {
      initialProps: { value: 0 },
    });
    expect(result.current).toBe(0);

    rerender({ value: 100 });
    // 刚换目标时还在补间中，不应该立刻就是终值。
    expect(result.current).toBeLessThan(100);

    await waitFor(() => expect(result.current).toBe(100));
  });

  it("prefers-reduced-motion 时直接跳变", () => {
    motionFlags.reduced = true;
    const { result, rerender } = renderHook(({ value }) => useAnimatedNumber(value), {
      initialProps: { value: 0 },
    });
    expect(result.current).toBe(0);

    rerender({ value: 100 });
    expect(result.current).toBe(100);
  });
});
