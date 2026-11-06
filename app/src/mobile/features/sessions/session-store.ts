import { create } from "zustand";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import type { FocusResultMessage, SessionSummary } from "@/protocol/messages";
import { focusErrorText } from "@/shared/lib/sessions";
import { sendFocusRequest } from "@/shared/lib/tauri";
import { type ClearedMap, loadCleared, saveCleared } from "./session-storage";

export type { SessionDisplayState, SessionRow } from "@/shared/lib/sessions";
// 展示层纯函数统一放在 shared/lib/sessions（桌面端复用同一套排序/文案）。
export { displayStateOf, focusErrorText, visibleSessions } from "@/shared/lib/sessions";

const FOCUS_TIMEOUT_MS = 3000;
const NOTICE_MS = 3200;
/** 已完成会话超过该时长没有新事件，就从手机列表隐藏（D96）。 */
export const COMPLETED_AUTO_CLEAR_MS = 2 * 60 * 60 * 1000;

let focusTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let requestSeq = 0;

function clearFocusTimer() {
  if (focusTimer !== null) {
    clearTimeout(focusTimer);
    focusTimer = null;
  }
}

function clearNoticeTimer() {
  if (noticeTimer !== null) {
    clearTimeout(noticeTimer);
    noticeTimer = null;
  }
}

type SessionStoreState = {
  /** 最近一次 status.sessionList 快照；断连时保留，动态页标注「最后一次快照」。 */
  raw: SessionSummary[];
  cleared: ClearedMap;
  hydrated: boolean;
  notice: string | null;
  noticeId: number;
  pendingFocusId: string | null;
  pendingRequestId: string | null;
  hydrate: () => Promise<void>;
  apply: (list: readonly SessionSummary[]) => void;
  clear: (id: string) => void;
  clearAll: () => void;
  requestFocus: (id: string) => void;
  handleFocusResult: (result: FocusResultMessage) => void;
  dismissNotice: () => void;
};

export const useSessionStore = create<SessionStoreState>((set, get) => {
  function showNotice(text: string) {
    clearNoticeTimer();
    set({ notice: text, noticeId: get().noticeId + 1 });
    noticeTimer = setTimeout(() => {
      noticeTimer = null;
      set({ notice: null });
    }, NOTICE_MS);
  }

  function persist(cleared: ClearedMap) {
    void saveCleared(cleared);
  }

  return {
    raw: [],
    cleared: {},
    hydrated: false,
    notice: null,
    noticeId: 0,
    pendingFocusId: null,
    pendingRequestId: null,

    hydrate: async () => {
      const cleared = await loadCleared();
      set({ cleared, hydrated: true });
    },

    apply: (list) => {
      const state = get();
      const raw = [...list];
      // 本地清除标记只过滤「清除之后没有新事件」的会话；有新事件自动解除。
      const cleared: ClearedMap = { ...state.cleared };
      for (const session of raw) {
        const marker = cleared[session.id];
        if (marker && session.lastEventAt > marker.through) delete cleared[session.id];
      }

      set({ raw, cleared });

      const clearedIds = Object.keys(cleared);
      const previousIds = Object.keys(state.cleared);
      if (
        clearedIds.length !== previousIds.length ||
        clearedIds.some((id) => !(id in state.cleared))
      ) {
        persist(cleared);
      }
    },

    clear: (id) => {
      const state = get();
      const session = state.raw.find((item) => item.id === id);
      if (!session) return;

      const cleared: ClearedMap = {
        ...state.cleared,
        [id]: { at: Date.now(), through: session.lastEventAt },
      };
      set({ cleared });
      persist(cleared);
      showNotice("已清除；这个会话有新动静会再出现。");
    },

    clearAll: () => {
      clearFocusTimer();
      clearNoticeTimer();
      set({
        raw: [],
        notice: null,
        pendingFocusId: null,
        pendingRequestId: null,
      });
    },

    requestFocus: (id) => {
      const state = get();
      const session = state.raw.find((item) => item.id === id);
      if (!session) return;
      if (useConnectionStore.getState().status !== "connected") {
        showNotice("先连上电脑，再打开会话。");
        return;
      }
      if (state.pendingRequestId !== null) return;

      requestSeq += 1;
      const requestId = `f-${Date.now()}-${requestSeq}`;
      set({ pendingFocusId: id, pendingRequestId: requestId });
      clearFocusTimer();
      focusTimer = setTimeout(() => {
        focusTimer = null;
        if (get().pendingRequestId !== requestId) return;
        set({ pendingFocusId: null, pendingRequestId: null });
        showNotice("电脑没有响应，稍后再试。");
      }, FOCUS_TIMEOUT_MS);

      void sendFocusRequest(session.source, session.id, requestId).catch(() => {
        if (get().pendingRequestId !== requestId) return;
        clearFocusTimer();
        set({ pendingFocusId: null, pendingRequestId: null });
        showNotice("电脑没有响应，稍后再试。");
      });
    },

    handleFocusResult: (result) => {
      if (get().pendingRequestId !== result.requestId) return;
      clearFocusTimer();
      set({ pendingFocusId: null, pendingRequestId: null });
      showNotice(result.ok ? "已在电脑上打开 DeepSeek Harness。" : focusErrorText(result.error));
    },

    dismissNotice: () => {
      clearNoticeTimer();
      set({ notice: null });
    },
  };
});
