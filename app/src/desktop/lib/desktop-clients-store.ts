import { create } from "zustand";

/**
 * 桌面端在线客户端数。
 *
 * 服务端通过 `system` 消息的可选 `clients` 字段广播（含桌面本机窗口与网页预览）。
 * 因此「手机数」是近似值：max(0, clients - 1)。UI 文案用「台设备」，
 * 精确手机台数需要 P1 角色握手，不在本轮范围。
 */
type DesktopClientsState = {
  /** 服务端报告的在线客户端总数；null 表示还没收到（旧服务端）。 */
  clients: number | null;
  apply: (count: number) => void;
  reset: () => void;
};

export const useDesktopClientsStore = create<DesktopClientsState>((set) => ({
  clients: null,
  apply: (count) => {
    if (!Number.isFinite(count) || count < 0) return;
    set({ clients: Math.floor(count) });
  },
  reset: () => set({ clients: null }),
}));

/** 去掉桌面本机窗口后的近似设备数。 */
export function deviceCountFromClients(clients: number | null): number {
  if (clients === null) return 0;
  return Math.max(0, clients - 1);
}
