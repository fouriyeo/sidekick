/** 备忘录类型：备忘 / 待办 / 灵感。 */
export type MemoType = "memo" | "todo" | "idea";

/** 管道状态；`offline` 等网络，`failed` 可重试。 */
export type MemoStatus = "pending" | "transcribing" | "structuring" | "done" | "failed" | "offline";

export type MemoSummary = {
  id: string;
  createdAt: number;
  updatedAt: number;
  memoType: MemoType;
  title: string;
  summary: string | null;
  todos: string[];
  tags: string[];
  durationMs: number;
  status: MemoStatus;
  aiStatus: string | null;
  hasAudio: boolean;
  audioBytes: number;
  synced: boolean;
  failedSegment: number | null;
  lastError: string | null;
};

export type MemoSegment = {
  idx: number;
  text: string;
  status: string;
};

export type MemoDetail = MemoSummary & {
  transcript: string;
  segments: MemoSegment[];
  audioPath: string | null;
};

export type MemoStorageStats = {
  count: number;
  audioBytes: number;
  audioFiles: number;
};

export type MemoKeyStatus = {
  hasKey: boolean;
  keyMasked: string | null;
  paired: boolean;
  deviceId: string;
};

export type MemoEvent = {
  kind: "changed" | "progress" | "error" | "key";
  id?: string;
  status?: MemoStatus;
  message?: string;
};

export type RecordingStarted = {
  sessionId: string;
  startedAt: number;
};

export type RecordingStatus = {
  sessionId: string;
  startedAt: number;
  bytes: number;
  durationMs: number;
  maxMs: number;
};

export type AppendResult = {
  bytes: number;
  durationMs: number;
  reachedMax: boolean;
};

export type MemoPairResult = {
  ok: boolean;
  token?: string;
  key?: string;
  error?: string;
};

const TYPES: readonly MemoType[] = ["memo", "todo", "idea"];
const STATUSES: readonly MemoStatus[] = [
  "pending",
  "transcribing",
  "structuring",
  "done",
  "failed",
  "offline",
];

export function isMemoType(value: unknown): value is MemoType {
  return typeof value === "string" && (TYPES as readonly string[]).includes(value);
}

export function isMemoStatus(value: unknown): value is MemoStatus {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/** 轻量校验：只检查列表渲染必需的字段，坏条目直接丢弃。 */
export function isMemoSummary(value: unknown): value is MemoSummary {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.createdAt === "number" &&
    typeof item.title === "string" &&
    isMemoType(item.memoType) &&
    isMemoStatus(item.status)
  );
}

export function isMemoEvent(value: unknown): value is MemoEvent {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  const kind = payload.kind;
  return (
    (kind === "changed" || kind === "progress" || kind === "error" || kind === "key") &&
    (payload.id === undefined || typeof payload.id === "string") &&
    (payload.status === undefined || isMemoStatus(payload.status)) &&
    (payload.message === undefined || typeof payload.message === "string")
  );
}

export function parseMemoPairResult(raw: string): MemoPairResult | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const payload = value as Record<string, unknown>;
  if (payload.type !== "memo.pair.result") return null;
  return {
    ok: payload.ok === true,
    token: typeof payload.token === "string" ? payload.token : undefined,
    key: typeof payload.key === "string" ? payload.key : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

/** 供 UI 判断是否「已同步」；未同步的完成条目显示小圆点。 */
export function memoStatusLabel(status: MemoStatus): string {
  switch (status) {
    case "pending":
      return "等待整理";
    case "transcribing":
      return "正在转写";
    case "structuring":
      return "正在整理";
    case "done":
      return "已完成";
    case "failed":
      return "需要重试";
    case "offline":
      return "等待网络";
  }
}

export function memoTypeLabel(type: MemoType): string {
  switch (type) {
    case "memo":
      return "备忘";
    case "todo":
      return "待办";
    case "idea":
      return "灵感";
  }
}
