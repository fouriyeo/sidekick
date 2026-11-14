import { AlertCircle, CheckCircle2, Loader2, Mic, MicOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { RemoteHudPayload } from "@/protocol/remote-mic";
import { formatDuration } from "@/shared/lib/format";
import { REMOTE_HUD_COPY, remoteHudText } from "@/shared/lib/mic-status-copy";
import { subscribeMicHud } from "@/shared/lib/tauri";
import { SignalDot, type SignalStatus } from "@/shared/ui/signal-dot";

/**
 * 桌面顶部麦克风 HUD（`?window=mic-hud`）。
 *
 * 快捷键流程里手机不在用户视野内，这个窗口是「现在到底在不在录」的唯一凭据
 * （PRD 铁律：录音时始终有可见指示）。窗口不抢焦点、不接鼠标，所以这里只有展示，
 * 取消走键盘 Esc（Rust 侧判定）。
 */
export function MicHud() {
  const [payload, setPayload] = useState<RemoteHudPayload | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => subscribeMicHud((next) => setPayload(next)), []);

  useEffect(() => {
    if (payload?.state !== "listening" || typeof payload.startedAt !== "number") {
      setElapsed(0);
      return;
    }
    const startedAt = payload.startedAt;
    const update = () => setElapsed(Math.max(0, Date.now() - startedAt));
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [payload]);

  if (!payload) return null;

  const { title, hint } = remoteHudText(payload);
  const listening = payload.state === "listening";
  const signal: SignalStatus =
    payload.state === "listening"
      ? "connected"
      : payload.state === "connecting" || payload.state === "processing"
        ? "waiting"
        : payload.state === "failed" || payload.state === "unavailable"
          ? "error"
          : payload.state === "delivered" || payload.state === "copied"
            ? "connected"
            : "idle";

  return (
    <div className="dsl-hud">
      <div className="deep-sea-scope flex w-full items-center gap-3 rounded-2xl border border-signal/45 bg-abyss px-4 py-3 text-pet-text shadow-popover">
        <Icon state={payload.state} />
        <div className="min-w-0 flex-1">
          <div role="status" aria-live="polite" className="flex items-center gap-2">
            <SignalDot status={signal} pulse={listening} />
            <p className="truncate text-[13px] font-medium">
              {listening ? `${title} · ${formatDuration(elapsed)}` : title}
            </p>
          </div>
          {hint && <p className="mt-0.5 truncate text-[11px] text-pet-muted">{hint}</p>}
        </div>
        <span className="shrink-0 font-mono text-[9px] tracking-[0.16em] text-signal uppercase">
          Mic
        </span>
      </div>
    </div>
  );
}

function Icon({ state }: { state: RemoteHudPayload["state"] }) {
  const className = "size-4 shrink-0";
  if (state === "listening")
    return <Mic aria-hidden="true" className={`${className} text-signal`} />;
  if (state === "processing" || state === "connecting") {
    return <Loader2 aria-hidden="true" className={`${className} animate-spin text-signal`} />;
  }
  if (state === "delivered" || state === "copied") {
    return <CheckCircle2 aria-hidden="true" className={`${className} text-signal`} />;
  }
  if (state === "cancelled")
    return <MicOff aria-hidden="true" className={`${className} text-pet-muted`} />;
  return <AlertCircle aria-hidden="true" className={`${className} text-pet-muted`} />;
}

/** 兜底文案导出，测试里用来断言「没有手机」这一条。 */
export const HUD_NO_PHONE_TITLE = REMOTE_HUD_COPY.noPhone;
