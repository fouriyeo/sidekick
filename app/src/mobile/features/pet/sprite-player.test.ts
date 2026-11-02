import { describe, expect, it } from "vitest";
import { advanceFrames, fitCellSize } from "./sprite-player";

const frames16 = Array.from({ length: 16 }, (_, col) => ({ col, duration: 100 }));

describe("advanceFrames", () => {
  it("按累计时间找到帧号（循环）", () => {
    expect(advanceFrames(frames16, 0, "loop").index).toBe(0);
    expect(advanceFrames(frames16, 99, "loop").index).toBe(0);
    expect(advanceFrames(frames16, 100, "loop").index).toBe(1);
    expect(advanceFrames(frames16, 1599, "loop").index).toBe(15);
    expect(advanceFrames(frames16, 1600, "loop").index).toBe(0);
    expect(advanceFrames(frames16, 1650, "loop").index).toBe(0);
  });

  it("once 播完停在最后一帧", () => {
    expect(advanceFrames(frames16, 1500, "once").index).toBe(15);
    expect(advanceFrames(frames16, 1600, "once").index).toBe(15);
    expect(advanceFrames(frames16, 99999, "once").index).toBe(15);
    expect(advanceFrames(frames16, 99999, "once").elapsedInFrame).toBe(100);
  });

  it("支持不规则帧时长（如 done 末帧定格 1.5s）", () => {
    const frames = [
      { col: 0, duration: 100 },
      { col: 1, duration: 100 },
      { col: 2, duration: 1500 },
    ];
    expect(advanceFrames(frames, 0, "once").index).toBe(0);
    expect(advanceFrames(frames, 150, "once").index).toBe(1);
    expect(advanceFrames(frames, 200, "once").index).toBe(2);
    expect(advanceFrames(frames, 1699, "once").index).toBe(2);
    expect(advanceFrames(frames, 1700, "once").index).toBe(2);
    expect(advanceFrames(frames, 1700, "loop").index).toBe(0);
  });

  it("空帧防御", () => {
    expect(advanceFrames([], 500, "loop")).toEqual({ index: 0, elapsedInFrame: 0 });
  });
});

describe("fitCellSize", () => {
  it("取容器较短边做方形格子，防止露出相邻行/列", () => {
    expect(fitCellSize(316, 512, 256)).toBe(316);
    expect(fitCellSize(512, 316, 256)).toBe(316);
    expect(fitCellSize(300, 300, 256)).toBe(300);
  });

  it("容器尺寸未知时回落到 manifest.cell", () => {
    expect(fitCellSize(0, 0, 256)).toBe(256);
    expect(fitCellSize(Number.NaN, 400, 256)).toBe(256);
    expect(fitCellSize(-10, 400, 256)).toBe(256);
  });
});
