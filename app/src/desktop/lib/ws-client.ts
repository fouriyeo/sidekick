import type { SocketStatus } from "./connection-status";

const RECONNECT_DELAY_MS = 1500;

export type DesktopSocket = {
  send: (text: string) => boolean;
  dispose: () => void;
};

export type OpenDesktopSocketOptions = {
  port: number;
  onStatus?: (status: SocketStatus) => void;
  onMessage?: (raw: string) => void;
};

export function openDesktopSocket({
  port,
  onStatus,
  onMessage,
}: OpenDesktopSocketOptions): DesktopSocket {
  const url = `ws://127.0.0.1:${port}/ws`;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function clearReconnectTimer() {
    if (reconnectTimer === null) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function emitStatus(status: SocketStatus) {
    if (stopped) return;
    onStatus?.(status);
  }

  function connect() {
    if (stopped) return;

    emitStatus("connecting");
    const next = new WebSocket(url);
    socket = next;

    next.onopen = () => {
      if (stopped || socket !== next) return;
      emitStatus("connected");
    };

    next.onmessage = (event) => {
      if (stopped || socket !== next) return;
      if (typeof event.data === "string") onMessage?.(event.data);
    };

    next.onclose = () => {
      if (socket !== next) return;
      socket = null;
      if (stopped) return;

      emitStatus("disconnected");
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    next.onerror = () => {
      next.close();
    };
  }

  connect();

  return {
    send(text) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      socket.send(text);
      return true;
    },
    dispose() {
      if (stopped) return;
      stopped = true;
      clearReconnectTimer();

      const current = socket;
      socket = null;
      if (!current) return;

      current.onopen = null;
      current.onmessage = null;
      current.onclose = null;
      current.onerror = null;
      if (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING) {
        current.close();
      }
    },
  };
}
