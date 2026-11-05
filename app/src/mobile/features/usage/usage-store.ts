import { create } from "zustand";
import type { TokenUsageStats, UsageRange } from "@/protocol/messages";
import { sendUsageRequest } from "@/shared/lib/tauri";

const REQUEST_TIMEOUT_MS = 8000;

type MobileUsageState = {
  range: UsageRange;
  /** 当前 range 对应的快照；切换区间后旧快照不直接复用。 */
  data: TokenUsageStats | null;
  loading: boolean;
  error: string | null;
  request: (range?: UsageRange) => void;
  setRange: (range: UsageRange) => void;
  apply: (data: TokenUsageStats) => void;
  reset: () => void;
};

let timeoutId: number | null = null;
let requestSeq = 0;

function clearTimer() {
  if (timeoutId !== null) {
    window.clearTimeout(timeoutId);
    timeoutId = null;
  }
}

export const useMobileUsageStore = create<MobileUsageState>((set, get) => ({
  range: "7d",
  data: null,
  loading: false,
  error: null,

  request: (range) => {
    const target = range ?? get().range;
    const seq = ++requestSeq;
    clearTimer();
    set({
      range: target,
      loading: true,
      error: null,
      data: get().data?.range === target ? get().data : null,
    });
    void sendUsageRequest(target).catch(() => {
      if (seq !== requestSeq) return;
      clearTimer();
      set({ loading: false, error: "还没连上电脑" });
    });
    timeoutId = window.setTimeout(() => {
      if (seq !== requestSeq) return;
      timeoutId = null;
      if (!get().loading) return;
      // 已有同区间快照时静默保留旧数据；没有快照才提示超时。
      const hasSnapshot = get().data?.range === target;
      set({ loading: false, error: hasSnapshot ? null : "电脑没有回应，点这里重试" });
    }, REQUEST_TIMEOUT_MS);
  },

  setRange: (range) => {
    if (get().range === range) return;
    get().request(range);
  },

  apply: (data) => {
    // 只接受当前区间的回包；桌面广播给多个客户端时避免区间错位。
    if (data.range !== get().range) return;
    clearTimer();
    set({ data, loading: false, error: null });
  },

  reset: () => {
    clearTimer();
    requestSeq += 1;
    set({ data: null, loading: false, error: null });
  },
}));
