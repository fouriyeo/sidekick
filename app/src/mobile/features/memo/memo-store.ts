import { create } from "zustand";
import type {
  MemoDetail,
  MemoEvent,
  MemoKeyStatus,
  MemoStorageStats,
  MemoSummary,
  MemoType,
} from "@/protocol/memo";
import {
  memoDelete,
  memoDeleteAudio,
  memoGet,
  memoKeyClear,
  memoKeySave,
  memoKeyStatus,
  memoList,
  memoPairApply,
  memoRetry,
  memoStorageStats,
  memoUpdate,
  normalizeError,
} from "@/shared/lib/tauri";

const SETTINGS_KEY = "sidekick:memo";

type MemoSettings = { keepAudio: boolean };

function readSettings(): MemoSettings {
  if (typeof localStorage === "undefined") return { keepAudio: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { keepAudio: true };
    const parsed = JSON.parse(raw) as Partial<MemoSettings>;
    return { keepAudio: parsed.keepAudio !== false };
  } catch {
    return { keepAudio: true };
  }
}

function writeSettings(settings: MemoSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage 不可用时静默；设置只影响本机提示，不阻断录音。
  }
}

type MemoState = {
  items: MemoSummary[];
  loading: boolean;
  error: string | null;
  detail: MemoDetail | null;
  detailId: string | null;
  detailLoading: boolean;
  key: MemoKeyStatus | null;
  storage: MemoStorageStats | null;
  keepAudio: boolean;
  load: () => Promise<void>;
  loadDetail: (id: string) => Promise<void>;
  clearDetail: () => void;
  updateMeta: (id: string, input: { title?: string; memoType?: MemoType }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeAudio: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  loadKey: () => Promise<void>;
  saveKey: (key: string) => Promise<void>;
  clearKey: () => Promise<void>;
  applyPair: (result: { token?: string; key?: string }) => Promise<boolean>;
  loadStorage: () => Promise<void>;
  setKeepAudio: (keepAudio: boolean) => void;
  applyEvent: (event: MemoEvent) => void;
};

export const useMemoStore = create<MemoState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  detail: null,
  detailId: null,
  detailLoading: false,
  key: null,
  storage: null,
  keepAudio: readSettings().keepAudio,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const items = await memoList();
      set({ items, loading: false });
      // 「保留录音」关掉时，等条目整理完成再删音频（避免管道读不到文件）。
      if (!get().keepAudio) {
        for (const item of items) {
          if (item.status === "done" && item.hasAudio) {
            void memoDeleteAudio(item.id).catch(() => undefined);
          }
        }
      }
    } catch (error) {
      set({ loading: false, error: normalizeError(error) });
    }
  },

  loadDetail: async (id) => {
    set({ detailId: id, detailLoading: true });
    try {
      const detail = await memoGet(id);
      // 加载期间用户可能已经退出详情，别把旧结果盖回来。
      if (get().detailId === id) set({ detail, detailLoading: false });
    } catch (error) {
      if (get().detailId === id) {
        set({ detail: null, detailLoading: false, error: normalizeError(error) });
      }
    }
  },

  clearDetail: () => set({ detail: null, detailId: null, detailLoading: false }),

  updateMeta: async (id, input) => {
    const updated = await memoUpdate(id, input);
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? updated : item)),
      detail:
        state.detail && state.detail.id === id ? { ...state.detail, ...updated } : state.detail,
    }));
  },

  remove: async (id) => {
    await memoDelete(id);
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      detail: state.detail?.id === id ? null : state.detail,
      detailId: state.detailId === id ? null : state.detailId,
    }));
  },

  removeAudio: async (id) => {
    await memoDeleteAudio(id);
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, hasAudio: false, audioBytes: 0 } : item,
      ),
      detail:
        state.detail?.id === id
          ? { ...state.detail, hasAudio: false, audioBytes: 0, audioPath: null }
          : state.detail,
    }));
  },

  retry: async (id) => {
    await memoRetry(id);
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, status: "pending", lastError: null } : item,
      ),
    }));
  },

  loadKey: async () => {
    try {
      set({ key: await memoKeyStatus() });
    } catch {
      // Key 状态读不到不弹错，页面显示「未配置」。
    }
  },

  saveKey: async (key) => {
    const status = await memoKeySave(key);
    set({ key: status });
  },

  clearKey: async () => {
    const status = await memoKeyClear();
    set({ key: status });
  },

  applyPair: async (result) => {
    if (!result.token) return false;
    await memoPairApply(result.token, result.key);
    set({ key: await memoKeyStatus() });
    return true;
  },

  loadStorage: async () => {
    try {
      set({ storage: await memoStorageStats() });
    } catch {
      set({ storage: null });
    }
  },

  setKeepAudio: (keepAudio) => {
    writeSettings({ keepAudio });
    set({ keepAudio });
  },

  applyEvent: (event) => {
    if (event.kind === "key") {
      void get().loadKey();
      return;
    }
    void get().load();
    if (event.id && get().detailId === event.id) {
      void get().loadDetail(event.id);
    }
  },
}));
