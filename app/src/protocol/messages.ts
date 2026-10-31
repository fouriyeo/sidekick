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
};

export type ConnEvent = {
  online: boolean;
  url?: string;
};

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
