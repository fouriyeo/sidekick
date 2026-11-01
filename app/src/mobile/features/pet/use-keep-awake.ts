import { useEffect, useRef } from "react";
import { setKeepScreenOn } from "@/shared/lib/tauri";

/**
 * 宠物页面屏幕常亮。
 *
 * `active` 为 true 时请求 Android 窗口常亮（`FLAG_KEEP_SCREEN_ON`），false 或卸载时释放。
 * 平台/版本不支持时静默降级为系统默认熄屏策略，不做用户可见报错；也不监听
 * `visibilitychange`——窗口标志只在窗口对用户可见时生效，后台本来就不会阻止熄屏。
 */
export function useKeepAwake(active: boolean) {
  const applied = useRef<boolean | null>(null);

  useEffect(() => {
    const apply = (enabled: boolean) => {
      if (applied.current === enabled) return;
      applied.current = enabled;
      void setKeepScreenOn(enabled).catch(() => undefined);
    };

    apply(active);
    return () => apply(false);
  }, [active]);
}
