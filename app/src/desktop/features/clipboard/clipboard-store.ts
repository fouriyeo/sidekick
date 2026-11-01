import { create } from "zustand";
import {
  type ClipboardItem,
  type ClipboardSnapshot,
  clearClipboard,
  copyClipboardItem,
  deleteClipboardItem,
  listClipboard,
  normalizeError,
  setClipboardEnabled,
  toggleClipboardPin,
} from "@/shared/lib/tauri";

type ClipboardState = {
  snapshot: ClipboardSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  copy: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  applySnapshot: (snapshot: ClipboardSnapshot) => void;
};

export function filterClipboardItems(items: ClipboardItem[], query: string): ClipboardItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) => item.text.toLowerCase().includes(needle));
}

/** 与 Rust 侧 MAX_ITEMS 对齐；snapshot 还没加载时用于展示上限。 */
export const DEFAULT_CLIPBOARD_MAX_ITEMS = 100;

export function formatClipboardCount(count: number, maxItems?: number): string {
  const limit = maxItems && maxItems > 0 ? maxItems : DEFAULT_CLIPBOARD_MAX_ITEMS;
  return `${count} / ${limit} 条 · 仅保存在这台电脑`;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  snapshot: null,
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const snapshot = await listClipboard();
      set({ snapshot, loading: false });
    } catch (cause) {
      set({ loading: false, error: normalizeError(cause) });
    }
  },

  copy: async (id) => {
    try {
      const snapshot = await copyClipboardItem(id);
      set({ snapshot, error: null });
    } catch (cause) {
      set({ error: normalizeError(cause) });
    }
  },

  togglePin: async (id) => {
    try {
      const snapshot = await toggleClipboardPin(id);
      set({ snapshot, error: null });
    } catch (cause) {
      set({ error: normalizeError(cause) });
    }
  },

  remove: async (id) => {
    try {
      const snapshot = await deleteClipboardItem(id);
      set({ snapshot, error: null });
    } catch (cause) {
      set({ error: normalizeError(cause) });
    }
  },

  clear: async () => {
    try {
      const snapshot = await clearClipboard();
      set({ snapshot, error: null });
    } catch (cause) {
      set({ error: normalizeError(cause) });
    }
  },

  setEnabled: async (enabled) => {
    try {
      const snapshot = await setClipboardEnabled(enabled);
      set({ snapshot, error: null });
    } catch (cause) {
      set({ error: normalizeError(cause) });
    }
  },

  applySnapshot: (snapshot) => set({ snapshot }),
}));
