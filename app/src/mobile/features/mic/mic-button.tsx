import { cn } from "cn";
import { Mic } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import type { Posture } from "@/mobile/features/pet/types";
import { sendVoice, sendVoiceCancel, sendVoiceStart } from "@/shared/lib/tauri";
import { startVoiceRecording, type VoiceSession } from "./voice-recorder";

type MicState = "idle" | "arming" | "listening" | "processing" | "error";

type MicButtonProps = {
  active: boolean;
  posture: Posture;
};

const MIN_RECORDING_MS = 300;
const MAX_RECORDING_MS = 60_000;

export function MicButton({ active, posture }: MicButtonProps) {
  const connectionStatus = useConnectionStore((state) => state.status);
  const dispatch = usePetStore((state) => state.dispatch);

  const [state, setState] = useState<MicState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [message, setMessage] = useState("");

  const sessionRef = useRef<VoiceSession | null>(null);
  const heldRef = useRef(false);
  const startSentRef = useRef(false);
  const startedAtRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const resetRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (resetRef.current !== null) {
      window.clearTimeout(resetRef.current);
      resetRef.current = null;
    }
  }, []);

  const resetSoon = useCallback(
    (nextMessage = "") => {
      clearTimers();
      setMessage(nextMessage);
      resetRef.current = window.setTimeout(() => {
        setState("idle");
        setMessage("");
        resetRef.current = null;
      }, 1800);
    },
    [clearTimers],
  );

  const cancelRecording = useCallback(
    async (notify: boolean) => {
      heldRef.current = false;
      clearTimers();

      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) await session.cancel();

      if (notify && startSentRef.current) {
        void sendVoiceCancel().catch(() => undefined);
      }
      startSentRef.current = false;
      dispatch({ type: "MIC_CANCEL", now: Date.now() });
      setState("idle");
      setElapsedSeconds(0);
      setMessage("");
    },
    [clearTimers, dispatch],
  );

  const finish = useCallback(
    async (send: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      heldRef.current = false;
      clearTimers();

      const session = sessionRef.current;
      sessionRef.current = null;
      if (!session) {
        busyRef.current = false;
        setState("idle");
        return;
      }

      try {
        const recording = await session.stop();
        const tooShort = !recording || recording.durationMs < MIN_RECORDING_MS;

        if (!send || tooShort) {
          if (startSentRef.current) {
            void sendVoiceCancel().catch(() => undefined);
          }
          startSentRef.current = false;
          dispatch({ type: "MIC_CANCEL", now: Date.now() });
          setState("idle");
          setElapsedSeconds(0);
          if (send && tooShort) resetSoon("按住说话。");
          return;
        }

        setState("processing");
        setMessage("转写中…");

        try {
          await sendVoice(recording.base64, recording.sampleRate, recording.durationMs);
          dispatch({ type: "MIC_CANCEL", now: Date.now() });
          resetSoon("已发送");
        } catch {
          dispatch({ type: "MIC_ERROR", now: Date.now() });
          setState("error");
          setElapsedSeconds(0);
          resetSoon("发送失败，检查连接。");
        } finally {
          startSentRef.current = false;
        }
      } finally {
        busyRef.current = false;
      }
    },
    [clearTimers, dispatch, resetSoon],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (
        busyRef.current ||
        state === "arming" ||
        state === "listening" ||
        state === "processing"
      ) {
        return;
      }

      if (connectionStatus !== "connected") {
        setState("error");
        resetSoon("先连接电脑，再按住说话。");
        return;
      }

      event.currentTarget.setPointerCapture?.(event.pointerId);
      pointerIdRef.current = event.pointerId;
      heldRef.current = true;
      setState("arming");
      setMessage("准备中…");

      void startVoiceRecording()
        .then(async (session) => {
          if (!heldRef.current) {
            await session.cancel();
            setState("idle");
            setMessage("");
            return;
          }

          sessionRef.current = session;
          startedAtRef.current = Date.now();
          startSentRef.current = true;
          dispatch({ type: "MIC_START", now: Date.now() });
          setState("listening");
          setMessage("正在听");

          try {
            await sendVoiceStart();
          } catch {
            // The send on release will surface the connection error.
          }

          tickRef.current = window.setInterval(() => {
            const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
            setElapsedSeconds(seconds);
            if (seconds * 1000 >= MAX_RECORDING_MS) {
              void finish(true);
            }
          }, 250);
        })
        .catch((error: unknown) => {
          heldRef.current = false;
          setState("error");
          const denied =
            typeof error === "object" &&
            error !== null &&
            "name" in error &&
            (error as { name?: unknown }).name === "NotAllowedError";
          resetSoon(
            denied ? "需要麦克风权限才能说话。去系统设置打开。" : "麦克风启动失败，再试一次。",
          );
        });
    },
    [connectionStatus, dispatch, finish, resetSoon, state],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      pointerIdRef.current = null;

      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (state === "listening") {
        void finish(true);
      } else if (state === "arming") {
        heldRef.current = false;
      }
    },
    [finish, state],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      pointerIdRef.current = null;
      if (state === "listening" || state === "arming") {
        void cancelRecording(true);
      }
    },
    [cancelRecording, state],
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && (state === "arming" || state === "listening")) {
        void cancelRecording(true);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [cancelRecording, state]);

  useEffect(() => {
    if (!active && (state === "arming" || state === "listening")) {
      void cancelRecording(true);
    }
  }, [active, cancelRecording, state]);

  useEffect(() => {
    return () => {
      clearTimers();
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void session.cancel();
    };
  }, [clearTimers]);

  const label =
    state === "arming"
      ? "准备中…"
      : state === "listening"
        ? "正在听"
        : state === "processing"
          ? message || "转写中…"
          : state === "error"
            ? message
            : "";

  return (
    <div
      className={cn(
        "absolute z-30 flex flex-col items-center gap-2",
        posture === "docked"
          ? "bottom-[calc(env(safe-area-inset-bottom)+16px)] left-1/2 -translate-x-1/2"
          : "bottom-[calc(env(safe-area-inset-bottom)+24px)] right-[calc(env(safe-area-inset-right)+24px)]",
      )}
    >
      {label && (
        <span
          aria-live="polite"
          className={cn(
            "max-w-[70vw] rounded-full border border-pet-border bg-card px-3 py-1.5 text-center text-xs text-pet-text",
            state === "error" && "border-pet-danger text-pet-danger",
          )}
        >
          {state === "listening" ? `${label} · ${elapsedSeconds}s` : label}
        </span>
      )}

      <button
        type="button"
        aria-label="按住说话，麦克风"
        aria-pressed={state === "listening"}
        className={cn(
          "touch-none select-none rounded-full border border-pet-border shadow-sm transition-transform active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pet-primary/40",
          posture === "docked"
            ? "flex h-14 min-w-[220px] items-center justify-center gap-2 px-6 text-sm font-medium"
            : "flex size-24 flex-col items-center justify-center gap-1 text-xs",
          state === "listening"
            ? "bg-pet-coral text-white"
            : "bg-pet-primary text-pet-primary-foreground disabled:opacity-60",
        )}
        disabled={state === "processing"}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <Mic className={posture === "docked" ? "size-5" : "size-7"} />
        {posture === "docked" && (
          <span>{state === "listening" ? `${elapsedSeconds}s` : "按住说话"}</span>
        )}
        {posture === "handheld" && <span>{state === "listening" ? "松手结束" : "按住"}</span>}
      </button>
    </div>
  );
}
