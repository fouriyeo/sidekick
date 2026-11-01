// Sidekick 的 DSH 本地联动脚本。
//
// 该文件会被 Sidekick 安装到 ~/.dsh/profiles/<profile>/plugins/sidekick-hook.mjs，
// 同时被桌面端 Rust 用 include_str! 打进安装包，因此必须自包含：
// - 只用 Node 内置模块，不 import 任何第三方包；
// - 顶层不做文件/网络 I/O，所有副作用都发生在 apply() 与其定时器里；
// - 任何异常都不能抛回 DSH 的会话事件总线。
//
// 职责：订阅 DSH 的 session/event、session/disposed，把顶层会话聚合成
// idle / working / asking / completed 四态，以回环 HTTP POST 推给 Sidekick 桌面端。
// 配置文件 ~/.dsh/sidekick/config.json 每秒重读一次（按 mtime 缓存），由桌面端写入。

import { readFile as readFileDefault, stat as statDefault } from "node:fs/promises";
import { homedir as homedirDefault } from "node:os";
import { join as joinPath } from "node:path";
import { fileURLToPath } from "node:url";

export const name = "sidekick-hook";

/** 与 Rust HookBridge / Sidekick 桌面端约定的插件协议版本。 */
export const PLUGIN_VERSION = 1;
/** 配置文件格式版本。 */
export const CONFIG_VERSION = 1;

export const DEFAULT_CONFIG_POLL_MS = 1000;
export const DEFAULT_HEARTBEAT_MS = 5000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 1500;
export const DEFAULT_COMPLETED_THROTTLE_MS = 5000;
export const DEFAULT_MAX_SESSIONS = 256;
export const DEFAULT_MAX_QUEUE = 32;

const HANDLED_EVENT_TYPES = new Set([
  "turn/start",
  "turn/end",
  "tool/call",
  "tool/result",
  "approval/asked",
  "approval/decided",
  "user/message",
]);

// Ask 工具识别用 token 集合。工具名先拆成 token 再匹配，避免 review / permission_scan
// 这类普通工具因为包含子串而被误判成「在等用户」。
const ASK_VERB_TOKENS = new Set([
  "ask",
  "asks",
  "asked",
  "asking",
  "request",
  "requests",
  "requested",
  "requesting",
  "require",
  "requires",
  "required",
  "requiring",
  "prompt",
  "prompts",
  "prompted",
  "prompting",
  "need",
  "needs",
  "needed",
  "seek",
  "seeks",
  "seeking",
  "await",
  "awaits",
  "awaiting",
  "wait",
  "waits",
  "waiting",
]);

const ASK_NOUN_TOKENS = new Set([
  "question",
  "questions",
  "input",
  "answer",
  "answers",
  "decision",
  "decisions",
  "confirmation",
  "confirmations",
  "approval",
  "approvals",
  "permission",
  "permissions",
  "authorization",
  "authorisation",
  "consent",
  "clarify",
  "clarification",
  "help",
  "choice",
  "choices",
  "selection",
  "option",
  "options",
]);

const USER_TOKENS = new Set(["user", "users", "human", "humans", "me", "operator"]);
const FILLER_TOKENS = new Set(["a", "an", "by", "for", "from", "of", "on", "the", "to", "with"]);
// 这些词单独出现时基本就表示「等用户决定」。
const STRONG_ASK_TOKENS = new Set(["authorize", "authorise", "consent"]);
const SINGLE_ASK_TOKENS = new Set([
  "approval",
  "clarification",
  "confirmation",
  "decision",
  "permission",
  "question",
]);

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function toPositiveNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

// ---------------------------------------------------------------------------
// 纯函数工具：窗口名 / 会话判定
// ---------------------------------------------------------------------------

/** 把工具名（snake_case、kebab-case、camelCase 都支持）拆成小写 token。 */
export function tokenizeToolName(toolName) {
  return String(toolName ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

/**
 * 判断一个工具调用是否在等待用户回答/审批。
 *
 * 命中（示例）：ask_user_question、exit_plan_mode、user_question、human_decision、
 * request_permission、approval_request、needs_confirmation、waiting_for_user_input、
 * ask_user、authorize、consent。
 * 不命中（示例）：code_review、permission_scan、allowlist_files、review、
 * enter_plan_mode、get_permissions、notify_user、user_profile。
 */
export function isAskTool(toolName) {
  const tokens = tokenizeToolName(toolName);
  if (tokens.length === 0) return false;

  const hasToken = (set) => tokens.some((token) => set.has(token));
  const hasUserToken = hasToken(USER_TOKENS);
  const hasNounToken = hasToken(ASK_NOUN_TOKENS);
  const hasVerbToken = hasToken(ASK_VERB_TOKENS);

  if (hasToken(STRONG_ASK_TOKENS)) return true;

  // DSH 计划模式通过 exit_plan_mode 提交计划并阻塞等待用户批准；
  // 只认这个精确 token 序列，enter_plan_mode / plan_mode 不算。
  for (let index = 0; index + 2 < tokens.length; index += 1) {
    if (tokens[index] === "exit" && tokens[index + 1] === "plan" && tokens[index + 2] === "mode") {
      return true;
    }
  }

  // 单个 token 的 approval / question / confirmation / permission / decision 等。
  if (tokens.length === 1 && SINGLE_ASK_TOKENS.has(tokens[0])) return true;

  // 动词 + 名词：ask_user_question、request_approval、needs_confirmation、approval_requested。
  if (hasVerbToken && hasNounToken) return true;

  // user/human 与 question/decision/approval/permission 等名词相邻（中间只允许虚词），
  // 例如 user_question、human_decision、permission_for_user。
  if (hasUserToken && hasNounToken) {
    for (let left = 0; left < tokens.length; left += 1) {
      if (!USER_TOKENS.has(tokens[left]) && !ASK_NOUN_TOKENS.has(tokens[left])) continue;
      for (let right = left + 1; right < tokens.length; right += 1) {
        const leftIsUser = USER_TOKENS.has(tokens[left]);
        const leftIsNoun = ASK_NOUN_TOKENS.has(tokens[left]);
        const rightIsUser = USER_TOKENS.has(tokens[right]);
        const rightIsNoun = ASK_NOUN_TOKENS.has(tokens[right]);
        if (!((leftIsUser && rightIsNoun) || (leftIsNoun && rightIsUser))) continue;
        let onlyFillers = true;
        for (let between = left + 1; between < right; between += 1) {
          if (!FILLER_TOKENS.has(tokens[between])) {
            onlyFillers = false;
            break;
          }
        }
        if (onlyFillers) return true;
      }
    }
  }

  // 动词 + 用户词：ask_user、request_human、waiting_for_user。
  for (let index = 0; index < tokens.length; index += 1) {
    if (!ASK_VERB_TOKENS.has(tokens[index])) continue;
    let cursor = index + 1;
    while (cursor < tokens.length && FILLER_TOKENS.has(tokens[cursor])) cursor += 1;
    if (cursor < tokens.length && USER_TOKENS.has(tokens[cursor])) return true;
  }

  return false;
}

/** 会话 id：优先用不可变 header，其次兼容 session.id / session.sessionId。 */
export function sessionIdOf(session) {
  const candidate = session?.header?.id ?? session?.id ?? session?.sessionId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

/**
 * 子 Agent（subagent）会话不参与状态聚合和会话计数：
 * header.origin === "subagent" 或 header.delegationDepth > 0。
 */
export function isSubagentSession(session) {
  const header = session?.header;
  if (!header || typeof header !== "object") return false;
  if (header.origin === "subagent") return true;
  const depth = Number(header.delegationDepth);
  return Number.isFinite(depth) && depth > 0;
}

/**
 * 会话集合聚合成一个稳定状态。
 * 优先级：any asking -> asking；else any working -> working；else idle。
 * 传 Map 时会自动取 values()；也接受任意可迭代对象或记录数组。
 */
export function aggregateDshState(sessions) {
  const iterable = sessions instanceof Map ? sessions.values() : (sessions ?? []);
  let sawWorking = false;
  for (const record of iterable) {
    const state = typeof record === "string" ? record : record?.state;
    if (state === "asking") return "asking";
    if (state === "working") sawWorking = true;
  }
  return sawWorking ? "working" : "idle";
}

// ---------------------------------------------------------------------------
// 配置：路径解析、读取、校验
// ---------------------------------------------------------------------------

function homeFromOptions(options) {
  if (typeof options?.home === "function") return options.home();
  if (typeof options?.home === "string" && options.home.length > 0) return options.home;
  return homedirDefault();
}

/** DSH home：DSH_HOME 环境变量优先，支持 ~ 展开，否则回退 <home>/.dsh。 */
export function resolveDshHome(env = process.env, home = homedirDefault()) {
  const raw = typeof env?.DSH_HOME === "string" ? env.DSH_HOME.trim() : "";
  if (!raw) return joinPath(home, ".dsh");
  if (raw === "~") return home;
  if (raw.startsWith("~/") || raw.startsWith("~\\")) return joinPath(home, raw.slice(2));
  return raw;
}

/** ~/.dsh/sidekick/config.json（或 DSH_HOME 覆盖后的位置）。 */
export function resolveConfigPath(options = {}) {
  const env = options.env ?? process.env;
  const home = homeFromOptions(options);
  return joinPath(resolveDshHome(env, home), "sidekick", "config.json");
}

/** 严格校验配置结构；不合法返回 null。 */
export function normalizeConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { version, enabled, profile, endpoint, token } = value;
  if (version !== CONFIG_VERSION) return null;
  if (typeof enabled !== "boolean") return null;
  if (typeof profile !== "string" || profile.length === 0) return null;
  if (typeof endpoint !== "string" || endpoint.length === 0) return null;
  if (typeof token !== "string" || token.length === 0) return null;
  return Object.freeze({ version: CONFIG_VERSION, enabled, profile, endpoint, token });
}

/** 解析配置文本；格式错误返回 null。 */
export function parseConfigText(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return normalizeConfig(value);
}

/** endpoint 是否为本机回环地址（127.0.0.1 / localhost / ::1）。 */
export function isLoopbackEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length === 0) return false;
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  let host = url.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  return LOOPBACK_HOSTS.has(host);
}

/**
 * 配置是否允许发送：enabled、profile 与本插件安装 profile 一致、token 非空、
 * endpoint 必须是回环地址。
 */
export function isConfigActive(config, expectedProfile) {
  if (!config || typeof config !== "object") return false;
  if (config.version !== CONFIG_VERSION || config.enabled !== true) return false;
  if (typeof expectedProfile !== "string" || expectedProfile.length === 0) return false;
  if (typeof config.profile !== "string" || config.profile !== expectedProfile) return false;
  if (typeof config.token !== "string" || config.token.length === 0) return false;
  return isLoopbackEndpoint(config.endpoint);
}

/**
 * 从 import.meta.url 解析本插件所属 DSH profile。
 * 安装路径形如 <dshHome>/profiles/<profile>/plugins/sidekick-hook.mjs。
 * 解析不到返回 null（此后所有配置都会因 profile 不匹配而被忽略）。
 */
export function profileFromModuleUrl(moduleUrl) {
  try {
    if (typeof moduleUrl !== "string" || moduleUrl.length === 0) return null;
    let pathname;
    try {
      pathname = fileURLToPath(moduleUrl);
    } catch {
      pathname = moduleUrl;
    }
    const normalized = String(pathname).replace(/\\/gu, "/");
    const match = /\/profiles\/([^/]+)\/plugins(?:\/|$)/u.exec(normalized);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  } catch {
    return null;
  }
}

function configCacheKey(stats) {
  const mtime = typeof stats?.mtimeMs === "number" ? String(stats.mtimeMs) : "?";
  const size = typeof stats?.size === "number" ? String(stats.size) : "?";
  return `${mtime}:${size}`;
}

/**
 * 配置读取器：每次 read() 都 stat 一次，mtime/size 未变化时直接复用缓存结果。
 * readFile / stat 可注入，方便测试。
 */
export function createConfigReader(options = {}) {
  const configPath = typeof options.configPath === "string" ? options.configPath : null;
  const readFile = typeof options.readFile === "function" ? options.readFile : readFileDefault;
  const stat = typeof options.stat === "function" ? options.stat : statDefault;
  const maxBytes = toPositiveNumber(options.maxBytes, 8192);
  let cachedKey = null;
  let cachedConfig = null;
  let hasCache = false;

  async function read() {
    if (!configPath) return null;
    let stats = null;
    try {
      stats = await stat(configPath);
    } catch {
      stats = null;
    }
    if (!stats || typeof stats !== "object" || stats.isDirectory?.() === true) {
      cachedKey = null;
      cachedConfig = null;
      hasCache = false;
      return null;
    }
    const key = configCacheKey(stats);
    if (hasCache && key === cachedKey) return cachedConfig;
    let text;
    try {
      text = await readFile(configPath, "utf8");
    } catch {
      cachedKey = null;
      cachedConfig = null;
      hasCache = false;
      return null;
    }
    const config = typeof text === "string" && text.length <= maxBytes ? parseConfigText(text) : null;
    cachedKey = key;
    cachedConfig = config;
    hasCache = true;
    return config;
  }

  return { path: configPath, read };
}

// ---------------------------------------------------------------------------
// Reducer：把会话事件折叠成每个会话的稳定状态
// ---------------------------------------------------------------------------

function createSessionRecord(id) {
  return {
    id,
    state: "idle",
    turnActive: false,
    pendingAsks: new Set(),
    pendingApprovals: new Set(),
  };
}

function recomputeRecord(record) {
  if (record.pendingAsks.size > 0 || record.pendingApprovals.size > 0) {
    record.state = "asking";
    return;
  }
  record.state = record.turnActive ? "working" : "idle";
}

function toolCallIdOf(event) {
  const data = event?.data;
  const candidate =
    data?.callId ??
    data?.message?.toolCallId ??
    data?.message?.source?.callId ??
    data?.message?.callId;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

/**
 * 创建纯 reducer。返回值方法：
 * - handle(session, event)：返回 { state, sessions, signature, pulse } 或 null（忽略）；
 *   pulse 只在“本轮 completed 且允许发脉冲”时为 { resume: "working" | "idle" }。
 * - disposeSession(session)：移除会话，返回新快照或 null。
 * - snapshot()：当前 { state, sessions, signature }。
 *
 * sessions = 进行中的顶层会话数（state 为 working/asking），idle 的存活会话不计入。
 * 测试可注入 now（完成脉冲 5s 节流）、completedThrottleMs、maxSessions。
 */
export function createDshHookReducer(options = {}) {
  const now = typeof options.now === "function" ? options.now : Date.now;
  const completedThrottleMs = toPositiveNumber(
    options.completedThrottleMs,
    DEFAULT_COMPLETED_THROTTLE_MS,
  );
  const maxSessions = toPositiveNumber(options.maxSessions, DEFAULT_MAX_SESSIONS);
  const sessions = new Map();
  let lastCompletedAt = Number.NEGATIVE_INFINITY;

  // sessions 表示“进行中的顶层会话数”（working/asking）；idle 但还活着的会话不计数。
  function activeSessionCount() {
    let count = 0;
    for (const record of sessions.values()) {
      if (record.state !== "idle") count += 1;
    }
    return count;
  }

  function snapshot() {
    const state = aggregateDshState(sessions.values());
    const count = activeSessionCount();
    return { state, sessions: count, signature: `${state}:${count}`, pulse: null };
  }

  function evictOverflow(keepId) {
    if (sessions.size <= maxSessions) return;
    for (const [candidateId, candidate] of sessions) {
      if (candidateId !== keepId && candidate.state === "idle") {
        sessions.delete(candidateId);
        return;
      }
    }
    for (const candidateId of sessions.keys()) {
      if (candidateId !== keepId) {
        sessions.delete(candidateId);
        return;
      }
    }
  }

  function ensureRecord(id) {
    const existing = sessions.get(id);
    if (existing) return existing;
    const record = createSessionRecord(id);
    sessions.set(id, record);
    evictOverflow(id);
    return record;
  }

  function pulseForCompletedTurn() {
    const result = snapshot();
    if (result.state === "asking") return result;
    const timestamp = now();
    if (timestamp - lastCompletedAt < completedThrottleMs) return result;
    lastCompletedAt = timestamp;
    result.pulse = { resume: result.state === "working" ? "working" : "idle" };
    return result;
  }

  function handle(session, event) {
    if (!event || typeof event !== "object" || typeof event.type !== "string") return null;
    if (!HANDLED_EVENT_TYPES.has(event.type)) return null;
    const id = sessionIdOf(session);
    if (!id) return null;
    if (isSubagentSession(session)) {
      sessions.delete(id);
      return null;
    }

    const data = event.data;
    switch (event.type) {
      case "turn/start": {
        const record = ensureRecord(id);
        record.turnActive = true;
        record.pendingAsks.clear();
        record.pendingApprovals.clear();
        record.state = "working";
        return snapshot();
      }
      case "tool/call": {
        const record = ensureRecord(id);
        record.turnActive = true;
        const toolName = String(data?.name ?? "");
        if (isAskTool(toolName)) {
          const callId = toolCallIdOf(event) ?? `seq:${String(event.seq ?? "")}`;
          record.pendingAsks.add(callId);
          record.state = "asking";
        } else if (record.state !== "asking") {
          record.state = "working";
        }
        return snapshot();
      }
      case "tool/result": {
        const record = ensureRecord(id);
        record.turnActive = true;
        const callId = toolCallIdOf(event);
        if (callId !== null) {
          if (record.pendingAsks.delete(callId)) recomputeRecord(record);
        } else if (record.pendingAsks.size > 0) {
          // 拿不到 callId 时无法配对：宁可退回工作态，也不要把 waiting 永久卡住。
          record.pendingAsks.clear();
          recomputeRecord(record);
        }
        return snapshot();
      }
      case "approval/asked": {
        const record = ensureRecord(id);
        record.turnActive = true;
        const approvalId = String(data?.id ?? `seq:${String(event.seq ?? "")}`);
        record.pendingApprovals.add(approvalId);
        record.state = "asking";
        return snapshot();
      }
      case "approval/decided": {
        const record = ensureRecord(id);
        const approvalId = data?.id;
        if (approvalId !== undefined && approvalId !== null) {
          if (record.pendingApprovals.delete(String(approvalId))) recomputeRecord(record);
        } else if (record.pendingApprovals.size > 0) {
          record.pendingApprovals.clear();
          recomputeRecord(record);
        }
        return snapshot();
      }
      case "user/message": {
        const record = ensureRecord(id);
        // 用户消息意味着该会话的提问/审批已被回答或已过期；
        // 见 docs/engineering/dsh-hook.md §4：清该会话所有 ask/approval。
        if (record.pendingAsks.size > 0 || record.pendingApprovals.size > 0) {
          record.pendingAsks.clear();
          record.pendingApprovals.clear();
          recomputeRecord(record);
        }
        return snapshot();
      }
      case "turn/end": {
        const record = ensureRecord(id);
        record.turnActive = false;
        record.pendingAsks.clear();
        record.pendingApprovals.clear();
        const kind = data?.reason?.kind;
        if (kind === "completed") {
          record.state = "idle";
          return pulseForCompletedTurn();
        }
        record.state = kind === "blocked" ? "asking" : "idle";
        return snapshot();
      }
      default:
        return null;
    }
  }

  function disposeSession(session) {
    const id = sessionIdOf(session);
    if (!id) return null;
    if (!sessions.delete(id)) return null;
    return snapshot();
  }

  return { handle, disposeSession, snapshot };
}

// ---------------------------------------------------------------------------
// HTTP transport：回环 POST，1.5s 超时，一次重试，静默失败
// ---------------------------------------------------------------------------

function timeoutSignal(timeoutMs) {
  if (typeof AbortSignal === "function" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }
  if (typeof AbortController === "function") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer?.unref?.();
    return controller.signal;
  }
  return undefined;
}

/**
 * 创建 hook POST 通道。send() 永远 resolve（返回 true/false），不会 reject。
 * fetchImpl 可注入用于测试。
 */
export function createHttpTransport(options = {}) {
  const fetchImpl = options.fetchImpl;
  const timeoutMs = toPositiveNumber(options.timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
  const retries =
    typeof options.retries === "number" &&
    Number.isInteger(options.retries) &&
    options.retries >= 0
      ? options.retries
      : 1;

  async function attempt(config, message) {
    const fetchFn = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;
    if (typeof fetchFn !== "function") throw new Error("fetch is unavailable");
    const init = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(message),
    };
    const signal = timeoutSignal(timeoutMs);
    if (signal) init.signal = signal;
    const response = await fetchFn(config.endpoint, init);
    if (response && typeof response.ok === "boolean" && response.ok === false) {
      throw new Error(`hook endpoint returned HTTP ${String(response.status)}`);
    }
    return response;
  }

  async function send(config, message) {
    if (!config || typeof config.endpoint !== "string") return false;
    for (let index = 0; index <= retries; index += 1) {
      try {
        await attempt(config, message);
        return true;
      } catch {
        // 静默失败：DSH 不应因为 Sidekick 没开而收到任何异常。
      }
    }
    return false;
  }

  return { send };
}

// ---------------------------------------------------------------------------
// Controller：配置轮询 + 心跳 + 事件 -> POST
// ---------------------------------------------------------------------------

function activeConfigKey(config) {
  return config ? `${config.profile}\u0000${config.endpoint}\u0000${config.token}` : null;
}

/**
 * 创建 hook 控制器（apply 的薄壳背后真正的运行时）。
 *
 * 可注入：transport、configReader、now、setInterval/clearInterval、reducer，
 * 便于在 Vitest 里不碰真实网络/定时器。
 */
export function createHookController(options = {}) {
  const profile =
    typeof options.profile === "string" && options.profile.length > 0 ? options.profile : null;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const setIntervalImpl = typeof options.setInterval === "function" ? options.setInterval : setInterval;
  const clearIntervalImpl =
    typeof options.clearInterval === "function" ? options.clearInterval : clearInterval;
  const configPollMs = toPositiveNumber(options.configPollMs, DEFAULT_CONFIG_POLL_MS);
  const heartbeatMs = toPositiveNumber(options.heartbeatMs, DEFAULT_HEARTBEAT_MS);
  const maxQueue = toPositiveNumber(options.maxQueue, DEFAULT_MAX_QUEUE);

  const reducer =
    options.reducer && typeof options.reducer.handle === "function"
      ? options.reducer
      : createDshHookReducer({
          now,
          completedThrottleMs: options.completedThrottleMs,
          maxSessions: options.maxSessions,
        });

  const configReader =
    options.configReader && typeof options.configReader.read === "function"
      ? options.configReader
      : createConfigReader({
          configPath: options.configPath ?? resolveConfigPath({ env: options.env, home: options.home }),
        });

  const transport =
    options.transport && typeof options.transport.send === "function"
      ? options.transport
      : createHttpTransport({
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs,
          retries: options.retries,
        });

  let activeConfig = null;
  let activeKey = null;
  let lastSignature = null;
  let started = false;
  let stopped = false;
  let queue = [];
  let draining = false;
  let drainPromise = Promise.resolve();
  let pollTimer = null;
  let heartbeatTimer = null;

  function snapshotOfReducer() {
    if (typeof reducer.snapshot === "function") {
      const snapshot = reducer.snapshot();
      if (
        snapshot &&
        typeof snapshot.state === "string" &&
        typeof snapshot.sessions === "number"
      ) {
        return snapshot;
      }
    }
    return { state: "idle", sessions: 0, signature: "idle:0", pulse: null };
  }

  // 串行发送队列：保证 hello -> state -> ... 的顺序，网络挂起时也不会无限堆积。
  // 队列满时丢最旧的待发消息；心跳会持续补上最新状态。
  function pump() {
    if (draining || stopped) return;
    draining = true;
    drainPromise = (async () => {
      while (!stopped && queue.length > 0) {
        const config = activeConfig;
        if (!config) {
          queue = [];
          return;
        }
        const message = queue.shift();
        try {
          await transport.send(config, message);
        } catch {
          // 静默失败：Sidekick 未启动/异常都不能影响 DSH。
        }
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        draining = false;
        if (!stopped && queue.length > 0) pump();
      });
  }

  function send(message) {
    if (stopped || !activeConfig) return false;
    queue.push(message);
    if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
    pump();
    return true;
  }

  /** 等待当前队列发完；仅供测试与诊断，正常路径不依赖。 */
  async function whenIdle() {
    let observed = null;
    do {
      observed = drainPromise;
      await observed.catch(() => undefined);
    } while (draining || queue.length > 0 || observed !== drainPromise);
  }

  function stateMessage(state, sessions, resume) {
    const message = { type: "state", state, sessions, ts: now() };
    if (state === "completed") message.resume = resume === "working" ? "working" : "idle";
    return message;
  }

  function helloMessage() {
    return { type: "hello", pluginVersion: PLUGIN_VERSION, profile, ts: now() };
  }

  function heartbeatMessage() {
    const snapshot = snapshotOfReducer();
    return {
      type: "heartbeat",
      state: snapshot.state,
      sessions: snapshot.sessions,
      resume: null,
      ts: now(),
    };
  }

  function publish(result) {
    if (!result) return;
    if (result.pulse) {
      lastSignature = result.signature;
      send(stateMessage("completed", result.sessions, result.pulse.resume));
      return;
    }
    if (result.signature !== lastSignature) {
      lastSignature = result.signature;
      send(stateMessage(result.state, result.sessions, null));
    }
  }

  async function refreshConfig() {
    if (stopped) return null;
    let config = null;
    try {
      config = await configReader.read();
    } catch {
      config = null;
    }
    if (stopped) return null;
    const usable = isConfigActive(config, profile) ? config : null;
    activeConfig = usable;
    const nextKey = activeConfigKey(usable);
    if (!usable) {
      activeKey = null;
      lastSignature = null;
      queue = [];
      return null;
    }
    if (nextKey !== activeKey) {
      activeKey = nextKey;
      const snapshot = snapshotOfReducer();
      lastSignature = snapshot.signature;
      send(helloMessage());
      send(stateMessage(snapshot.state, snapshot.sessions, null));
    }
    return usable;
  }

  function sendHeartbeat() {
    if (stopped) return false;
    return send(heartbeatMessage());
  }

  function handleSessionEvent(session, event) {
    if (stopped) return null;
    try {
      const result = reducer.handle(session, event);
      publish(result);
      return result;
    } catch {
      return null;
    }
  }

  function handleSessionDisposed(session) {
    if (stopped) return null;
    try {
      const result =
        typeof reducer.disposeSession === "function" ? reducer.disposeSession(session) : null;
      publish(result);
      return result;
    } catch {
      return null;
    }
  }

  function start() {
    if (started) return api;
    started = true;
    stopped = false;
    try {
      heartbeatTimer = setIntervalImpl(() => {
        try {
          sendHeartbeat();
        } catch {
          // 心跳异常不允许冒泡到宿主定时器。
        }
      }, heartbeatMs);
      heartbeatTimer?.unref?.();
      pollTimer = setIntervalImpl(() => {
        void refreshConfig().catch(() => undefined);
      }, configPollMs);
      pollTimer?.unref?.();
    } catch {
      // 定时器不可用时仍尝试做一次配置读取；DSH 不应因此加载失败。
    }
    void refreshConfig().catch(() => undefined);
    return api;
  }

  function stop() {
    stopped = true;
    started = false;
    if (heartbeatTimer) {
      try {
        clearIntervalImpl(heartbeatTimer);
      } catch {
        // ignore
      }
      heartbeatTimer = null;
    }
    if (pollTimer) {
      try {
        clearIntervalImpl(pollTimer);
      } catch {
        // ignore
      }
      pollTimer = null;
    }
    activeConfig = null;
    activeKey = null;
    queue = [];
  }

  const api = {
    start,
    stop,
    refreshConfig,
    sendHeartbeat,
    handleSessionEvent,
    handleSessionDisposed,
    snapshot: snapshotOfReducer,
    whenIdle,
  };
  return api;
}

// ---------------------------------------------------------------------------
// DSH 插件入口
// ---------------------------------------------------------------------------

function resolveEventSource(ctx) {
  if (!ctx || typeof ctx !== "object") return null;
  const root = ctx.root;
  if (root && typeof root.on === "function") return root;
  if (typeof ctx.on === "function") return ctx;
  return null;
}

/**
 * DSH 插件入口。保持尽可能薄：只做事件订阅、生命周期清理，真正的状态机与 I/O
 * 都在 createHookController / createDshHookReducer 里（可单测）。
 *
 * 注意：这个函数绝不能把异常抛给 DSH；所有回调和清理都单独 try/catch。
 */
export function apply(ctx) {
  let controller = null;
  let offEvent = null;
  let offDisposed = null;
  try {
    const source = resolveEventSource(ctx);
    if (!source) return;
    const profile = profileFromModuleUrl(import.meta.url);
    controller = createHookController({ profile });
    controller.start();
    const handleEvent = (session, event) => {
      try {
        controller.handleSessionEvent(session, event);
      } catch {
        // 吞掉异常：单个会话事件的失败不能影响其他订阅者。
      }
    };
    const handleDisposed = (session) => {
      try {
        controller.handleSessionDisposed(session);
      } catch {
        // 同上。
      }
    };
    offEvent = source.on("session/event", handleEvent, { global: true });
    offDisposed = source.on("session/disposed", handleDisposed, { global: true });

    const dispose = () => {
      try {
        if (typeof offEvent === "function") offEvent();
      } catch {
        // ignore
      }
      try {
        if (typeof offDisposed === "function") offDisposed();
      } catch {
        // ignore
      }
      try {
        controller?.stop();
      } catch {
        // ignore
      }
    };

    if (typeof ctx.effect === "function") {
      ctx.effect(() => dispose, "sidekick-hook: DSH session status bridge");
    }
  } catch {
    try {
      if (typeof offEvent === "function") offEvent();
    } catch {
      // ignore
    }
    try {
      if (typeof offDisposed === "function") offDisposed();
    } catch {
      // ignore
    }
    try {
      controller?.stop();
    } catch {
      // ignore
    }
  }
}
