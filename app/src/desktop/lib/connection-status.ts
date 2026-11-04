import type { SignalStatus } from "@/shared/ui/signal-dot";

export type DesktopConnectionStatus =
  | "loading"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type SocketStatus = Extract<
  DesktopConnectionStatus,
  "connecting" | "connected" | "disconnected"
>;

export const CONNECTION_STATUS_TEXT: Record<DesktopConnectionStatus, string> = {
  loading: "连接中…",
  connecting: "连接中…",
  connected: "已连接",
  disconnected: "已断开，重连中…",
  error: "连接失败",
};

/** 连接状态映射成声呐信号点：只有真正连上才是薄荷色。 */
export const CONNECTION_SIGNAL_STATUS: Record<DesktopConnectionStatus, SignalStatus> = {
  loading: "idle",
  connecting: "waiting",
  connected: "connected",
  disconnected: "waiting",
  error: "error",
};
