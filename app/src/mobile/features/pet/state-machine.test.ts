import { describe, expect, it } from "vitest";
import { createDefaultSave, defaultPetState, petSaveFromState } from "./persistence";
import { reducePet } from "./state-machine";
import type { PetState } from "./types";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function at(hour: number, minute = 0): number {
  return new Date(2026, 9, 31, hour, minute, 0, 0).getTime();
}

function ready(now: number): PetState {
  return {
    ...defaultPetState(now),
    onboarded: true,
  };
}

describe("pet state machine", () => {
  it("falls asleep after five night minutes without interaction", () => {
    const now = at(23);
    const state = {
      ...ready(now),
      lastInteractionAt: now - 5 * MINUTE - 1,
    };

    const result = reducePet(state, { type: "TICK", now });
    expect(result.state.phase).toBe("sleeping");
    expect(result.state.mood).toBe("sleepy");
  });

  it("wakes up after 06:00", () => {
    const night = at(23);
    const sleeping = reducePet(
      { ...ready(night), lastInteractionAt: night - 6 * MINUTE },
      { type: "TICK", now: night },
    ).state;
    expect(sleeping.phase).toBe("sleeping");

    const morning = new Date(2026, 10, 1, 6, 1, 0, 0).getTime();
    const awake = reducePet(sleeping, { type: "TICK", now: morning });
    expect(awake.state.phase).toBe("idle");
  });

  it("greets after six hours away", () => {
    const now = at(12);
    const away = reducePet(ready(now), { type: "VISIBILITY", now, visible: false });
    expect(away.state.phase).toBe("away");

    const back = reducePet(away.state, {
      type: "VISIBILITY",
      now: now + 7 * HOUR,
      visible: true,
    });
    expect(back.state.phase).toBe("idle");
    expect(back.effects).toContainEqual({
      type: "bubble",
      copyId: "returning",
      durationMs: 4000,
    });
  });

  it("sleeps instead of greeting when returning at night", () => {
    const now = at(23);
    const away = reducePet(ready(now), { type: "VISIBILITY", now, visible: false });
    const back = reducePet(away.state, {
      type: "VISIBILITY",
      now: now + 6 * MINUTE,
      visible: true,
    });

    expect(back.state.phase).toBe("sleeping");
    expect(back.effects.some((effect) => effect.type === "bubble")).toBe(false);
  });

  it("tracks overlay open/close without changing the phase", () => {
    const now = at(12);
    const opened = reducePet(ready(now), { type: "OVERLAY", now: now + 100, open: true });

    expect(opened.state.overlayOpen).toBe(true);
    expect(opened.state.phase).toBe("idle");

    const closed = reducePet(opened.state, { type: "OVERLAY", now: now + 200, open: false });
    expect(closed.state.overlayOpen).toBe(false);
    expect(closed.state.lastInteractionAt).toBe(now + 200);
  });

  it("resets pet data but keeps settings", () => {
    const now = at(12);
    const current = {
      ...ready(now),
      settings: { ...ready(now).settings, haptics: false },
    };

    const reset = reducePet(current, { type: "RESET", now });
    expect(reset.state.onboarded).toBe(false);
    expect(reset.state.settings.haptics).toBe(false);
  });

  it("boots first-run (fixed name, no naming) and marks onboarded", () => {
    const now = at(12);
    const firstRun = reducePet(defaultPetState(now), { type: "BOOT", now, save: null });
    // 首次 BOOT 即「已见过面」；只保留 first_meet 问候气泡。
    expect(firstRun.state.onboarded).toBe(true);
    expect(firstRun.state).not.toHaveProperty("name");
    expect(firstRun.effects).toContainEqual({ type: "bubble", copyId: "first_meet" });

    const saved = petSaveFromState(firstRun.state, now);
    const secondBoot = reducePet(firstRun.state, { type: "BOOT", now: now + 1000, save: saved });
    expect(secondBoot.effects.some((effect) => effect.type === "bubble")).toBe(false);
  });

  it("boots returning and corrupted states", () => {
    const now = at(12);
    const save = createDefaultSave(now - 7 * HOUR);
    save.onboarded = true;
    const greeting = reducePet(defaultPetState(now), { type: "BOOT", now, save });
    expect(greeting.effects).toContainEqual({
      type: "bubble",
      copyId: "returning",
      durationMs: 4000,
    });

    const corrupted = reducePet(defaultPetState(now), {
      type: "BOOT",
      now,
      save: createDefaultSave(now),
      corrupted: true,
    });
    expect(corrupted.effects).toContainEqual({ type: "bubble", copyId: "corrupted" });
  });
});
