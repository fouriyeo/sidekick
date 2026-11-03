import { useCallback, useEffect, useRef, useState } from "react";
import { useDesktopMicStore } from "@/desktop/features/mic-receiver/mic-status-store";
import {
  parseKeyResult,
  parseMessage,
  parseMicMessage,
  type ServerInfo,
} from "@/protocol/messages";
import { getServerInfo, normalizeError } from "@/shared/lib/tauri";
import { useChatStore } from "./features/chat/chat-store";
import type { DesktopConnectionStatus } from "./lib/connection-status";
import { type DesktopSocket, openDesktopSocket } from "./lib/ws-client";

const OFFLINE_HINT = "服务还没连上，稍等一下";

export type DesktopConnection = {
  status: DesktopConnectionStatus;
  info: ServerInfo | null;
  error: string | null;
  sendText: (text: string) => boolean;
  /** 桌面浮层「取消录音」：请求服务端中止当前麦克风会话。 */
  cancelMic: (session: string) => boolean;
  retry: () => void;
};

export function useDesktopConnection(): DesktopConnection {
  const append = useChatStore((state) => state.append);
  const [status, setStatus] = useState<DesktopConnectionStatus>("loading");
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<DesktopSocket | null>(null);
  const generationRef = useRef(0);

  const connect = useCallback(async () => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const isCurrent = () => generationRef.current === generation;

    socketRef.current?.dispose();
    socketRef.current = null;
    useDesktopMicStore.getState().reset();
    setStatus("loading");
    setInfo(null);
    setError(null);

    try {
      const serverInfo = await getServerInfo();
      if (!isCurrent()) return;

      setInfo(serverInfo);
      setStatus("connecting");

      const socket = openDesktopSocket({
        port: serverInfo.port,
        onStatus: (next) => {
          if (isCurrent()) setStatus(next);
        },
        onMessage: (raw) => {
          if (!isCurrent()) return;

          const keyResult = parseKeyResult(raw);
          if (keyResult) {
            useDesktopMicStore.getState().handleKeyResult(keyResult);
            return;
          }

          const micMessage = parseMicMessage(raw);
          if (micMessage) {
            useDesktopMicStore.getState().handleMessage(micMessage);
            return;
          }

          const parsed = parseMessage(raw, "desktop");
          if (parsed) append(parsed.kind, parsed.text);
        },
      });

      if (!isCurrent()) {
        socket.dispose();
        return;
      }
      socketRef.current = socket;
    } catch (cause) {
      if (!isCurrent()) return;
      setStatus("error");
      setError(normalizeError(cause));
    }
  }, [append]);

  useEffect(() => {
    void connect();

    return () => {
      generationRef.current += 1;
      socketRef.current?.dispose();
      socketRef.current = null;
    };
  }, [connect]);

  const sendText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return false;

      const socket = socketRef.current;
      const payload = JSON.stringify({
        type: "chat",
        from: "desktop",
        text: trimmed,
        ts: Date.now(),
      });

      if (!socket?.send(payload)) {
        append("system", OFFLINE_HINT);
        return false;
      }

      return true;
    },
    [append],
  );

  const cancelMic = useCallback((session: string) => {
    const trimmed = session.trim();
    if (!trimmed) return false;

    const socket = socketRef.current;
    if (!socket) return false;

    return socket.send(
      JSON.stringify({
        v: 1,
        type: "mic.cancel",
        session: trimmed,
        ts: Date.now(),
      }),
    );
  }, []);

  const retry = useCallback(() => {
    void connect();
  }, [connect]);

  return { status, info, error, sendText, cancelMic, retry };
}
