import { deriveIdleMood, greetingFor, isNight, settleEnergy } from "./mood";
import { defaultPetState, petStateFromSave } from "./persistence";
import type { PetEffect, PetEvent, PetPhase, PetState } from "./types";

const NIGHT_SLEEP_MS = 5 * 60_000;

function idleState(state: PetState, now: number): PetState {
  return {
    ...state,
    phase: "idle",
    mood: deriveIdleMood(now, state.energy),
  };
}

function energyMode(state: PetState): "foreground" | "background" | "sleeping" {
  if (!state.visible) return "background";
  if (state.phase === "sleeping" && !state.overlayOpen) return "sleeping";
  return "foreground";
}

export function reducePet(
  state: PetState,
  event: PetEvent,
): { state: PetState; effects: PetEffect[] } {
  switch (event.type) {
    case "BOOT": {
      const now = event.now;
      const base = event.save ? petStateFromSave(event.save) : defaultPetState(now);
      const previousLastSeenAt = event.save?.lastSeenAt ?? base.lastSeenAt;
      const wasOnboarded = base.onboarded;
      let next: PetState = {
        ...base,
        phase: "idle",
        // 首次 BOOT 一次就算「已见过面」，之后不再重复问候。
        onboarded: true,
        visible: true,
        overlayOpen: false,
        lastSeenAt: now,
      };

      if (event.save) {
        next = settleEnergy(next, now, "background");
      }

      const sleptWhileAway =
        wasOnboarded && isNight(now) && now - previousLastSeenAt >= NIGHT_SLEEP_MS;
      if (sleptWhileAway) {
        next = { ...next, phase: "sleeping", mood: "sleepy" };
      } else if (wasOnboarded) {
        next = { ...next, mood: deriveIdleMood(now, next.energy) };
      } else {
        next = { ...next, mood: "curious" };
      }

      const effects: PetEffect[] = [];
      if (event.corrupted) {
        effects.push({ type: "bubble", copyId: "corrupted" });
      } else if (!wasOnboarded) {
        effects.push({ type: "bubble", copyId: "first_meet" });
      } else if (!sleptWhileAway) {
        const greeting = greetingFor(now, previousLastSeenAt);
        if (greeting) {
          effects.push({
            type: "bubble",
            copyId: greeting.copyId,
            durationMs: greeting.durationMs,
          });
        }
      }

      return { state: next, effects };
    }

    case "TICK": {
      let next = settleEnergy(state, event.now, energyMode(state));
      const effects: PetEffect[] = [];

      if (next.phase === "sleeping" && !isNight(event.now)) {
        next = idleState(next, event.now);
      } else if (
        next.phase === "idle" &&
        next.visible &&
        !next.overlayOpen &&
        isNight(event.now) &&
        event.now - next.lastInteractionAt >= NIGHT_SLEEP_MS
      ) {
        next = {
          ...next,
          phase: "sleeping",
          mood: "sleepy",
        };
      } else if (next.phase === "sleeping") {
        next = { ...next, mood: "sleepy" };
      } else if (next.phase === "idle") {
        next = { ...next, mood: deriveIdleMood(event.now, next.energy) };
      }

      return { state: next, effects };
    }

    case "VISIBILITY": {
      if (!event.visible) {
        if (state.phase === "away") return { state, effects: [] };

        let next = settleEnergy(state, event.now, "foreground");
        const effects: PetEffect[] = [];

        next = {
          ...next,
          phase: "away",
          visible: false,
          overlayOpen: false,
          lastSeenAt: event.now,
          lastEnergyAt: event.now,
        };
        return { state: next, effects };
      }

      if (state.visible) return { state, effects: [] };

      let next = settleEnergy(state, event.now, "background");
      const previousLastSeenAt = state.lastSeenAt;
      const elapsed = event.now - previousLastSeenAt;
      const effects: PetEffect[] = [];
      let phase: PetPhase = "idle";
      let mood = deriveIdleMood(event.now, next.energy);

      if (next.onboarded && isNight(event.now) && elapsed >= NIGHT_SLEEP_MS) {
        phase = "sleeping";
        mood = "sleepy";
      } else if (next.onboarded) {
        const greeting = greetingFor(event.now, previousLastSeenAt);
        if (greeting) {
          effects.push({
            type: "bubble",
            copyId: greeting.copyId,
            durationMs: greeting.durationMs,
          });
        }
      }

      next = {
        ...next,
        phase,
        mood,
        visible: true,
        overlayOpen: false,
        lastSeenAt: event.now,
      };

      return { state: next, effects };
    }

    case "OVERLAY": {
      if (event.open === state.overlayOpen) return { state, effects: [] };

      if (event.open) {
        return { state: { ...state, overlayOpen: true }, effects: [] };
      }

      return {
        state: { ...state, overlayOpen: false, lastInteractionAt: event.now },
        effects: [],
      };
    }

    case "RESET": {
      return {
        state: {
          ...defaultPetState(event.now),
          settings: { ...state.settings },
          visible: state.visible,
          overlayOpen: state.overlayOpen,
        },
        effects: [],
      };
    }

    default: {
      return { state, effects: [] };
    }
  }
}
