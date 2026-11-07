import { cn } from "cn";
import { CornerDownLeft, Mic, ShieldAlert, Trash2 } from "lucide-react";
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
import { LoadingOrbit } from "@/shared/ui/motion";
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
};

const MIN_RECORDING_MS = 300;
const MAX_RECORDING_MS = 60_000;
const WARN_RECORDING_MS = 50_000;
/**
 * 上滑进入取消区的距离：按住时手指自然一滚（约 1cm）不应误取消，所以用 80
 * （约 1.4cm 的刻意上滑）；滑回 32 以内退出取消区。
 * 提示放在胶囊内，按住时胶囊变珊瑚色；不做独立的目标区域。
 */
const CANCEL_ENTER_PX = 80;
const CANCEL_EXIT_PX = 32;

export function MicButton({
  active,
  onOpenConnection,
  shape = "pill",
  bottomOffsetClassName,
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
      // 真机：子元素已 pointer-events:none（见 clean.css .mic-gesture），
      // pointercancel 只应来自真实中断；否则 recording 切换卸载触摸目标会被误判成取消。
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
  const metaText = keyError ?? keyNotice;
  const contentText = result?.text ?? error ?? result?.message ?? "";
  const showLiveCard = Boolean(partialText) && (recording || processing);
  const showCard = showLiveCard || Boolean(showResult);
  const actionsVisible = Boolean(showResult) && inserted;

  const timerText = formatDuration(elapsedMs);

  const label = !connected
    ? MIC_COPY.idleDisconnected
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
          实时卡 / 结果卡共用一张白卡、一个位置：
          录音时 170，松手后 110；卡片内容交叉淡入，不跳位。
        */}
        <div
          className={cn(
            "mic-card-layer pointer-events-none absolute inset-x-0 mx-auto flex w-[min(86vw,380px)] flex-col items-center gap-2",
            showResult ? "bottom-[110px]" : "bottom-[170px]",
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

          {showCard && (
            <div
              data-testid="mic-result-card"
              className="pointer-events-auto w-full rounded-[18px] border border-border bg-card px-3 py-2.5 text-left shadow-[0_16px_34px_-24px_rgba(20,30,35,0.26)]"
            >
              <div className="grid">
                <div
                  className={cn(
                    "col-start-1 row-start-1 transition-opacity duration-150",
                    showResult ? "pointer-events-none opacity-0" : "opacity-100",
                  )}
                >
                  <div className="flex min-h-[18px] items-center justify-between gap-2">
                    <span className="rounded-full bg-[#e9f5f1] px-1.5 py-0.5 text-[9px] leading-none font-semibold text-[#075c4e]">
                      {MIC_COPY.engineCloud}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] leading-none text-pet-muted">
                        {MIC_COPY.recognizing}
                      </span>
                      <span className="size-1 animate-pulse rounded-full bg-pet-signal" />
                    </span>
                  </div>
                  <p
                    aria-live="polite"
                    className="mt-1.5 line-clamp-2 text-[11.5px] leading-[17px] break-words whitespace-pre-wrap text-pet-muted"
                  >
                    {partialText}
                  </p>
                </div>

                <div
                  className={cn(
                    "col-start-1 row-start-1 transition-opacity duration-150",
                    showResult ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  <div className="flex min-h-[18px] items-center justify-between gap-2">
                    <span className="rounded-full bg-[#e9f5f1] px-1.5 py-0.5 text-[9px] leading-none font-semibold text-[#075c4e]">
                      {MIC_COPY.engineCloud}
                    </span>
                    <span
                      className={cn(
                        "text-[9px] leading-none font-semibold",
                        failed ? "text-pet-coral" : inserted ? "text-pet-signal" : "text-pet-muted",
                      )}
                    >
                      {resultTitle}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 line-clamp-2 text-[11.5px] leading-[17px] break-words",
                      failed && !result?.text ? "text-pet-coral" : "text-pet-text",
                    )}
                    title={contentText}
                  >
                    {contentText}
                  </p>
                  {metaText && (
                    <p
                      aria-live="polite"
                      className={cn(
                        "mt-1 line-clamp-1 text-[10px] leading-4",
                        keyError ? "text-pet-coral" : "text-pet-signal",
                      )}
                    >
                      {metaText}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {recording && (
          <span
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-[100px] z-20 mx-auto w-fit text-xs font-semibold transition-opacity duration-150",
              cancelZone ? "text-pet-coral" : "text-pet-text",
            )}
          >
            {cancelZone
              ? MIC_COPY.releaseToCancel
              : warning
                ? MIC_COPY.warning
                : MIC_COPY.cancelHint}
          </span>
        )}

        <button
          type="button"
          aria-label={
            processing ? "正在转写，请稍候" : listening ? "松开结束录音" : "按住说话，麦克风"
          }
          aria-pressed={listening}
          aria-busy={processing}
          className={cn(
            "mic-gesture mic-morph pointer-events-auto relative flex h-14 touch-none select-none items-center justify-center rounded-full border text-sm font-medium",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pet-signal focus-visible:ring-offset-2 focus-visible:ring-offset-pet-bg",
            recording
              ? "mic-recording w-[min(90vw,420px)]"
              : shape === "circle"
                ? "w-14 border-0 bg-pet-primary text-pet-primary-foreground"
                : "w-[min(86vw,360px)] border-pet-border text-pet-text",
            processing &&
              shape === "circle" &&
              "border-0 bg-pet-primary text-pet-primary-foreground",
            !connected && !recording && shape !== "circle" && "text-pet-muted",
            !recording && !processing && shape !== "circle" && deepSea.surface2,
          )}
          disabled={processing}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <span
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-150",
              processing ? "opacity-100" : "opacity-0",
            )}
          >
            <LoadingOrbit size={20} />
          </span>

          <span
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center gap-2.5 px-5 transition-opacity duration-150",
              recording ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-current" />
            <span className="shrink-0 text-xs tabular-nums">{timerText}</span>
            <VoiceWaveform
              active={listening}
              getLevel={getLevel}
              reducedMotion={reducedMotion}
              bars={14}
              className="min-w-0 flex-1"
            />
          </span>

          <span
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-150",
              !recording && !processing ? "opacity-100" : "opacity-0",
            )}
          >
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
          </span>
        </button>

        <button
          type="button"
          data-visible={actionsVisible ? "true" : "false"}
          aria-hidden={!actionsVisible}
          tabIndex={actionsVisible ? 0 : -1}
          aria-label={keyArmedClear ? "再点一次清空电脑输入框" : "清空电脑输入框"}
          disabled={keyPending !== null || keyNotice !== null || !connected}
          onClick={() => handleKeyAction("clear")}
          className={cn(
            "mic-action absolute bottom-0 left-[calc(50%-120px)] z-20 flex size-14 flex-col items-center justify-center gap-0.5 rounded-full border border-[#e5e5ea] bg-[#f2f2f7] shadow-[0_8px_18px_-12px_rgba(20,30,35,0.16)] disabled:opacity-50",
            keyArmedClear ? "text-pet-coral" : "text-[#3a3a3c]",
          )}
        >
          <Trash2 aria-hidden="true" className="size-[18px]" />
          <span className="text-[9px] leading-none font-medium">
            {keyPending === "clear"
              ? "…"
              : keyArmedClear
                ? MIC_COPY.keyClearConfirm
                : MIC_COPY.keyClear}
          </span>
        </button>

        <button
          type="button"
          data-visible={actionsVisible ? "true" : "false"}
          aria-hidden={!actionsVisible}
          tabIndex={actionsVisible ? 0 : -1}
          aria-label="在电脑上按回车"
          disabled={keyPending !== null || keyNotice !== null || !connected}
          onClick={() => handleKeyAction("enter")}
          className="mic-action absolute right-[calc(50%-120px)] bottom-0 z-20 flex size-14 flex-col items-center justify-center gap-0.5 rounded-full border border-[#e5e5ea] bg-[#f2f2f7] text-pet-signal shadow-[0_8px_18px_-12px_rgba(20,30,35,0.16)] disabled:opacity-50"
        >
          <CornerDownLeft aria-hidden="true" className="size-[18px]" />
          <span className="text-[9px] leading-none font-medium">
            {keyPending === "enter" ? "…" : MIC_COPY.keyEnter}
          </span>
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
