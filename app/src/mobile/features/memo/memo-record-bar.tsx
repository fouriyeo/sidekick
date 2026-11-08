import { cn } from "cn";
import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  cancelArmedAfter,
  shouldDiscardShort,
  shouldIgnoreClick,
  TAP_MAX_MS,
} from "@/mobile/features/memo/memo-gesture";
import { MemoPrivacySheet, useMemoPrivacy } from "@/mobile/features/memo/memo-privacy-sheet";
import type { useMemoRecorder } from "@/mobile/features/memo/memo-recorder";
import { formatDuration } from "@/shared/lib/format";
import { haptic } from "@/shared/lib/tauri";

type Recorder = ReturnType<typeof useMemoRecorder>;

function buzz(style: "light" | "medium" | "success" | "error"): void {
  void haptic(style).catch(() => undefined);
}

/**
 * 手机备忘录底部录音条（D124）。
 *
 * C 双模没有“模式开关”：按住 ≥400ms 松手保存；轻点 ≤400ms 锁定继续录，
 * 再点一下结束；按住上滑 80dp 松手取消。TalkBack 没有 pointer，走 click 兜底。
 */
export function MemoRecordBar({
  recorder,
  disabled = false,
}: {
  recorder: Recorder;
  disabled?: boolean;
}) {
  const privacy = useMemoPrivacy();
  const [locked, setLocked] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const pressingRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startedAt: number;
  } | null>(null);
  const pendingReleaseRef = useRef<number | null>(null);
  const pendingCancelRef = useRef(false);
  const wantLockOnStartRef = useRef(false);
  const stopOnReleaseRef = useRef(false);
  const abortedRef = useRef(false);
  const lastPointerAtRef = useRef(0);
  const confirmTimerRef = useRef<number | null>(null);

  const phase = recorder.phase;
  const recording = phase === "recording";
  const busy = phase === "starting" || phase === "saving";

  useEffect(() => {
    if (phase === "idle") {
      setLocked(false);
      setCancelArmed(false);
      pendingReleaseRef.current = null;
      pendingCancelRef.current = false;
      wantLockOnStartRef.current = false;
    }
  }, [phase]);

  // 录音真正就绪后，补上“松手时”的判定（启动耗时不计入按住时长）。
  useEffect(() => {
    if (phase !== "recording") return;
    if (pendingCancelRef.current) {
      pendingCancelRef.current = false;
      void recorder.cancel();
      return;
    }
    if (wantLockOnStartRef.current) {
      wantLockOnStartRef.current = false;
      setLocked(true);
      toast("已开始录音，点一下结束");
      return;
    }
    const held = pendingReleaseRef.current;
    if (held === null) return;
    pendingReleaseRef.current = null;
    if (held < TAP_MAX_MS) {
      setLocked(true);
      toast("已锁定录音，点一下结束");
      return;
    }
    // 松手发生在开麦之前：这里不套“太短丢弃”，用户是明确按住的。
    void recorder.stop();
  }, [phase, recorder]);

  useEffect(
    () => () => {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
    },
    [],
  );

  const finish = () => {
    if (shouldDiscardShort(recorder.elapsedMs, recorder.peak)) {
      void recorder.cancel();
      toast("太短了，再说一次");
      return;
    }
    void recorder.stop();
  };

  const releaseCapture = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 忽略：捕获丢失不影响本次松手判定。
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || busy) return;
    lastPointerAtRef.current = Date.now();

    if (recording) {
      if (locked) stopOnReleaseRef.current = true;
      return;
    }
    if (phase !== "idle") return;

    pressingRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: Date.now(),
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 某些 WebView 不支持捕获：仍靠 pointerup/pointercancel 兜底。
    }
    setCancelArmed(false);
    abortedRef.current = false;

    if (!privacy.acked) {
      setSheetOpen(true);
      return;
    }
    buzz("light");
    void recorder.start();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const pressing = pressingRef.current;
    if (!pressing || pressing.pointerId !== event.pointerId) return;
    const dy = event.clientY - pressing.startY;
    const dx = event.clientX - pressing.startX;
    // 横向甩动 / 往下拖 = 当成滚动，不进入取消区，松手也不落条目。
    if (dy > 24 || Math.abs(dx) > 24) {
      abortedRef.current = true;
      return;
    }
    setCancelArmed(cancelArmedAfter(dy, cancelArmed));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    lastPointerAtRef.current = Date.now();
    releaseCapture(event);

    if (stopOnReleaseRef.current) {
      stopOnReleaseRef.current = false;
      if (recording) finish();
      return;
    }

    const pressing = pressingRef.current;
    if (!pressing || pressing.pointerId !== event.pointerId) return;
    pressingRef.current = null;
    const held = Date.now() - pressing.startedAt;

    if (abortedRef.current) {
      abortedRef.current = false;
      setCancelArmed(false);
      if (phase === "starting") {
        pendingCancelRef.current = true;
      } else if (phase === "recording") {
        if (recorder.elapsedMs < 1000) void recorder.cancel();
        else void recorder.stop();
      }
      return;
    }

    if (phase === "starting") {
      pendingReleaseRef.current = held;
      return;
    }
    if (phase !== "recording") return;

    if (cancelArmed) {
      setCancelArmed(false);
      void recorder.cancel();
      buzz("light");
      toast("已取消录音");
      return;
    }

    if (held < TAP_MAX_MS) {
      setLocked(true);
      buzz("light");
      toast("已锁定录音，点一下结束");
      return;
    }

    finish();
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    releaseCapture(event);
    const pressing = pressingRef.current;
    pressingRef.current = null;
    stopOnReleaseRef.current = false;
    setCancelArmed(false);
    if (!pressing) return;
    if (phase === "starting") {
      pendingCancelRef.current = true;
      return;
    }
    if (phase !== "recording") return;
    if (recorder.elapsedMs < 1000) void recorder.cancel();
    else void recorder.stop();
  };

  // TalkBack / 键盘：没有 pointer 序列，click 直接 toggle（开始后进锁定态）。
  const handleClick = () => {
    if (disabled || busy) return;
    if (shouldIgnoreClick(lastPointerAtRef.current, Date.now())) return;
    if (recording) {
      finish();
      return;
    }
    if (phase !== "idle") return;
    if (!privacy.acked) {
      setSheetOpen(true);
      return;
    }
    wantLockOnStartRef.current = true;
    buzz("light");
    void recorder.start();
  };

  const handleCancel = () => {
    if (confirmCancel) {
      if (confirmTimerRef.current !== null) window.clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
      setConfirmCancel(false);
      void recorder.cancel();
      toast("已取消录音");
      return;
    }
    setConfirmCancel(true);
    confirmTimerRef.current = window.setTimeout(() => {
      confirmTimerRef.current = null;
      setConfirmCancel(false);
    }, 2000);
  };

  const hint = cancelArmed
    ? "松手取消"
    : recording
      ? locked
        ? "已锁定 · 点一下结束"
        : "正在录音 · 松手保存，上滑取消"
      : phase === "starting"
        ? "正在打开麦克风…"
        : phase === "saving"
          ? "正在保存…"
          : "按住说松手存 · 轻点开始，再点结束";

  return (
    <div className="flex-none border-t-[0.5px] border-border bg-card px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+24px)]">
      <p
        className={cn(
          "m-0 flex h-6 items-center justify-center gap-2 text-[11.5px] leading-none",
          cancelArmed ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {recording && (
          <span className="text-[20px] leading-none font-medium tabular-nums text-foreground">
            {formatDuration(recorder.elapsedMs)}
          </span>
        )}
        <span>{hint}</span>
      </p>

      <div className="relative mt-1.5 flex h-16 items-center justify-center">
        <button
          type="button"
          aria-label={
            recording
              ? locked
                ? "已锁定，点一下结束并保存"
                : "松手保存，上滑取消"
              : "开始录音：按住说话，或轻点开始"
          }
          disabled={disabled || phase === "saving"}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(event) => event.preventDefault()}
          onClick={handleClick}
          className={cn(
            "flex select-none items-center justify-center rounded-full text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.35)] transition-transform duration-100 [touch-action:none] [-webkit-touch-callout:none]",
            recording ? "size-[60px] bg-[#2C2C2E]" : "size-16 bg-primary",
            (disabled || phase === "saving") && "opacity-50",
            locked && "ring-2 ring-primary/25",
          )}
        >
          {recording ? (
            <Square aria-hidden="true" className="size-5 fill-current" />
          ) : (
            <Mic aria-hidden="true" className="size-6" />
          )}
        </button>

        {locked && recording && (
          <button
            type="button"
            className={cn(
              "absolute right-0 flex min-h-11 items-center rounded-full px-3 text-[13px]",
              confirmCancel ? "text-destructive" : "text-muted-foreground",
            )}
            onClick={handleCancel}
          >
            {confirmCancel ? "再点一次取消" : "取消"}
          </button>
        )}
      </div>

      <span className="sr-only" aria-live="polite">
        {recording ? `已录音 ${Math.max(0, Math.floor(recorder.elapsedMs / 10000)) * 10} 秒` : ""}
      </span>

      <MemoPrivacySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onConfirm={() => {
          privacy.acknowledge();
          wantLockOnStartRef.current = true;
          void recorder.start();
        }}
      />
    </div>
  );
}
