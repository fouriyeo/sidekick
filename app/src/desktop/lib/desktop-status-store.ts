import { create } from "zustand";
import type { SessionSummary, StatusMessage } from "@/protocol/messages";

/**
 * 桌面端 AI 状态与会话列表的唯一事实源。
 *
 * 数据来自桌面本地 WS 收到的 `status` 广播（与手机同一条消息）。
 * 不落盘；重连后由服务端快照补回。
 */
type DesktopStatusState = {
  status: StatusMessage | null;
  sessionList: SessionSummary[];
  /** 最近一次 status 的接收时间（本机时钟），用于「状态可能过期」提示。 */
  updatedAt: number | null;
  apply: (message: StatusMessage) => void;
  reset: () => void;
};

export const useDesktopStatusStore = create<DesktopStatusState>((set) => ({
  status: null,
  sessionList: [],
  updatedAt: null,
  apply: (message) =>
    set({
      status: message,
      sessionList: message.sessionList ?? [],
      updatedAt: Date.now(),
    }),
  reset: () => set({ status: null, sessionList: [], updatedAt: null }),
}));
