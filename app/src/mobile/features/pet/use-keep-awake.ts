import { useEffect, useRef } from "react";
import { setKeepScreenOn } from "@/shared/lib/tauri";

/**
 * 宠物页面屏幕常亮。
 *
 * `active` 为 true 时请求 Android 窗口常亮（`FLAG_KEEP_SCREEN_ON`），false 或卸载时释放。
 * `maxDurationMs` 为常亮最长时长（`null` 表示不限）：到点主动释放，让系统按默认策略熄屏，
 * 避免放在桌边时整夜常亮耗电；用户点亮屏幕回到前台后重新计时。
 *
 * 平台/版本不支持时静默降级为系统默认熄屏策略，不做用户可见报错；也不依赖
 * `visibilitychange` 之外的事件——窗口标志只在窗口对用户可见时生效。
 */
export function useKeepAwake(active: boolean, maxDurationMs: number | null = null) {
  const applied = useRef<boolean | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const apply = (enabled: boolean) => {
      if (applied.current === enabled) return;
      applied.current = enabled;
      void setKeepScreenOn(enabled).catch(() => undefined);
    };

    const clearTimer = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };

    const arm = () => {
      apply(true);
      clearTimer();
      if (maxDurationMs !== null && maxDurationMs > 0) {
        timer.current = window.setTimeout(() => {
          timer.current = null;
          // 到点释放常亮：系统恢复默认熄屏，宠物页本身不变暗、不打断。
          apply(false);
        }, maxDurationMs);
      }
    };

    if (!active) {
      clearTimer();
      apply(false);
      return;
    }

    arm();

    // 熄灭后用户点亮屏幕回到前台：重新计时，否则第一次到点后就再也不常亮了。
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") arm();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimer();
      apply(false);
    };
  }, [active, maxDurationMs]);
}
