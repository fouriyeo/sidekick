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
  /**
   * 当前在线客户端数（可选，只增字段）。桌面服务端在连接/断开时广播；
   * 旧客户端忽略，旧服务端不发送。含桌面本机窗口与网页预览客户端。
   */
  clients?: number;
};

/** AI 联动状态：宠物四态的协议层名称（idle 对应产品里的「静态」）。 */
export type StatusState = "idle" | "working" | "asking" | "completed";

export type StatusSource = "dsh" | "test";

/** 会话来源；P0 只有 DSH，预留后续 Claude Code / Qoder。 */
export type SessionSource = "dsh";

/** 单个会话的稳定态；completed 由 completedAt 推导，不放进会话状态。 */
export type SessionState = "idle" | "working" | "asking";

export type AskKind = "approval" | "question";

/**
 * 会话当前正在使用的工具类别（白名单，粗粒度）。
 *
 * 插件只上报这个类别，绝不上报工具名原文/参数/路径：工具名在本地映射成固定枚举，
 * 未知工具统一落 `tool`。旧版桌面不发送，旧版手机忽略。
 */
export type SessionTool = "bash" | "read" | "edit" | "search" | "web" | "agent" | "plan" | "tool";

/** 手机端会话列表用的最小元数据，不含任何对话内容。 */
export type SessionSummary = {
  id: string;
  /** 已清洗的 DSH 会话标题；缺失为 null。 */
  title: string | null;
  source: SessionSource;
  state: SessionState;
  askKind?: AskKind | null;
  /** 仅 working 有值：当前正在使用的工具类别；其余状态恒为 null。 */
  tool?: SessionTool | null;
  /** 桌面时钟 ms；只在 turn/ask/title 等有意义事件更新。 */
  lastEventAt: number;
  /** 最近一轮 completed 的桌面时钟 ms；null 表示没有完成记录。 */
  completedAt?: number | null;
};

const SESSION_TOOLS: readonly SessionTool[] = [
  "bash",
  "read",
  "edit",
  "search",
  "web",
  "agent",
  "plan",
  "tool",
];

/** 白名单校验：未知/非字符串一律不认，避免把任意字符串当工具类别渲染。 */
export function isSessionTool(value: unknown): value is SessionTool {
  return typeof value === "string" && (SESSION_TOOLS as readonly string[]).includes(value);
}

/** 协议层会话列表上限；桌面桥与手机都会按这个值截断。 */
export const MAX_SESSION_LIST = 50;
/** 会话标题最大字符数（按 Unicode 码点计）。 */
export const MAX_SESSION_TITLE_CHARS = 80;

/**
 * AI 状态系统消息。桌面端把 AI 的聚合状态广播给所有手机；
 * completed 只持续几秒，桌面会补发 resume 状态，remainingMs 供手机本地兜底。
 * sessionList 是可选的会话列表，旧客户端会忽略。
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
  /** 顶层会话列表；旧版桌面不发送，手机按空列表处理。 */
  sessionList?: SessionSummary[];
  ts: number;
};

/** 手机 → 桌面：把某个会话对应的软件切到前台（没开则启动）。 */
export type FocusRequestMessage = {
  type: "focus.request";
  v: 1;
  requestId: string;
  source: SessionSource;
  sessionId: string;
  ts: number;
};

/** 桌面 → 手机：focus.request 的处理结果；error 只回错误码。 */
export type FocusResultMessage = {
  type: "focus.result";
  v: 1;
  requestId: string;
  source: SessionSource;
  ok: boolean;
  error?: string | null;
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

export type MicCancelReason = "desktop" | "timeout";

/**
 * 桌面 → 手机/UI：桌面端权威取消当前录音会话。
 *
 * 人工点「取消录音」时 reason=desktop；服务端看门狗（手机停止消息丢失/卡死）
 * 触发时 reason=timeout。手机收到后必须停止本地采集，即使本地记录的 session
 * 与消息里的不一致——该消息的语义是「当前不应该再有录音」。
 */
export type MicCancelMessage = {
  v: 1;
  type: "mic.cancel";
  session: string;
  reason?: MicCancelReason;
  ts: number;
};

export type MicMessage =
  | MicStartMessage
  | MicReadyMessage
  | MicStopMessage
  | MicPartialMessage
  | MicResultMessage
  | MicStateMessage
  | MicErrorMessage
  | MicCancelMessage;

/**
 * 结果卡片上的手动按键动作：`enter` = 在电脑上按一次 Return，
 * `clear` = 在电脑上按 ⌘A + Delete 清空输入框。
 *
 * 只由用户主动点按触发，绝不自动发送（见 docs/prd/mic/PRD.md 铁律）。
 */
export type KeyAction = "enter" | "clear";

/** 手机 → 桌面：请求在最近一次插入文本的目标应用里按一次键。 */
export type KeyRequestMessage = {
  v: 1;
  type: "key.request";
  requestId: string;
  /** 最近一次 mic.result(outcome=inserted) 的会话 id，用于对回目标窗口。 */
  session: string;
  action: KeyAction;
  ts: number;
};

/** 桌面 → 手机/UI：按键结果；error 只回错误码，不含文本/应用名。 */
export type KeyResultMessage = {
  v: 1;
  type: "key.result";
  requestId: string;
  action: KeyAction;
  ok: boolean;
  error?: string | null;
  ts: number;
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
  return (
    message.type === "system" &&
    typeof message.text === "string" &&
    (message.clients === undefined ||
      (typeof message.clients === "number" &&
        Number.isInteger(message.clients) &&
        message.clients >= 0))
  );
}

export function isStatusState(value: unknown): value is StatusState {
  return value === "idle" || value === "working" || value === "asking" || value === "completed";
}

export function isSessionState(value: unknown): value is SessionState {
  return value === "idle" || value === "working" || value === "asking";
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** 单行标题：去控制字符、折叠空白、按码点截断；空标题归为 null。 */
export function normalizeSessionTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const oneLine = value
    .replace(/[\p{Cc}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!oneLine) return null;
  return Array.from(oneLine).slice(0, MAX_SESSION_TITLE_CHARS).join("");
}

/** 宽松解析单条会话；非法项返回 null，由列表过滤掉。 */
export function normalizeSessionSummary(value: unknown): SessionSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const session = value as Record<string, unknown>;
  if (typeof session.id !== "string") return null;
  const id = session.id.trim();
  if (!id || id.length > 128) return null;
  if (session.source !== "dsh") return null;
  if (!isSessionState(session.state)) return null;
  if (!isNonNegativeNumber(session.lastEventAt)) return null;
  if (
    session.completedAt !== undefined &&
    session.completedAt !== null &&
    !isNonNegativeNumber(session.completedAt)
  ) {
    return null;
  }
  if (
    session.askKind !== undefined &&
    session.askKind !== null &&
    session.askKind !== "approval" &&
    session.askKind !== "question"
  ) {
    return null;
  }

  return {
    id,
    title: normalizeSessionTitle(session.title),
    source: "dsh",
    state: session.state,
    askKind:
      session.askKind === "approval" || session.askKind === "question" ? session.askKind : null,
    // 工具类别只在 working 时有意义；未知值静默置 null，不整条丢弃（向后兼容）。
    tool: session.state === "working" && isSessionTool(session.tool) ? session.tool : null,
    lastEventAt: session.lastEventAt,
    completedAt: isNonNegativeNumber(session.completedAt) ? session.completedAt : null,
  };
}

/** 宽松解析会话列表：丢弃非法项、最多保留 MAX_SESSION_LIST 条。 */
export function normalizeSessionList(value: unknown): SessionSummary[] {
  if (!Array.isArray(value)) return [];
  const list: SessionSummary[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const session = normalizeSessionSummary(item);
    if (!session || seen.has(session.id)) continue;
    seen.add(session.id);
    list.push(session);
    if (list.length >= MAX_SESSION_LIST) break;
  }
  return list;
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
  if (
    message.sessionList !== undefined &&
    message.sessionList !== null &&
    !Array.isArray(message.sessionList)
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
  if (!isStatusMessage(value)) return null;
  return { ...value, sessionList: normalizeSessionList(value.sessionList) };
}

export function isFocusResultMessage(value: unknown): value is FocusResultMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "focus.result" &&
    message.v === 1 &&
    typeof message.requestId === "string" &&
    message.requestId.length > 0 &&
    message.source === "dsh" &&
    typeof message.ok === "boolean" &&
    (message.error === undefined || message.error === null || typeof message.error === "string") &&
    typeof message.ts === "number"
  );
}

export function parseFocusResult(raw: string): FocusResultMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return isFocusResultMessage(value) ? value : null;
}

export function isKeyAction(value: unknown): value is KeyAction {
  return value === "enter" || value === "clear";
}

export function isKeyResultMessage(value: unknown): value is KeyResultMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "key.result" &&
    message.v === 1 &&
    typeof message.requestId === "string" &&
    message.requestId.length > 0 &&
    isKeyAction(message.action) &&
    typeof message.ok === "boolean" &&
    (message.error === undefined || message.error === null || typeof message.error === "string") &&
    typeof message.ts === "number"
  );
}

export function parseKeyResult(raw: string): KeyResultMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return isKeyResultMessage(value) ? value : null;
}

/**
 * 解析系统消息里的在线客户端数；没有该字段（旧服务端）或非法值返回 null。
 * 只做数值解析，不读取/展示任何内容。
 */
export function parseSystemClients(raw: string): number | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isSystemMessage(value) || value.clients === undefined) return null;
  return value.clients;
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

export function isMicCancelMessage(value: unknown): value is MicCancelMessage {
  if (!isMicBase(value)) return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "mic.cancel" &&
    (message.reason === undefined || message.reason === "desktop" || message.reason === "timeout")
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
    isMicReadyMessage(value) ||
    isMicCancelMessage(value)
  ) {
    return value;
  }
  return null;
}
