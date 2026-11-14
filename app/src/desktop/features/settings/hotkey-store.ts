import { create } from "zustand";
import {
  type HotkeyConfig,
  type HotkeyStatus,
  hotkeySave,
  hotkeyStatus,
  normalizeError,
} from "@/shared/lib/tauri";

type HotkeyState = {
  status: HotkeyStatus | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (config: HotkeyConfig) => Promise<void>;
};

/** 语音页「键盘快捷键」卡的状态；后端是唯一事实来源（配置文件在 ~/.sidekick/hotkey.json）。 */
export const useHotkeyStore = create<HotkeyState>((set) => ({
  status: null,
  loading: false,
  saving: false,
  error: null,

  load: async () => {
    set({ loading: true });
    try {
      const status = await hotkeyStatus();
      set({ status, error: null });
    } catch (cause) {
      set({ error: normalizeError(cause) });
    } finally {
      set({ loading: false });
    }
  },

  save: async (config) => {
    set({ saving: true });
    try {
      const status = await hotkeySave(config);
      set({ status, error: null });
    } catch (cause) {
      set({ error: normalizeError(cause) });
    } finally {
      set({ saving: false });
    }
  },
}));
