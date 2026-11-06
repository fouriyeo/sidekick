import { create } from "zustand";
import type { TokenUsageStats, UsageRange } from "@/protocol/messages";
import { sendUsageRequest } from "@/shared/lib/tauri";

const REQUEST_TIMEOUT_MS = 8000;

type MobileUsageState = {
  range: UsageRange;
  /** 当前 range 对应的快照；切换区间后旧快照不直接复用。 */
  data: TokenUsageStats | null;
  /** 宠物页顶栏的「今天」快照；与用量页当前区间互不影响。 */
  today: TokenUsageStats | null;
  loading: boolean;
  error: string | null;
  request: (range?: UsageRange) => void;
  /** 静默拉一次「今天」，只驱动顶栏数字：不改区间、不显示加载/错误。 */
  requestToday: () => void;
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
  today: null,
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

  requestToday: () => {
    // 顶栏数字是静默信息：请求失败/超时都不进 loading/error，只保持图标态。
    void sendUsageRequest("today").catch(() => undefined);
  },

  setRange: (range) => {
    if (get().range === range) return;
    get().request(range);
  },

  apply: (data) => {
    // 「今天」快照独立于用量页区间：顶栏数字不随用量页切区间而变。
    if (data.range === "today") set({ today: data });
    // 用量页只接受当前区间的回包；桌面广播给多个客户端时避免区间错位。
    if (data.range !== get().range) return;
    clearTimer();
    set({ data, loading: false, error: null });
  },

  reset: () => {
    clearTimer();
    requestSeq += 1;
    set({ data: null, today: null, loading: false, error: null });
  },
}));
