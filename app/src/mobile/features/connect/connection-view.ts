import { useEffect, useState } from "react";
import type { SignalLevel, SignalTone } from "@/shared/ui/signal-bars";
import { useConnectionStore } from "./connection-store";

/**
 * 连接状态的统一展示口径（顶部条 / 消息页 / 连接页 / 设置页共用）。
 *
 * 状态语言：文字 + 3 格信号 + 颜色三线索；连接中/重连中/未连接一律中性色，
 * 琥珀只留给 AI「等你决定」，所以这里不会出现 decide 色调。
 */
export type ConnectionView = {
  label: string;
  detail?: string;
  level: SignalLevel;
  tone: SignalTone;
};

type ConnectionViewInput = {
  status: "disconnected" | "connecting" | "connected" | "error";
  addr: string;
  retrying: boolean;
  retryAttempt: number;
  retryAt: number | null;
  error?: string | null;
};

/** 每 500ms 刷新一次，用于「N 秒后自动重连」倒计时；没有排期时不开计时器。 */
export function useRetryCountdown(retryAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (retryAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [retryAt]);

  if (retryAt === null) return null;
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

export function connectionViewOf(
  state: ConnectionViewInput,
  retrySeconds: number | null = null,
): ConnectionView {
  if (state.status === "connected") {
    return { label: "已连接", detail: "局域网", level: 3, tone: "signal" };
  }

  if (state.status === "connecting") {
    const addr = state.addr.trim();
    return {
      label: "连接中…",
      ...(addr ? { detail: addr } : {}),
      level: 2,
      tone: "muted",
    };
  }

  if (state.retrying) {
    return {
      label: "正在重连",
      detail: state.retryAttempt > 0 ? `第 ${state.retryAttempt} 次` : undefined,
      level: 2,
      tone: "muted",
    };
  }

  if (retrySeconds !== null) {
    return {
      label: "还没连上电脑",
      detail: `${retrySeconds} 秒后重连`,
      level: 1,
      tone: "muted",
    };
  }

  return { label: "还没连上电脑", level: 1, tone: "muted" };
}

/** 组件里直接取连接状态展示口径；连接相关页面/顶部条不要各写一套文案。 */
export function useConnectionView(): ConnectionView {
  const status = useConnectionStore((state) => state.status);
  const addr = useConnectionStore((state) => state.addr);
  const retrying = useConnectionStore((state) => state.retrying);
  const retryAttempt = useConnectionStore((state) => state.retryAttempt);
  const retryAt = useConnectionStore((state) => state.retryAt);
  const retrySeconds = useRetryCountdown(retryAt);

  return connectionViewOf({ status, addr, retrying, retryAttempt, retryAt }, retrySeconds);
}
