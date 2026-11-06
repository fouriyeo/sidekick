import { useEffect, useState } from "react";

/** 会话列表「现在」的刷新间隔：60 秒，最多延迟一分钟感知到 2 小时自动隐藏。 */
export const SESSION_CLOCK_INTERVAL_MS = 60_000;

/**
 * 会话列表用的时钟：挂载时取一次，之后每 `intervalMs` 刷新，回前台立即刷新。
 *
 * 用于 `visibleSessions({ now, autoClearCompletedAfterMs })`：没有新事件时
 * 也能在完成后 2 小时把已完成会话从列表里隐藏（D96）。
 */
export function useSessionClock(intervalMs = SESSION_CLOCK_INTERVAL_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);

  return now;
}
