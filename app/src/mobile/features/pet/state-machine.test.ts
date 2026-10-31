import { describe, expect, it } from "vitest";
import { createDefaultSave, defaultPetState } from "./persistence";
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
    name: "小满",
  };
}

describe("pet state machine", () => {
  it("reaches happy after three seconds of petting", () => {
    const now = at(12);
    const start = reducePet(ready(now), { type: "PET_START", now });
    expect(start.state.phase).toBe("interacting");
    expect(start.effects).toContainEqual({ type: "rive", trigger: "trigger_pet" });

    const complete = reducePet(start.state, { type: "PET_PROGRESS", now: now + 3000 });
    expect(complete.state.mood).toBe("happy");
    expect(complete.state.pettingCompleted).toBe(true);
    expect(complete.state.affinity).toBe(1);
    expect(complete.effects).toContainEqual({ type: "hearts", count: 6 });
  });

  it("returns to idle two seconds after the pointer is released", () => {
    const now = at(12);
    const start = reducePet(ready(now), { type: "PET_START", now });
    const end = reducePet(start.state, { type: "PET_END", now: now + 3200 });
    expect(end.state.cooldownUntil).toBe(now + 5200);

    const idle = reducePet(end.state, { type: "TICK", now: now + 5300 });
    expect(idle.state.phase).toBe("idle");
  });

  it("ignores a second poke during cooldown", () => {
    const now = at(12);
    const first = reducePet(ready(now), { type: "POKE", now });
    expect(first.state.phase).toBe("interacting");
    expect(first.state.mood).toBe("curious");

    const second = reducePet(first.state, { type: "POKE", now: now + 1000 });
    expect(second.state.mood).toBe("curious");
    expect(second.effects).toEqual([{ type: "haptic", style: "light" }]);
  });

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
    expect(awake.effects).toContainEqual({ type: "rive", trigger: "trigger_wake" });
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

  it("pauses petting when an overlay opens", () => {
    const now = at(12);
    const poke = reducePet(ready(now), { type: "POKE", now });
    const overlay = reducePet(poke.state, { type: "OVERLAY", now: now + 100, open: true });

    expect(overlay.state.overlayOpen).toBe(true);
    expect(overlay.state.phase).toBe("idle");
    expect(overlay.state.pettingStartedAt).toBeNull();

    const closed = reducePet(overlay.state, { type: "OVERLAY", now: now + 200, open: false });
    expect(closed.state.overlayOpen).toBe(false);
  });

  it("supports the reserved microphone transitions", () => {
    const now = at(12);
    const listening = reducePet(ready(now), { type: "MIC_START", now });
    expect(listening.state.phase).toBe("listening");
    expect(listening.state.mood).toBe("listening");
    expect(listening.state.resumeMood).toBe("content");

    const success = reducePet(listening.state, { type: "MIC_SUCCESS", now: now + 1000 });
    expect(success.state.phase).toBe("celebrating");
    expect(success.state.mood).toBe("proud");

    const cancel = reducePet(listening.state, { type: "MIC_CANCEL", now: now + 1000 });
    expect(cancel.state.phase).toBe("idle");
    expect(cancel.effects.some((effect) => effect.type === "bubble")).toBe(false);

    const error = reducePet(listening.state, { type: "MIC_ERROR", now: now + 1000 });
    expect(error.state.phase).toBe("concerned");
    expect(error.state.mood).toBe("concerned");
  });

  it("sets the name and resets the pet", () => {
    const now = at(12);
    const named = reducePet(
      { ...ready(now), onboarded: false, name: "小跟班" },
      { type: "NAME_SET", now, name: "小满", skipped: false },
    );
    expect(named.state.onboarded).toBe(true);
    expect(named.state.name).toBe("小满");
    expect(named.state.phase).toBe("celebrating");
    expect(named.effects).toContainEqual({ type: "bubble", copyId: "named" });

    const reset = reducePet(
      {
        ...named.state,
        settings: { ...named.state.settings, posture: "handheld" },
      },
      { type: "RESET", now },
    );
    expect(reset.state.onboarded).toBe(false);
    expect(reset.state.name).toBe("小跟班");
    expect(reset.state.settings.posture).toBe("handheld");
  });

  it("boots first-run, greeting and corrupted states", () => {
    const now = at(12);
    const firstRun = reducePet(defaultPetState(now), { type: "BOOT", now, save: null });
    expect(firstRun.state.onboarded).toBe(false);
    expect(firstRun.effects).toContainEqual({ type: "bubble", copyId: "first_meet" });

    const save = createDefaultSave(now - 7 * HOUR);
    save.onboarded = true;
    save.name = "小满";
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

  it("persists the manually selected posture", () => {
    const now = at(12);
    const result = reducePet(ready(now), { type: "SET_POSTURE", now, posture: "handheld" });
    expect(result.state.settings.posture).toBe("handheld");
  });
});
