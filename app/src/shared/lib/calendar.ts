/**
 * 两端共用的「按天」日期数学（D124）。
 *
 * 统一口径：
 * - 一天 = 本机时区的 YYYY-MM-DD（不用 `toISOString`，避免 UTC 偏移把深夜算到前一天）；
 * - 一周从周一开始（手机上「周一…周日」的排法）；
 * - 月历固定 42 格（6 行），只有 5 周的月份最后一行留空，翻月高度不跳。
 *
 * 只做纯函数，不碰平台 UI / Tauri；手机与桌面各自渲染。
 */

export type DayKey = string;

const WEEKDAY_SHORT = ["日", "一", "二", "三", "四", "五", "六"] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 时间戳 / Date → 本地 YYYY-MM-DD。 */
export function dayKey(input: number | Date): DayKey {
  const date = input instanceof Date ? input : new Date(input);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** YYYY-MM-DD → 本地当天 00:00。非法输入回退到今天，避免崩溃。 */
export function parseDayKey(key: DayKey): Date {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

/** 按本地日历加减天数（跨月/跨年/闰年自动进位）。 */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** 本机今天 00:00。 */
export function startOfToday(now = Date.now()): Date {
  return new Date(dayKey(now));
}

/** 所在周的周一 00:00。 */
export function startOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}

/** 所在周的 7 天（周一 → 周日）。 */
export function weekDays(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export type MonthCell = {
  date: Date;
  key: DayKey;
  inMonth: boolean;
};

/** 固定 42 格（6 行）的月历矩阵，周一起始。 */
export function monthMatrix(year: number, month: number): MonthCell[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return {
      date,
      key: dayKey(date),
      inMonth: date.getFullYear() === year && date.getMonth() === month,
    };
  });
}

/** 周几的中文简称（周日/周一…）。 */
export function weekdayLabel(date: Date): string {
  return `周${WEEKDAY_SHORT[date.getDay()]}`;
}

/** 2026-11-08 → 11 月 8 日 · 周日。 */
export function formatDayTitle(key: DayKey): string {
  const date = parseDayKey(key);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${weekdayLabel(date)}`;
}

/** 日历工具行标题：当年只写「11 月」，跨年写「2025 年 11 月」。 */
export function monthLabel(year: number, month: number, now = new Date()): string {
  return year === now.getFullYear() ? `${month + 1} 月` : `${year} 年 ${month + 1} 月`;
}

/** 桌面/对话里需要完整年月时用。 */
export function fullMonthLabel(year: number, month: number): string {
  return `${year} 年 ${month + 1} 月`;
}

/** 周范围标题：同月「11 月 2 日 – 8 日」，跨月带上月份。 */
export function weekRangeLabel(days: Date[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return "";
  if (first.getMonth() === last.getMonth()) {
    return `${first.getMonth() + 1} 月 ${first.getDate()} 日 – ${last.getDate()} 日`;
  }
  return `${first.getMonth() + 1} 月 ${first.getDate()} 日 – ${last.getMonth() + 1} 月 ${last.getDate()} 日`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 按「条目创建时间」的本地日聚合；保持传入顺序（列表本身已倒序）。 */
export function groupByDay<T extends { createdAt: number }>(items: T[]): Map<DayKey, T[]> {
  const groups = new Map<DayKey, T[]>();
  for (const item of items) {
    const key = dayKey(item.createdAt);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
