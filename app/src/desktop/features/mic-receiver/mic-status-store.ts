import { create } from "zustand";
import type { MicMessage } from "@/protocol/messages";
import { micErrorText, micReasonText } from "@/shared/lib/mic-status-copy";

export type DesktopMicPhase = "idle" | "listening" | "processing" | "delivered" | "error";

type DesktopMicState = {
  phase: DesktopMicPhase;
  session: string | null;
  startedAt: number | null;
  message: string;
  visible: boolean;
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

export const useDesktopMicStore = create<DesktopMicState>((set, get) => ({
  phase: "idle",
  session: null,
  startedAt: null,
  message: "",
  visible: false,

  handleMessage: (message) => {
    if (message.type === "mic.ready") {
      clearHideTimer();
      set({
        phase: "listening",
        session: message.session,
        startedAt: Date.now(),
        message: "",
        visible: true,
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
        clearHideTimer();
        set({ phase: "processing", session: message.session, message: "", visible: true });
      } else if (message.state === "cancelled" || message.state === "idle") {
        clearHideTimer();
        set({ phase: "idle", session: null, startedAt: null, message: "已取消", visible: true });
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
      const messageText = micReasonText(message.outcome, message.reason);
      set({
        phase: failed ? "error" : "delivered",
        session: message.session,
        startedAt: null,
        message: message.truncated ? `${messageText}太长了，只输入了前 2000 字。` : messageText,
        visible: true,
      });

      hideTimer = window.setTimeout(
        () => {
          hideTimer = null;
          set({ visible: false, phase: "idle", session: null, message: "" });
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
      });
      hideTimer = window.setTimeout(() => {
        hideTimer = null;
        set({ visible: false, phase: "idle", session: null, message: "" });
      }, 5000);
    }
  },

  reset: () => {
    clearHideTimer();
    set({ phase: "idle", session: null, startedAt: null, message: "", visible: false });
  },
}));
