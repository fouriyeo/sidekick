import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDesktopMicStore } from "@/desktop/features/mic-receiver/mic-status-store";
import {
  describeClientsActivity,
  describeStatusActivity,
} from "@/desktop/lib/desktop-activity-events";
import { useDesktopActivityStore } from "@/desktop/lib/desktop-activity-store";
import { useDesktopClientsStore } from "@/desktop/lib/desktop-clients-store";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import { useDesktopVoiceStore } from "@/desktop/lib/desktop-voice-store";
import {
  type FocusResultMessage,
  parseFocusResult,
  parseKeyResult,
  parseMessage,
  parseMicMessage,
  parseStatusMessage,
  parseSystemClients,
  type ServerInfo,
  type StatusMessage,
} from "@/protocol/messages";
import { micReasonText } from "@/shared/lib/mic-status-copy";
import { focusErrorText } from "@/shared/lib/sessions";
import { getServerInfo, normalizeError } from "@/shared/lib/tauri";
import { useChatStore } from "./features/chat/chat-store";
import type { DesktopConnectionStatus, SocketStatus } from "./lib/connection-status";
import { type DesktopSocket, openDesktopSocket } from "./lib/ws-client";

const OFFLINE_HINT = "服务还没连上，稍等一下";
/** focus.request 的回包等待上限；超时按「电脑没响应」提示，不影响后续操作。 */
const FOCUS_TIMEOUT_MS = 8000;
const FOCUS_SUCCESS = "已让 DeepSeek Harness 到前台";

export type DesktopConnection = {
  status: DesktopConnectionStatus;
  info: ServerInfo | null;
  error: string | null;
  sendText: (text: string) => boolean;
  /** 桌面浮层「取消录音」：请求服务端中止当前麦克风会话。 */
  cancelMic: (session: string) => boolean;
  /** 请求服务端补发一次 AI 状态快照（会话页「刷新」）。 */
  requestStatus: () => boolean;
  /**
   * 会话行「在 DSH 打开」：走本地 WS 发 `focus.request`（复用手机同一条协议，
   * 不需要新的 Tauri 命令）；结果由 `focus.result` 广播回来，成功/失败用 toast 反馈。
   */
  requestFocus: (sessionId: string) => boolean;
  retry: () => void;
};

type PendingFocus = { timer: number };

export function useDesktopConnection(): DesktopConnection {
  const append = useChatStore((state) => state.append);
  const [status, setStatus] = useState<DesktopConnectionStatus>("loading");
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<DesktopSocket | null>(null);
  const generationRef = useRef(0);
  const pendingFocusRef = useRef(new Map<string, PendingFocus>());
  const focusSeqRef = useRef(0);
  const previousStatusStateRef = useRef<StatusMessage["state"] | null>(null);
  const previousClientsRef = useRef<number | null>(null);
  const previousSocketStatusRef = useRef<SocketStatus | null>(null);

  const handleStatus = useCallback((message: StatusMessage) => {
    const activity = useDesktopActivityStore.getState();
    const previous = previousStatusStateRef.current;
    previousStatusStateRef.current = message.state;
    useDesktopStatusStore.getState().apply(message);
    const event = describeStatusActivity(message, previous);
    if (event) activity.record(event);
  }, []);

  const handleClients = useCallback((count: number) => {
    const previous = previousClientsRef.current;
    previousClientsRef.current = count;
    useDesktopClientsStore.getState().apply(count);
    const event = describeClientsActivity(previous, count);
    if (event) useDesktopActivityStore.getState().record(event);
  }, []);

  const handleFocusResult = useCallback((message: FocusResultMessage) => {
    const pending = pendingFocusRef.current.get(message.requestId);
    if (!pending) return;
    pendingFocusRef.current.delete(message.requestId);
    window.clearTimeout(pending.timer);
    if (message.ok) toast.success(FOCUS_SUCCESS);
    else toast.error(focusErrorText(message.error));
  }, []);

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
          if (!isCurrent()) return;
          const previous = previousSocketStatusRef.current;
          previousSocketStatusRef.current = next;
          setStatus(next);
          // 只有「连上过又断开」才值得进事件流；启动时的 connecting → connected 不算。
          if (next === "disconnected" && previous === "connected") {
            useDesktopActivityStore.getState().record({
              kind: "connection",
              title: "电脑服务连接断开",
              detail: "正在自动重连",
            });
          }
        },
        onMessage: (raw) => {
          if (!isCurrent()) return;

          const keyResult = parseKeyResult(raw);
          if (keyResult) {
            useDesktopMicStore.getState().handleKeyResult(keyResult);
            return;
          }

          const focusResult = parseFocusResult(raw);
          if (focusResult) {
            handleFocusResult(focusResult);
            return;
          }

          const micMessage = parseMicMessage(raw);
          if (micMessage) {
            useDesktopMicStore.getState().handleMessage(micMessage);
            if (micMessage.type === "mic.result") {
              const text = (micMessage.text ?? "").trim();
              const detail = micReasonText(micMessage.outcome, micMessage.reason);
              useDesktopVoiceStore.getState().record({
                text,
                outcome: micMessage.outcome,
                reason: micMessage.reason ?? null,
                at: Date.now(),
              });
              useDesktopActivityStore.getState().record({
                kind: "voice",
                title: text ? `语音输入：${text}` : "语音输入",
                detail,
              });
            }
            return;
          }

          const statusMessage = parseStatusMessage(raw);
          if (statusMessage) {
            handleStatus(statusMessage);
            return;
          }

          const clients = parseSystemClients(raw);
          if (clients !== null) handleClients(clients);

          // 系统消息既进「最近事件」统计，也进「消息」页的通道记录（调试用）。
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
  }, [append, handleClients, handleFocusResult, handleStatus]);

  useEffect(() => {
    void connect();

    return () => {
      generationRef.current += 1;
      socketRef.current?.dispose();
      socketRef.current = null;
      for (const pending of pendingFocusRef.current.values()) {
        window.clearTimeout(pending.timer);
      }
      pendingFocusRef.current.clear();
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

  const requestStatus = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return false;
    return socket.send(JSON.stringify({ type: "status.request" }));
  }, []);

  const requestFocus = useCallback((sessionId: string) => {
    const trimmed = sessionId.trim();
    const socket = socketRef.current;
    if (!trimmed || !socket) {
      if (!socket) toast.error(OFFLINE_HINT);
      return false;
    }

    focusSeqRef.current += 1;
    const requestId = `dsk-${focusSeqRef.current}-${Date.now().toString(36)}`.slice(0, 64);
    const sent = socket.send(
      JSON.stringify({
        type: "focus.request",
        v: 1,
        requestId,
        source: "dsh",
        sessionId: trimmed,
        ts: Date.now(),
      }),
    );
    if (!sent) {
      toast.error(OFFLINE_HINT);
      return false;
    }

    const timer = window.setTimeout(() => {
      pendingFocusRef.current.delete(requestId);
      toast.error(focusErrorText(null));
    }, FOCUS_TIMEOUT_MS);
    pendingFocusRef.current.set(requestId, { timer });
    return true;
  }, []);

  const retry = useCallback(() => {
    void connect();
  }, [connect]);

  return { status, info, error, sendText, cancelMic, requestStatus, requestFocus, retry };
}
