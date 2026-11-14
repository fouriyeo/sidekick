/**
 * 桌面快捷键 → 手机录音的遥控消息（v1 新增，向后兼容）。
 *
 * 方向：
 * - `mic.remote`：桌面 → 手机（**只允许桌面后端发起**，绝不接受 WS 外部输入）；
 * - `mic.remote.ack`：手机 → 桌面（命令是否被接受，失败带稳定错误码）；
 * - `mic.remote.status`：手机 → 桌面（连上/改设置时上报「是否允许电脑遥控」）。
 *
 * 会话本身仍由手机发 `mic.start`/`mic.stop`，这里不涉及音频与会话 id。
 */

export type RemoteMicAction = "start" | "stop" | "cancel";

/** 手机拒绝/无法执行的稳定错误码（只做文案映射，不含任何内容）。 */
export type RemoteMicAckCode =
  | "remote_disabled"
  | "not_pet_page"
  | "busy"
  | "permission_denied"
  | "audio_blocked"
  | "not_recording"
  | "disconnected"
  | "mic_start"
  | "cancelled"
  | "bad_request";

/** 桌面 → 手机：请开始/结束/取消一次录音。 */
export type RemoteMicCommand = {
  v: 1;
  type: "mic.remote";
  requestId: string;
  action: RemoteMicAction;
  ts: number;
};

/** 手机 → 桌面：命令回执。 */
export type RemoteMicAck = {
  v: 1;
  type: "mic.remote.ack";
  requestId: string;
  action: RemoteMicAction;
  ok: boolean;
  code?: RemoteMicAckCode | null;
  ts: number;
};

/** 手机 → 桌面：这台手机当前是否响应电脑遥控。 */
export type RemoteMicStatus = {
  v: 1;
  type: "mic.remote.status";
  enabled: boolean;
  ts: number;
};

export type RemoteMicMessage = RemoteMicCommand | RemoteMicAck | RemoteMicStatus;

/** HUD 状态机（Rust 推，前端只渲染）。 */
export type RemoteHudState =
  | "unavailable"
  | "connecting"
  | "listening"
  | "processing"
  | "delivered"
  | "copied"
  | "failed"
  | "cancelled";

export type RemoteHudPayload = {
  v: 1;
  state: RemoteHudState;
  /** 失败/复制原因；协议里的 `reason` 与本地 `no_phone` 一类共用这个字段。 */
  reason?: string | null;
  /** 录音开始时刻（HUD 用来算计时）。 */
  startedAt?: number | null;
  ts: number;
};

const ACTIONS: readonly string[] = ["start", "stop", "cancel"];
const HUD_STATES: readonly string[] = [
  "unavailable",
  "connecting",
  "listening",
  "processing",
  "delivered",
  "copied",
  "failed",
  "cancelled",
];

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

export function isRemoteMicCommand(value: unknown): value is RemoteMicCommand {
  const message = record(value);
  if (!message) return false;
  return (
    message.v === 1 &&
    message.type === "mic.remote" &&
    typeof message.requestId === "string" &&
    message.requestId.length > 0 &&
    typeof message.action === "string" &&
    ACTIONS.includes(message.action) &&
    typeof message.ts === "number"
  );
}

export function isRemoteMicAck(value: unknown): value is RemoteMicAck {
  const message = record(value);
  if (!message) return false;
  return (
    message.v === 1 &&
    message.type === "mic.remote.ack" &&
    typeof message.requestId === "string" &&
    typeof message.action === "string" &&
    ACTIONS.includes(message.action) &&
    typeof message.ok === "boolean" &&
    (message.code === undefined || message.code === null || typeof message.code === "string") &&
    typeof message.ts === "number"
  );
}

export function isRemoteMicStatus(value: unknown): value is RemoteMicStatus {
  const message = record(value);
  if (!message) return false;
  return (
    message.v === 1 &&
    message.type === "mic.remote.status" &&
    typeof message.enabled === "boolean" &&
    typeof message.ts === "number"
  );
}

/** 解析遥控相关消息；不是这一类时返回 null（调用方继续走别的解析器）。 */
export function parseRemoteMicMessage(raw: string): RemoteMicMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (isRemoteMicCommand(value)) return value;
  if (isRemoteMicAck(value)) return value;
  if (isRemoteMicStatus(value)) return value;
  return null;
}

export function isRemoteHudPayload(value: unknown): value is RemoteHudPayload {
  const payload = record(value);
  if (!payload) return false;
  return (
    payload.v === 1 &&
    typeof payload.state === "string" &&
    HUD_STATES.includes(payload.state) &&
    (payload.reason === undefined ||
      payload.reason === null ||
      typeof payload.reason === "string") &&
    (payload.startedAt === undefined ||
      payload.startedAt === null ||
      typeof payload.startedAt === "number") &&
    typeof payload.ts === "number"
  );
}
