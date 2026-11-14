import { exit, onBackButtonPress } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { type DiscoveredServer, isDiscoveredServer } from "@/protocol/discovery";
import {
  type AppendResult,
  isMemoEvent,
  type MemoDetail,
  type MemoEvent,
  type MemoKeyStatus,
  type MemoStorageStats,
  type MemoSummary,
  type MemoType,
  type RecordingStarted,
  type RecordingStatus,
} from "@/protocol/memo";
import {
  type ConnEvent,
  isConnEvent,
  isStatusState,
  type KeyAction,
  type MicStopReason,
  type PricingStatus,
  type ServerInfo,
  type SessionSource,
  type StatusState,
  type TokenUsageStats,
  type UsageRange,
} from "@/protocol/messages";
import {
  isRemoteHudPayload,
  type RemoteHudPayload,
  type RemoteMicAckCode,
  type RemoteMicAction,
} from "@/protocol/remote-mic";
import {
  isWordChangedEvent,
  type WordDetail,
  type WordGenerateResult,
  type WordStatusInfo,
  type WordSummary,
  type WordTtsResult,
  type WordUsageStats,
} from "@/protocol/words";

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
  /** 关键词列表（一行一个词）；录音时作为即时热词发送。 */
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
  sendKeyRequest: "send_key_request",
  accessibilityInfo: "accessibility_info",
  accessibilityOpenSettings: "accessibility_open_settings",
  accessibilityRequest: "accessibility_request",
  accessibilityRevealApp: "accessibility_reveal_app",
  asrCloudStatus: "asr_cloud_status",
  asrCloudSave: "asr_cloud_save",
  asrCloudTest: "asr_cloud_test",
  asrCloudClear: "asr_cloud_clear",
  asrKeywordsSave: "asr_keywords_save",
  asrUsageStats: "asr_usage_stats",
  asrUsageClear: "asr_usage_clear",
  clipboardList: "clipboard_list",
  clipboardStatus: "clipboard_status",
  clipboardCopy: "clipboard_copy",
  clipboardTogglePin: "clipboard_toggle_pin",
  clipboardDelete: "clipboard_delete",
  clipboardClear: "clipboard_clear",
  clipboardSetEnabled: "clipboard_set_enabled",
  clipboardSetMaxItems: "clipboard_set_max_items",
  sendStatusRequest: "send_status_request",
  sendFocusRequest: "send_focus_request",
  dshHookStatus: "dsh_hook_status",
  dshHookInstall: "dsh_hook_install",
  dshHookSetEnabled: "dsh_hook_set_enabled",
  dshHookRemove: "dsh_hook_remove",
  dshHookTest: "dsh_hook_test",
  hotkeyStatus: "hotkey_status",
  hotkeySave: "hotkey_save",
  sendRemoteMicAck: "send_remote_mic_ack",
  sendRemoteMicStatus: "send_remote_mic_status",
  sendUsageRequest: "send_usage_request",
  tokenUsageStats: "token_usage_stats",
  tokenPricingStatus: "token_pricing_status",
  tokenPricingRefresh: "token_pricing_refresh",
  tokenPricingSetAuto: "token_pricing_set_auto",
  tokenPricingSetMobileModels: "token_pricing_set_mobile_models",
  hideUsagePanel: "hide_usage_panel",
  openUsagePage: "open_usage_page",
  panelGlassReady: "panel_glass_ready",
  usagePanelPinned: "usage_panel_pinned",
  setUsagePanelPinned: "set_usage_panel_pinned",
  usagePanelArrowX: "usage_panel_arrow_x",
  usagePanelArrowEnabled: "usage_panel_arrow_enabled",
  memoList: "memo_list",
  memoGet: "memo_get",
  memoUpdate: "memo_update",
  memoDelete: "memo_delete",
  memoDeleteAudio: "memo_delete_audio",
  memoStorageStats: "memo_storage_stats",
  memoRecordingStart: "memo_recording_start",
  memoRecordingAppend: "memo_recording_append",
  memoRecordingFinish: "memo_recording_finish",
  memoRecordingCancel: "memo_recording_cancel",
  memoRecordingStatus: "memo_recording_status",
  memoRetry: "memo_retry",
  memoKeyStatus: "memo_key_status",
  memoKeySave: "memo_key_save",
  memoKeyClear: "memo_key_clear",
  memoPairRequest: "memo_pair_request",
  memoPairApply: "memo_pair_apply",
  memoSyncNow: "memo_sync_now",
  memoSyncPending: "memo_sync_pending",
  memoPairCodeCreate: "memo_pair_code_create",
  wordList: "word_list",
  wordGet: "word_get",
  wordAdd: "word_add",
  wordExplain: "word_explain",
  wordSetNote: "word_set_note",
  wordDelete: "word_delete",
  wordGenerate: "word_generate",
  wordUsage: "word_usage",
  wordStatus: "word_status",
  wordConsent: "word_consent",
  wordClipboardCandidates: "word_clipboard_candidates",
  wordSyncNow: "word_sync_now",
  wordTts: "word_tts",
  wordExportMarkdown: "word_export_markdown",
} as const;

const EVENTS = {
  chat: "chat",
  conn: "conn",
  clipboardChanged: "clipboard-changed",
  dshHookStatus: "dsh-hook-status",
  navigate: "sidekick-navigate",
  memo: "memo",
  memoChanged: "memo-changed",
  wordChanged: "word-changed",
  hotkeyChanged: "hotkey-changed",
  micHud: "mic-hud",
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
const navigateChannel = createEventChannel(EVENTS.navigate);
const memoChannel = createEventChannel(EVENTS.memo);
const memoChangedChannel = createEventChannel(EVENTS.memoChanged);
const wordChangedChannel = createEventChannel(EVENTS.wordChanged);
const hotkeyChangedChannel = createEventChannel(EVENTS.hotkeyChanged);
const micHudChannel = createEventChannel(EVENTS.micHud);

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

/** 手机请求一次用量快照；桌面回 `usage` 消息（不含提示词/路径）。 */
export function sendUsageRequest(range: UsageRange): Promise<void> {
  return invoke<void>(COMMANDS.sendUsageRequest, { range });
}

export function sendMicStart(session: string, sampleRate: number, frameMs: number): Promise<void> {
  return invoke<void>(COMMANDS.micStart, { session, sampleRate, frameMs });
}

export function sendMicFrame(
  session: string,
  sequence: number,
  pcm: string,
  level?: number,
): Promise<void> {
  return invoke<void>(COMMANDS.micFrame, { session, sequence, pcm, level: level ?? null });
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

/** 只保存关键词，不触碰同意状态、API Key 与其他识别参数。 */
export function saveCloudKeywords(keywords: string[]): Promise<CloudAsrStatus> {
  return invoke<CloudAsrStatus>(COMMANDS.asrKeywordsSave, { keywords });
}

export function getUsageStats(): Promise<UsageStats> {
  return invoke<UsageStats>(COMMANDS.asrUsageStats);
}

/** 桌面端 Token 用量看板：读取本机 DSH 账本并聚合。 */
export function getTokenUsageStats(range: UsageRange): Promise<TokenUsageStats> {
  return invoke<TokenUsageStats>(COMMANDS.tokenUsageStats, { range });
}

export function getTokenPricingStatus(): Promise<PricingStatus> {
  return invoke<PricingStatus>(COMMANDS.tokenPricingStatus);
}

export function refreshTokenPricing(force: boolean): Promise<PricingStatus> {
  return invoke<PricingStatus>(COMMANDS.tokenPricingRefresh, { force });
}

export function setTokenPricingAuto(enabled: boolean): Promise<PricingStatus> {
  return invoke<PricingStatus>(COMMANDS.tokenPricingSetAuto, { enabled });
}

export function setTokenPricingMobileModels(enabled: boolean): Promise<PricingStatus> {
  return invoke<PricingStatus>(COMMANDS.tokenPricingSetMobileModels, { enabled });
}

/** 菜单栏用量小看板（D108）：Esc / 点外部收起，不退出进程。 */
export function hideUsagePanel(): Promise<void> {
  return invoke<void>(COMMANDS.hideUsagePanel);
}

/** 小看板「打开用量页」：唤起主窗口并切到用量页（Rust 发 `sidekick-navigate`）。 */
export function openUsagePage(): Promise<void> {
  return invoke<void>(COMMANDS.openUsagePage);
}

/**
 * 小看板卡片区是否铺上了原生玻璃底衬（D120）。
 *
 * CSS 的 `backdrop-filter` 采不到窗口背后的桌面，磨砂只能由 Rust 在 WebView 下垫
 * `NSVisualEffectView` 提供。铺上了卡片才能用半透明 tint；没铺上（非 macOS /
 * `SIDEKICK_UI_VIBRANCY=off` / AppKit 失败）必须继续用不透明实色，否则正文会直接
 * 压在清晰的壁纸上。
 */
export function panelGlassReady(): Promise<boolean> {
  return invoke<boolean>(COMMANDS.panelGlassReady);
}

/**
 * 小看板「钉住」状态（D135）：钉住后失焦不收起，Esc / 再点图标 / Cmd+W 仍照收。
 *
 * 真值在 Rust（失焦判断在窗口事件里）；面板挂载时读一次校准按钮态，
 * 防止 WebView 重载后 JS 状态与 Rust 不一致。
 */
export function usagePanelPinned(): Promise<boolean> {
  return invoke<boolean>(COMMANDS.usagePanelPinned);
}

/** 写钉住状态；返回生效后的值，前端用它收敛按钮。 */
export function setUsagePanelPinned(pinned: boolean): Promise<boolean> {
  return invoke<boolean>(COMMANDS.setUsagePanelPinned, { pinned });
}

/**
 * 顶部指引尖的横向中心（逻辑像素，相对卡片左边；D138）。
 *
 * 卡片会被夹在屏幕安全边内、图标不会，所以贴边时尖要跟着图标挪。
 * Rust 在每次定位后算出这个值，并在 show 之前写进 CSS 变量；这里只是兜底校准。
 */
export function usagePanelArrowX(): Promise<number> {
  return invoke<number>(COMMANDS.usagePanelArrowX);
}

/** 尖是否启用（`SIDEKICK_PANEL_ARROW=off` 时前端不画三角）。 */
export function usagePanelArrowEnabled(): Promise<boolean> {
  return invoke<boolean>(COMMANDS.usagePanelArrowEnabled);
}

/**
 * 桌面主窗口导航事件（目前只有 `"usage"`）。
 *
 * 由 Rust 在「看板 → 打开用量页」时 `emit_to("main", …)`；主窗口隐藏时也会收到，
 * 因为 WebView 仍在内存里跑。StrictMode 下的异步 listen 清理复用 `createEventChannel`。
 */
export function subscribeNavigate(handler: (view: string) => void): Unsubscribe {
  return navigateChannel((payload) => {
    if (typeof payload === "string") handler(payload);
  });
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

/** 保留条数（10–200，Rust 侧夹住）；改小会立即按「置顶优先、其余从旧到新」裁剪。 */
export function setClipboardMaxItems(maxItems: number): Promise<ClipboardSnapshot> {
  return invoke<ClipboardSnapshot>(COMMANDS.clipboardSetMaxItems, { maxItems });
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

/**
 * 手机端请求在最近一次输入的目标应用里按一次键；结果走 key.result 事件。
 *
 * 只由用户主动点按触发：`enter` 合成 Return，`clear` 合成 ⌘A + Delete。
 */
export function sendKeyRequest(
  action: KeyAction,
  session: string,
  requestId: string,
): Promise<void> {
  return invoke<void>(COMMANDS.sendKeyRequest, { action, session, requestId });
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

/** 语音备忘录的本地管道事件（录音完成 / 转写进度 / Key 变化）。 */
export function subscribeMemo(handler: (event: MemoEvent) => void): Unsubscribe {
  return memoChannel((payload) => {
    if (isMemoEvent(payload)) handler(payload);
  });
}

/** 桌面镜像收到手机推送/音频提交后广播的「列表变了」。 */
export function subscribeMemoChanged(handler: () => void): Unsubscribe {
  return memoChangedChannel(() => handler());
}

export function memoList(): Promise<MemoSummary[]> {
  return invoke<MemoSummary[]>(COMMANDS.memoList);
}

export function memoGet(id: string): Promise<MemoDetail> {
  return invoke<MemoDetail>(COMMANDS.memoGet, { id });
}

export function memoUpdate(
  id: string,
  input: { title?: string; memoType?: MemoType },
): Promise<MemoSummary> {
  return invoke<MemoSummary>(COMMANDS.memoUpdate, { id, ...input });
}

export function memoDelete(id: string): Promise<void> {
  return invoke<void>(COMMANDS.memoDelete, { id });
}

export function memoDeleteAudio(id: string): Promise<void> {
  return invoke<void>(COMMANDS.memoDeleteAudio, { id });
}

export function memoStorageStats(): Promise<MemoStorageStats> {
  return invoke<MemoStorageStats>(COMMANDS.memoStorageStats);
}

export function memoRecordingStart(): Promise<RecordingStarted> {
  return invoke<RecordingStarted>(COMMANDS.memoRecordingStart);
}

export function memoRecordingAppend(session: string, pcm: string): Promise<AppendResult> {
  return invoke<AppendResult>(COMMANDS.memoRecordingAppend, { session, pcm });
}

export function memoRecordingFinish(): Promise<MemoSummary> {
  return invoke<MemoSummary>(COMMANDS.memoRecordingFinish);
}

export function memoRecordingCancel(): Promise<void> {
  return invoke<void>(COMMANDS.memoRecordingCancel);
}

export function memoRecordingStatus(): Promise<RecordingStatus | null> {
  return invoke<RecordingStatus | null>(COMMANDS.memoRecordingStatus);
}

export function memoRetry(id: string): Promise<void> {
  return invoke<void>(COMMANDS.memoRetry, { id });
}

export function memoKeyStatus(): Promise<MemoKeyStatus> {
  return invoke<MemoKeyStatus>(COMMANDS.memoKeyStatus);
}

export function memoKeySave(key: string): Promise<MemoKeyStatus> {
  return invoke<MemoKeyStatus>(COMMANDS.memoKeySave, { key });
}

export function memoKeyClear(): Promise<MemoKeyStatus> {
  return invoke<MemoKeyStatus>(COMMANDS.memoKeyClear);
}

export function memoPairRequest(code: string, name?: string): Promise<void> {
  return invoke<void>(COMMANDS.memoPairRequest, { code, name });
}

export function memoPairApply(token: string, key?: string): Promise<MemoKeyStatus> {
  return invoke<MemoKeyStatus>(COMMANDS.memoPairApply, { token, key });
}

export type MemoPairCode = { code: string; expiresAt: number };

/** 桌面生成一次性配对码（2 分钟、错 3 次作废），手机用它换 token + Key。 */
export function memoPairCodeCreate(): Promise<MemoPairCode> {
  return invoke<MemoPairCode>(COMMANDS.memoPairCodeCreate);
}

/** 连上电脑 / 打开备忘录页 / 条目完成后触发一次镜像同步；未配对时静默返回。 */
export function memoSyncNow(): Promise<void> {
  return invoke<void>(COMMANDS.memoSyncNow);
}

export function memoSyncPending(): Promise<number> {
  return invoke<number>(COMMANDS.memoSyncPending);
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

// ── 英语角（生词本）─────────────────────────────────────────────────────

/** 词库列表；`query` 为空返回全部（Rust 侧按 updated_at 倒序）。 */
export function wordList(query?: string): Promise<WordSummary[]> {
  return invoke<WordSummary[]>(COMMANDS.wordList, { query: query ?? null });
}

export function wordGet(word: string): Promise<WordDetail | null> {
  return invoke<WordDetail | null>(COMMANDS.wordGet, { word });
}

/** 新增词条（pending）；解释由 `wordExplain` 单独触发，失败可重试。 */
export function wordAdd(input: {
  word: string;
  context?: string;
  source?: string;
}): Promise<WordDetail> {
  return invoke<WordDetail>(COMMANDS.wordAdd, {
    word: input.word,
    context: input.context ?? null,
    source: input.source ?? "manual",
  });
}

/** 调用百炼解释一个词；成功返回 ready 详情，失败抛错（词条保留为 failed）。 */
export function wordExplain(word: string, context?: string): Promise<WordDetail> {
  return invoke<WordDetail>(COMMANDS.wordExplain, { word, context: context ?? null });
}

/** 修改备注（空字符串表示清空）。 */
export function wordSetNote(word: string, note: string | null): Promise<WordDetail> {
  return invoke<WordDetail>(COMMANDS.wordSetNote, { word, note });
}

/** 删除（墓碑）；同步后另一端也会消失。 */
export function wordDelete(word: string): Promise<void> {
  return invoke<void>(COMMANDS.wordDelete, { word });
}

/** 用选中的词生成 3–5 个例句。 */
export function wordGenerate(words: string[]): Promise<WordGenerateResult> {
  return invoke<WordGenerateResult>(COMMANDS.wordGenerate, { words });
}

export function wordUsage(): Promise<WordUsageStats> {
  return invoke<WordUsageStats>(COMMANDS.wordUsage);
}

export function wordStatus(): Promise<WordStatusInfo> {
  return invoke<WordStatusInfo>(COMMANDS.wordStatus);
}

/** 首次使用同意（把单词原文/可选语境发送到百炼）。 */
export function wordConsent(agreed: boolean): Promise<WordStatusInfo> {
  return invoke<WordStatusInfo>(COMMANDS.wordConsent, { agreed });
}

/** 桌面：从剪贴板历史里提取英文候选词（只读，不自动入库）。 */
export function wordClipboardCandidates(): Promise<string[]> {
  return invoke<string[]>(COMMANDS.wordClipboardCandidates);
}

/**
 * 语音合成（qwen-audio-3.1-tts-plus）：返回本地音频路径（缓存命中不发请求）。
 * 桌面在云端失败时回退系统 `say`，此时 `fallback=true`、`path` 为空。
 */
export function wordTts(text: string, kind: "word" | "sentence" = "word"): Promise<WordTtsResult> {
  return invoke<WordTtsResult>(COMMANDS.wordTts, { text, kind });
}

/** 导出全部词条为 Markdown 文本（前端展示并复制，不写文件、不联网）。 */
export function wordExportMarkdown(): Promise<string> {
  return invoke<string>(COMMANDS.wordExportMarkdown);
}

/** 手机：立即同步一次词库（连上电脑时调用）。 */
export function wordSyncNow(): Promise<void> {
  return invoke<void>(COMMANDS.wordSyncNow);
}

/** 本机或对端改了词库（新增/解释完成/删除/同步落库）后触发，订阅方重新拉列表。 */
export function subscribeWordChanged(handler: () => void): Unsubscribe {
  return wordChangedChannel((payload) => {
    if (isWordChangedEvent(payload)) handler();
  });
}

// ---------------------------------------------------------------------------
// 桌面快捷键（全局录音开关）
// ---------------------------------------------------------------------------

export type HotkeyBareKey =
  | "leftControl"
  | "rightControl"
  | "leftShift"
  | "rightShift"
  | "leftOption"
  | "rightOption"
  | "leftCommand"
  | "rightCommand";

export type HotkeyBinding =
  | { kind: "bare"; key: HotkeyBareKey }
  | { kind: "single"; keyCode: number; label: string }
  | {
      kind: "combo";
      keyCode: number;
      label: string;
      control: boolean;
      shift: boolean;
      option: boolean;
      command: boolean;
    };

export type HotkeyMode = "toggle" | "hold";

export type HotkeyConfig = {
  enabled: boolean;
  binding: HotkeyBinding;
  mode: HotkeyMode;
};

export type HotkeyStatus = HotkeyConfig & {
  /** 触发方式的显示名（如「双击 右 Control」）。 */
  label: string;
  /** 辅助功能是否已授权（全局键盘监听的硬前提）。 */
  trusted: boolean;
  /** 监听器是否装好；非 macOS 恒为 false。 */
  listening: boolean;
  platform: string;
  hint: string | null;
};

export function hotkeyStatus(): Promise<HotkeyStatus> {
  return invoke<HotkeyStatus>(COMMANDS.hotkeyStatus);
}

export function hotkeySave(config: HotkeyConfig): Promise<HotkeyStatus> {
  return invoke<HotkeyStatus>(COMMANDS.hotkeySave, { config });
}

/** 快捷键配置变化（设置页保存、或辅助功能授权变化后重读）。 */
export function subscribeHotkeyChanged(handler: (status: HotkeyStatus) => void): Unsubscribe {
  return hotkeyChangedChannel((payload) => {
    if (isHotkeyStatus(payload)) handler(payload);
  });
}

function isHotkeyStatus(value: unknown): value is HotkeyStatus {
  if (typeof value !== "object" || value === null) return false;
  const status = value as Record<string, unknown>;
  return (
    typeof status.enabled === "boolean" &&
    typeof status.mode === "string" &&
    typeof status.label === "string" &&
    typeof status.trusted === "boolean" &&
    typeof status.binding === "object" &&
    status.binding !== null
  );
}

/** 顶部麦克风 HUD（独立窗口，Rust 推状态，不走 WS）。 */
export function subscribeMicHud(handler: (payload: RemoteHudPayload) => void): Unsubscribe {
  return micHudChannel((payload) => {
    if (isRemoteHudPayload(payload)) handler(payload);
  });
}

/** 手机：上报本机是否响应电脑遥控（连上电脑 / 开关变化时）。 */
export function sendRemoteMicStatus(enabled: boolean): Promise<void> {
  return invoke<void>(COMMANDS.sendRemoteMicStatus, { enabled });
}

/** 手机：回执 `mic.remote` 命令。 */
export function sendRemoteMicAck(input: {
  requestId: string;
  action: RemoteMicAction;
  ok: boolean;
  code?: RemoteMicAckCode | null;
}): Promise<void> {
  return invoke<void>(COMMANDS.sendRemoteMicAck, {
    requestId: input.requestId,
    action: input.action,
    ok: input.ok,
    code: input.code ?? null,
  });
}
