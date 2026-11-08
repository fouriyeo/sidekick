/** 毫秒 → 0:07 / 3:42 / 1:02:03。 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** 时间戳 → 14:05（本机时区）。 */
export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 字节 → 0 B / 12.3 MB / 1.1 GB。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** 是否今天（本机时区）。 */
export function isToday(timestamp: number, now = Date.now()): boolean {
  const date = new Date(timestamp);
  const today = new Date(now);
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

/** 列表分组：今天 / 更早。 */
export function groupByDay<T extends { createdAt: number }>(
  items: T[],
  now = Date.now(),
): { today: T[]; earlier: T[] } {
  const today: T[] = [];
  const earlier: T[] = [];
  for (const item of items) {
    (isToday(item.createdAt, now) ? today : earlier).push(item);
  }
  return { today, earlier };
}
