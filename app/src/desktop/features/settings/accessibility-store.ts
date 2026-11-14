import { create } from "zustand";
import { type AccessibilityInfo, getAccessibilityInfo } from "@/shared/lib/tauri";

/**
 * 自动输入（macOS 辅助功能）授权状态，外壳级只读一次。
 *
 * D143 之后不再有「概览」承载提示条：未授权时只在侧栏「设置」上挂一个琥珀点，
 * 说明与「去开启」留在「设置 › 自动输入」。`info === null` 表示未知（非 macOS、
 * 命令不可用或还没读到），此时不提示——沉默即正常。
 */
type AccessibilityState = {
  info: AccessibilityInfo | null;
  refresh: () => Promise<void>;
};

export const useAccessibilityStore = create<AccessibilityState>((set) => ({
  info: null,
  refresh: async () => {
    try {
      set({ info: await getAccessibilityInfo() });
    } catch {
      set({ info: null });
    }
  },
}));
