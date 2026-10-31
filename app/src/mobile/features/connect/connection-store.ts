import { create } from "zustand";
import type { DiscoveredServer } from "@/protocol/discovery";
import { readLocal, SERVER_ADDR_KEY, writeLocal } from "@/shared/lib/local-storage";
import { connectServer, discoverServers, normalizeError } from "@/shared/lib/tauri";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type DiscoverOptions = {
  /** 只有一台电脑时是否自动连接，默认 true。 */
  autoConnect?: boolean;
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
  hydrateAddr: () => void;
  setAddr: (addr: string) => void;
  connect: (addr: string) => Promise<string | null>;
  discover: (options?: DiscoverOptions) => Promise<string | null>;
  setOnline: (online: boolean) => void;
};

const DISCOVER_FALLBACK_ERROR = "搜索电脑失败，请稍后重试";

function toDiscoverError(error: unknown): string {
  const message = normalizeError(error).trim();
  if (!message) return DISCOVER_FALLBACK_ERROR;
  return `搜索电脑失败：${message}`;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  addr: "",
  status: "disconnected",
  error: null,
  hydrated: false,
  devices: [],
  discovering: false,
  hasDiscovered: false,
  discoverError: null,

  hydrateAddr: () => {
    if (get().hydrated) return;

    const saved = readLocal(SERVER_ADDR_KEY);
    set({ hydrated: true, ...(saved === null ? {} : { addr: saved }) });
  },

  setAddr: (addr) => set({ addr }),

  connect: async (rawAddr) => {
    const addr = rawAddr.trim();
    if (!addr) return null;

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
      return message;
    }
  },

  discover: async (options) => {
    // 并发保护：正在搜索时直接复用当前这一次，不重复发请求。
    if (get().discovering) return null;

    const autoConnect = options?.autoConnect ?? true;
    set({ discovering: true, discoverError: null });

    let devices: DiscoveredServer[];
    try {
      devices = await discoverServers();
    } catch (error) {
      const message = toDiscoverError(error);
      set({ discovering: false, hasDiscovered: true, discoverError: message });
      return message;
    }

    set({ devices, discovering: false, hasDiscovered: true, discoverError: null });

    // 找不到电脑不是错误：保留手动输入兜底，由 UI 给出中文提示。
    if (!autoConnect || devices.length !== 1) return null;

    const { status } = get();
    if (status !== "disconnected" && status !== "error") return null;

    return get().connect(devices[0].addr);
  },

  setOnline: (online) => {
    set(online ? { status: "connected", error: null } : { status: "disconnected", error: null });
  },
}));
