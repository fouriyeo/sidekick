import { AlertCircle, CheckCircle2, Loader2, Mic, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/shared/lib/format";
import { MIC_STATUS_COPY } from "@/shared/lib/mic-status-copy";
import { Button } from "@/shared/ui/button";
import { SignalDot, type SignalStatus } from "@/shared/ui/signal-dot";
import { useDesktopMicStore } from "./mic-status-store";

type MicStatusOverlayProps = {
  /** 请求服务端中止当前录音；返回 false 表示本机 WS 没连上。 */
  onCancel: (session: string) => boolean;
};

export function MicStatusOverlay({ onCancel }: MicStatusOverlayProps) {
  const phase = useDesktopMicStore((state) => state.phase);
  const session = useDesktopMicStore((state) => state.session);
  const startedAt = useDesktopMicStore((state) => state.startedAt);
  const message = useDesktopMicStore((state) => state.message);
  const visible = useDesktopMicStore((state) => state.visible);
  const partialText = useDesktopMicStore((state) => state.partialText);
  const [elapsed, setElapsed] = useState(0);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelErrorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible || phase !== "listening" || startedAt === null) {
      setElapsed(0);
      return;
    }

    const update = () => setElapsed(Date.now() - startedAt);
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [phase, startedAt, visible]);

  // 浮层收起/进入下一阶段时清掉本地的失败提示，避免跨会话残留。
  useEffect(() => {
    if (phase === "listening") return;
    setCancelError(null);
    if (cancelErrorTimerRef.current !== null) {
      window.clearTimeout(cancelErrorTimerRef.current);
      cancelErrorTimerRef.current = null;
    }
  }, [phase]);

  useEffect(
    () => () => {
      if (cancelErrorTimerRef.current !== null) {
        window.clearTimeout(cancelErrorTimerRef.current);
        cancelErrorTimerRef.current = null;
      }
    },
    [],
  );

  if (!visible) return null;

  const live = phase === "listening" || phase === "processing";
  const signalStatus: SignalStatus =
    phase === "listening"
      ? "connected"
      : phase === "processing"
        ? "waiting"
        : phase === "delivered"
          ? "connected"
          : phase === "error"
            ? "error"
            : "idle";

  const handleCancel = () => {
    if (!session) return;
    if (onCancel(session)) return;

    if (cancelErrorTimerRef.current !== null) {
      window.clearTimeout(cancelErrorTimerRef.current);
    }
    setCancelError(MIC_STATUS_COPY.cancelMicFailed);
    cancelErrorTimerRef.current = window.setTimeout(() => {
      cancelErrorTimerRef.current = null;
      setCancelError(null);
    }, 2500);
  };

  return (
    <div className="pointer-events-none fixed top-6 right-6 z-50 flex w-[min(92vw,380px)] flex-col gap-2 rounded-xl border border-signal/45 bg-abyss px-4 py-3 text-sm text-pet-text shadow-popover">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[9px] tracking-[0.16em] text-signal uppercase">
          Mic · 百炼云端
        </span>
        {live && (
          <span className="rounded-full border border-signal/40 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.14em] text-signal uppercase">
            Live
          </span>
        )}
      </div>

      <div role="status" aria-live="polite" className="flex min-h-6 items-center gap-2.5">
        <SignalDot
          status={signalStatus}
          pulse={phase === "listening"}
          className={signalStatus === "idle" ? "bg-pet-muted" : undefined}
        />
        {phase === "listening" && (
          <>
            <Mic className="size-4 text-signal" />
            <span className="tabular-nums">正在听 · {formatDuration(elapsed)}</span>
          </>
        )}
        {phase === "processing" && (
          <>
            <Loader2 className="size-4 animate-spin text-pet-muted" />
            <span>转写中…</span>
          </>
        )}
        {phase === "delivered" && (
          <>
            <CheckCircle2 className="size-4 shrink-0 text-pet-success" />
            <span className="min-w-0 break-words">{message || "已输入"}</span>
          </>
        )}
        {phase === "error" && (
          <>
            <AlertCircle className="size-4 shrink-0 text-pet-danger" />
            <span className="min-w-0 break-words">{message || "语音输入失败"}</span>
          </>
        )}
        {phase === "idle" && <span className="text-pet-muted">{message}</span>}

        {live && (
          <span className="ml-auto shrink-0 rounded-full border border-pet-border/70 bg-pet-bg/60 px-1.5 py-0.5 text-[10px] text-pet-muted">
            百炼
          </span>
        )}

        {/*
          桌面端的人工中断入口：手机停在「正在听」或浮层卡住时，用户可以在电脑上
          直接丢弃这段录音。取消不会转写/插入，也不需要先切回手机。
        */}
        {phase === "listening" && session && (
          <Button
            type="button"
            size="xs"
            className="pointer-events-auto shrink-0 border border-pet-coral/45 bg-pet-coral/15 text-pet-coral hover:bg-pet-coral/25 hover:text-pet-coral"
            aria-label={MIC_STATUS_COPY.cancelMic}
            title="丢弃这段录音，不转写、不插入"
            onClick={handleCancel}
          >
            <X className="size-3.5" />
            {MIC_STATUS_COPY.cancelMic}
          </Button>
        )}
      </div>

      {cancelError && (
        <p role="status" className="text-xs leading-relaxed text-pet-danger">
          {cancelError}
        </p>
      )}

      {live && partialText && (
        // 实时文本只做视觉反馈：不放进 aria-live，避免每个字都被读屏播报。
        <p
          aria-live="off"
          className="line-clamp-3 rounded-lg border border-pet-border/70 bg-pet-bg/60 px-2.5 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap text-pet-muted"
        >
          {partialText}
        </p>
      )}
    </div>
  );
}
