import { AlertCircle, CheckCircle2, Loader2, Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDuration } from "@/shared/lib/format";
import { useDesktopMicStore } from "./mic-status-store";

export function MicStatusOverlay() {
  const phase = useDesktopMicStore((state) => state.phase);
  const startedAt = useDesktopMicStore((state) => state.startedAt);
  const message = useDesktopMicStore((state) => state.message);
  const visible = useDesktopMicStore((state) => state.visible);
  const [elapsed, setElapsed] = useState(0);

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

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-4 right-4 z-50 flex min-h-12 max-w-[320px] items-center gap-2.5 rounded-xl border border-border bg-popover px-3.5 py-2.5 text-sm text-popover-foreground shadow-lg"
    >
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
          <CheckCircle2 className="size-4 text-success" />
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
    </div>
  );
}
