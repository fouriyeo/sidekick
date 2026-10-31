export type Haptics = {
  light: () => void;
  medium: () => void;
  success: () => void;
  error: () => void;
};

type VibrateFn = (pattern: number | number[]) => boolean;

export function createHaptics(vibrate?: VibrateFn): Haptics {
  const call = (pattern: number | number[]) => {
    if (typeof navigator === "undefined") return;
    const fn = vibrate ?? (typeof navigator.vibrate === "function" ? navigator.vibrate : null);
    if (!fn) return;

    try {
      fn.call(navigator, pattern);
    } catch {
      // 震动不可用时静默降级，视觉反馈仍然保留。
    }
  };

  return {
    light: () => call(10),
    medium: () => call(20),
    success: () => call([10, 40, 10]),
    error: () => call([20, 50, 20]),
  };
}
