import { cn } from "cn";
import { AlertCircle, Check, Copy, CornerDownLeft, Loader2, Mic, ShieldAlert } from "lucide-react";
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
import deepSea from "@/mobile/styles/deep-sea.module.css";
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
  /** 胶囊（默认）或圆形主按钮；圆形只在空闲态生效，录音/处理仍用胶囊展开。 */
  shape?: "pill" | "circle";
  /**
   * 胶囊距页面底部的定位类。默认按「无底部导航」布局（安全区 + 16）；
   * 宠物页有 62px 底部三档，传入升高后的值，覆盖层会一起上移。
   */
  bottomOffsetClassName?: string;
  /**
   * 结果/提示覆盖层距胶囊容器的定位类。默认 68（胶囊上方）；
   * 宠物页有「最近 1 条会话」行时传更大的值，避免卡片盖住该行。
   */
  overlayBottomClassName?: string;
};

const MIN_RECORDING_MS = 300;
const MAX_RECORDING_MS = 60_000;
const WARN_RECORDING_MS = 50_000;
const CANCEL_ENTER_PX = 48;
const CANCEL_EXIT_PX = 24;

/** 结果卡右上角的相对时间（12/400）；不引入时间库、不造假时间。 */
function relativeTime(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 5) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.floor(minutes / 60)} 小时前`;
}

export function MicButton({
  active,
  onOpenConnection,
  shape = "pill",
  bottomOffsetClassName,
  overlayBottomClassName,
}: MicButtonProps) {
  const connectionStatus = useConnectionStore((state) => state.status);
  const phase = useMicStore((state) => state.phase);
  const result = useMicStore((state) => state.result);
  const error = useMicStore((state) => state.error);
  const partialText = useMicStore((state) => state.partialText);
  const keyPending = useMicStore((state) => state.keyPending);
  const keyArmedClear = useMicStore((state) => state.keyArmedClear);
  const keyNotice = useMicStore((state) => state.keyNotice);
  const keyError = useMicStore((state) => state.keyError);
  const cancelNonce = useMicStore((state) => state.cancelNonce);

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
  /** 正在异步启动（sendMicStart/getUserMedia）中；期间拒绝任何新的按下。 */
  const startingRef = useRef(false);
  /** 单调递增的会话生命周期；旧异步结果 token 不匹配时不得回写 store。 */
  const lifecycleRef = useRef(0);
  /** 已处理到的服务端取消次数，避免组件挂载时重放旧提示。 */
  const seenCancelNonceRef = useRef(cancelNonce);

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
      lifecycleRef.current += 1;
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
      lifecycleRef.current += 1;
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
      lifecycleRef.current += 1;
      const token = lifecycleRef.current;
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
        // 收尾期间被电脑端取消/断连/新会话取代：不要再用旧结果写 store。
        if (lifecycleRef.current !== token) return;
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
      const livePhase = useMicStore.getState().phase;
      if (
        !active ||
        startingRef.current ||
        finishingRef.current ||
        pointerIdRef.current !== null ||
        heldRef.current ||
        livePhase === "arming" ||
        livePhase === "listening" ||
        livePhase === "processing"
      ) {
        return;
      }
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

      startingRef.current = true;
      const token = lifecycleRef.current + 1;
      lifecycleRef.current = token;

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
      } catch {
        startingRef.current = false;
        heldRef.current = false;
        sessionIdRef.current = null;
        releasePointer();
        if (useMicStore.getState().session === sessionId) {
          useMicStore.getState().fail(MIC_COPY.disconnected, "disconnect");
        }
        return;
      }
      startSentRef.current = true;

      // 启动期间手指已抬起 / 被后台、断连、电脑端取消接管：不进入录音。
      if (lifecycleRef.current !== token || !heldRef.current) {
        startingRef.current = false;
        sessionIdRef.current = null;
        startSentRef.current = false;
        releasePointer();
        void sendMicStop(sessionId, "cancel").catch(() => undefined);
        if (useMicStore.getState().session === sessionId) {
          const current = useMicStore.getState().phase;
          if (current === "arming" || current === "listening") useMicStore.getState().cancel();
        }
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

        // getUserMedia 期间松手/取消：本地会话直接丢掉，不提交、不录音。
        if (lifecycleRef.current !== token || !heldRef.current) {
          startingRef.current = false;
          sessionIdRef.current = null;
          startSentRef.current = false;
          releasePointer();
          await session.cancel();
          void sendMicStop(sessionId, "cancel").catch(() => undefined);
          if (useMicStore.getState().session === sessionId) {
            const current = useMicStore.getState().phase;
            if (current === "arming" || current === "listening") useMicStore.getState().cancel();
          }
          return;
        }

        startingRef.current = false;
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
        startingRef.current = false;
        heldRef.current = false;
        sessionRef.current = null;
        sessionIdRef.current = null;
        startSentRef.current = false;
        releasePointer();
        void sendMicStop(sessionId, "cancel").catch(() => undefined);

        // 松手/取消已经接管了这次启动：不再弹权限/失败，只保证 store 回到 idle。
        if (lifecycleRef.current !== token) {
          if (useMicStore.getState().session === sessionId) useMicStore.getState().cancel();
          return;
        }

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
      connected,
      haptics,
      onOpenConnection,
      permissionDenied,
      primerDone,
      cancelRecording,
      finishRecording,
      releasePointer,
      showHint,
    ],
  );

  const endPointer = useCallback(
    (pointerId: number, event?: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== pointerId) return;
      releasePointer(event);

      if (cancelZoneRef.current) {
        void cancelRecording("cancel", MIC_COPY.cancelled);
        return;
      }

      if (heldRef.current) {
        void finishRecording("release");
      } else {
        setElapsedMs(0);
      }
    },
    [cancelRecording, finishRecording, releasePointer],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (useMicStore.getState().phase === "processing") return;
      if (
        pointerIdRef.current !== null ||
        startingRef.current ||
        finishingRef.current ||
        heldRef.current
      ) {
        return;
      }
      void startRecording(event);
    },
    [startRecording],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId || !heldRef.current) return;

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
    [haptics],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      endPointer(event.pointerId, event);
    },
    [endPointer],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      void cancelRecording("cancel");
    },
    [cancelRecording],
  );

  // 兜底：pointer capture 失效/抬起事件没回到按钮时，window 上也能结束录音。
  useEffect(() => {
    const onWindowPointerUp = (event: PointerEvent) => {
      endPointer(event.pointerId);
    };
    const onWindowPointerCancel = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      void cancelRecording("cancel");
    };

    window.addEventListener("pointerup", onWindowPointerUp);
    window.addEventListener("pointercancel", onWindowPointerCancel);
    return () => {
      window.removeEventListener("pointerup", onWindowPointerUp);
      window.removeEventListener("pointercancel", onWindowPointerCancel);
    };
  }, [cancelRecording, endPointer]);

  // 电脑端权威取消（人工/看门狗）：不校验 session，直接停本地采集并提示。
  useEffect(() => {
    if (cancelNonce === seenCancelNonceRef.current) return;
    seenCancelNonceRef.current = cancelNonce;
    void abortLocalCapture(false);
    const notice = useMicStore.getState().cancelNotice;
    if (notice) showHint(notice);
    haptics.light();
  }, [abortLocalCapture, cancelNonce, haptics, showHint]);

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
      const current = useMicStore.getState().phase;
      if (
        document.visibilityState === "hidden" &&
        (current === "arming" || current === "listening")
      ) {
        void cancelRecording("background", MIC_COPY.background);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [cancelRecording]);

  useEffect(() => {
    const current = useMicStore.getState().phase;
    if (connectionStatus !== "connected" && (current === "arming" || current === "listening")) {
      void cancelRecording("disconnect", MIC_COPY.disconnected);
    }
  }, [cancelRecording, connectionStatus]);

  useEffect(() => {
    const current = useMicStore.getState().phase;
    if (!active && (current === "arming" || current === "listening")) {
      void cancelRecording("background", MIC_COPY.background);
    }
  }, [active, cancelRecording]);

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
  const failed = phase === "error" || result?.outcome === "failed";
  const inserted = result?.outcome === "inserted";
  const resultTitle = failed ? "没成功" : inserted ? MIC_COPY.inserted : "已复制";
  const resultMessage = result?.message && result.message !== resultTitle ? result.message : null;
  const metaText = keyError ?? keyNotice;
  const resultAt = relativeTime(result?.at ?? Date.now());
  const contentText = result?.text ?? error ?? result?.message ?? "";

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
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 z-30 flex flex-col items-center",
          bottomOffsetClassName ?? "bottom-[calc(env(safe-area-inset-bottom)+16px)]",
        )}
      >
        {/*
          覆盖层（临时提示 / 结果卡片 / 实时文本）固定在胶囊上方：
          它不参与外层宽度计算，出现/消失都不会推动按钮。
        */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 mx-auto flex w-[min(86vw,380px)] flex-col items-center gap-2",
            overlayBottomClassName ?? "bottom-[68px]",
          )}
        >
          {message && (
            <span
              role="status"
              aria-live="polite"
              className={cn(
                "max-w-[86vw] rounded-full border border-pet-border px-3 py-1.5 text-center text-xs text-pet-text",
                deepSea.surface,
              )}
            >
              {message}
            </span>
          )}

          {/*
            v16 结果卡：白底弹窗三段（grabber / header 16 / content 13 单行 / footer 15）。
            用页面主题令牌（卡片、文字、hairline），不再套 deep-sea 深色作用域；
            动作只留纯文字链接（44 热区），「清空」仍点两次才发。
          */}
          {showResult && (
            <div
              data-testid="mic-result-card"
              className="mic-result-card pointer-events-auto w-full overflow-hidden rounded-[20px] border-[0.5px] border-border bg-card text-left shadow-[0_12px_32px_-12px_rgba(20,30,35,0.18)]"
            >
              <div
                aria-hidden="true"
                data-testid="mic-result-grabber"
                className="mx-auto mt-1.5 h-1 w-9 rounded-[2px] bg-[#d1d1d6]"
              />

              <div className="mt-0.5 flex h-10 items-center justify-between gap-2 border-b-[0.5px] border-border px-3.5">
                <span className="flex min-w-0 items-center gap-2">
                  {failed ? (
                    <AlertCircle aria-hidden="true" className="size-5 shrink-0 text-destructive" />
                  ) : (
                    <Check aria-hidden="true" className="size-5 shrink-0 text-primary" />
                  )}
                  <span
                    className={cn(
                      "truncate text-base leading-[21px] font-normal",
                      failed ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {resultTitle}
                  </span>
                </span>
                <span className="flex min-w-0 items-center justify-end gap-1">
                  <span className="min-w-0 truncate text-[12px] leading-4 font-normal text-muted-foreground">
                    {resultMessage && (
                      <span className="hidden min-[360px]:inline">{resultMessage} · </span>
                    )}
                    {resultAt}
                  </span>
                  {result?.text && (
                    <button
                      type="button"
                      aria-label={copyDone ? "已复制识别文本" : "复制识别文本"}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--wash)] hover:text-foreground"
                      onClick={handleCopyResult}
                    >
                      {copyDone ? (
                        <Check aria-hidden="true" className="size-3.5 text-success" />
                      ) : (
                        <Copy aria-hidden="true" className="size-3.5" />
                      )}
                    </button>
                  )}
                </span>
              </div>

              <div className="flex h-[34px] items-center px-3.5">
                <p
                  className={cn(
                    "min-w-0 truncate text-[13px] leading-[18px] font-normal whitespace-nowrap",
                    failed && !result?.text ? "text-destructive" : "text-foreground",
                  )}
                  title={contentText}
                >
                  {contentText}
                </p>
              </div>

              {metaText && (
                <div className="flex min-h-7 items-center border-t-[0.5px] border-border px-3.5">
                  <span
                    aria-live="polite"
                    className={cn(
                      "min-w-0 flex-1 truncate text-[12px] leading-4 font-normal",
                      keyError ? "text-destructive" : "text-success",
                    )}
                  >
                    {metaText}
                  </span>
                </div>
              )}

              {/*
                只有真正插入成功才有可操作目标；「清空」会删掉整个输入框，
                因此点两次才发送。纯文字动作，44 热区，无实心底色。
              */}
              {inserted && (
                <div className="flex h-11 items-center justify-end gap-5 border-t-[0.5px] border-border px-3.5">
                  <button
                    type="button"
                    aria-label={keyArmedClear ? "再点一次清空电脑输入框" : "清空电脑输入框"}
                    className={cn(
                      "flex min-h-11 items-center px-0.5 text-[15px] leading-5 font-normal disabled:opacity-50",
                      keyArmedClear ? "text-destructive" : "text-muted-foreground",
                    )}
                    disabled={keyPending !== null || keyNotice !== null || !connected}
                    onClick={() => handleKeyAction("clear")}
                  >
                    {keyPending === "clear"
                      ? MIC_COPY.keyWorking
                      : keyArmedClear
                        ? MIC_COPY.keyClearConfirm
                        : MIC_COPY.keyClear}
                  </button>
                  <button
                    type="button"
                    aria-label="在电脑上按回车"
                    className="flex min-h-11 items-center gap-1 px-0.5 text-[15px] leading-5 font-normal text-primary disabled:opacity-50"
                    disabled={keyPending !== null || keyNotice !== null || !connected}
                    onClick={() => handleKeyAction("enter")}
                  >
                    <CornerDownLeft aria-hidden="true" className="size-3.5" />
                    {keyPending === "enter" ? MIC_COPY.keyWorking : MIC_COPY.keyEnter}
                  </button>
                </div>
              )}
            </div>
          )}

          {partialText && (recording || processing) && (
            <div
              className={cn(
                "pointer-events-auto w-full rounded-[14px] border border-pet-border px-3 py-2 text-left",
                deepSea.surface,
              )}
            >
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
            "press-spring pointer-events-auto flex h-14 touch-none select-none items-center justify-center gap-2.5 rounded-full border text-sm font-medium",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pet-signal focus-visible:ring-offset-2 focus-visible:ring-offset-pet-bg",
            recording
              ? "w-[min(90vw,420px)] px-5"
              : shape === "circle"
                ? "w-14 px-0"
                : "w-[min(86vw,360px)] px-5",
            cancelZone
              ? "border-pet-coral bg-pet-coral text-pet-coral-foreground"
              : recording
                ? "border-pet-coral bg-pet-coral text-pet-coral-foreground"
                : processing
                  ? "border-pet-border text-pet-muted"
                  : shape === "circle"
                    ? "border-0 bg-pet-primary text-pet-primary-foreground"
                    : "border-pet-border text-pet-text",
            !connected && !recording && shape !== "circle" && "border-pet-border text-pet-muted",
            !recording && !processing && shape !== "circle" && deepSea.surface2,
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
              <Mic
                className={cn(
                  "size-5",
                  shape === "circle"
                    ? "text-pet-primary-foreground"
                    : connected
                      ? "text-pet-signal"
                      : "text-pet-muted",
                )}
              />
              {shape === "pill" && <span>{label}</span>}
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
          className={cn(
            "absolute bottom-[calc(env(safe-area-inset-bottom)+24px)] left-[calc(env(safe-area-inset-left)+24px)] z-30 flex size-11 items-center justify-center rounded-full border border-pet-border text-pet-signal",
            deepSea.surface,
          )}
          onClick={() => setGuideOpen(true)}
        >
          <ShieldAlert className="size-5" />{" "}
        </button>
      )}
    </>
  );
}
