import type { BaselineMood, Mood, PetState } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type TimeOfDay = "morning" | "day" | "evening" | "night";

export function isNight(now: number): boolean {
  const hour = new Date(now).getHours();
  return hour >= 23 || hour < 6;
}

export function timeOfDay(now: number): TimeOfDay {
  const hour = new Date(now).getHours();
  if (hour < 6) return "night";
  if (hour < 11) return "morning";
  if (hour < 18) return "day";
  if (hour < 23) return "evening";
  return "night";
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function energyAfterElapsed(
  energy: number,
  elapsedMs: number,
  mode: "foreground" | "background" | "sleeping",
): number {
  if (!Number.isFinite(energy)) return 100;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return clamp(energy);

  const deltaPerMs =
    mode === "foreground" ? -1 / (30 * MINUTE) : mode === "background" ? -1 / (2 * HOUR) : 5 / HOUR;

  return clamp(energy + deltaPerMs * elapsedMs);
}

export function settleEnergy(
  state: PetState,
  now: number,
  mode: "foreground" | "background" | "sleeping",
): PetState {
  if (now <= state.lastEnergyAt) {
    return {
      ...state,
      energy: clamp(state.energy),
      lastEnergyAt: Math.max(state.lastEnergyAt, now),
    };
  }

  return {
    ...state,
    energy: energyAfterElapsed(state.energy, now - state.lastEnergyAt, mode),
    lastEnergyAt: now,
  };
}

export function deriveIdleMood(now: number, energy: number): BaselineMood {
  return energy < 15 || isNight(now) ? "sleepy" : "content";
}

export type Greeting = {
  copyId: "returning" | "returning_long";
  durationMs: number;
};

export function greetingFor(now: number, lastSeenAt: number): Greeting | null {
  if (lastSeenAt <= 0 || now <= lastSeenAt) return null;

  const elapsed = now - lastSeenAt;
  if (elapsed > 3 * DAY) return { copyId: "returning_long", durationMs: 4000 };
  if (elapsed > 6 * HOUR) return { copyId: "returning", durationMs: 4000 };
  return null;
}

export function idleMoodForPhase(now: number, energy: number, fallback?: Mood): Mood {
  return fallback ?? deriveIdleMood(now, energy);
}
