import { create } from "zustand";

export type MobileView = "pet" | "chat";

type UiState = {
  view: MobileView;
  settingsOpen: boolean;
  setView: (view: MobileView) => void;
  setSettingsOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  view: "pet",
  settingsOpen: false,
  setView: (view) => set({ view }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
