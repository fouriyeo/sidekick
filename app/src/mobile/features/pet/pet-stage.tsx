import { cn } from "cn";
import { MessageCircle, Settings } from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { Button } from "@/shared/ui/button";
import { createGestureRecognizer } from "./gestures";
import { isNight } from "./mood";
import { NamePrompt } from "./name-prompt";
import styles from "./pet.module.css";
import { PetBubble } from "./pet-bubble";
import { PetCanvas } from "./pet-canvas";
import { PetHearts } from "./pet-hearts";
import { usePetStore } from "./pet-store";
import { postureForOrientation } from "./posture";
import type { GestureEvent, PetState } from "./types";
import { useOrientation } from "./use-orientation";
import { useReducedMotion } from "./use-reduced-motion";

type PetStageProps = {
  active: boolean;
  onOpenChat: () => void;
  onOpenSettings: () => void;
};

const STATUS_TEXT: Record<PetState["phase"], string> = {
  idle: "正在陪伴",
  interacting: "正在陪你玩",
  listening: "正在听",
  celebrating: "很开心",
  concerned: "有点担心",
  sleeping: "睡着了",
  away: "在休息",
};

function sampleFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
  return {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    t: Date.now(),
  };
}

export function PetStage({ active, onOpenChat, onOpenSettings }: PetStageProps) {
  const pet = usePetStore((state) => state.pet);
  const bubble = usePetStore((state) => state.bubble);
  const heartBurst = usePetStore((state) => state.heartBurst);
  const hydrated = usePetStore((state) => state.hydrated);
  const hydrate = usePetStore((state) => state.hydrate);
  const dispatch = usePetStore((state) => state.dispatch);
  const handleGesture = usePetStore((state) => state.handleGesture);
  const flush = usePetStore((state) => state.flush);
  const saveStatus = usePetStore((state) => state.saveStatus);
  const setPosture = usePetStore((state) => state.setPosture);
  const connectionStatus = useConnectionStore((state) => state.status);
  const orientation = useOrientation();

  const systemReduced = useReducedMotion();
  const reducedMotion =
    pet.settings.reduceMotion === "on" || (pet.settings.reduceMotion === "system" && systemReduced);

  const [controlsVisible, setControlsVisible] = useState(true);
  const [dimmed, setDimmed] = useState(false);
  const dimmedRef = useRef(false);
  const controlTimer = useRef<number | null>(null);
  const dimTimer = useRef<number | null>(null);
  const recognizer = useRef(createGestureRecognizer());

  const markActivity = useCallback(() => {
    if (dimTimer.current !== null) window.clearTimeout(dimTimer.current);
    if (dimmedRef.current) {
      dimmedRef.current = false;
      setDimmed(false);
    }
    dimTimer.current = window.setTimeout(() => {
      dimmedRef.current = true;
      setDimmed(true);
    }, 120_000);

    setControlsVisible(true);
    if (controlTimer.current !== null) window.clearTimeout(controlTimer.current);
    if (pet.settings.posture === "docked" && active) {
      controlTimer.current = window.setTimeout(() => setControlsVisible(false), 5000);
    }
  }, [active, pet.settings.posture]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!hydrated) return;

    const next = postureForOrientation(orientation);
    if (usePetStore.getState().pet.settings.posture !== next) {
      void setPosture(next);
    }
  }, [hydrated, orientation, setPosture]);

  useEffect(() => {
    if (!active) return;
    markActivity();

    return () => {
      if (controlTimer.current !== null) window.clearTimeout(controlTimer.current);
      if (dimTimer.current !== null) window.clearTimeout(dimTimer.current);
    };
  }, [active, markActivity]);

  useEffect(() => {
    dispatch({ type: "OVERLAY", now: Date.now(), open: !active });
  }, [active, dispatch]);

  useEffect(() => {
    if (pet.onboarded) markActivity();
  }, [pet.onboarded, markActivity]);

  useEffect(() => {
    if (!active) return;

    dispatch({ type: "TICK", now: Date.now() });
    const timer = window.setInterval(() => {
      dispatch({ type: "TICK", now: Date.now() });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [active, dispatch]);

  useEffect(() => {
    const onChange = () => {
      const visible = document.visibilityState === "visible";
      dispatch({ type: "VISIBILITY", now: Date.now(), visible });
      if (!visible) void flush();
    };

    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [dispatch, flush]);

  function emit(events: GestureEvent[]) {
    for (const event of events) handleGesture(event);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (dimmedRef.current) {
      markActivity();
      return;
    }

    markActivity();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    emit(recognizer.current.down(sampleFromPointer(event)));
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dimmedRef.current) return;
    emit(recognizer.current.move(sampleFromPointer(event)));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    emit(recognizer.current.up(sampleFromPointer(event)));
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    markActivity();
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    emit(recognizer.current.cancel(sampleFromPointer(event)));
  }

  const poseStyle = (
    pet.settings.posture === "docked"
      ? { "--pet-x": "14%", "--pet-y": "0%", "--pet-scale": "1" }
      : { "--pet-x": "0%", "--pet-y": "-12%", "--pet-scale": "0.86" }
  ) as CSSProperties;

  const night = isNight(Date.now());
  const statusText = STATUS_TEXT[pet.phase];

  return (
    <section
      aria-hidden={!active || undefined}
      aria-label={`${pet.name}，正在陪伴`}
      className={cn(
        "relative h-dvh w-screen overflow-hidden bg-pet-bg text-pet-text",
        reducedMotion && styles.reduceMotion,
      )}
      data-orientation={orientation}
      data-posture={pet.settings.posture}
      data-phase={pet.phase}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(45% 55% at 68% 46%, var(--pet-glow), transparent 72%)",
        }}
      />

      <div className="absolute top-[calc(env(safe-area-inset-top)+16px)] left-[calc(env(safe-area-inset-left)+24px)] z-30">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="打开设置"
          aria-hidden={!controlsVisible || undefined}
          tabIndex={controlsVisible ? 0 : -1}
          className={cn(
            "size-11 rounded-full text-pet-muted transition-opacity duration-200 hover:bg-secondary hover:text-pet-text",
            !controlsVisible && "pointer-events-none opacity-0",
          )}
          onClick={onOpenSettings}
        >
          <Settings className="size-5" />
        </Button>
      </div>

      <div className="absolute top-[calc(env(safe-area-inset-top)+16px)] right-[calc(env(safe-area-inset-right)+24px)] z-30 flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "size-2 rounded-full transition-opacity duration-200",
            connectionStatus === "connected" ? "bg-pet-success" : "bg-pet-muted",
            !controlsVisible && "opacity-0",
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="打开聊天"
          aria-hidden={!controlsVisible || undefined}
          tabIndex={controlsVisible ? 0 : -1}
          className={cn(
            "size-11 rounded-full text-pet-muted transition-opacity duration-200 hover:bg-secondary hover:text-pet-text",
            !controlsVisible && "pointer-events-none opacity-0",
          )}
          onClick={onOpenChat}
        >
          <MessageCircle className="size-5" />
        </Button>
      </div>

      <div
        className={cn(
          "absolute z-20",
          pet.settings.posture === "docked"
            ? "top-[16%] left-[calc(env(safe-area-inset-left)+8%)] w-[48%] landscape:w-[36%]"
            : "top-[16%] left-[calc(env(safe-area-inset-left)+8%)] w-[42%] landscape:top-[12%] landscape:w-[32%]",
        )}
      >
        <PetBubble bubble={bubble} />
      </div>

      <div className={styles.petSlot} style={poseStyle}>
        <div
          className="relative h-full w-full touch-none select-none"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <PetCanvas
            mood={pet.mood}
            energy={pet.energy}
            isNight={night}
            phase={pet.phase}
            active={active}
            reducedMotion={reducedMotion}
          />
          <PetHearts burst={heartBurst} reducedMotion={reducedMotion} />
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {pet.name}，{statusText}
      </div>

      {saveStatus === "error" && (
        <p className="absolute bottom-[calc(env(safe-area-inset-bottom)+16px)] left-1/2 z-30 -translate-x-1/2 text-xs text-pet-muted">
          这次记不住，下次再试。
        </p>
      )}

      {dimmed && (
        <div
          role="presentation"
          className="absolute inset-0 z-40 bg-black opacity-30"
          onPointerDown={(event) => {
            event.preventDefault();
            markActivity();
          }}
        />
      )}

      {active && hydrated && !pet.onboarded && <NamePrompt open />}
    </section>
  );
}
