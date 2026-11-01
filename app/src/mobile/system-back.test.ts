import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearBackHandlers, handleBack, pushBackHandler } from "./system-back";

beforeEach(() => {
  clearBackHandlers();
});

describe("system-back 返回栈", () => {
  it("后压入的处理函数优先，退订后回落到下一层", () => {
    const order: string[] = [];
    const removeFirst = pushBackHandler(() => {
      order.push("first");
      return true;
    });
    const removeSecond = pushBackHandler(() => {
      order.push("second");
      return true;
    });

    expect(handleBack()).toBe(true);
    expect(order).toEqual(["second"]);

    removeSecond();
    expect(handleBack()).toBe(true);
    expect(order).toEqual(["second", "first"]);

    removeFirst();
    expect(handleBack()).toBe(false);
  });

  it("没人消费时返回 false，交给根页面", () => {
    const remove = pushBackHandler(() => false);

    expect(handleBack()).toBe(false);

    remove();
    expect(handleBack()).toBe(false);
  });

  it("重复退订不会误删其他人", () => {
    const handler = vi.fn(() => true);
    const remove = pushBackHandler(handler);

    remove();
    remove();

    expect(handleBack()).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
