import { create } from "zustand";
import type { PricingStatus, TokenUsageStats, UsageRange } from "@/protocol/messages";
import {
  getTokenUsageStats,
  normalizeError,
  refreshTokenPricing,
  setTokenPricingAuto,
  setTokenPricingMobileModels,
} from "@/shared/lib/tauri";

export type UsageGroupMode = "client" | "session" | "model";

type UsageState = {
  range: UsageRange;
  group: UsageGroupMode;
  stats: TokenUsageStats | null;
  loading: boolean;
  error: string | null;
  pricingBusy: boolean;
  pricingError: string | null;
  sheetOpen: boolean;
  setRange: (range: UsageRange) => void;
  setGroup: (group: UsageGroupMode) => void;
  setSheetOpen: (open: boolean) => void;
  load: () => Promise<void>;
  refreshPricing: (force: boolean) => Promise<void>;
  setAutoRefresh: (enabled: boolean) => Promise<void>;
  setMobileModels: (enabled: boolean) => Promise<void>;
};

/** 自动刷新每个 App 会话只尝试一次，失败不反复打扰。 */
let autoRefreshTried = false;
/** 防止快速切区间时旧请求覆盖新结果。 */
let requestSeq = 0;

export const useUsageStore = create<UsageState>((set, get) => {
  async function fetchStats(range: UsageRange) {
    const seq = ++requestSeq;
    set({ loading: true, error: null });
    try {
      const stats = await getTokenUsageStats(range);
      if (seq !== requestSeq) return;
      set({ stats, loading: false });
      const pricingAge = stats.pricing.updatedAt
        ? Date.now() - stats.pricing.updatedAt
        : Number.POSITIVE_INFINITY;
      if (stats.pricing.autoRefresh && pricingAge > 24 * 60 * 60 * 1000 && !autoRefreshTried) {
        autoRefreshTried = true;
        // 价格刷新不阻塞首屏：后台拉取后只替换 pricing，账本数据不重读。
        void refreshTokenPricing(false)
          .then(async () => {
            // 价格更新后重读一次统计，让模型行的单价也跟着变；账本按 mtime 命中缓存。
            try {
              const latest = await getTokenUsageStats(get().range);
              set({ stats: latest });
            } catch {
              // 重读失败就保留旧快照；价格状态已由后端更新。
            }
          })
          .catch(() => {
            // 失败保留 seed/上次成功；价格面板里会显示 lastError。
          });
      }
    } catch (cause) {
      if (seq !== requestSeq) return;
      set({ loading: false, error: normalizeError(cause) });
    }
  }

  function applyPricing(pricing: PricingStatus) {
    const current = get().stats;
    if (current) set({ stats: { ...current, pricing } });
  }

  return {
    range: "today",
    group: "model",
    stats: null,
    loading: false,
    error: null,
    pricingBusy: false,
    pricingError: null,
    sheetOpen: false,

    setRange: (range) => {
      if (get().range === range) return;
      set({ range });
      void fetchStats(range);
    },

    setGroup: (group) => set({ group }),
    setSheetOpen: (sheetOpen) => set({ sheetOpen }),

    load: async () => {
      await fetchStats(get().range);
    },

    refreshPricing: async (force) => {
      set({ pricingBusy: true, pricingError: null });
      try {
        const pricing = await refreshTokenPricing(force);
        try {
          const latest = await getTokenUsageStats(get().range);
          set({ stats: latest });
        } catch {
          applyPricing(pricing);
        }
        set({ pricingBusy: false });
      } catch (cause) {
        set({ pricingBusy: false, pricingError: normalizeError(cause) });
      }
    },

    setAutoRefresh: async (enabled) => {
      try {
        const pricing = await setTokenPricingAuto(enabled);
        applyPricing(pricing);
        set({ pricingError: null });
      } catch (cause) {
        set({ pricingError: normalizeError(cause) });
      }
    },

    setMobileModels: async (enabled) => {
      try {
        const pricing = await setTokenPricingMobileModels(enabled);
        applyPricing(pricing);
        set({ pricingError: null });
      } catch (cause) {
        set({ pricingError: normalizeError(cause) });
      }
    },
  };
});
