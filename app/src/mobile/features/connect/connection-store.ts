import { create } from "zustand";
import type { DiscoveredServer } from "@/protocol/discovery";
import { readLocal, SERVER_ADDR_KEY, writeLocal } from "@/shared/lib/local-storage";
import { connectServer, discoverServers, normalizeError } from "@/shared/lib/tauri";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** 自动重连的退避序列（毫秒）：1s → 2s → 4s → 8s → 16s → 30s，之后固定 30s。 */
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;

export type DiscoverOptions = {
  /** 只有一台电脑时是否自动连接，默认 true。 */
  autoConnect?: boolean;
  /** 自动重连发起的静默搜索：不显示「正在找电脑…」，用 retrying 单独提示。 */
  silent?: boolean;
};

export type ConnectOptions = {
  /** 自动重连发起的连接：不清空退避计数，由重连循环继续决定下一次。 */
  auto?: boolean;
};

export type ConnectionState = {
  addr: string;
  status: ConnectionStatus;
  error: string | null;
  hydrated: boolean;
  devices: DiscoveredServer[];
  discovering: boolean;
  /** 是否已完成过一次搜索（成功或失败），用于防止页面切换时重复搜索。 */
  hasDiscovered: boolean;
  discoverError: string | null;
  /** 已排队的自动重连次数：0 表示没有排队，1 表示第 1 次等待中。 */
  retryAttempt: number;
  /** 下一次自动重连的时间戳（毫秒）；null 表示没有排队。 */
  retryAt: number | null;
  /** 正在执行一次自动重连（静默重新发现 + 连接）。 */
  retrying: boolean;
  /** App 在后台时暂停自动重连，回到前台立即重试。 */
  retryPaused: boolean;
  hydrateAddr: () => void;
  setAddr: (addr: string) => void;
  connect: (addr: string, options?: ConnectOptions) => Promise<string | null>;
  discover: (options?: DiscoverOptions) => Promise<string | null>;
  setOnline: (online: boolean) => void;
  /** App 启动入口：读取上次地址 → 搜索 → 连不上就进入自动重连。 */
  bootstrap: () => Promise<void>;
  /** 安排下一次自动重连（退避），手动操作会取消排期。 */
  scheduleRetry: () => void;
  /** 立即重连并重置退避（用户点「立即重连」）。 */
  retryNow: () => void;
  /** App 切到后台：暂停排期；进行中的重连会被取消续跑。 */
  pauseRetry: () => void;
  /** App 回到前台：立即重连一次。 */
  resumeRetry: () => void;
};

const DISCOVER_FALLBACK_ERROR = "搜索电脑失败，请稍后重试";

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let discoverInFlight = false;
/** 每次手动操作递增，用来取消在途自动重连的续跑（避免手动/自动互相打断）。 */
let retryGeneration = 0;

function clearRetryTimer() {
  if (retryTimer === null) return;
  clearTimeout(retryTimer);
  retryTimer = null;
}

function retryDelay(attempt: number) {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempt, 0), RETRY_DELAYS_MS.length - 1)];
}

function toDiscoverError(error: unknown): string {
  const message = normalizeError(error).trim();
  if (!message) return DISCOVER_FALLBACK_ERROR;
  return `搜索电脑失败：${message}`;
}

export const useConnectionStore = create<ConnectionState>((set, get) => {
  /**
   * 执行一次自动重连：先静默重新发现（覆盖 IP/端口变化），再连发现到的唯一电脑；
   * 找不到电脑时退回上次地址；多台电脑优先回上次那台，没有上次地址就停下等用户选。
   */
  async function runRetry(): Promise<void> {
    const generation = retryGeneration;
    const state = get();
    if (state.retryPaused) return;
    if (state.status === "connected" || state.status === "connecting") {
      set({ retryAttempt: 0, retryAt: null });
      return;
    }
    if (state.discovering) {
      // 手动搜索正在进行，等它结束后再排下一次。
      get().scheduleRetry();
      return;
    }

    set({ retrying: true, retryAt: null });
    try {
      await get().discover({ autoConnect: false, silent: true });
      // 用户已经手动介入（连接/搜索/暂停），本次自动重连不再续跑。
      if (generation !== retryGeneration) return;

      const { status, devices, addr } = get();
      if (status === "connected" || status === "connecting") {
        set({ retryAttempt: 0, retryAt: null });
        return;
      }

      const savedAddr = addr.trim();
      let target: string | null = null;
      if (devices.length === 1) {
        target = devices[0].addr;
      } else if (devices.length > 1) {
        // 多台电脑时不替用户选；有上次地址就回上次那台，否则停止自动重连。
        if (!savedAddr) {
          set({ retryAttempt: 0, retryAt: null });
          return;
        }
        target = savedAddr;
      } else if (savedAddr) {
        target = savedAddr;
      }

      if (target) {
        const message = await get().connect(target, { auto: true });
        if (generation !== retryGeneration) return;
        if (!message) {
          set({ retryAttempt: 0, retryAt: null });
          return;
        }
      }
    } finally {
      if (generation === retryGeneration) set({ retrying: false });
    }

    if (generation !== retryGeneration) return;
    const { status } = get();
    if (status === "connected" || status === "connecting") {
      set({ retryAttempt: 0, retryAt: null });
      return;
    }
    get().scheduleRetry();
  }

  return {
    addr: "",
    status: "disconnected",
    error: null,
    hydrated: false,
    devices: [],
    discovering: false,
    hasDiscovered: false,
    discoverError: null,
    retryAttempt: 0,
    retryAt: null,
    retrying: false,
    retryPaused: false,

    hydrateAddr: () => {
      if (get().hydrated) return;

      const saved = readLocal(SERVER_ADDR_KEY);
      set({ hydrated: true, ...(saved === null ? {} : { addr: saved }) });
    },

    setAddr: (addr) => set({ addr }),

    connect: async (rawAddr, options) => {
      const addr = rawAddr.trim();
      if (!addr) return null;

      const auto = options?.auto ?? false;
      if (!auto) {
        // 手动连接优先：取消已排队的自动重连，退避从头开始。
        clearRetryTimer();
        retryGeneration += 1;
        set({ retryAttempt: 0, retryAt: null, retrying: false });
      }

      // 存地址只是便利功能，写入失败不应阻止连接。
      writeLocal(SERVER_ADDR_KEY, addr);
      set({ addr, status: "connecting", error: null });

      try {
        await connectServer(addr);
        // 真正的 connected 状态由 Rust 的 conn 事件驱动。
        return null;
      } catch (error) {
        const message = normalizeError(error);
        set({ status: "error", error: message });
        // 手动连接失败也纳入自动重连（电脑可能只是晚点开机）。
        if (!auto && retryTimer === null && !get().retrying) get().scheduleRetry();
        return message;
      }
    },

    discover: async (options) => {
      const silent = options?.silent ?? false;
      const autoConnect = options?.autoConnect ?? true;

      // 并发保护：已有一次搜索在跑（手动或静默）时直接复用，不重复发请求。
      if (discoverInFlight) return null;
      discoverInFlight = true;

      if (silent) {
        set({ discoverError: null });
      } else {
        // 手动搜索优先：取消已排队的自动重连。
        clearRetryTimer();
        retryGeneration += 1;
        set({
          discovering: true,
          discoverError: null,
          retryAttempt: 0,
          retryAt: null,
          retrying: false,
        });
      }

      let devices: DiscoveredServer[];
      try {
        devices = await discoverServers();
      } catch (error) {
        discoverInFlight = false;
        const message = toDiscoverError(error);
        set({ discovering: false, hasDiscovered: true, discoverError: message });
        return message;
      }
      discoverInFlight = false;

      set({ devices, discovering: false, hasDiscovered: true, discoverError: null });

      // 找不到电脑不是错误：保留手动输入兜底，由 UI 给出中文提示。
      if (!autoConnect || devices.length !== 1) return null;

      const { status } = get();
      if (status !== "disconnected" && status !== "error") return null;

      return get().connect(devices[0].addr, { auto: silent });
    },

    setOnline: (online) => {
      if (online) {
        clearRetryTimer();
        retryGeneration += 1;
        set({
          status: "connected",
          error: null,
          retryAttempt: 0,
          retryAt: null,
          retrying: false,
        });
        return;
      }

      set({ status: "disconnected", error: null });
      // 断连后自动进入重连；进行中的重连由它自己收尾，避免重复排期。
      if (!get().retrying && retryTimer === null) get().scheduleRetry();
    },

    bootstrap: async () => {
      get().hydrateAddr();
      if (get().status === "connected" || get().status === "connecting") return;

      await get().discover();
      const { status, retryPaused } = get();
      if (status === "connected" || status === "connecting" || retryPaused) return;
      get().scheduleRetry();
    },

    scheduleRetry: () => {
      if (get().retryPaused) return;
      if (get().status === "connected" || get().status === "connecting") return;
      // 多台电脑且从未连过：不替用户选，等手动选择。
      if (get().devices.length > 1 && !get().addr.trim()) return;

      clearRetryTimer();
      const attempt = get().retryAttempt;
      const delay = retryDelay(attempt);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void runRetry();
      }, delay);
      set({ retryAttempt: attempt + 1, retryAt: Date.now() + delay });
    },

    retryNow: () => {
      clearRetryTimer();
      retryGeneration += 1;
      set({ retryAttempt: 0, retryAt: null, retrying: false, retryPaused: false });
      if (get().status === "connected" || get().status === "connecting") return;
      void runRetry();
    },

    pauseRetry: () => {
      clearRetryTimer();
      retryGeneration += 1;
      set({ retryPaused: true, retryAttempt: 0, retryAt: null, retrying: false });
    },

    resumeRetry: () => {
      set({ retryPaused: false });
      if (get().status === "connected" || get().status === "connecting") return;
      // 回前台立即重试一次，退避从头开始（熄屏期间系统可能已冻结计时器）。
      clearRetryTimer();
      retryGeneration += 1;
      set({ retryAttempt: 0, retryAt: null });
      void runRetry();
    },
  };
});
