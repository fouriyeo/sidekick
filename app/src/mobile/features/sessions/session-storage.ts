import { load, type Store } from "@tauri-apps/plugin-store";

/** 手机本地只保存「清除标记」：会话 id → 清除时间与清除时的 lastEventAt。 */
export type ClearedMap = Record<string, { at: number; through: number }>;

const FILE_NAME = "sidekick-sessions.json";
const KEY = "cleared";
const MAX_ENTRIES = 200;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load(FILE_NAME, { autoSave: false });
  return storePromise;
}

function isClearedRecord(value: unknown): value is { at: number; through: number } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.at === "number" &&
    Number.isFinite(record.at) &&
    typeof record.through === "number" &&
    Number.isFinite(record.through)
  );
}

/** 清洗本地清除标记：丢非法项、去 7 天前的旧标记、最多 200 条。 */
export function normalizeCleared(raw: unknown, now = Date.now()): ClearedMap {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const result: ClearedMap = {};
  for (const [id, record] of Object.entries(raw as Record<string, unknown>)) {
    if (!id || id.length > 128) continue;
    if (!isClearedRecord(record)) continue;
    if (now - record.at > TTL_MS) continue;
    result[id] = { at: record.at, through: record.through };
  }

  const entries = Object.entries(result).sort((left, right) => right[1].at - left[1].at);
  return Object.fromEntries(entries.slice(0, MAX_ENTRIES));
}

export async function loadCleared(): Promise<ClearedMap> {
  try {
    const store = await getStore();
    return normalizeCleared(await store.get<unknown>(KEY));
  } catch {
    return {};
  }
}

export async function saveCleared(cleared: ClearedMap): Promise<void> {
  try {
    const store = await getStore();
    await store.set(KEY, cleared);
    await store.save();
  } catch {
    // 本地清除标记失败只影响「重启后是否还记得」，静默降级。
  }
}
