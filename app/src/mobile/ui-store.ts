import { create } from "zustand";
import { micBusyNow } from "@/mobile/features/mic/mic-store";

/**
 * 手机端一级/二级视图。
 *
 * - `pet` / `stream` / `settings` 是底部三档（根页面是 pet）；
 * - `chat` / `asking` / `offline` 是二级全屏页，离开时按返回层级回到上一级；
 * - `offline` 记录打开它的视图，返回时回到原页面（「连接」是多入口的排障页）。
 */
export type MobileView = "pet" | "stream" | "settings" | "chat" | "asking" | "offline";

/** 可以打开连接页、且需要被记住的上一级视图。 */
type OfflineReturnView = Exclude<MobileView, "offline">;

type UiState = {
  view: MobileView;
  /** 全屏扫码页；叠在当前视图上，关闭后回到原页面。 */
  scanOpen: boolean;
  /** 打开连接页之前所在的视图，用于「offline → 上一页」。 */
  offlineReturnView: OfflineReturnView;
  setView: (view: MobileView) => void;
  /** 打开连接页：只记录一次来源，避免在连接页里再点状态把自己记成来源。 */
  openOffline: () => void;
  /** 关闭连接页，回到打开它的页面。 */
  closeOffline: () => void;
  setScanOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set, get) => ({
  view: "pet",
  scanOpen: false,
  offlineReturnView: "pet",

  // 录音中禁切页：所有换页入口统一在这里拦截（底部三档另有禁用与提示）。
  setView: (view) => {
    if (micBusyNow()) return;
    set({ view });
  },

  openOffline: () => {
    if (micBusyNow()) return;
    const current = get().view;
    set({
      view: "offline",
      ...(current === "offline" ? {} : { offlineReturnView: current }),
    });
  },

  closeOffline: () => {
    if (micBusyNow()) return;
    set({ view: get().offlineReturnView });
  },

  // 扫码页是覆盖层：只记开关，不改当前视图，关闭后自然回到打开它的页面。
  setScanOpen: (scanOpen) => {
    if (scanOpen && micBusyNow()) return;
    set({ scanOpen });
  },
}));
