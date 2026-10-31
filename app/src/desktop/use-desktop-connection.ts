import { useCallback, useEffect, useRef, useState } from "react";
import { parseMessage, type ServerInfo } from "@/protocol/messages";
import {
  captureFrontApp,
  getServerInfo,
  normalizeError,
  transcribeAndInsert,
} from "@/shared/lib/tauri";
import { useChatStore } from "./features/chat/chat-store";
import type { DesktopConnectionStatus } from "./lib/connection-status";
import { type DesktopSocket, openDesktopSocket } from "./lib/ws-client";

const OFFLINE_HINT = "服务还没连上，稍等一下";

export type DesktopConnection = {
  status: DesktopConnectionStatus;
  info: ServerInfo | null;
  error: string | null;
  sendText: (text: string) => boolean;
  retry: () => void;
};

export function useDesktopConnection(): DesktopConnection {
  const append = useChatStore((state) => state.append);
  const [status, setStatus] = useState<DesktopConnectionStatus>("loading");
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<DesktopSocket | null>(null);
  const generationRef = useRef(0);
  const voiceTargetRef = useRef<string | null>(null);
  const voiceBusyRef = useRef(false);

  const connect = useCallback(async () => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const isCurrent = () => generationRef.current === generation;

    socketRef.current?.dispose();
    socketRef.current = null;
    voiceTargetRef.current = null;
    voiceBusyRef.current = false;
    setStatus("loading");
    setInfo(null);
    setError(null);

    const handleVoiceMessage = (raw: string): boolean => {
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        return false;
      }

      if (typeof payload !== "object" || payload === null) return false;
      const value = payload as Record<string, unknown>;

      if (value.type === "voice.start") {
        voiceTargetRef.current = null;
        append("system", "正在听…");
        void captureFrontApp()
          .then((app) => {
            if (isCurrent()) voiceTargetRef.current = app;
          })
          .catch(() => undefined);
        return true;
      }

      if (value.type === "voice.cancel") {
        voiceTargetRef.current = null;
        append("system", "语音已取消");
        return true;
      }

      if (value.type === "voice") {
        if (typeof value.audio !== "string" || !value.audio) {
          append("system", "语音数据为空");
          return true;
        }
        if (voiceBusyRef.current) return true;

        voiceBusyRef.current = true;
        append("system", "语音转写中…");
        void transcribeAndInsert(value.audio, voiceTargetRef.current)
          .then((result) => {
            if (!isCurrent()) return;
            append(
              "system",
              result.outcome === "inserted"
                ? "语音已输入"
                : "语音已复制；要自动输入请允许 Sidekick 的辅助功能",
            );
          })
          .catch(() => {
            if (isCurrent()) append("system", "语音输入失败，再说一次？");
          })
          .finally(() => {
            voiceBusyRef.current = false;
            voiceTargetRef.current = null;
          });
        return true;
      }

      return false;
    };

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
          if (handleVoiceMessage(raw)) return;
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

  const retry = useCallback(() => {
    void connect();
  }, [connect]);

  return { status, info, error, sendText, retry };
}
