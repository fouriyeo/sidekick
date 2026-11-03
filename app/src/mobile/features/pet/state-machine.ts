import { deriveIdleMood, greetingFor, isNight, recordAffinity, settleEnergy } from "./mood";
import { defaultPetState, petStateFromSave } from "./persistence";
import type { PetEffect, PetEvent, PetPhase, PetState } from "./types";

const PETTING_MS = 3000;
const INTERACTION_HOLD_MS = 2000;
const POKE_COOLDOWN_MS = 2000;
const NIGHT_SLEEP_MS = 5 * 60_000;
const CELEBRATE_MS = 1500;
const SUCCESS_MS = 2000;
const CONCERN_MS = 1500;

function idleState(state: PetState, now: number): PetState {
  return {
    ...state,
    phase: "idle",
    mood: deriveIdleMood(now, state.energy),
    phaseUntil: 0,
    pettingStartedAt: null,
    pettingCompleted: false,
  };
}

function energyMode(state: PetState): "foreground" | "background" | "sleeping" {
  if (!state.visible) return "background";
  if (state.phase === "sleeping" && !state.overlayOpen) return "sleeping";
  return "foreground";
}

function canInteract(state: PetState): boolean {
  return !state.overlayOpen && state.phase !== "listening" && state.visible;
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
        visible: true,
        overlayOpen: false,
        phaseUntil: 0,
        cooldownUntil: 0,
        pettingStartedAt: null,
        pettingCompleted: false,
        resumeMood: null,
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

    case "NAME_SET": {
      const name = event.name.trim();
      if (!name) return { state, effects: [] };

      return {
        state: {
          ...state,
          name,
          onboarded: true,
          phase: "celebrating",
          mood: "happy",
          phaseUntil: event.now + CELEBRATE_MS,
          pettingStartedAt: null,
          pettingCompleted: false,
          resumeMood: null,
          lastInteractionAt: event.now,
        },
        effects: [
          { type: "bubble", copyId: "named" },
          { type: "hearts", count: 3 },
        ],
      };
    }

    case "PET_START": {
      if (!canInteract(state)) return { state, effects: [] };
      if (event.now < state.cooldownUntil) {
        return { state, effects: [{ type: "haptic", style: "light" }] };
      }

      const effects: PetEffect[] = [
        { type: "haptic", style: "light" },
        { type: "bubble", copyId: "petting" },
      ];

      return {
        state: {
          ...state,
          phase: "interacting",
          mood: "curious",
          pettingStartedAt: event.now,
          pettingCompleted: false,
          phaseUntil: event.now + INTERACTION_HOLD_MS,
          lastInteractionAt: event.now,
        },
        effects,
      };
    }

    case "PET_PROGRESS": {
      if (state.phase !== "interacting" || state.pettingStartedAt === null) {
        return { state, effects: [] };
      }

      if (!state.pettingCompleted && event.now - state.pettingStartedAt >= PETTING_MS) {
        const next = recordAffinity(state, event.now);
        return {
          state: {
            ...next,
            mood: "happy",
            pettingCompleted: true,
            phaseUntil: event.now + INTERACTION_HOLD_MS,
            lastInteractionAt: event.now,
          },
          effects: [
            { type: "hearts", count: 6 },
            { type: "bubble", copyId: "petting_more" },
            { type: "haptic", style: "light" },
          ],
        };
      }

      return {
        state: {
          ...state,
          phaseUntil: event.now + INTERACTION_HOLD_MS,
          lastInteractionAt: event.now,
        },
        effects: [],
      };
    }

    case "PET_END": {
      if (state.pettingStartedAt === null) return { state, effects: [] };

      return {
        state: {
          ...state,
          phase: state.phase === "interacting" ? "interacting" : state.phase,
          phaseUntil: event.now + INTERACTION_HOLD_MS,
          cooldownUntil: event.now + POKE_COOLDOWN_MS,
          pettingStartedAt: null,
          pettingCompleted: false,
          lastInteractionAt: event.now,
        },
        effects: [],
      };
    }

    case "POKE": {
      if (!canInteract(state)) return { state, effects: [] };
      if (event.now < state.cooldownUntil) {
        return { state, effects: [{ type: "haptic", style: "light" }] };
      }

      const effects: PetEffect[] = [
        { type: "haptic", style: "light" },
        { type: "bubble", copyId: "poke" },
      ];

      const next = recordAffinity(state, event.now);
      return {
        state: {
          ...next,
          phase: "interacting",
          mood: "curious",
          pettingStartedAt: null,
          pettingCompleted: false,
          phaseUntil: event.now + INTERACTION_HOLD_MS,
          cooldownUntil: event.now + POKE_COOLDOWN_MS,
          lastInteractionAt: event.now,
        },
        effects,
      };
    }

    case "TICK": {
      let next = settleEnergy(state, event.now, energyMode(state));
      const effects: PetEffect[] = [];

      if (next.phase === "interacting" && next.phaseUntil > 0 && event.now >= next.phaseUntil) {
        next = idleState(next, event.now);
      }

      if (
        (next.phase === "celebrating" || next.phase === "concerned") &&
        next.phaseUntil > 0 &&
        event.now >= next.phaseUntil
      ) {
        next = idleState(next, event.now);
      }

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
          phaseUntil: 0,
          pettingStartedAt: null,
          pettingCompleted: false,
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
          pettingStartedAt: null,
          pettingCompleted: false,
          phaseUntil: 0,
          cooldownUntil: 0,
          resumeMood: null,
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
        pettingStartedAt: null,
        pettingCompleted: false,
        phaseUntil: 0,
        cooldownUntil: 0,
        resumeMood: null,
        lastSeenAt: event.now,
      };

      return { state: next, effects };
    }

    case "OVERLAY": {
      if (event.open === state.overlayOpen) return { state, effects: [] };

      if (event.open) {
        return {
          state: {
            ...state,
            ...(state.phase === "interacting" ? idleState(state, event.now) : {}),
            overlayOpen: true,
            pettingStartedAt: null,
            pettingCompleted: false,
          },
          effects: [],
        };
      }

      return {
        state: { ...state, overlayOpen: false, lastInteractionAt: event.now },
        effects: [],
      };
    }

    case "MIC_START": {
      if (state.phase === "listening") return { state, effects: [] };

      const wasSleeping = state.phase === "sleeping";
      const resumeMood = wasSleeping ? "content" : state.mood;

      return {
        state: {
          ...state,
          phase: "listening",
          mood: "listening",
          resumeMood,
          pettingStartedAt: null,
          pettingCompleted: false,
          phaseUntil: 0,
          lastInteractionAt: event.now,
        },
        effects: [],
      };
    }

    case "MIC_SUCCESS": {
      if (state.phase !== "listening") return { state, effects: [] };

      return {
        state: {
          ...state,
          phase: "celebrating",
          mood: "proud",
          phaseUntil: event.now + SUCCESS_MS,
          resumeMood: null,
          lastInteractionAt: event.now,
        },
        effects: [
          { type: "haptic", style: "success" },
          { type: "bubble", copyId: "mic_success" },
        ],
      };
    }

    case "MIC_CANCEL": {
      if (state.phase !== "listening") return { state, effects: [] };

      return {
        state: {
          ...state,
          phase: "idle",
          mood: state.resumeMood ?? deriveIdleMood(event.now, state.energy),
          resumeMood: null,
          phaseUntil: 0,
          lastInteractionAt: event.now,
        },
        effects: [],
      };
    }

    case "MIC_ERROR": {
      if (state.phase !== "listening") return { state, effects: [] };

      return {
        state: {
          ...state,
          phase: "concerned",
          mood: "concerned",
          phaseUntil: event.now + CONCERN_MS,
          resumeMood: null,
          lastInteractionAt: event.now,
        },
        effects: [
          { type: "haptic", style: "error" },
          { type: "bubble", copyId: "mic_error" },
        ],
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
