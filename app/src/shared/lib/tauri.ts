import { exit, onBackButtonPress } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { type DiscoveredServer, isDiscoveredServer } from "@/protocol/discovery";
import {
  type ConnEvent,
  isConnEvent,
  isStatusState,
  type MicStopReason,
  type ServerInfo,
  type SessionSource,
  type StatusState,
} from "@/protocol/messages";

export type AppRole = "desktop" | "mobile";
export type Unsubscribe = () => void;

/** App 主动触感的语义；具体映射到哪个 Android HapticFeedbackConstants 由原生层决定。 */
export type HapticStyle = "light" | "medium" | "success" | "error";

export type CloudAsrConfig = {
  endpoint: string;
  model: string;
  languageHints: string[];
  keepDialect: boolean;
  vadModel: "near_meeting_16k" | "far_field_meeting_16k";
  maxSentenceSilenceMs: number;
  heartbeat: boolean;
  vocabulary: string[];
};

export type CloudAsrStatus = {
  configured: boolean;
  consent: boolean;
  hasKey: boolean;
  keyMasked: string | null;
  config: CloudAsrConfig;
};

export type CloudAsrSaveInput = {
  config: CloudAsrConfig;
  consent: boolean;
  /** 新 Key；留空表示保持已保存的 Key。 */
  apiKey?: string | null;
  /** 删除已保存的 Key。 */
  clearKey?: boolean;
};

export type CloudAsrTestResult = {
  ok: boolean;
  latencyMs: number | null;
  model: string | null;
  errorCode: string | null;
  message: string | null;
};

/** 单次/单日/区间用量汇总；金额单位为人民币微元（1 元 = 1,000,000）。 */
export type UsageSummary = {
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  audioDurationMs: number;
  costCnyMicros: number;
};

export type UsageDay = UsageSummary & { date: string };

export type UsageStats = {
  today: UsageSummary;
  last7Days: UsageSummary;
  last30Days: UsageSummary;
  last365Days: UsageSummary;
  days: UsageDay[];
  priceNote: string;
};

export type AccessibilityInfo = {
  trusted: boolean;
  appName: string;
  executablePath: string;
  isDev: boolean;
};

export type ClipboardItem = {
  id: string;
  text: string;
  kind: "text" | "url" | "voice";
  createdAt: number;
  lastUsedAt: number;
  pinned: boolean;
};

export type ClipboardSnapshot = {
  enabled: boolean;
  items: ClipboardItem[];
  path: string;
  maxItems: number;
};

/** AI 联动：与协议层 status.state 同义；idle 对应产品里的「静态」。 */
export type DshHookState = StatusState;

export type DshHookEvent = {
  at: number;
  state: DshHookState;
  sessions: number;
  source: string;
};

export type DshProfileInfo = {
  name: string;
  label: string;
  active: boolean;
  installed: boolean;
};

export type DshHookStatus = {
  installed: boolean;
  enabled: boolean;
  connected: boolean;
  profile: string | null;
  currentState: DshHookState;
  sessions: number;
  lastEventAt: number | null;
  lastHeartbeatAt: number | null;
  pluginVersion: number | null;
  endpoint: string | null;
  configPath: string;
  pluginPath: string | null;
  patchPath: string | null;
  error: string | null;
  recentEvents: DshHookEvent[];
  profiles: DshProfileInfo[];
};

const COMMANDS = {
  appRole: "app_role",
  setKeepScreenOn: "set_keep_screen_on",
  haptic: "haptic",
  disableWebviewHaptics: "disable_webview_haptics",
  serverInfo: "server_info",
  discoverServers: "discover_servers",
  connectServer: "connect_server",
  sendChat: "send_chat",
  micStart: "mic_start",
  micFrame: "mic_frame",
  micStop: "mic_stop",
  accessibilityInfo: "accessibility_info",
  accessibilityOpenSettings: "accessibility_open_settings",
  accessibilityRequest: "accessibility_request",
  accessibilityRevealApp: "accessibility_reveal_app",
  asrCloudStatus: "asr_cloud_status",
  asrCloudSave: "asr_cloud_save",
  asrCloudTest: "asr_cloud_test",
  asrCloudClear: "asr_cloud_clear",
  asrUsageStats: "asr_usage_stats",
  asrUsageClear: "asr_usage_clear",
  clipboardList: "clipboard_list",
  clipboardStatus: "clipboard_status",
  clipboardCopy: "clipboard_copy",
  clipboardTogglePin: "clipboard_toggle_pin",
  clipboardDelete: "clipboard_delete",
  clipboardClear: "clipboard_clear",
  clipboardSetEnabled: "clipboard_set_enabled",
  sendStatusRequest: "send_status_request",
  sendFocusRequest: "send_focus_request",
  dshHookStatus: "dsh_hook_status",
  dshHookInstall: "dsh_hook_install",
  dshHookSetEnabled: "dsh_hook_set_enabled",
  dshHookRemove: "dsh_hook_remove",
  dshHookTest: "dsh_hook_test",
} as const;

const EVENTS = {
  chat: "chat",
  conn: "conn",
  clipboardChanged: "clipboard-changed",
  dshHookStatus: "dsh-hook-status",
} as const;

type Listener<T> = (payload: T) => void;

function createEventChannel(name: string) {
  const listeners = new Set<Listener<unknown>>();
  let unlisten: UnlistenFn | null = null;
  let pending: Promise<UnlistenFn> | null = null;
  let closed = false;

  function start() {
    if (unlisten || pending) return;

    const current = listen<unknown>(name, (event) => {
      for (const listener of [...listeners]) listener(event.payload);
    });
    pending = current;

    void current
      .then((stop) => {
        if (pending !== current) {
          stop();
          return;
        }
        pending = null;
        if (closed || listeners.size === 0) {
          closed = false;
          stop();
        } else {
          unlisten = stop;
        }
      })
      .catch(() => {
        if (pending === current) pending = null;
      });
  }

  return (listener: Listener<unknown>): Unsubscribe => {
    listeners.add(listener);
    closed = false;
    start();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);

      if (listeners.size === 0) {
        closed = true;
        if (unlisten) {
          unlisten();
          unlisten = null;
        }
      }
    };
  };
}

const chatChannel = createEventChannel(EVENTS.chat);
const connChannel = createEventChannel(EVENTS.conn);
const clipboardChannel = createEventChannel(EVENTS.clipboardChanged);
const dshHookChannel = createEventChannel(EVENTS.dshHookStatus);

export async function getAppRole(): Promise<AppRole> {
  const role = await invoke<string>(COMMANDS.appRole);
  if (role !== "desktop" && role !== "mobile") {
    throw new Error(`未知的运行平台：${role}`);
  }
  return role;
}

export function getServerInfo(): Promise<ServerInfo> {
  return invoke<ServerInfo>(COMMANDS.serverInfo);
}

/**
 * 手机端屏幕常亮：宠物页面在前台时阻止系统自动熄屏。
 *
 * 桌面端不注册该命令、iOS 暂为空实现；失败时调用方应静默降级为系统默认熄屏策略。
 */
export function setKeepScreenOn(enabled: boolean): Promise<void> {
  return invoke<void>(COMMANDS.setKeepScreenOn, { enabled });
}

/**
 * App 主动触感（手机端）。
 *
 * 原生层用 `View.performHapticFeedback`，不申请 `VIBRATE` 权限，并跟随系统
 * 「触摸振动」开关；桌面/iOS 暂为空实现，失败时调用方静默忽略。
 */
export function haptic(style: HapticStyle): Promise<void> {
  return invoke<void>(COMMANDS.haptic, { style });
}

/**
 * 关闭 WebView 自带的系统触感（长按文本选择 / 上下文菜单的默认震动）。
 *
 * 触感改由 `haptic()` 统一控制；只影响 WebView 这个 View，不影响 App 主动触感。
 */
export function disableWebviewHaptics(): Promise<void> {
  return invoke<void>(COMMANDS.disableWebviewHaptics);
}

/** 搜索同一局域网内正在广播的电脑；非法条目直接丢弃。 */
export async function discoverServers(): Promise<DiscoveredServer[]> {
  const result = await invoke<unknown>(COMMANDS.discoverServers);
  if (!Array.isArray(result)) {
    throw new Error("搜索电脑失败：返回结果格式不正确");
  }
  return result.filter(isDiscoveredServer);
}

export function connectServer(addr: string): Promise<void> {
  return invoke<void>(COMMANDS.connectServer, { addr });
}

export function sendChat(text: string): Promise<void> {
  return invoke<void>(COMMANDS.sendChat, { text });
}

export function sendMicStart(session: string, sampleRate: number, frameMs: number): Promise<void> {
  return invoke<void>(COMMANDS.micStart, { session, sampleRate, frameMs });
}

export function sendMicFrame(session: string, sequence: number, pcm: string): Promise<void> {
  return invoke<void>(COMMANDS.micFrame, { session, sequence, pcm });
}

export function sendMicStop(session: string, reason: MicStopReason): Promise<void> {
  return invoke<void>(COMMANDS.micStop, { session, reason });
}

export function getAccessibilityInfo(): Promise<AccessibilityInfo> {
  return invoke<AccessibilityInfo>(COMMANDS.accessibilityInfo);
}

export function openAccessibilitySettings(): Promise<void> {
  return invoke<void>(COMMANDS.accessibilityOpenSettings);
}

export function requestAccessibility(): Promise<AccessibilityInfo> {
  return invoke<AccessibilityInfo>(COMMANDS.accessibilityRequest);
}

export function revealAccessibilityApp(): Promise<void> {
  return invoke<void>(COMMANDS.accessibilityRevealApp);
}

export function getCloudAsrStatus(): Promise<CloudAsrStatus> {
  return invoke<CloudAsrStatus>(COMMANDS.asrCloudStatus);
}

export function saveCloudAsr(input: CloudAsrSaveInput): Promise<CloudAsrStatus> {
  return invoke<CloudAsrStatus>(COMMANDS.asrCloudSave, { input });
}

export function testCloudAsr(input: {
  config: CloudAsrConfig;
  apiKey?: string | null;
}): Promise<CloudAsrTestResult> {
  return invoke<CloudAsrTestResult>(COMMANDS.asrCloudTest, {
    config: input.config,
    apiKey: input.apiKey ?? null,
  });
}

export function clearCloudAsr(): Promise<CloudAsrStatus> {
  return invoke<CloudAsrStatus>(COMMANDS.asrCloudClear);
}

export function getUsageStats(): Promise<UsageStats> {
  return invoke<UsageStats>(COMMANDS.asrUsageStats);
}

export function clearUsageStats(): Promise<UsageStats> {
  return invoke<UsageStats>(COMMANDS.asrUsageClear);
}

export function listClipboard(): Promise<ClipboardSnapshot> {
  return invoke<ClipboardSnapshot>(COMMANDS.clipboardList);
}

export function getClipboardStatus(): Promise<ClipboardSnapshot> {
  return invoke<ClipboardSnapshot>(COMMANDS.clipboardStatus);
}

export function copyClipboardItem(id: string): Promise<ClipboardSnapshot> {
  return invoke<ClipboardSnapshot>(COMMANDS.clipboardCopy, { id });
}

export function toggleClipboardPin(id: string): Promise<ClipboardSnapshot> {
  return invoke<ClipboardSnapshot>(COMMANDS.clipboardTogglePin, { id });
}

export function deleteClipboardItem(id: string): Promise<ClipboardSnapshot> {
  return invoke<ClipboardSnapshot>(COMMANDS.clipboardDelete, { id });
}

export function clearClipboard(): Promise<ClipboardSnapshot> {
  return invoke<ClipboardSnapshot>(COMMANDS.clipboardClear);
}

export function setClipboardEnabled(enabled: boolean): Promise<ClipboardSnapshot> {
  return invoke<ClipboardSnapshot>(COMMANDS.clipboardSetEnabled, { enabled });
}

/** 手机端请求一次当前 AI 状态快照；桌面端收到后回一条 status（广播）。 */
export function sendStatusRequest(): Promise<void> {
  return invoke<void>(COMMANDS.sendStatusRequest);
}

/** 手机端请求电脑把某个会话对应的软件切到前台；结果走 focus.result 事件。 */
export function sendFocusRequest(
  source: SessionSource,
  sessionId: string,
  requestId: string,
): Promise<void> {
  return invoke<void>(COMMANDS.sendFocusRequest, { source, sessionId, requestId });
}

export function getDshHookStatus(): Promise<DshHookStatus> {
  return invoke<DshHookStatus>(COMMANDS.dshHookStatus);
}

/** 写入本地 DSH 联动脚本 + profile patch；首次生效需要重启 DSH。 */
export function installDshHook(profile: string): Promise<DshHookStatus> {
  return invoke<DshHookStatus>(COMMANDS.dshHookInstall, { profile });
}

/** 只切换 enabled 配置；已安装时 1 秒内热生效，不需要重启 DSH。 */
export function setDshHookEnabled(enabled: boolean): Promise<DshHookStatus> {
  return invoke<DshHookStatus>(COMMANDS.dshHookSetEnabled, { enabled });
}

/** 移除 Sidekick 写入的 patch 标记、脚本和配置；DSH 下次启动不再加载。 */
export function removeDshHook(): Promise<DshHookStatus> {
  return invoke<DshHookStatus>(COMMANDS.dshHookRemove);
}

/** 本机模拟一次状态，走同一条广播链路，便于不启动 DSH 时验收手机四态。 */
export function testDshHook(state: DshHookState): Promise<DshHookStatus> {
  return invoke<DshHookStatus>(COMMANDS.dshHookTest, { state });
}

export function isDshHookStatus(value: unknown): value is DshHookStatus {
  if (typeof value !== "object" || value === null) return false;
  const status = value as Record<string, unknown>;
  return (
    typeof status.installed === "boolean" &&
    typeof status.enabled === "boolean" &&
    typeof status.connected === "boolean" &&
    isStatusState(status.currentState) &&
    typeof status.sessions === "number" &&
    typeof status.configPath === "string" &&
    Array.isArray(status.recentEvents) &&
    Array.isArray(status.profiles)
  );
}

export function subscribeDshHookStatus(handler: (status: DshHookStatus) => void): Unsubscribe {
  return dshHookChannel((payload) => {
    if (isDshHookStatus(payload)) handler(payload);
  });
}

export function subscribeChat(handler: (raw: string) => void): Unsubscribe {
  return chatChannel((payload) => {
    if (typeof payload === "string") handler(payload);
  });
}

export function subscribeConn(handler: (payload: ConnEvent) => void): Unsubscribe {
  return connChannel((payload) => {
    if (isConnEvent(payload)) handler(payload);
  });
}

export function isClipboardSnapshot(value: unknown): value is ClipboardSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.enabled === "boolean" && Array.isArray(snapshot.items);
}

export function subscribeClipboardChanged(
  handler: (payload: ClipboardSnapshot) => void,
): Unsubscribe {
  return clipboardChannel((payload) => {
    if (isClipboardSnapshot(payload)) handler(payload);
  });
}

export type BackButtonPayload = { canGoBack: boolean };

/**
 * 接管 Android 系统返回键。
 *
 * 一旦注册，Tauri 不再自动退出/回退，全部交给 handler 决定；所以整个 App 只在启动时
 * 注册一次（根页面兜底「再按一次退出」），设置页/聊天页的返回语义由
 * `mobile/system-back.ts` 的返回栈决定。非 Android 环境（桌面 / iOS / 浏览器）
 * 注册失败时静默降级，返回键行为不变。
 */
export function subscribeBackButton(handler: (payload: BackButtonPayload) => void): Unsubscribe {
  let unregister: Unsubscribe | null = null;
  let disposed = false;

  void onBackButtonPress((payload) => {
    if (!disposed) handler(payload);
  })
    .then((listener) => {
      if (disposed) {
        void listener.unregister().catch(() => undefined);
        return;
      }
      unregister = () => {
        void listener.unregister().catch(() => undefined);
      };
    })
    .catch((error: unknown) => {
      console.warn("[back-button] 接管返回键失败，保持系统默认行为：", normalizeError(error));
    });

  return () => {
    if (disposed) return;
    disposed = true;
    unregister?.();
    unregister = null;
  };
}

/** 退出 App（Android 走 AppPlugin.exit → finishAffinity）；需要 `core:app:allow-exit` 权限。 */
export function exitApp(code = 0): Promise<void> {
  return exit(code);
}

export function normalizeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
