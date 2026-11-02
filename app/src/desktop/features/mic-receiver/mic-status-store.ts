import { create } from "zustand";
import type { MicMessage } from "@/protocol/messages";
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
      });
      return;
    }

    if (message.type === "mic.partial") {
      if (message.session !== get().session) return;
      if (message.rev <= get().partialRev) return;
      set({
        partialText: message.text,
        partialRev: message.rev,
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
      const messageText = message.truncated ? `${base}${MIC_STATUS_COPY.truncated}` : base;

      set({
        phase: failed ? "error" : "delivered",
        session: message.session,
        startedAt: null,
        message: messageText,
        visible: true,
        ...EMPTY_PARTIAL,
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
    });
  },
}));
