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
