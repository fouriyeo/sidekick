import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKey,
  formatDayTitle,
  fullMonthLabel,
  groupByDay,
  isSameDay,
  monthLabel,
  monthMatrix,
  parseDayKey,
  startOfWeek,
  weekDays,
  weekdayLabel,
  weekRangeLabel,
} from "./calendar";

describe("dayKey / parseDayKey", () => {
  it("按本机时区取日，不用 UTC", () => {
    expect(dayKey(new Date(2026, 10, 8, 23, 59))).toBe("2026-11-08");
    expect(dayKey(new Date(2026, 10, 9, 0, 1))).toBe("2026-11-09");
    expect(dayKey(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("解析回同一天", () => {
    const date = parseDayKey("2026-11-08");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(10);
    expect(date.getDate()).toBe(8);
    expect(isSameDay(date, new Date(2026, 10, 8, 18, 30))).toBe(true);
  });

  it("坏输入回退到今天而不是崩溃", () => {
    expect(() => parseDayKey("")).not.toThrow();
  });
});

describe("addDays / 周", () => {
  it("跨月、跨年、闰年都正确", () => {
    expect(dayKey(addDays(new Date(2026, 10, 30), 1))).toBe("2026-12-01");
    expect(dayKey(addDays(new Date(2026, 11, 31), 1))).toBe("2027-01-01");
    expect(dayKey(addDays(new Date(2028, 1, 28), 1))).toBe("2028-02-29");
    expect(dayKey(addDays(new Date(2026, 2, 1), -1))).toBe("2026-02-28");
  });

  it("周一开头", () => {
    const sunday = new Date(2026, 10, 8); // 2026-11-08 是周日
    expect(dayKey(startOfWeek(sunday))).toBe("2026-11-02");
    const monday = new Date(2026, 10, 2);
    expect(dayKey(startOfWeek(monday))).toBe("2026-11-02");
  });

  it("一周 7 天、从周一到周日", () => {
    const days = weekDays(new Date(2026, 10, 8));
    expect(days).toHaveLength(7);
    expect(days.map((day) => dayKey(day))).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    expect(weekdayLabel(days[0] ?? new Date())).toBe("周一");
    expect(weekdayLabel(days[6] ?? new Date())).toBe("周日");
  });
});

describe("monthMatrix", () => {
  it("固定 42 格，周一起始，11 月 1 日落在第 7 格", () => {
    const cells = monthMatrix(2026, 10); // 2026-11
    expect(cells).toHaveLength(42);
    expect(cells[0]?.key).toBe("2026-10-26");
    expect(cells[6]?.key).toBe("2026-11-01");
    expect(cells[6]?.inMonth).toBe(true);
    expect(cells[0]?.inMonth).toBe(false);
    expect(cells[35]?.key).toBe("2026-11-30");
    expect(cells[36]?.inMonth).toBe(false);
  });

  it("6 周月份也保持 42 格", () => {
    const cells = monthMatrix(2026, 7); // 2026-08-01 是周六
    expect(cells).toHaveLength(42);
    const inMonth = cells.filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(cells[0]?.key).toBe("2026-07-27");
  });

  it("5 周月份最后一行留空（inMonth=false），高度不跳", () => {
    const cells = monthMatrix(2026, 1); // 2026-02-01 是周日
    expect(cells).toHaveLength(42);
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(28);
    expect(cells[41]?.inMonth).toBe(false);
  });

  it("闰年 2 月 29 天", () => {
    const cells = monthMatrix(2028, 1);
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(29);
  });

  it("跨年 12 → 1 月边界", () => {
    const cells = monthMatrix(2026, 11);
    expect(cells[0]?.key).toBe("2026-11-30");
    const january = monthMatrix(2027, 0);
    expect(january.some((cell) => cell.key === "2027-01-01")).toBe(true);
  });
});

describe("文案", () => {
  it("日标题", () => {
    expect(formatDayTitle("2026-11-08")).toBe("11 月 8 日 · 周日");
  });

  it("月份标题按当年省略年", () => {
    const now = new Date(2026, 10, 8);
    expect(monthLabel(2026, 10, now)).toBe("11 月");
    expect(monthLabel(2025, 10, now)).toBe("2025 年 11 月");
    expect(fullMonthLabel(2026, 10)).toBe("2026 年 11 月");
  });

  it("周范围跨月带月份", () => {
    expect(weekRangeLabel(weekDays(new Date(2026, 10, 8)))).toBe("11 月 2 日 – 8 日");
    expect(weekRangeLabel(weekDays(new Date(2026, 10, 1)))).toBe("10 月 26 日 – 11 月 1 日");
  });
});

describe("groupByDay", () => {
  it("按本地日聚合且保持顺序", () => {
    const items = [
      { id: "a", createdAt: new Date(2026, 10, 8, 23, 59).getTime() },
      { id: "b", createdAt: new Date(2026, 10, 8, 9, 0).getTime() },
      { id: "c", createdAt: new Date(2026, 10, 7, 12, 0).getTime() },
    ];
    const groups = groupByDay(items);
    expect([...groups.keys()]).toEqual(["2026-11-08", "2026-11-07"]);
    expect(groups.get("2026-11-08")?.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groups.get("2026-11-07")?.map((item) => item.id)).toEqual(["c"]);
  });
});
