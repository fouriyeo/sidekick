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

export type IncomingMessage = ChatMessage | SystemMessage;

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

export type MicResultMessage = {
  v: 1;
  type: "mic.result";
  session: string;
  outcome: MicResultOutcome;
  reason?: string | null;
  text?: string | null;
  truncated?: boolean;
  latencyMs?: number;
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
    isMicResultMessage(value) ||
    isMicStateMessage(value) ||
    isMicErrorMessage(value) ||
    isMicReadyMessage(value)
  ) {
    return value;
  }
  return null;
}
