import { describe, expect, it } from "vitest";
import { SPRING_POP, SPRING_SLIDE } from "./motion";

type Spring = { stiffness: number; damping: number; mass: number };

/** 阻尼比 ζ = c / (2·√(k·m))。 */
function dampingRatio({ stiffness, damping, mass }: Spring) {
  return damping / (2 * Math.sqrt(stiffness * mass));
}

/** 阶跃响应的首次过冲：e^(−πζ / √(1−ζ²))。 */
function overshoot(spring: Spring) {
  const ratio = dampingRatio(spring);
  return Math.exp((-Math.PI * ratio) / Math.sqrt(1 - ratio * ratio));
}

describe("桌面弹簧令牌（D89）", () => {
  it("滑块 spring 落在 8%–13% 过冲区间（ζ 0.55–0.7），一眼能看出回弹但不来回震荡", () => {
    const ratio = dampingRatio(SPRING_SLIDE);
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.7);
    expect(overshoot(SPRING_SLIDE)).toBeGreaterThan(0.08);
    expect(overshoot(SPRING_SLIDE)).toBeLessThan(0.13);
  });

  it("图标 pop 比滑块更弹，但仍在可辨识的轻快区间（不超过 13%）", () => {
    expect(dampingRatio(SPRING_POP)).toBeLessThan(dampingRatio(SPRING_SLIDE));
    expect(overshoot(SPRING_POP)).toBeGreaterThan(0.1);
    expect(overshoot(SPRING_POP)).toBeLessThan(0.13);
  });
});
