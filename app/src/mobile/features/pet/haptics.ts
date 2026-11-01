import { type HapticStyle, haptic as sendHaptic } from "@/shared/lib/tauri";

export type Haptics = {
  light: () => void;
  medium: () => void;
  success: () => void;
  error: () => void;
};

type VibrateFn = (pattern: number | number[]) => boolean;

type HapticsOptions = {
  /** 调用时再判断是否开启，避免把「设置 → 震动」的旧值闭包进 useMemo。 */
  enabled?: () => boolean;
  /** 仅测试/浏览器兜底用；默认 navigator.vibrate。 */
  vibrate?: VibrateFn;
};

/** 浏览器兜底（真机 WebView 没有 VIBRATE 权限时它是静默无效的，原生命令才是主路径）。 */
const FALLBACK_PATTERNS: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 20,
  success: [10, 40, 10],
  error: [20, 50, 20],
};

export function createHaptics(options: HapticsOptions = {}): Haptics {
  const fallback = (style: HapticStyle) => {
    if (typeof navigator === "undefined") return;

    const fn =
      options.vibrate ?? (typeof navigator.vibrate === "function" ? navigator.vibrate : null);
    if (!fn) return;

    try {
      fn.call(navigator, FALLBACK_PATTERNS[style]);
    } catch {
      // 震动不可用时静默降级，视觉反馈仍然保留。
    }
  };

  const fire = (style: HapticStyle) => {
    if (options.enabled && !options.enabled()) return;

    // 原生命令是主路径（不需要 VIBRATE 权限、跟随系统触感设置）；
    // 浏览器/测试环境拿不到原生能力时退回 Web Vibration API。
    void sendHaptic(style).catch(() => fallback(style));
  };

  return {
    light: () => fire("light"),
    medium: () => fire("medium"),
    success: () => fire("success"),
    error: () => fire("error"),
  };
}
