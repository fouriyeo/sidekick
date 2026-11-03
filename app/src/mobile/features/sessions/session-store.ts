import { create } from "zustand";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import type { FocusResultMessage, SessionSummary } from "@/protocol/messages";
import { sendFocusRequest } from "@/shared/lib/tauri";
import { type ClearedMap, loadCleared, saveCleared } from "./session-storage";

/** 会话行的展示态：asking/working/completed/idle；completed 由 completedAt 推导。 */
export type SessionDisplayState = "asking" | "working" | "completed" | "idle";

export type SessionRow = SessionSummary & { display: SessionDisplayState };

const DISPLAY_ORDER: Record<SessionDisplayState, number> = {
  asking: 0,
  working: 1,
  completed: 2,
  idle: 3,
};

const FOCUS_TIMEOUT_MS = 3000;
const NOTICE_MS = 3200;

let focusTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let clearConfirmTimer: ReturnType<typeof setTimeout> | null = null;
let requestSeq = 0;

export function displayStateOf(session: SessionSummary): SessionDisplayState {
  if (session.state === "asking") return "asking";
  if (session.state === "working") return "working";
  if (session.completedAt !== null && session.completedAt !== undefined) return "completed";
  return "idle";
}

/** 可见会话：过滤「已清除且之后没有新事件」的项，并按优先级排序。 */
export function visibleSessions(
  list: readonly SessionSummary[],
  cleared: ClearedMap,
): SessionRow[] {
  return list
    .filter((session) => {
      const marker = cleared[session.id];
      return !marker || session.lastEventAt > marker.through;
    })
    .map((session) => ({ ...session, display: displayStateOf(session) }))
    .sort((left, right) => {
      const byState = DISPLAY_ORDER[left.display] - DISPLAY_ORDER[right.display];
      if (byState !== 0) return byState;
      return right.lastEventAt - left.lastEventAt;
    });
}

export function focusErrorText(error: string | null | undefined): string {
  switch (error) {
    case "launch_failed":
      return "电脑上没有找到 DeepSeek Harness。";
    case "rate_limited":
      return "刚打开过，稍等一下再试。";
    case "unsupported_platform":
      return "当前电脑暂不支持自动打开。";
    case "unsupported_source":
      return "这个会话类型还不支持打开。";
    default:
      return "电脑没有响应，稍后再试。";
  }
}

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

function clearClearConfirmTimer() {
  if (clearConfirmTimer !== null) {
    clearTimeout(clearConfirmTimer);
    clearConfirmTimer = null;
  }
}

type SessionStoreState = {
  raw: SessionSummary[];
  cleared: ClearedMap;
  hydrated: boolean;
  expanded: boolean;
  notice: string | null;
  noticeId: number;
  pendingFocusId: string | null;
  pendingRequestId: string | null;
  pendingClearId: string | null;
  lastAskingIds: string[];
  seenSnapshot: boolean;
  hydrate: () => Promise<void>;
  apply: (list: readonly SessionSummary[]) => void;
  toggle: () => void;
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
    expanded: false,
    notice: null,
    noticeId: 0,
    pendingFocusId: null,
    pendingRequestId: null,
    pendingClearId: null,
    lastAskingIds: [],
    seenSnapshot: false,

    hydrate: async () => {
      const cleared = await loadCleared();
      set({ cleared, hydrated: true });
    },

    apply: (list) => {
      const state = get();
      const raw = [...list];
      const cleared: ClearedMap = { ...state.cleared };
      for (const session of raw) {
        const marker = cleared[session.id];
        if (marker && session.lastEventAt > marker.through) delete cleared[session.id];
      }

      const askingIds = raw.filter((session) => session.state === "asking").map((s) => s.id);
      const hasNewAsking = askingIds.some((id) => !state.lastAskingIds.includes(id));
      const expanded = state.expanded || (state.seenSnapshot && hasNewAsking);
      const pendingClearId =
        state.pendingClearId && raw.some((session) => session.id === state.pendingClearId)
          ? state.pendingClearId
          : null;

      set({
        raw,
        cleared,
        expanded,
        pendingClearId,
        lastAskingIds: askingIds,
        seenSnapshot: true,
      });

      const clearedIds = Object.keys(cleared);
      const previousIds = Object.keys(state.cleared);
      if (
        clearedIds.length !== previousIds.length ||
        clearedIds.some((id) => !(id in state.cleared))
      ) {
        persist(cleared);
      }
    },

    toggle: () => {
      clearClearConfirmTimer();
      set((state) => ({ expanded: !state.expanded, pendingClearId: null }));
    },

    clear: (id) => {
      const state = get();
      const session = state.raw.find((item) => item.id === id);
      if (!session) return;

      if (session.state === "asking" && state.pendingClearId !== id) {
        clearClearConfirmTimer();
        set({ pendingClearId: id });
        clearConfirmTimer = setTimeout(() => {
          clearConfirmTimer = null;
          if (get().pendingClearId === id) set({ pendingClearId: null });
        }, NOTICE_MS);
        showNotice("这个会话正在等你决定，再点一次清除。");
        return;
      }

      const cleared: ClearedMap = {
        ...state.cleared,
        [id]: { at: Date.now(), through: session.lastEventAt },
      };
      clearClearConfirmTimer();
      set({ cleared, pendingClearId: null });
      persist(cleared);
      showNotice("已清除；这个会话有新动静会再出现。");
    },

    clearAll: () => {
      clearFocusTimer();
      clearNoticeTimer();
      clearClearConfirmTimer();
      set({
        raw: [],
        expanded: false,
        notice: null,
        pendingFocusId: null,
        pendingRequestId: null,
        pendingClearId: null,
        lastAskingIds: [],
        seenSnapshot: false,
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
