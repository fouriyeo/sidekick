import { AlertCircle, CheckCircle2, Loader2, Mic, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/shared/lib/format";
import { MIC_STATUS_COPY } from "@/shared/lib/mic-status-copy";
import { Button } from "@/shared/ui/button";
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
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(92vw,380px)] flex-col gap-1.5 rounded-xl border border-border bg-popover px-3.5 py-2.5 text-sm text-popover-foreground shadow-lg">
      <div role="status" aria-live="polite" className="flex min-h-6 items-center gap-2.5">
        {phase === "listening" && (
          <>
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-pet-coral opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-pet-coral" />
            </span>
            <Mic className="size-4 text-muted-foreground" />
            <span>正在听 · {formatDuration(elapsed)}</span>
          </>
        )}
        {phase === "processing" && (
          <>
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span>转写中…</span>
          </>
        )}
        {phase === "delivered" && (
          <>
            <CheckCircle2 className="size-4 shrink-0 text-success" />
            <span className="min-w-0 break-words">{message || "已输入"}</span>
          </>
        )}
        {phase === "error" && (
          <>
            <AlertCircle className="size-4 shrink-0 text-destructive" />
            <span className="min-w-0 break-words">{message || "语音输入失败"}</span>
          </>
        )}
        {phase === "idle" && <span className="text-muted-foreground">{message}</span>}

        {live && (
          <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
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
            variant="destructive"
            size="xs"
            className="pointer-events-auto shrink-0"
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
        <p role="status" className="text-xs leading-relaxed text-destructive">
          {cancelError}
        </p>
      )}

      {live && partialText && (
        // 实时文本只做视觉反馈：不放进 aria-live，避免每个字都被读屏播报。
        <p
          aria-live="off"
          className="line-clamp-3 break-words text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground"
        >
          {partialText}
        </p>
      )}
    </div>
  );
}
