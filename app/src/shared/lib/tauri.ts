import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { type DiscoveredServer, isDiscoveredServer } from "@/protocol/discovery";
import {
  type ConnEvent,
  isConnEvent,
  type MicStopReason,
  type ServerInfo,
} from "@/protocol/messages";

export type AppRole = "desktop" | "mobile";
export type Unsubscribe = () => void;

export type AsrModelId = "tiny" | "base" | "small" | "medium";

export type AsrModelInfo = {
  id: AsrModelId;
  label: string;
  fileName: string;
  approxBytes: number;
  sizeBytes: number;
  downloaded: boolean;
  selected: boolean;
  note: string;
};

export type AsrDownloadInfo = {
  id: AsrModelId;
  received: number;
  total: number;
};

export type AsrStatus = {
  dir: string;
  selected: AsrModelId | null;
  models: AsrModelInfo[];
  downloading: AsrDownloadInfo | null;
};

export type ModelProgressState = "downloading" | "done" | "error" | "cancelled";

export type ModelProgress = {
  modelId: AsrModelId;
  received: number;
  total: number;
  state: ModelProgressState;
  message?: string | null;
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
  kind: "text" | "url";
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

const COMMANDS = {
  appRole: "app_role",
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
  asrStatus: "asr_status",
  asrSelectModel: "asr_select_model",
  asrDownloadModel: "asr_download_model",
  asrCancelDownload: "asr_cancel_download",
  asrDeleteModel: "asr_delete_model",
  asrRevealDir: "asr_reveal_dir",
  clipboardList: "clipboard_list",
  clipboardStatus: "clipboard_status",
  clipboardCopy: "clipboard_copy",
  clipboardTogglePin: "clipboard_toggle_pin",
  clipboardDelete: "clipboard_delete",
  clipboardClear: "clipboard_clear",
  clipboardSetEnabled: "clipboard_set_enabled",
} as const;

const EVENTS = {
  chat: "chat",
  conn: "conn",
  modelProgress: "model-progress",
  clipboardChanged: "clipboard-changed",
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
const modelProgressChannel = createEventChannel(EVENTS.modelProgress);
const clipboardChannel = createEventChannel(EVENTS.clipboardChanged);

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

export function getAsrStatus(): Promise<AsrStatus> {
  return invoke<AsrStatus>(COMMANDS.asrStatus);
}

export function selectAsrModel(id: AsrModelId): Promise<AsrStatus> {
  return invoke<AsrStatus>(COMMANDS.asrSelectModel, { id });
}

export function downloadAsrModel(id: AsrModelId): Promise<void> {
  return invoke<void>(COMMANDS.asrDownloadModel, { id });
}

export function cancelAsrDownload(): Promise<void> {
  return invoke<void>(COMMANDS.asrCancelDownload);
}

export function deleteAsrModel(id: AsrModelId): Promise<AsrStatus> {
  return invoke<AsrStatus>(COMMANDS.asrDeleteModel, { id });
}

export function revealAsrDir(): Promise<void> {
  return invoke<void>(COMMANDS.asrRevealDir);
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

export function isModelProgress(value: unknown): value is ModelProgress {
  if (typeof value !== "object" || value === null) return false;
  const progress = value as Record<string, unknown>;
  return (
    typeof progress.modelId === "string" &&
    typeof progress.received === "number" &&
    typeof progress.total === "number" &&
    ["downloading", "done", "error", "cancelled"].includes(String(progress.state))
  );
}

export function subscribeModelProgress(handler: (payload: ModelProgress) => void): Unsubscribe {
  return modelProgressChannel((payload) => {
    if (isModelProgress(payload)) handler(payload);
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

export function normalizeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
