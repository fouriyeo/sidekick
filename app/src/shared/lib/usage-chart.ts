import type { TokenUsageSummary, UsageRange } from "@/protocol/messages";

/**
 * 用量页共享的纯数学/派生（D97/D98）。
 *
 * 只做数字与路径，不碰 DOM/React/CSS：桌面的花费剖面与手机的紧凑剖面共用，
 * 避免两端各写一套归一化、刻度、百分比和环比。颜色/排版仍由各端自己决定。
 */

export type CostBucketKey = "cacheRead" | "input" | "output" | "cacheWrite" | "reasoning";

export type CostBucket = {
  key: CostBucketKey;
  label: string;
  value: number;
  /** 占比，1 位小数；五桶合计保证 100.0（最大余数法）。 */
  pct: number;
};

const COST_BUCKETS: ReadonlyArray<{ key: CostBucketKey; label: string }> = [
  { key: "cacheRead", label: "缓存读" },
  { key: "input", label: "输入" },
  { key: "output", label: "输出" },
  { key: "cacheWrite", label: "缓存写" },
  { key: "reasoning", label: "推理" },
];

const RANGE_SPEND_LABEL: Record<UsageRange, string> = {
  today: "今天花费",
  "7d": "近 7 天花费",
  "30d": "近 30 天花费",
  "180d": "近半年花费",
};

export function rangeSpendLabel(range: UsageRange): string {
  return RANGE_SPEND_LABEL[range] ?? "花费";
}

/** 本地时区的 YYYY-MM-DD；账本日期就是本地日，不能用 UTC 解析。 */
export function localDayKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isToday(dateStr: string, now: Date = new Date()): boolean {
  return dateStr === localDayKey(now);
}

/** 「MM-DD」，账本日期字符串直接截取，不经过 Date 避免时区偏移。 */
export function shortDate(dateStr: string): string {
  return dateStr.length >= 10 ? dateStr.slice(5) : dateStr;
}

/** 区间的起止日期；今天只有一个日期。 */
export function periodLabel(days: ReadonlyArray<{ date: string }>): string {
  const first = days[0]?.date;
  const last = days[days.length - 1]?.date;
  if (!first || !last) return "";
  return first === last ? shortDate(first) : `${shortDate(first)} – ${shortDate(last)}`;
}

/** 五桶构成：值为 0 的桶省略；百分比按最大余数法补到 100.0。 */
export function costBuckets(summary: TokenUsageSummary): CostBucket[] {
  const values = COST_BUCKETS.map((bucket) => ({
    ...bucket,
    value: Math.max(0, summary[bucket.key]),
  }));
  const total = values.reduce((sum, bucket) => sum + bucket.value, 0);
  if (total <= 0) return [];
  const parts = values.filter((bucket) => bucket.value > 0);
  const pcts = distributePct(parts.map((bucket) => bucket.value));
  return parts.map((bucket, index) => ({ ...bucket, pct: pcts[index] }));
}

/** 把一组数值按比例分到 1000 个千分位（最大余数），返回 1 位小数的百分比。 */
function distributePct(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  const tenths = values.map((value) => Math.floor((value / total) * 1000));
  const used = tenths.reduce((sum, value) => sum + value, 0);
  const remainders = values
    .map((value, index) => ({ index, rem: (value / total) * 1000 - tenths[index] }))
    .sort((a, b) => b.rem - a.rem);
  let rest = 1000 - used;
  for (let i = 0; rest > 0; i += 1) {
    tenths[remainders[i % remainders.length].index] += 1;
    rest -= 1;
  }
  return tenths.map((value) => value / 10);
}

export type SpendDelta = { pct: number; direction: "up" | "down" | "flat" };

/** 环比：上期 <= 0 时没有可比基数，返回 null（界面隐藏环比）。 */
export function spendDelta(current: number, previous: number): SpendDelta | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const direction = Math.abs(pct) < 0.05 ? "flat" : pct > 0 ? "up" : "down";
  return { pct, direction };
}

/** 坐标轴上界取「好看」的整数档：8.2 → 10、4.8 → 5。 */
export function niceAxisMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const picks = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const pick = picks.find((candidate) => fraction <= candidate + 1e-9) ?? 10;
  return pick * base;
}

/** 轴标签：>=10 取整，<10 保留 1 位（去尾 0）。 */
export function axisLabel(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value >= 10) return String(Math.round(value));
  return value
    .toFixed(1)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

/** X 轴标签下标：<=8 全部显示，更多时取 6 个（含首尾）。 */
export function xLabelIndices(count: number): number[] {
  if (count <= 1) return [0];
  if (count <= 8) return Array.from({ length: count }, (_, index) => index);
  const indices = [0];
  for (let i = 1; i < 5; i += 1) indices.push(Math.round((i * (count - 1)) / 5));
  indices.push(count - 1);
  return Array.from(new Set(indices));
}

export type ChartPoint = { x: number; y: number };

/**
 * Catmull-Rom → 三次贝塞尔平滑折线。
 * 控制点夹在 [minY, maxY]，避免低值/零值处曲线冲到坐标轴外。
 */
export function smoothLinePath(
  points: ReadonlyArray<ChartPoint>,
  clamp: { minY?: number; maxY?: number } = {},
): string {
  if (points.length === 0) return "";
  const clampY = (y: number): number => {
    let next = y;
    if (clamp.minY != null) next = Math.max(clamp.minY, next);
    if (clamp.maxY != null) next = Math.min(clamp.maxY, next);
    return next;
  };
  const move = `M${round(points[0].x)} ${round(points[0].y)}`;
  if (points.length === 1) return move;
  const tension = 0.9;
  const commands: string[] = [move];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = clampY(p1.y + ((p2.y - p0.y) / 6) * tension);
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = clampY(p2.y - ((p3.y - p1.y) / 6) * tension);
    commands.push(
      `C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(p2.x)} ${round(p2.y)}`,
    );
  }
  return commands.join(" ");
}

/** 面积路径：折线 + 落到底边 + 回到起点。 */
export function areaPath(points: ReadonlyArray<ChartPoint>, baselineY: number): string {
  if (points.length === 0) return "";
  const line = smoothLinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${line} L${round(last.x)} ${round(baselineY)} L${round(first.x)} ${round(baselineY)} Z`;
}

/** 分组行：返回的 Top 行内按金额降序，「其他」始终垫底。 */
export function sortRowsByCost<T extends { costCnyMicros: number; tag?: string | null }>(
  rows: ReadonlyArray<T>,
): T[] {
  return [...rows].sort((a, b) => {
    const aOther = a.tag === "other" ? 1 : 0;
    const bOther = b.tag === "other" ? 1 : 0;
    if (aOther !== bOther) return aOther - bOther;
    return b.costCnyMicros - a.costCnyMicros;
  });
}

/** 组内金额占比；组内金额全为 0 时退回 Token 占比。 */
export function rowCostShare(
  row: { costCnyMicros: number; tokens: number },
  rows: ReadonlyArray<{ costCnyMicros: number; tokens: number }>,
): number {
  const costTotal = rows.reduce((sum, item) => sum + item.costCnyMicros, 0);
  if (costTotal > 0) return (row.costCnyMicros / costTotal) * 100;
  const tokenTotal = rows.reduce((sum, item) => sum + item.tokens, 0);
  return tokenTotal > 0 ? (row.tokens / tokenTotal) * 100 : 0;
}

function round(value: number): string {
  return value.toFixed(2);
}
