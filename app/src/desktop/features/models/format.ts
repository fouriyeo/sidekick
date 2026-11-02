const CNY_MICROS_PER_YUAN = 1_000_000;

/** 人民币微元 → 展示金额：0 → ¥0.00；不足 1 分 → 4 位小数；其余 2 位。 */
export function formatCnyMicros(micros: number): string {
  const value = Number.isFinite(micros) ? Math.max(0, micros) : 0;
  if (value === 0) return "¥0.00";
  const yuan = value / CNY_MICROS_PER_YUAN;
  if (yuan < 0.01) return `¥${yuan.toFixed(4)}`;
  return `¥${yuan.toFixed(2)}`;
}

/** 千分位整数，避免依赖运行环境的 Intl 数据。 */
export function formatTokens(tokens: number): string {
  const value = Number.isFinite(tokens) ? Math.max(0, Math.trunc(tokens)) : 0;
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 音频时长：小于 1 分钟显示秒，否则 mm:ss。 */
export function formatAudioDuration(milliseconds: number): string {
  const value = Number.isFinite(milliseconds) ? Math.max(0, Math.trunc(milliseconds)) : 0;
  const totalSeconds = Math.floor(value / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** 后端日期是 YYYY-MM-DD；明细里只显示 MM-DD。 */
export function formatDayLabel(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5) : date;
}
