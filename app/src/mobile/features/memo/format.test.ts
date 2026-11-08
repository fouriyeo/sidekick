import { describe, expect, it } from "vitest";
import { formatBytes, formatClock, formatDuration, groupByDay, isToday } from "./format";

describe("备忘录格式化", () => {
  it("时长", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(7_400)).toBe("0:07");
    expect(formatDuration(222_000)).toBe("3:42");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
  });

  it("字节", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(12_000)).toBe("12 KB");
    expect(formatBytes(12.3 * 1024 * 1024)).toBe("12 MB");
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("时钟用本机时区", () => {
    const date = new Date(2026, 0, 2, 14, 5, 0);
    expect(formatClock(date.getTime())).toBe("14:05");
  });

  it("今天/更早分组", () => {
    const now = new Date(2026, 0, 2, 12, 0, 0).getTime();
    const today = new Date(2026, 0, 2, 9, 0, 0).getTime();
    const yesterday = new Date(2026, 0, 1, 23, 0, 0).getTime();
    expect(isToday(today, now)).toBe(true);
    expect(isToday(yesterday, now)).toBe(false);
    const groups = groupByDay([{ createdAt: yesterday }, { createdAt: today }], now);
    expect(groups.today).toHaveLength(1);
    expect(groups.earlier).toHaveLength(1);
  });
});
