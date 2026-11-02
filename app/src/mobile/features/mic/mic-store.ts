import { create } from "zustand";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import type {
  MicErrorMessage,
  MicPartialMessage,
  MicReadyMessage,
  MicResultMessage,
  MicResultOutcome,
  MicStateMessage,
} from "@/protocol/messages";
import { MIC_COPY, micErrorText, micReasonText } from "./mic-copy";

export type MicPhase = "idle" | "arming" | "listening" | "processing" | "delivered" | "error";

export type MicResultView = {
  outcome: MicResultOutcome;
  reason: string | null;
  text: string | null;
  truncated: boolean;
  message: string;
  at: number;
};

type MicState = {
  phase: MicPhase;
  session: string | null;
  result: MicResultView | null;
  error: string | null;
  failureCount: number;
  /** 最近一条流式中间结果（完整可见文本，整体替换）。 */
  partialText: string;
  /** 已接受的中间结果版本号；用于丢弃重复/乱序消息。 */
  partialRev: number;
  begin: (session: string) => void;
  markListening: () => void;
  markProcessing: () => void;
  handleReady: (message: MicReadyMessage) => void;
  handlePartial: (message: MicPartialMessage) => void;
  handleResult: (message: MicResultMessage) => void;
  handleState: (message: MicStateMessage) => void;
  handleError: (message: MicErrorMessage) => void;
  fail: (message: string, code?: string) => void;
  cancel: () => void;
  reset: () => void;
};

let resultTimer: number | null = null;
let timeoutTimer: number | null = null;
let errorTimer: number | null = null;

const EMPTY_PARTIAL = {
  partialText: "",
  partialRev: 0,
} as const;

function clearTimers() {
  if (resultTimer !== null) {
    window.clearTimeout(resultTimer);
    resultTimer = null;
  }
  if (timeoutTimer !== null) {
    window.clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
  if (errorTimer !== null) {
    window.clearTimeout(errorTimer);
    errorTimer = null;
  }
}

function petDispatch(event: "MIC_START" | "MIC_SUCCESS" | "MIC_CANCEL" | "MIC_ERROR") {
  usePetStore.getState().dispatch({ type: event, now: Date.now() });
}

export const useMicStore = create<MicState>((set, get) => ({
  phase: "idle",
  session: null,
  result: null,
  error: null,
  failureCount: 0,
  ...EMPTY_PARTIAL,

  begin: (session) => {
    clearTimers();
    set({
      phase: "arming",
      session,
      result: null,
      error: null,
      ...EMPTY_PARTIAL,
    });
    petDispatch("MIC_START");
  },

  markListening: () => {
    if (get().phase === "arming") set({ phase: "listening" });
  },

  markProcessing: () => {
    clearTimers();
    set({ phase: "processing", error: null });
    timeoutTimer = window.setTimeout(() => {
      timeoutTimer = null;
      get().fail(MIC_COPY.timeout, "asr_timeout");
    }, 10_000);
  },

  handleReady: (message) => {
    if (message.session !== get().session) return;
    // 新会话的 ready 只负责清掉上一轮残留的实时文本；引擎固定为百炼云端。
    set({ ...EMPTY_PARTIAL });
  },

  handlePartial: (message) => {
    if (message.session !== get().session) return;
    if (message.rev <= get().partialRev) return;
    set({
      partialText: message.text,
      partialRev: message.rev,
    });
  },

  handleResult: (message) => {
    if (message.session !== get().session) return;

    clearTimers();
    const failed = message.outcome === "failed";
    const base = micReasonText(message.outcome, message.reason);
    const withTruncated = message.truncated ? `${base}${MIC_COPY.truncated}` : base;
    const failureCount = failed ? get().failureCount + 1 : 0;
    const shown =
      failed &&
      failureCount >= 2 &&
      ["asr_failed", "empty_transcript", "asr_timeout", "insert_failed"].includes(
        message.reason ?? "",
      )
        ? `${withTruncated}${MIC_COPY.checkSettings}`
        : withTruncated;

    set({
      phase: failed ? "error" : "delivered",
      result: {
        outcome: message.outcome,
        reason: message.reason ?? null,
        text: message.text ?? null,
        truncated: Boolean(message.truncated),
        message: shown,
        at: Date.now(),
      },
      error: failed ? shown : null,
      failureCount,
      ...EMPTY_PARTIAL,
    });

    petDispatch(failed ? "MIC_ERROR" : "MIC_SUCCESS");

    resultTimer = window.setTimeout(() => {
      resultTimer = null;
      get().reset();
    }, 10_000);
  },

  handleState: (message) => {
    if (message.session !== get().session) return;

    if (message.state === "processing") {
      get().markProcessing();
    } else if (message.state === "cancelled") {
      get().cancel();
    } else if (message.state === "listening" && get().phase === "arming") {
      set({ phase: "listening" });
    }
  },

  handleError: (message) => {
    const session = get().session;
    if (message.session && message.session !== session) return;
    get().fail(micErrorText(message.code), message.code);
  },

  fail: (message, code) => {
    clearTimers();
    const failureCount = get().failureCount + 1;
    const shown =
      failureCount >= 2 &&
      ["asr_failed", "empty_transcript", "asr_timeout", "insert_failed"].includes(code ?? "")
        ? `${message}${MIC_COPY.checkSettings}`
        : message;

    set({
      phase: "error",
      error: shown,
      result: null,
      failureCount,
      ...EMPTY_PARTIAL,
    });
    petDispatch("MIC_ERROR");

    errorTimer = window.setTimeout(() => {
      errorTimer = null;
      get().reset();
    }, 5_000);
  },

  cancel: () => {
    clearTimers();
    set({
      phase: "idle",
      session: null,
      result: null,
      error: null,
      ...EMPTY_PARTIAL,
    });
    petDispatch("MIC_CANCEL");
  },

  reset: () => {
    clearTimers();
    set({
      phase: "idle",
      session: null,
      result: null,
      error: null,
      ...EMPTY_PARTIAL,
    });
  },
}));
