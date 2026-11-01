import { useEffect, useRef, useState } from "react";
import type { AiState } from "./ai-status";
import { PetFallback } from "./pet-fallback";
import type { Mood, PetPhase } from "./types";

export const RIVE_ASSET_AVAILABLE = false;

type PetCanvasProps = {
  mood: Mood;
  energy: number;
  isNight: boolean;
  phase: PetPhase;
  /** 舞台最终展示的 AI 姿态；非静态时暂停随机 idle 小动作。 */
  aiState: AiState;
  active: boolean;
  reducedMotion: boolean;
};

type IdleAction = "look" | "stretch" | null;

/** 静态时每 30–45 秒才伸个懒腰/打个哈欠：低、慢、安静。 */
const IDLE_ACTION_MIN_MS = 30_000;
const IDLE_ACTION_EXTRA_MS = 15_000;
const IDLE_ACTION_HOLD_MS = 1200;

function useIdleAction(enabled: boolean): IdleAction {
  const [action, setAction] = useState<IdleAction>(null);
  const actionTimer = useRef<number | null>(null);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setAction(null);
      return;
    }

    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      actionTimer.current = window.setTimeout(
        () => {
          if (cancelled) return;
          setAction(Math.random() < 0.5 ? "look" : "stretch");
          resetTimer.current = window.setTimeout(() => {
            if (!cancelled) setAction(null);
          }, IDLE_ACTION_HOLD_MS);
          schedule();
        },
        IDLE_ACTION_MIN_MS + Math.random() * IDLE_ACTION_EXTRA_MS,
      );
    };

    schedule();

    return () => {
      cancelled = true;
      if (actionTimer.current !== null) window.clearTimeout(actionTimer.current);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      actionTimer.current = null;
      resetTimer.current = null;
    };
  }, [enabled]);

  return action;
}

export function PetCanvas({
  mood,
  energy,
  isNight,
  phase,
  aiState,
  active,
  reducedMotion,
}: PetCanvasProps) {
  const idleAction = useIdleAction(active && !reducedMotion && aiState === "idle");

  return (
    <PetFallback
      mood={mood}
      energy={energy}
      isNight={isNight}
      phase={phase}
      aiState={aiState}
      reducedMotion={reducedMotion}
      idleAction={idleAction}
    />
  );
}
