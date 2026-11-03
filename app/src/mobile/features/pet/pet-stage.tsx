import { cn } from "cn";
import { MessageCircle, Settings } from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { MicButton } from "@/mobile/features/mic/mic-button";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { SessionPanel } from "@/mobile/features/sessions/session-panel";
import {
  visibleSessions as selectVisibleSessions,
  useSessionStore,
} from "@/mobile/features/sessions/session-store";
import { Button } from "@/shared/ui/button";
import { type AiState, displayStateOf } from "./ai-status";
import { createGestureRecognizer } from "./gestures";
import { isNight } from "./mood";
import { NamePrompt } from "./name-prompt";
import styles from "./pet.module.css";
import { PetBubble } from "./pet-bubble";
import { PetHearts } from "./pet-hearts";
import { usePetStore } from "./pet-store";
import { SpritePet } from "./sprite-pet";
import type { GestureEvent, PetState } from "./types";
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

const AI_STATUS_TEXT: Record<Exclude<AiState, "idle">, string> = {
  working: "正在陪你工作",
  asking: "等你决定",
  completed: "完成了一件事",
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
  const ai = usePetStore((state) => state.ai);
  const aiCaption = usePetStore((state) => state.aiCaption);
  const setMicListening = usePetStore((state) => state.setMicListening);
  const unlockSound = usePetStore((state) => state.unlockSound);
  const connectionStatus = useConnectionStore((state) => state.status);
  const micBusy = useMicStore(
    (state) =>
      state.phase === "arming" || state.phase === "listening" || state.phase === "processing",
  );
  const sessionRaw = useSessionStore((state) => state.raw);
  const sessionCleared = useSessionStore((state) => state.cleared);
  const sessionExpanded = useSessionStore((state) => state.expanded);
  const sessionHydrated = useSessionStore((state) => state.hydrated);
  const sessionRows = useMemo(
    () => selectVisibleSessions(sessionRaw, sessionCleared),
    [sessionRaw, sessionCleared],
  );
  const panelVisible = active && sessionHydrated && sessionRows.length > 0;
  const askingKey = useMemo(
    () =>
      sessionRows
        .filter((row) => row.display === "asking")
        .map((row) => row.id)
        .join(","),
    [sessionRows],
  );

  const systemReduced = useReducedMotion();
  const reducedMotion =
    pet.settings.reduceMotion === "on" || (pet.settings.reduceMotion === "system" && systemReduced);

  const [dimmed, setDimmed] = useState(false);
  const dimMs = Math.max(1, pet.settings.dimMinutes) * 60_000;
  const dimmedRef = useRef(false);
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
    }, dimMs);
  }, [dimMs]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!active) return;
    markActivity();

    return () => {
      if (dimTimer.current !== null) window.clearTimeout(dimTimer.current);
    };
  }, [active, markActivity]);

  useEffect(() => {
    dispatch({ type: "OVERLAY", now: Date.now(), open: !active });
  }, [active, dispatch]);

  useEffect(() => {
    if (pet.onboarded) markActivity();
  }, [pet.onboarded, markActivity]);

  // 新的「等你决定」会唤醒变暗屏幕/控制栏，避免用户错过反问。
  useEffect(() => {
    if (askingKey) markActivity();
  }, [askingKey, markActivity]);

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

  // 录音中静音 AI 触感/音效；结束后恢复。
  useEffect(() => {
    setMicListening(micBusy);
  }, [micBusy, setMicListening]);

  // 首次用户手势解锁 Web Audio（浏览器/WebView 的自动播放策略）。
  useEffect(() => {
    const unlock = () => unlockSound();
    document.addEventListener("pointerdown", unlock, { once: true, capture: true });
    return () => document.removeEventListener("pointerdown", unlock, { capture: true });
  }, [unlockSound]);

  // 等你决定时叫醒自动变暗/控制栏，保证一眼看到；working/completed 不打断夜间状态。
  useEffect(() => {
    if (active && ai.state === "asking") markActivity();
  }, [active, ai.state, markActivity]);

  function emit(events: GestureEvent[]) {
    for (const event of events) handleGesture(event);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (micBusy) return;
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

  const poseStyle = {
    "--pet-x": "0%",
    "--pet-y": "-12%",
    "--pet-scale": "0.86",
    "--pet-session-shift": panelVisible ? (sessionExpanded ? "56px" : "32px") : "0px",
  } as CSSProperties;

  const night = isNight(Date.now());
  const displayAi = displayStateOf(pet.phase, ai.state);
  // AI 状态文案优先占用气泡槽位；触摸/录音/即时心情反馈时暂时让位给闲聊气泡。
  const caption = displayAi === "idle" ? null : aiCaption;
  const liveText =
    displayAi === "idle"
      ? `${pet.name}，${STATUS_TEXT[pet.phase]}`
      : `${pet.name}，${AI_STATUS_TEXT[displayAi]}`;

  return (
    <section
      aria-hidden={!active || undefined}
      aria-label={`${pet.name}，正在陪伴`}
      className={cn(
        "relative h-dvh w-screen overflow-hidden bg-pet-bg text-pet-text select-none",
        styles.stage,
        reducedMotion && styles.reduceMotion,
      )}
      onContextMenu={(event) => event.preventDefault()}
      data-phase={pet.phase}
      data-ai-state={displayAi}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-session-panel={panelVisible ? (sessionExpanded ? "expanded" : "collapsed") : "hidden"}
    >
      <div className="absolute top-[calc(env(safe-area-inset-top)+16px)] left-[calc(env(safe-area-inset-left)+24px)] z-30">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="打开设置"
          className="size-11 rounded-full text-pet-muted transition-opacity duration-200 hover:bg-secondary hover:text-pet-text"
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
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="打开聊天"
          className="size-11 rounded-full text-pet-muted transition-opacity duration-200 hover:bg-secondary hover:text-pet-text"
          onClick={onOpenChat}
        >
          <MessageCircle className="size-5" />
        </Button>
      </div>

      <SessionPanel active={active} onInteract={markActivity} />

      {!(panelVisible && sessionExpanded) && (
        <div
          className={cn(
            "absolute z-20 left-[calc(env(safe-area-inset-left)+8%)] w-[42%]",
            panelVisible ? "top-[calc(env(safe-area-inset-top)+136px)]" : "top-[16%]",
          )}
        >
          <PetBubble bubble={bubble} caption={caption} />
        </div>
      )}

      <div className={styles.petSlot} style={poseStyle}>
        <div
          className="relative h-full w-full touch-none select-none"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <SpritePet
            ai={displayAi}
            phase={pet.phase}
            night={night}
            active={active}
            reducedMotion={reducedMotion}
          />
          <PetHearts burst={heartBurst} reducedMotion={reducedMotion} />
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {liveText}
      </div>

      <MicButton active={active} onOpenConnection={onOpenChat} />

      {saveStatus === "error" && (
        <p className="absolute bottom-[calc(env(safe-area-inset-bottom)+16px)] left-0 right-0 z-30 mx-auto w-fit text-xs text-pet-muted">
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
