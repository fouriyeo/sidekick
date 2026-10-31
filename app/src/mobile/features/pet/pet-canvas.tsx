import { useEffect, useRef, useState } from "react";
import { PetFallback } from "./pet-fallback";
import type { Mood, PetPhase } from "./types";

export const RIVE_ASSET_AVAILABLE = false;

type PetCanvasProps = {
  mood: Mood;
  energy: number;
  isNight: boolean;
  phase: PetPhase;
  active: boolean;
  reducedMotion: boolean;
};

type IdleAction = "look" | "stretch" | null;

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
          }, 1200);
          schedule();
        },
        4000 + Math.random() * 8000,
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

export function PetCanvas({ mood, energy, isNight, phase, active, reducedMotion }: PetCanvasProps) {
  const idleAction = useIdleAction(active && !reducedMotion);

  return (
    <PetFallback
      mood={mood}
      energy={energy}
      isNight={isNight}
      phase={phase}
      reducedMotion={reducedMotion}
      idleAction={idleAction}
    />
  );
}
