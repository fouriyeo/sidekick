export type ChatFrom = "desktop" | "phone";

export type ChatMessage = {
  type: "chat";
  from: ChatFrom;
  text: string;
  ts: number;
};

export type SystemMessage = {
  type: "system";
  text: string;
};

/** AI 联动状态：宠物四态的协议层名称（idle 对应产品里的「静态」）。 */
export type StatusState = "idle" | "working" | "asking" | "completed";

export type StatusSource = "dsh" | "test";

/**
 * AI 状态系统消息。桌面端把 AI 的聚合状态广播给所有手机；
 * completed 只持续几秒，桌面会补发 resume 状态，remainingMs 供手机本地兜底。
 */
export type StatusMessage = {
  type: "status";
  v: 1;
  source: StatusSource;
  state: StatusState;
  /** 进行中的顶层会话数；只用于桌面 UI/调试，手机不展示数字。 */
  sessions: number;
  /** 仅 completed 有值：3 秒后回到哪个稳定态。 */
  resume?: StatusState | null;
  /** 仅 completed 有值：桌面计算的剩余展示时长，避免手机时钟偏差。 */
  remainingMs?: number | null;
  ts: number;
};

export type IncomingMessage = ChatMessage | SystemMessage | StatusMessage;

export type ServerInfo = {
  ip: string;
  port: number;
  url: string;
  /** UDP 自动发现端口；null 表示桌面端未开启自动发现。 */
  discoveryPort: number | null;
};

export type ConnEvent = {
  online: boolean;
  url?: string;
};

export type MicStopReason =
  | "release"
  | "cancel"
  | "timeout"
  | "background"
  | "disconnect"
  | "mic_lost";

/** 百炼返回的单次用量（只用于桌面 UI/日志，不上报）。 */
export type MicUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  audioDurationMs: number;
};

export type MicStartMessage = {
  v: 1;
  type: "mic.start";
  session: string;
  codec: "pcm16";
  sampleRate: number;
  channels: number;
  frameMs: number;
  maxMs: number;
  ts: number;
};

export type MicReadyMessage = {
  v: 1;
  type: "mic.ready";
  session: string;
  ts: number;
};

export type MicStopMessage = {
  v: 1;
  type: "mic.stop";
  session: string;
  reason: MicStopReason;
  ts: number;
};

export type MicResultOutcome = "inserted" | "copied" | "failed";

/**
 * 流式中间结果：text 是「已定稿句 + 当前句」的完整可见文本，客户端整体替换。
 * rev 从 1 递增，同一 session 只接受更大的值；只用于回显，不用于落字。
 */
export type MicPartialMessage = {
  v: 1;
  type: "mic.partial";
  session: string;
  rev: number;
  text: string;
  sentence: number;
  ts: number;
};

export type MicResultMessage = {
  v: 1;
  type: "mic.result";
  session: string;
  outcome: MicResultOutcome;
  reason?: string | null;
  text?: string | null;
  truncated?: boolean;
  latencyMs?: number;
  usage?: MicUsage | null;
  ts: number;
};

export type MicStateMessage = {
  v: 1;
  type: "mic.state";
  session: string;
  state: "listening" | "processing" | "delivered" | "error" | "cancelled" | "idle";
  ts: number;
};

export type MicErrorMessage = {
  v: 1;
  type: "mic.error";
  session?: string | null;
  code: string;
  ts: number;
};

export type MicMessage =
  | MicStartMessage
  | MicReadyMessage
  | MicStopMessage
  | MicPartialMessage
  | MicResultMessage
  | MicStateMessage
  | MicErrorMessage;

export type ParsedMessage = {
  kind: "me" | "them" | "system";
  text: string;
  ts?: number;
};

export function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "chat" &&
    (message.from === "desktop" || message.from === "phone") &&
    typeof message.text === "string" &&
    typeof message.ts === "number"
  );
}

export function isSystemMessage(value: unknown): value is SystemMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return message.type === "system" && typeof message.text === "string";
}

export function isStatusState(value: unknown): value is StatusState {
  return value === "idle" || value === "working" || value === "asking" || value === "completed";
}

export function isStatusMessage(value: unknown): value is StatusMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.type !== "status" || message.v !== 1) return false;
  if (message.source !== "dsh" && message.source !== "test") return false;
  if (!isStatusState(message.state)) return false;
  if (
    typeof message.sessions !== "number" ||
    !Number.isInteger(message.sessions) ||
    message.sessions < 0
  ) {
    return false;
  }
  if (typeof message.ts !== "number" || !Number.isFinite(message.ts)) return false;
  if (message.resume !== undefined && message.resume !== null && !isStatusState(message.resume)) {
    return false;
  }
  if (
    message.remainingMs !== undefined &&
    message.remainingMs !== null &&
    (typeof message.remainingMs !== "number" ||
      !Number.isFinite(message.remainingMs) ||
      message.remainingMs < 0)
  ) {
    return false;
  }
  return true;
}

export function parseStatusMessage(raw: string): StatusMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return isStatusMessage(value) ? value : null;
}

export function isConnEvent(value: unknown): value is ConnEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.online === "boolean" && (event.url === undefined || typeof event.url === "string")
  );
}

export function parseMessage(raw: string, self: ChatFrom): ParsedMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: "system", text: raw };
  }

  if (isSystemMessage(value)) {
    return { kind: "system", text: value.text };
  }

  if (isChatMessage(value)) {
    return { kind: value.from === self ? "me" : "them", text: value.text, ts: value.ts };
  }

  return null;
}

function isMicBase(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).v === 1 &&
    typeof (value as Record<string, unknown>).session === "string"
  );
}

export function isMicResultMessage(value: unknown): value is MicResultMessage {
  if (!isMicBase(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "mic.result" &&
    (message.outcome === "inserted" || message.outcome === "copied" || message.outcome === "failed")
  );
}

export function isMicStateMessage(value: unknown): value is MicStateMessage {
  if (!isMicBase(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "mic.state" &&
    typeof message.state === "string" &&
    ["listening", "processing", "delivered", "error", "cancelled", "idle"].includes(message.state)
  );
}

export function isMicReadyMessage(value: unknown): value is MicReadyMessage {
  if (!isMicBase(value)) return false;
  return (value as Record<string, unknown>).type === "mic.ready";
}

export function isMicPartialMessage(value: unknown): value is MicPartialMessage {
  if (!isMicBase(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "mic.partial" &&
    typeof message.text === "string" &&
    typeof message.rev === "number" &&
    Number.isInteger(message.rev) &&
    message.rev >= 1 &&
    typeof message.sentence === "number" &&
    Number.isInteger(message.sentence)
  );
}

export function isMicErrorMessage(value: unknown): value is MicErrorMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.v === 1 &&
    message.type === "mic.error" &&
    typeof message.code === "string" &&
    (message.session === undefined ||
      message.session === null ||
      typeof message.session === "string")
  );
}

export function parseMicMessage(raw: string): MicMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    isMicPartialMessage(value) ||
    isMicResultMessage(value) ||
    isMicStateMessage(value) ||
    isMicErrorMessage(value) ||
    isMicReadyMessage(value)
  ) {
    return value;
  }
  return null;
}
