import { describe, expect, it } from "vitest";
import { resolveSwipeOpen, SWIPE_ACTION_WIDTH } from "./use-swipe-row";

describe("resolveSwipeOpen", () => {
  it("位移超过 40% 展开", () => {
    expect(resolveSwipeOpen({ offset: -29, velocity: 0 })).toBe(true);
  });

  it("位移不足且没有快速滑动时回弹", () => {
    expect(resolveSwipeOpen({ offset: -20, velocity: 0 })).toBe(false);
  });

  it("快速左滑即使位移不大也展开", () => {
    expect(resolveSwipeOpen({ offset: -20, velocity: -0.5 })).toBe(true);
  });

  it("快速右滑不展开", () => {
    expect(resolveSwipeOpen({ offset: -20, velocity: 0.5 })).toBe(false);
  });

  it("已展开时轻微左拖保持展开", () => {
    expect(resolveSwipeOpen({ offset: -SWIPE_ACTION_WIDTH, velocity: 0 })).toBe(true);
  });

  it("已展开时右拖过阈值收起", () => {
    expect(resolveSwipeOpen({ offset: -10, velocity: 0 })).toBe(false);
  });

  it("位移为 0 时不展开", () => {
    expect(resolveSwipeOpen({ offset: 0, velocity: -1 })).toBe(false);
  });
});
