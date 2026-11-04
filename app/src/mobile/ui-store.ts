import { create } from "zustand";

export type MobileView = "pet" | "chat";

type UiState = {
  view: MobileView;
  settingsOpen: boolean;
  /** 全屏扫码页；只从聊天页的连接面板打开。 */
  scanOpen: boolean;
  setView: (view: MobileView) => void;
  setSettingsOpen: (open: boolean) => void;
  setScanOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  view: "pet",
  settingsOpen: false,
  scanOpen: false,
  setView: (view) => set({ view }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setScanOpen: (scanOpen) => set({ scanOpen }),
}));
