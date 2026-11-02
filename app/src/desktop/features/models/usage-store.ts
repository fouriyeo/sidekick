import { create } from "zustand";
import {
  clearUsageStats,
  getUsageStats,
  normalizeError,
  type UsageStats,
} from "@/shared/lib/tauri";

type UsageState = {
  stats: UsageStats | null;
  loading: boolean;
  clearing: boolean;
  error: string | null;
  load: () => Promise<void>;
  clear: () => Promise<void>;
  reset: () => void;
};

const initialState = {
  stats: null,
  loading: false,
  clearing: false,
  error: null,
};

export const useUsageStore = create<UsageState>((set) => ({
  ...initialState,

  load: async () => {
    set({ loading: true, error: null });
    try {
      set({ stats: await getUsageStats(), loading: false });
    } catch (cause) {
      set({ loading: false, error: `读取用量统计失败：${normalizeError(cause)}` });
    }
  },

  clear: async () => {
    set({ clearing: true, error: null });
    try {
      set({ stats: await clearUsageStats(), clearing: false });
    } catch (cause) {
      set({ clearing: false, error: `清空用量统计失败：${normalizeError(cause)}` });
    }
  },

  reset: () => set({ ...initialState }),
}));
