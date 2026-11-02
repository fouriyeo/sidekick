import { describe, expect, it } from "vitest";
import { formatAudioDuration, formatCnyMicros, formatDayLabel, formatTokens } from "./format";

describe("formatCnyMicros", () => {
  it("零显示 ¥0.00", () => {
    expect(formatCnyMicros(0)).toBe("¥0.00");
    expect(formatCnyMicros(-1)).toBe("¥0.00");
    expect(formatCnyMicros(Number.NaN)).toBe("¥0.00");
  });

  it("不足 1 分显示 4 位小数", () => {
    expect(formatCnyMicros(1)).toBe("¥0.0000");
    expect(formatCnyMicros(5_000)).toBe("¥0.0050");
    expect(formatCnyMicros(9_999)).toBe("¥0.0100");
  });

  it("1 分及以上显示 2 位小数", () => {
    expect(formatCnyMicros(10_000)).toBe("¥0.01");
    expect(formatCnyMicros(1_234_567)).toBe("¥1.23");
    expect(formatCnyMicros(6_000_000)).toBe("¥6.00");
  });
});

describe("formatTokens / formatAudioDuration / formatDayLabel", () => {
  it("千分位与边界", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1_234_567)).toBe("1,234,567");
    expect(formatTokens(-10)).toBe("0");
  });

  it("音频时长", () => {
    expect(formatAudioDuration(0)).toBe("0s");
    expect(formatAudioDuration(59_999)).toBe("59s");
    expect(formatAudioDuration(65_000)).toBe("1m 05s");
    expect(formatAudioDuration(-5)).toBe("0s");
  });

  it("日期只显示 MM-DD", () => {
    expect(formatDayLabel("2026-11-02")).toBe("11-02");
    expect(formatDayLabel("bad")).toBe("bad");
  });
});
