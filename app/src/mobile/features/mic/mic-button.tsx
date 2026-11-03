import { cn } from "cn";
import {
  AlertCircle,
  Check,
  Copy,
  CornerDownLeft,
  Eraser,
  Loader2,
  Mic,
  ShieldAlert,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { createHaptics } from "@/mobile/features/pet/haptics";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import { useReducedMotion } from "@/mobile/features/pet/use-reduced-motion";
import type { MicStopReason } from "@/protocol/messages";
import {
  MIC_PERMISSION_DENIED_KEY,
  MIC_PRIMER_KEY,
  readLocal,
  writeLocal,
} from "@/shared/lib/local-storage";
import { sendMicFrame, sendMicStart, sendMicStop } from "@/shared/lib/tauri";
import { formatDuration, MIC_COPY, micLocalErrorText } from "./mic-copy";
import { useMicStore } from "./mic-store";
import { PermissionPrimer } from "./permission-primer";
import {
  createSessionId,
  primeMicrophone,
  startVoiceRecording,
  type VoiceSession,
} from "./voice-recorder";
import { VoiceWaveform } from "./voice-waveform";

type MicButtonProps = {
  active: boolean;
  onOpenConnection?: () => void;
};

const MIN_RECORDING_MS = 300;
const MAX_RECORDING_MS = 60_000;
const WARN_RECORDING_MS = 50_000;
const CANCEL_ENTER_PX = 48;
const CANCEL_EXIT_PX = 24;

export function MicButton({ active, onOpenConnection }: MicButtonProps) {
  const connectionStatus = useConnectionStore((state) => state.status);
  const phase = useMicStore((state) => state.phase);
  const result = useMicStore((state) => state.result);
  const error = useMicStore((state) => state.error);
  const partialText = useMicStore((state) => state.partialText);
  const keyPending = useMicStore((state) => state.keyPending);
  const keyArmedClear = useMicStore((state) => state.keyArmedClear);
  const keyNotice = useMicStore((state) => state.keyNotice);
  const keyError = useMicStore((state) => state.keyError);

  const reducedMotion = useReducedMotion();
  const hapticsEnabled = usePetStore((state) => state.pet.settings.haptics);
  const hapticsEnabledRef = useRef(hapticsEnabled);
  hapticsEnabledRef.current = hapticsEnabled;
  const haptics = useMemo(() => createHaptics({ enabled: () => hapticsEnabledRef.current }), []);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [warning, setWarning] = useState(false);
  const [cancelZone, setCancelZone] = useState(false);
  const [message, setMessage] = useState("");
  const [copyDone, setCopyDone] = useState(false);
  const [primerOpen, setPrimerOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [primerBusy, setPrimerBusy] = useState(false);
  const [primerDone, setPrimerDone] = useState(() => readLocal(MIC_PRIMER_KEY) === "1");
  const [permissionDenied, setPermissionDenied] = useState(
    () => readLocal(MIC_PERMISSION_DENIED_KEY) === "1",
  );

  const sessionRef = useRef<VoiceSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const startYRef = useRef(0);
  const heldRef = useRef(false);
  const startSentRef = useRef(false);
  const startedAtRef = useRef(0);
  const cancelZoneRef = useRef(false);
  const warnedRef = useRef(false);
  const tickRef = useRef<number | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const finishingRef = useRef(false);

  const busy = phase === "arming" || phase === "listening" || phase === "processing";
  const connected = connectionStatus === "connected";

  const showHint = useCallback((text: string) => {
    if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
    setMessage(text);
    hintTimerRef.current = window.setTimeout(() => {
      hintTimerRef.current = null;
      setMessage("");
    }, 1800);
  }, []);

  const clearTick = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const releasePointer = useCallback((event?: ReactPointerEvent<HTMLButtonElement>) => {
    const pointerId = pointerIdRef.current;
    pointerIdRef.current = null;
    if (event && pointerId !== null && event.currentTarget.hasPointerCapture?.(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
  }, []);

  const cancelRecording = useCallback(
    async (reason: MicStopReason, hint = "") => {
      heldRef.current = false;
      clearTick();
      releasePointer();
      setCancelZone(false);
      cancelZoneRef.current = false;

      const session = sessionRef.current;
      sessionRef.current = null;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      const shouldNotify = startSentRef.current;
      startSentRef.current = false;

      await session?.cancel();
      if (shouldNotify && sessionId) {
        void sendMicStop(sessionId, reason).catch(() => undefined);
      }

      useMicStore.getState().cancel();
      setElapsedMs(0);
      setWarning(false);
      warnedRef.current = false;
      if (hint) showHint(hint);
      if (reason === "cancel") haptics.light();
    },
    [clearTick, haptics, releasePointer, showHint],
  );

  const abortLocalCapture = useCallback(
    async (notifyServer: boolean) => {
      heldRef.current = false;
      clearTick();
      releasePointer();
      setCancelZone(false);
      cancelZoneRef.current = false;

      const session = sessionRef.current;
      sessionRef.current = null;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      const wasSent = startSentRef.current;
      startSentRef.current = false;

      if (session) await session.cancel();
      if (notifyServer && wasSent && sessionId) {
        void sendMicStop(sessionId, "cancel").catch(() => undefined);
      }
    },
    [clearTick, releasePointer],
  );

  const finishRecording = useCallback(
    async (reason: "release" | "timeout") => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      heldRef.current = false;
      clearTick();
      releasePointer();
      setCancelZone(false);
      cancelZoneRef.current = false;

      const session = sessionRef.current;
      sessionRef.current = null;
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;

      if (!session || !sessionId) {
        useMicStore.getState().reset();
        setElapsedMs(0);
        finishingRef.current = false;
        return;
      }

      try {
        const recording = await session.stop();
        if (recording.durationMs < MIN_RECORDING_MS) {
          if (startSentRef.current) {
            void sendMicStop(sessionId, "cancel").catch(() => undefined);
          }
          startSentRef.current = false;
          useMicStore.getState().cancel();
          setElapsedMs(0);
          setWarning(false);
          warnedRef.current = false;
          showHint(MIC_COPY.tooShort);
          haptics.light();
          return;
        }

        useMicStore.getState().markProcessing();
        const sent = startSentRef.current;
        startSentRef.current = false;
        if (!sent) {
          useMicStore.getState().fail(MIC_COPY.disconnected, "disconnect");
          return;
        }

        try {
          await sendMicStop(sessionId, reason);
        } catch {
          useMicStore.getState().fail(MIC_COPY.disconnected, "disconnect");
        }
        setElapsedMs(0);
        setWarning(false);
        warnedRef.current = false;
      } finally {
        finishingRef.current = false;
      }
    },
    [clearTick, haptics, releasePointer, showHint],
  );

  const startRecording = useCallback(
    async (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (busy || !active) return;
      if (!connected) {
        showHint("先连接电脑，再按住说话。");
        onOpenConnection?.();
        return;
      }
      if (!primerDone) {
        setPrimerOpen(true);
        return;
      }
      if (permissionDenied) {
        setGuideOpen(true);
        return;
      }

      // 按下即开始录音：中震一下，给「现在在录」的即时确认（UX 规范 §7）。
      haptics.medium();

      event.currentTarget.setPointerCapture?.(event.pointerId);
      pointerIdRef.current = event.pointerId;
      startYRef.current = event.clientY;
      heldRef.current = true;
      cancelZoneRef.current = false;
      setCancelZone(false);
      warnedRef.current = false;
      setWarning(false);
      setElapsedMs(0);
      startedAtRef.current = Date.now();
      sequenceRef.current = 0;
      startSentRef.current = false;

      const sessionId = createSessionId();
      sessionIdRef.current = sessionId;
      useMicStore.getState().begin(sessionId);

      try {
        await sendMicStart(sessionId, 16_000, 128);
        startSentRef.current = true;
      } catch {
        heldRef.current = false;
        sessionIdRef.current = null;
        useMicStore.getState().fail(MIC_COPY.disconnected, "disconnect");
        return;
      }

      if (!heldRef.current) {
        void sendMicStop(sessionId, "cancel").catch(() => undefined);
        startSentRef.current = false;
        sessionIdRef.current = null;
        const phase = useMicStore.getState().phase;
        if (phase === "arming" || phase === "listening") useMicStore.getState().cancel();
        return;
      }

      try {
        const session = await startVoiceRecording({
          sessionId,
          onFrame: (pcm) => {
            const sequence = sequenceRef.current;
            sequenceRef.current += 1;
            void sendMicFrame(sessionId, sequence, pcm).catch(() => {
              if (heldRef.current) {
                void cancelRecording("disconnect", MIC_COPY.disconnected);
              }
            });
          },
          onLost: () => {
            if (heldRef.current) {
              void cancelRecording("mic_lost", MIC_COPY.micLost);
            }
          },
        });

        if (!heldRef.current) {
          void sendMicStop(sessionId, "cancel").catch(() => undefined);
          startSentRef.current = false;
          await session.cancel();
          sessionIdRef.current = null;
          const phase = useMicStore.getState().phase;
          if (phase === "arming" || phase === "listening") useMicStore.getState().cancel();
          return;
        }

        sessionRef.current = session;
        useMicStore.getState().markListening();
        tickRef.current = window.setInterval(() => {
          const elapsed = Date.now() - startedAtRef.current;
          setElapsedMs(elapsed);
          if (!warnedRef.current && elapsed >= WARN_RECORDING_MS) {
            warnedRef.current = true;
            setWarning(true);
            haptics.medium();
          }
          if (elapsed >= MAX_RECORDING_MS && heldRef.current) {
            void finishRecording("timeout");
          }
        }, 250);
      } catch (cause) {
        heldRef.current = false;
        void sendMicStop(sessionId, "cancel").catch(() => undefined);
        startSentRef.current = false;
        sessionIdRef.current = null;
        sessionRef.current = null;
        useMicStore.getState().cancel();

        const denied =
          typeof cause === "object" &&
          cause !== null &&
          "name" in cause &&
          (cause as { name?: unknown }).name === "NotAllowedError";
        if (denied) {
          setPrimerDone(true);
          writeLocal(MIC_PRIMER_KEY, "1");
          setPermissionDenied(true);
          writeLocal(MIC_PERMISSION_DENIED_KEY, "1");
          setGuideOpen(true);
        } else {
          useMicStore.getState().fail(micLocalErrorText(cause), "mic_start");
        }
      }
    },
    [
      active,
      busy,
      cancelRecording,
      connected,
      finishRecording,
      haptics,
      onOpenConnection,
      permissionDenied,
      primerDone,
      showHint,
    ],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (phase === "processing") return;
      void startRecording(event);
    },
    [phase, startRecording],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId || !heldRef.current) return;
      if (phase !== "listening" && phase !== "arming") return;

      const delta = startYRef.current - event.clientY;
      if (!cancelZoneRef.current && delta >= CANCEL_ENTER_PX) {
        cancelZoneRef.current = true;
        setCancelZone(true);
        haptics.light();
      } else if (cancelZoneRef.current && delta < CANCEL_EXIT_PX) {
        cancelZoneRef.current = false;
        setCancelZone(false);
      }
    },
    [haptics, phase],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      releasePointer(event);

      if (cancelZoneRef.current) {
        void cancelRecording("cancel", MIC_COPY.cancelled);
        return;
      }

      if (phase === "listening" || phase === "arming") {
        void finishRecording("release");
      } else if (phase === "idle" && !heldRef.current) {
        setElapsedMs(0);
      }
    },
    [cancelRecording, finishRecording, phase, releasePointer],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      void cancelRecording("cancel");
    },
    [cancelRecording],
  );

  useEffect(() => {
    if (
      (phase === "idle" || phase === "error") &&
      (sessionRef.current !== null || heldRef.current)
    ) {
      void abortLocalCapture(phase === "error");
    }
  }, [abortLocalCapture, phase]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && (phase === "arming" || phase === "listening")) {
        void cancelRecording("background", MIC_COPY.background);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [cancelRecording, phase]);

  useEffect(() => {
    if (connectionStatus !== "connected" && (phase === "arming" || phase === "listening")) {
      void cancelRecording("disconnect", MIC_COPY.disconnected);
    }
  }, [cancelRecording, connectionStatus, phase]);

  useEffect(() => {
    if (!active && (phase === "arming" || phase === "listening")) {
      void cancelRecording("background", MIC_COPY.background);
    }
  }, [active, cancelRecording, phase]);

  useEffect(() => {
    return () => {
      clearTick();
      if (hintTimerRef.current !== null) window.clearTimeout(hintTimerRef.current);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void session.cancel();
    };
  }, [clearTick]);

  const handlePrimerContinue = useCallback(async () => {
    setPrimerBusy(true);
    try {
      await primeMicrophone();
      writeLocal(MIC_PRIMER_KEY, "1");
      writeLocal(MIC_PERMISSION_DENIED_KEY, "0");
      setPrimerDone(true);
      setPermissionDenied(false);
      setPrimerOpen(false);
      setGuideOpen(false);
      showHint(MIC_COPY.permissionReady);
      haptics.light();
    } catch (cause) {
      const denied = micLocalErrorText(cause) === MIC_COPY.permissionDenied;
      if (denied) {
        writeLocal(MIC_PRIMER_KEY, "1");
        writeLocal(MIC_PERMISSION_DENIED_KEY, "1");
        setPrimerDone(true);
        setPermissionDenied(true);
      }
      setPrimerOpen(false);
      setGuideOpen(true);
      if (!denied) showHint(micLocalErrorText(cause));
    } finally {
      setPrimerBusy(false);
    }
  }, [haptics, showHint]);

  const handleGuideContinue = useCallback(() => {
    setGuideOpen(false);
    setPermissionDenied(false);
    writeLocal(MIC_PERMISSION_DENIED_KEY, "0");
  }, []);

  const handleCopyResult = useCallback(() => {
    if (!result?.text) return;
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    void clipboard
      .writeText(result.text)
      .then(() => {
        setCopyDone(true);
        if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => {
          setCopyDone(false);
          copyTimerRef.current = null;
        }, 1500);
      })
      .catch(() => undefined);
  }, [result]);

  const handleKeyAction = useCallback(
    (action: "enter" | "clear") => {
      haptics.light();
      useMicStore.getState().requestKey(action);
    },
    [haptics],
  );

  const getLevel = useCallback(() => sessionRef.current?.getLevel() ?? 0, []);
  const recording = phase === "arming" || phase === "listening";
  const listening = phase === "listening";
  const processing = phase === "processing";
  const showResult = (phase === "delivered" || phase === "error") && (result || error);

  const timerText = formatDuration(elapsedMs);
  // 本机 whisper 已下线：录音/收尾只展示百炼云端来源。
  const processingLabel = MIC_COPY.cloudProcessing;
  const recordingEngineLabel = `${MIC_COPY.engineCloud} · ${MIC_COPY.audioUploading}`;
  const processingEngineLabel = MIC_COPY.engineCloud;

  const label = !connected
    ? MIC_COPY.idleDisconnected
    : processing
      ? processingLabel
      : phase === "arming"
        ? MIC_COPY.arming
        : MIC_COPY.idle;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 z-30 bottom-[calc(env(safe-area-inset-bottom)+16px)] flex flex-col items-center">
        {/*
          覆盖层（临时提示 / 结果卡片 / 实时文本）固定在胶囊上方：
          它不参与外层宽度计算，出现/消失都不会推动按钮。
        */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[68px] mx-auto flex w-[min(86vw,380px)] flex-col items-center gap-2">
          {message && (
            <span
              role="status"
              aria-live="polite"
              className="max-w-[86vw] rounded-full border border-pet-border bg-pet-bg px-3 py-1.5 text-center text-xs text-pet-text shadow-sm"
            >
              {message}
            </span>
          )}

          {showResult && (
            <div
              className={cn(
                "pointer-events-auto w-full rounded-2xl border bg-pet-bg p-3 text-left shadow-lg",
                error ? "border-pet-danger" : "border-pet-border",
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                    error ? "bg-secondary text-pet-danger" : "bg-secondary text-pet-success",
                  )}
                >
                  {error ? <AlertCircle className="size-3.5" /> : <Check className="size-3.5" />}
                </span>
                <p className="text-xs leading-relaxed text-pet-text">{error ?? result?.message}</p>
              </div>

              {result?.text && (
                <div className="mt-2 rounded-xl bg-secondary px-2.5 py-2">
                  <p className="line-clamp-2 text-xs leading-relaxed text-pet-muted">
                    {result.text}
                  </p>
                  <button
                    type="button"
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-pet-primary"
                    onClick={handleCopyResult}
                  >
                    {copyDone ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {copyDone ? MIC_COPY.copiedAction : MIC_COPY.copy}
                  </button>
                </div>
              )}

              {/*
                只有真正插入成功才有可操作目标；「清空」会删掉整个输入框，
                因此点两次才发送。按钮高 44px，符合触控目标规范。
              */}
              {result?.outcome === "inserted" && (
                <div className="mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-label="在电脑上按回车"
                      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-pet-primary text-xs font-medium text-pet-primary-foreground disabled:opacity-50"
                      disabled={keyPending !== null || keyNotice !== null || !connected}
                      onClick={() => handleKeyAction("enter")}
                    >
                      <CornerDownLeft className="size-4" />
                      {keyPending === "enter" ? MIC_COPY.keyWorking : MIC_COPY.keyEnter}
                    </button>
                    <button
                      type="button"
                      aria-label={keyArmedClear ? "再点一次清空电脑输入框" : "清空电脑输入框"}
                      className={cn(
                        "inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-medium disabled:opacity-50",
                        keyArmedClear
                          ? "border-pet-coral bg-pet-coral text-white"
                          : "border-pet-border bg-secondary text-pet-text",
                      )}
                      disabled={keyPending !== null || keyNotice !== null || !connected}
                      onClick={() => handleKeyAction("clear")}
                    >
                      <Eraser className="size-4" />
                      {keyPending === "clear"
                        ? MIC_COPY.keyWorking
                        : keyArmedClear
                          ? MIC_COPY.keyClearConfirm
                          : MIC_COPY.keyClear}
                    </button>
                  </div>
                  {(keyError || keyNotice) && (
                    <p
                      role="status"
                      aria-live="polite"
                      className={cn(
                        "mt-1.5 text-[11px] leading-relaxed",
                        keyError ? "text-pet-danger" : "text-pet-success",
                      )}
                    >
                      {keyError ?? keyNotice}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {partialText && (recording || processing) && (
            <div className="pointer-events-auto w-full rounded-2xl border border-pet-border bg-pet-bg px-3 py-2 text-left shadow-lg">
              <span className="rounded-full border border-pet-border px-1.5 py-0.5 text-[10px] text-pet-muted">
                {recording ? recordingEngineLabel : processingEngineLabel}
              </span>
              <p
                aria-live="polite"
                className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed break-words whitespace-pre-wrap text-pet-muted"
              >
                {partialText}
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label={listening ? "松开结束录音" : "按住说话，麦克风"}
          aria-pressed={listening}
          className={cn(
            "pointer-events-auto flex h-14 touch-none select-none items-center justify-center gap-2.5 rounded-full border px-5 text-sm font-medium shadow-sm transition-transform active:scale-[0.98]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pet-primary",
            recording ? "w-[min(90vw,420px)]" : "w-[min(86vw,360px)]",
            cancelZone
              ? "border-pet-coral bg-pet-coral text-white"
              : recording
                ? "border-pet-coral bg-pet-coral text-white"
                : processing
                  ? "border-pet-border bg-secondary text-pet-muted"
                  : "border-pet-primary bg-pet-primary text-pet-primary-foreground",
            !connected && !recording && "border-pet-border bg-secondary text-pet-muted",
          )}
          disabled={processing}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          {processing ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              <span>{processingLabel}</span>
              <span className="rounded-full border border-current px-1.5 py-0.5 text-[10px] font-normal opacity-70">
                {processingEngineLabel}
              </span>
            </>
          ) : recording ? (
            <>
              <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-current" />
              <span className="shrink-0 text-xs tabular-nums">{timerText}</span>
              <VoiceWaveform
                active={listening}
                getLevel={getLevel}
                reducedMotion={reducedMotion}
                bars={14}
                className="min-w-0 flex-1"
              />
              <span className="shrink-0 text-[11px] opacity-90">
                {cancelZone
                  ? MIC_COPY.releaseToCancel
                  : warning
                    ? MIC_COPY.warning
                    : MIC_COPY.cancelHint}
              </span>
            </>
          ) : (
            <>
              <Mic className="size-5" />
              <span>{label}</span>
            </>
          )}
        </button>
      </div>

      <PermissionPrimer
        open={primerOpen}
        mode="primer"
        busy={primerBusy}
        onOpenChange={setPrimerOpen}
        onContinue={() => {
          void handlePrimerContinue();
        }}
      />
      <PermissionPrimer
        open={guideOpen}
        mode="guide"
        onOpenChange={setGuideOpen}
        onContinue={handleGuideContinue}
      />

      {/* 权限快捷入口：固定在左下安全区，避开底部居中的麦克风按钮与上方覆盖层 */}
      {phase === "error" && error && /权限/.test(error) && (
        <button
          type="button"
          aria-label="查看麦克风权限设置"
          className="absolute bottom-[calc(env(safe-area-inset-bottom)+24px)] left-[calc(env(safe-area-inset-left)+24px)] z-30 flex size-11 items-center justify-center rounded-full border border-pet-border bg-pet-bg text-pet-primary"
          onClick={() => setGuideOpen(true)}
        >
          <ShieldAlert className="size-5" />{" "}
        </button>
      )}
    </>
  );
}
