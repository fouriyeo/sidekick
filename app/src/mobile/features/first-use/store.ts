import { create } from "zustand";
import type { DesktopStatusMessage } from "@/protocol/messages";
import { FIRST_USE_KEY, readLocal, writeLocal } from "@/shared/lib/local-storage";

type Persisted = {
  /** 是否已经成功用过一次麦克风（拿到 mic.ready / 首次录音成功）。 */
  micReady: boolean;
  /** 用户是否手动收起首用清单。 */
  dismissed: boolean;
};

/** 电脑侧真实状态：只存在运行态，不落盘（每次连接都重新问电脑）。 */
export type DesktopStatus = {
  asrConfigured: boolean;
  asrHasKey: boolean;
  accessibilityTrusted: boolean;
  /** 收到该快照的时间（桌面毫秒时钟）。 */
  at: number;
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
  /** 桌面最近一次上报的真实状态；null = 没收到（旧桌面或还没连上）。 */
  desktop: DesktopStatus | null;
  hydrate: () => void;
  markMicReady: () => void;
  dismiss: () => void;
  applyDesktopStatus: (
    status: Pick<
      DesktopStatusMessage,
      "asrConfigured" | "asrHasKey" | "accessibilityTrusted" | "ts"
    >,
  ) => void;
  reset: () => void;
};

/**
 * 首用清单的本机状态。
 *
 * 前两步（连接由 connection store 实时判断；麦克风由 micReady 判断）是本机事实；
 * 后两步（百炼 Key / 桌面辅助功能）只听电脑的 desktop.status，手机不伪造完成态。
 * 电脑侧状态只存在运行态，persist() 仍然只写 {micReady, dismissed}。
 */
export const useFirstUseStore = create<FirstUseState>((set, get) => ({
  ...DEFAULT,
  hydrated: false,
  desktop: null,

  hydrate: () => {
    if (get().hydrated) return;
    const saved = parse(readLocal(FIRST_USE_KEY));
    // 只合并持久化字段；已经应用过的 desktop 快照保留，不被水合覆盖。
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

  applyDesktopStatus: (status) => {
    set({
      desktop: {
        asrConfigured: status.asrConfigured,
        asrHasKey: status.asrHasKey,
        accessibilityTrusted: status.accessibilityTrusted,
        at: status.ts,
      },
    });
  },

  reset: () => {
    persist({ ...DEFAULT });
    set({ ...DEFAULT, desktop: null });
  },
}));
