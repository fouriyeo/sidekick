import { create } from "zustand";
import { FIRST_USE_KEY, readLocal, writeLocal } from "@/shared/lib/local-storage";

type Persisted = {
  /** 是否已经成功用过一次麦克风（拿到 mic.ready / 首次录音成功）。 */
  micReady: boolean;
  /** 用户是否手动收起首用清单。 */
  dismissed: boolean;
};

const DEFAULT: Persisted = { micReady: false, dismissed: false };

function parse(raw: string | null): Persisted {
  if (!raw) return { ...DEFAULT };
  try {
    const value = JSON.parse(raw) as Partial<Persisted> | null;
    if (typeof value !== "object" || value === null) return { ...DEFAULT };
    return {
      micReady: value.micReady === true,
      dismissed: value.dismissed === true,
    };
  } catch {
    return { ...DEFAULT };
  }
}

function persist(value: Persisted): void {
  writeLocal(FIRST_USE_KEY, JSON.stringify(value));
}

type FirstUseState = Persisted & {
  hydrated: boolean;
  hydrate: () => void;
  markMicReady: () => void;
  dismiss: () => void;
  reset: () => void;
};

/**
 * 首用清单的本机状态。
 *
 * 只记录手机端能验证的步骤（连接由 connection store 实时判断；麦克风由
 * micReady 判断）。百炼 Key / 桌面辅助功能在电脑上完成，手机不伪造完成态。
 */
export const useFirstUseStore = create<FirstUseState>((set, get) => ({
  ...DEFAULT,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const saved = parse(readLocal(FIRST_USE_KEY));
    set({ ...saved, hydrated: true });
  },

  markMicReady: () => {
    if (get().micReady) return;
    const next: Persisted = { micReady: true, dismissed: get().dismissed };
    persist(next);
    set({ micReady: true });
  },

  dismiss: () => {
    const next: Persisted = { micReady: get().micReady, dismissed: true };
    persist(next);
    set({ dismissed: true });
  },

  reset: () => {
    persist({ ...DEFAULT });
    set({ ...DEFAULT });
  },
}));
