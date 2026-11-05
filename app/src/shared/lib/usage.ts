import type { UsageRange } from "@/protocol/messages";

export const USAGE_RANGES: ReadonlyArray<{ value: UsageRange; label: string }> = [
  { value: "today", label: "今天" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
  { value: "180d", label: "半年" },
];

export const RANGE_LABEL: Record<UsageRange, string> = {
  today: "今天",
  "7d": "近 7 天",
  "30d": "近 30 天",
  "180d": "近半年",
};

/** 中文紧凑 Token：亿 / 万；用于卡片大数与分组行。 */
export function formatTokenCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 100_000_000) return `${trim(value / 100_000_000, 2)} 亿`;
  if (value >= 10_000) return `${trim(value / 10_000, 1)} 万`;
  return new Intl.NumberFormat("zh-CN").format(Math.round(value));
}

/** 完整 Token 数（tooltip / 辅助文本）。 */
export function formatTokenExact(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value)));
}

/** 金额：输入人民币微元，输出「¥29.84」；极小非零值显示 <0.01。 */
export function formatCny(micros: number, digits = 2): string {
  const cny = Math.max(0, micros) / 1_000_000;
  if (cny > 0 && cny < 0.01) return "<¥0.01";
  return `¥${cny.toFixed(digits)}`;
}

/** 单价：¥/1M tokens，小于 1 时保留 3 位，便于看出缓存价差。 */
export function formatCnyPerM(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return `¥${value < 1 ? value.toFixed(3) : value.toFixed(2)}`;
}

export function formatPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("zh-CN").format(Math.round(value));
}

export function formatUpdatedAt(updatedAt: number | null): string {
  if (!updatedAt) return "从未更新";
  const deltaMinutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60_000));
  if (deltaMinutes < 1) return "刚刚更新";
  if (deltaMinutes < 60) return `${deltaMinutes} 分钟前`;
  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

/** 成本来源文案：实际记账 / 估算 / 混合 / 缺价。 */
export function costSourceLabel(source: string): string {
  switch (source) {
    case "ledger":
      return "DSH 记账";
    case "estimated":
      return "按价格表估算";
    case "mixed":
      return "记账 + 估算";
    case "unknown":
      return "缺价";
    default:
      return source;
  }
}

export function isEstimated(source: string): boolean {
  return source === "estimated" || source === "mixed";
}

/** 金额展示：缺价显示「—」，估算前置 `≈`；未知成本不伪装成 ¥0.00。 */
export function formatUsageCost(source: string, micros: number): string {
  if (source === "unknown") return "—";
  return `${isEstimated(source) ? "≈" : ""}${formatCny(micros)}`;
}

function trim(value: number, digits: number): string {
  return value
    .toFixed(digits)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}

/** 5 个 Token 桶的颜色（与图表保持一致）。 */
export const TOKEN_PART_COLORS = {
  cacheRead: "var(--chart-2)",
  input: "var(--chart-1)",
  output: "var(--chart-3)",
  cacheWrite: "var(--chart-4)",
  reasoning: "var(--chart-5)",
} as const;
