import { useEffect } from "react";

/**
 * 后台 / 窗口失焦时暂停装饰动画（声呐环等）。
 * 通过 <html data-motion-paused> 让 CSS 动画 animation-play-state: paused。
 */
export function useMotionPause(): void {
  useEffect(() => {
    const root = document.documentElement;

    const setPaused = (paused: boolean) => {
      root.dataset.motionPaused = paused ? "true" : "false";
    };

    const sync = () => setPaused(document.visibilityState === "hidden");
    const onBlur = () => setPaused(true);
    const onFocus = () => setPaused(false);

    document.addEventListener("visibilitychange", sync);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    sync();

    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      delete root.dataset.motionPaused;
    };
  }, []);
}
