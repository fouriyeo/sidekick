import { create } from "zustand";
import { readLocal, SERVER_ADDR_KEY, writeLocal } from "@/shared/lib/local-storage";
import { connectServer, normalizeError } from "@/shared/lib/tauri";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type ConnectionState = {
  addr: string;
  status: ConnectionStatus;
  error: string | null;
  hydrated: boolean;
  hydrateAddr: () => void;
  setAddr: (addr: string) => void;
  connect: (addr: string) => Promise<string | null>;
  setOnline: (online: boolean) => void;
};

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  addr: "",
  status: "disconnected",
  error: null,
  hydrated: false,

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

  setOnline: (online) => {
    set(online ? { status: "connected", error: null } : { status: "disconnected", error: null });
  },
}));
