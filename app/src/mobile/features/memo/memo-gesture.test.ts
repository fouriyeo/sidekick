import { describe, expect, it } from "vitest";
import {
  cancelArmedAfter,
  releaseIntent,
  shouldDiscardShort,
  shouldIgnoreClick,
  TAP_MAX_MS,
} from "./memo-gesture";

describe("releaseIntent", () => {
  it("轻点锁定、按住保存", () => {
    expect(releaseIntent({ heldMs: 120, cancelArmed: false, locked: false })).toBe("lock");
    expect(releaseIntent({ heldMs: TAP_MAX_MS - 1, cancelArmed: false, locked: false })).toBe(
      "lock",
    );
    expect(releaseIntent({ heldMs: TAP_MAX_MS, cancelArmed: false, locked: false })).toBe("save");
    expect(releaseIntent({ heldMs: 1500, cancelArmed: false, locked: false })).toBe("save");
  });

  it("取消区优先，锁定态松手即保存", () => {
    expect(releaseIntent({ heldMs: 1500, cancelArmed: true, locked: false })).toBe("cancel");
    expect(releaseIntent({ heldMs: 120, cancelArmed: true, locked: false })).toBe("cancel");
    expect(releaseIntent({ heldMs: 120, cancelArmed: false, locked: true })).toBe("save");
  });
});

describe("cancelArmedAfter（80 进入 / 32 退出，带滞回）", () => {
  it("上滑超过 80 进入取消区", () => {
    expect(cancelArmedAfter(-79, false)).toBe(false);
    expect(cancelArmedAfter(-80, false)).toBe(true);
    expect(cancelArmedAfter(-140, false)).toBe(true);
  });

  it("进入后回到 32 以内才退出，中间保持", () => {
    expect(cancelArmedAfter(-70, true)).toBe(true);
    expect(cancelArmedAfter(-33, true)).toBe(true);
    expect(cancelArmedAfter(-31, true)).toBe(false);
    expect(cancelArmedAfter(0, true)).toBe(false);
  });

  it("向下移动不会进入取消区", () => {
    expect(cancelArmedAfter(120, false)).toBe(false);
    expect(cancelArmedAfter(40, true)).toBe(false);
  });
});

describe("shouldIgnoreClick", () => {
  it("pointerup 后 600ms 内的合成 click 忽略", () => {
    const upAt = 1000;
    expect(shouldIgnoreClick(upAt, upAt + 10)).toBe(true);
    expect(shouldIgnoreClick(upAt, upAt + 599)).toBe(true);
    expect(shouldIgnoreClick(upAt, upAt + 600)).toBe(false);
    expect(shouldIgnoreClick(0, 5000)).toBe(false);
  });
});

describe("shouldDiscardShort", () => {
  it("太短且没有声音才丢弃", () => {
    expect(shouldDiscardShort(300, 0)).toBe(true);
    expect(shouldDiscardShort(599, 0.01)).toBe(true);
    expect(shouldDiscardShort(600, 0)).toBe(false);
    expect(shouldDiscardShort(300, 0.2)).toBe(false);
  });
});
