import { create } from "zustand";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import type {
  KeyAction,
  KeyResultMessage,
  MicCancelMessage,
  MicErrorMessage,
  MicPartialMessage,
  MicReadyMessage,
  MicResultMessage,
  MicResultOutcome,
  MicStateMessage,
} from "@/protocol/messages";
import { sendKeyRequest } from "@/shared/lib/tauri";
import { keyActionErrorText, MIC_COPY, micErrorText, micReasonText } from "./mic-copy";

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
  /** 结果卡片「回车/清空」等待桌面结果的动作；非 null 时按钮禁用。 */
  keyPending: KeyAction | null;
  /** 「清空」第一次点击后的二次确认态（3 秒内再点才发送）。 */
  keyArmedClear: boolean;
  /** 按键成功后的短提示（随后收起卡片）。 */
  keyNotice: string | null;
  /** 按键失败的一行中文提示；卡片保留到 10 秒。 */
  keyError: string | null;
  /** 正在等待回包的 requestId，用于丢弃过期/别的会话的结果。 */
  keyRequestId: string | null;
  /** 服务端权威取消次数；MicButton 用它强制停掉本地采集。 */
  cancelNonce: number;
  /** 服务端取消后的短提示（电脑端取消 / 超时自动停止）。 */
  cancelNotice: string | null;
  begin: (session: string) => void;
  markListening: () => void;
  markProcessing: () => void;
  handleReady: (message: MicReadyMessage) => void;
  handlePartial: (message: MicPartialMessage) => void;
  handleResult: (message: MicResultMessage) => void;
  handleState: (message: MicStateMessage) => void;
  handleError: (message: MicErrorMessage) => void;
  /** 桌面端权威取消：不校验 session，必须停掉本地采集。 */
  handleCancel: (message: MicCancelMessage) => void;
  fail: (message: string, code?: string) => void;
  cancel: () => void;
  reset: () => void;
  /** 结果卡片按钮入口：enter 直接发；clear 第一次只做二次确认。 */
  requestKey: (action: KeyAction) => void;
  handleKeyResult: (message: KeyResultMessage) => void;
};

let resultTimer: number | null = null;
let timeoutTimer: number | null = null;
let errorTimer: number | null = null;
let keyConfirmTimer: number | null = null;
let keyPendingTimer: number | null = null;
let keyNoticeTimer: number | null = null;

/** 结果卡片停留时长（含回车/清空按钮）。 */
const RESULT_VISIBLE_MS = 10_000;
/** 「清空」二次确认窗口。 */
const KEY_CLEAR_CONFIRM_MS = 3_000;
/** 等桌面回包的上限；超时提示可重试，卡片不消失。 */
const KEY_PENDING_TIMEOUT_MS = 4_000;
/** 按键成功提示的停留时长，之后收起卡片。 */
const KEY_NOTICE_MS = 1_400;

const EMPTY_PARTIAL = {
  partialText: "",
  partialRev: 0,
} as const;

const EMPTY_KEY = {
  keyPending: null,
  keyArmedClear: false,
  keyNotice: null,
  keyError: null,
  keyRequestId: null,
} as const;

function clearKeyConfirmTimer() {
  if (keyConfirmTimer !== null) {
    window.clearTimeout(keyConfirmTimer);
    keyConfirmTimer = null;
  }
}

function clearKeyPendingTimer() {
  if (keyPendingTimer !== null) {
    window.clearTimeout(keyPendingTimer);
    keyPendingTimer = null;
  }
}

function clearKeyNoticeTimer() {
  if (keyNoticeTimer !== null) {
    window.clearTimeout(keyNoticeTimer);
    keyNoticeTimer = null;
  }
}

function clearKeyTimers() {
  clearKeyConfirmTimer();
  clearKeyPendingTimer();
  clearKeyNoticeTimer();
}

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
  clearKeyTimers();
}

function createKeyRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `k-${crypto.randomUUID()}`;
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 重新排一次结果卡片 10 秒收起（按键失败/超时后让卡片再留一会儿）。 */
function scheduleResultReset(reset: () => void) {
  if (resultTimer !== null) {
    window.clearTimeout(resultTimer);
    resultTimer = null;
  }
  resultTimer = window.setTimeout(() => {
    resultTimer = null;
    reset();
  }, RESULT_VISIBLE_MS);
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
  cancelNonce: 0,
  cancelNotice: null,
  ...EMPTY_PARTIAL,
  ...EMPTY_KEY,

  begin: (session) => {
    clearTimers();
    set({
      phase: "arming",
      session,
      result: null,
      error: null,
      cancelNotice: null,
      ...EMPTY_PARTIAL,
      ...EMPTY_KEY,
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
      ...EMPTY_KEY,
    });

    petDispatch(failed ? "MIC_ERROR" : "MIC_SUCCESS");

    scheduleResultReset(() => get().reset());
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

  handleCancel: (message) => {
    const wasActive =
      get().phase === "arming" || get().phase === "listening" || get().session !== null;
    clearTimers();
    set((state) => ({
      phase: "idle",
      session: null,
      result: null,
      error: null,
      cancelNotice:
        message.reason === "timeout" ? MIC_COPY.recordingTimeout : MIC_COPY.cancelledByDesktop,
      // 不校验 session：即使本地记录的会话与桌面 active 不一致，也必须停采集。
      cancelNonce: state.cancelNonce + 1,
      ...EMPTY_PARTIAL,
      ...EMPTY_KEY,
    }));
    if (wasActive) petDispatch("MIC_CANCEL");
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
      ...EMPTY_KEY,
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
      cancelNotice: null,
      ...EMPTY_PARTIAL,
      ...EMPTY_KEY,
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
      cancelNotice: null,
      ...EMPTY_PARTIAL,
      ...EMPTY_KEY,
    });
  },

  requestKey: (action) => {
    const state = get();
    if (state.keyPending !== null) return;
    if (state.phase !== "delivered" || state.result?.outcome !== "inserted") return;
    const session = state.session;
    if (!session) return;
    if (useConnectionStore.getState().status !== "connected") {
      set({ keyArmedClear: false, keyError: MIC_COPY.disconnected });
      return;
    }

    // 「清空」会删掉输入框里的全部内容：第一次只做二次确认。
    if (action === "clear" && !state.keyArmedClear) {
      clearKeyConfirmTimer();
      set({ keyArmedClear: true, keyError: null });
      keyConfirmTimer = window.setTimeout(() => {
        keyConfirmTimer = null;
        if (get().keyArmedClear) set({ keyArmedClear: false });
      }, KEY_CLEAR_CONFIRM_MS);
      return;
    }

    clearKeyConfirmTimer();
    // 请求途中不要因为结果卡片的 10 秒计时器把按钮收起来。
    if (resultTimer !== null) {
      window.clearTimeout(resultTimer);
      resultTimer = null;
    }

    const requestId = createKeyRequestId();
    set({
      keyPending: action,
      keyArmedClear: false,
      keyNotice: null,
      keyError: null,
      keyRequestId: requestId,
    });

    keyPendingTimer = window.setTimeout(() => {
      keyPendingTimer = null;
      if (get().keyRequestId !== requestId) return;
      set({ keyPending: null, keyRequestId: null, keyError: MIC_COPY.keyNoResponse });
      scheduleResultReset(() => get().reset());
    }, KEY_PENDING_TIMEOUT_MS);

    void sendKeyRequest(action, session, requestId).catch(() => {
      if (get().keyRequestId !== requestId) return;
      clearKeyPendingTimer();
      set({ keyPending: null, keyRequestId: null, keyError: MIC_COPY.disconnected });
      scheduleResultReset(() => get().reset());
    });
  },

  handleKeyResult: (message) => {
    if (get().keyRequestId !== message.requestId) return;
    clearKeyPendingTimer();

    if (!message.ok) {
      set({
        keyPending: null,
        keyRequestId: null,
        keyArmedClear: false,
        keyError: keyActionErrorText(message.error),
      });
      scheduleResultReset(() => get().reset());
      return;
    }

    set({
      keyPending: null,
      keyRequestId: null,
      keyArmedClear: false,
      keyError: null,
      keyNotice: message.action === "enter" ? MIC_COPY.keyEnterSent : MIC_COPY.keyClearSent,
    });
    clearKeyNoticeTimer();
    keyNoticeTimer = window.setTimeout(() => {
      keyNoticeTimer = null;
      get().reset();
    }, KEY_NOTICE_MS);
  },
}));
