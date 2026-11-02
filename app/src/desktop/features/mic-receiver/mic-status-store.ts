import { create } from "zustand";
import type { MicEngine, MicMessage } from "@/protocol/messages";
import { MIC_STATUS_COPY, micErrorText, micReasonText } from "@/shared/lib/mic-status-copy";

export type DesktopMicPhase = "idle" | "listening" | "processing" | "delivered" | "error";

type DesktopMicState = {
  phase: DesktopMicPhase;
  session: string | null;
  startedAt: number | null;
  message: string;
  visible: boolean;
  /** 最近一条流式中间结果（完整可见文本，整体替换）。 */
  partialText: string;
  /** 已接受的中间结果版本号；用于丢弃重复/乱序消息。 */
  partialRev: number;
  /** 本次会话实际使用的引擎；旧桌面不带 engine 时按 local 处理。 */
  engine: MicEngine;
  /** 云端失败后由本机兜底完成。 */
  fallback: boolean;
  handleMessage: (message: MicMessage) => void;
  reset: () => void;
};

let hideTimer: number | null = null;

function clearHideTimer() {
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
}

const EMPTY_PARTIAL = {
  partialText: "",
  partialRev: 0,
} as const;

export const useDesktopMicStore = create<DesktopMicState>((set, get) => ({
  phase: "idle",
  session: null,
  startedAt: null,
  message: "",
  visible: false,
  ...EMPTY_PARTIAL,
  engine: "local",
  fallback: false,

  handleMessage: (message) => {
    if (message.type === "mic.ready") {
      clearHideTimer();
      set({
        phase: "listening",
        session: message.session,
        startedAt: Date.now(),
        message: "",
        visible: true,
        ...EMPTY_PARTIAL,
        engine: message.engine ?? "local",
        fallback: false,
      });
      return;
    }

    if (message.type === "mic.partial") {
      if (message.session !== get().session) return;
      if (message.rev <= get().partialRev) return;
      set({
        partialText: message.text,
        partialRev: message.rev,
        engine: message.engine ?? get().engine,
      });
      return;
    }

    if (message.type === "mic.state") {
      if (message.state === "listening") {
        clearHideTimer();
        set({
          phase: "listening",
          session: message.session,
          startedAt: get().startedAt ?? Date.now(),
          visible: true,
        });
      } else if (message.state === "processing") {
        // 收尾阶段保留最后一段实时文本，避免界面突然空掉。
        clearHideTimer();
        set({ phase: "processing", session: message.session, message: "", visible: true });
      } else if (message.state === "cancelled" || message.state === "idle") {
        clearHideTimer();
        set({
          phase: "idle",
          session: null,
          startedAt: null,
          message: "已取消",
          visible: true,
          ...EMPTY_PARTIAL,
          engine: "local",
          fallback: false,
        });
        hideTimer = window.setTimeout(() => {
          hideTimer = null;
          set({ visible: false, message: "" });
        }, 1500);
      }
      return;
    }

    if (message.type === "mic.result") {
      clearHideTimer();
      const failed = message.outcome === "failed";
      const base = micReasonText(message.outcome, message.reason);
      const withTruncated = message.truncated ? `${base}${MIC_STATUS_COPY.truncated}` : base;
      const messageText =
        !failed && message.fallback
          ? `${withTruncated}${MIC_STATUS_COPY.cloudFallback}`
          : withTruncated;

      set({
        phase: failed ? "error" : "delivered",
        session: message.session,
        startedAt: null,
        message: messageText,
        visible: true,
        ...EMPTY_PARTIAL,
        engine: message.engine ?? get().engine,
        fallback: Boolean(message.fallback),
      });

      hideTimer = window.setTimeout(
        () => {
          hideTimer = null;
          set({
            visible: false,
            phase: "idle",
            session: null,
            message: "",
            ...EMPTY_PARTIAL,
            engine: "local",
            fallback: false,
          });
        },
        failed ? 5000 : 2000,
      );
      return;
    }

    if (message.type === "mic.error") {
      if (message.session && get().session && message.session !== get().session) return;
      clearHideTimer();
      set({
        phase: "error",
        message: micErrorText(message.code),
        startedAt: null,
        visible: true,
        ...EMPTY_PARTIAL,
      });
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        set({
          visible: false,
          phase: "idle",
          session: null,
          message: "",
          ...EMPTY_PARTIAL,
          engine: "local",
          fallback: false,
        });
      }, 5000);
    }
  },

  reset: () => {
    clearHideTimer();
    set({
      phase: "idle",
      session: null,
      startedAt: null,
      message: "",
      visible: false,
      ...EMPTY_PARTIAL,
      engine: "local",
      fallback: false,
    });
  },
}));
