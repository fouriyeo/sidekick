import { describe, expect, it } from "vitest";
import {
  deriveIdleMood,
  energyAfterElapsed,
  greetingFor,
  isNight,
  localDateKey,
  recordAffinity,
  settleEnergy,
  timeOfDay,
} from "./mood";
import { defaultPetState } from "./persistence";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function at(hour: number, minute = 0): number {
  return new Date(2026, 9, 31, hour, minute, 0, 0).getTime();
}

describe("time helpers", () => {
  it("detects night and time of day", () => {
    expect(isNight(at(23))).toBe(true);
    expect(isNight(at(2))).toBe(true);
    expect(isNight(at(12))).toBe(false);
    expect(timeOfDay(at(7))).toBe("morning");
    expect(timeOfDay(at(13))).toBe("day");
    expect(timeOfDay(at(20))).toBe("evening");
    expect(timeOfDay(at(23))).toBe("night");
  });

  it("formats a local date key", () => {
    expect(localDateKey(at(9))).toBe("2026-10-31");
  });
});

describe("energy", () => {
  it("applies foreground, background and sleeping rates", () => {
    expect(energyAfterElapsed(100, 30 * MINUTE, "foreground")).toBe(99);
    expect(energyAfterElapsed(100, 2 * HOUR, "background")).toBe(99);
    expect(energyAfterElapsed(50, HOUR, "sleeping")).toBe(55);
  });

  it("clamps and ignores time rollback", () => {
    expect(energyAfterElapsed(0, 30 * MINUTE, "foreground")).toBe(0);
    expect(energyAfterElapsed(100, HOUR, "sleeping")).toBe(100);
    expect(energyAfterElapsed(50, -HOUR, "foreground")).toBe(50);
  });

  it("settles from lastEnergyAt", () => {
    const now = at(12);
    const state = { ...defaultPetState(now), energy: 100, lastEnergyAt: now - 30 * MINUTE };
    expect(settleEnergy(state, now, "foreground").energy).toBe(99);
    expect(settleEnergy(state, now, "foreground").lastEnergyAt).toBe(now);
  });
});

describe("affinity", () => {
  it("adds at most five points per local day", () => {
    let state = { ...defaultPetState(at(10)), affinity: 10 };
    for (let index = 0; index < 7; index += 1) {
      state = recordAffinity(state, at(10));
    }

    expect(state.affinity).toBe(15);
    expect(state.affinityGainedToday).toBe(5);
  });

  it("resets the daily counter on the next day", () => {
    const first = {
      ...defaultPetState(at(10)),
      affinityDate: "2026-10-30",
      affinityGainedToday: 5,
    };
    const next = recordAffinity(first, at(10));
    expect(next.affinityDate).toBe("2026-10-31");
    expect(next.affinityGainedToday).toBe(1);
  });
});

describe("idle mood and greetings", () => {
  it("derives sleepy at night or at low energy", () => {
    expect(deriveIdleMood(at(23), 80)).toBe("sleepy");
    expect(deriveIdleMood(at(12), 10)).toBe("sleepy");
    expect(deriveIdleMood(at(12), 80)).toBe("content");
  });

  it("returns the 6h and 3d greetings", () => {
    expect(greetingFor(at(12), at(12) - 4 * HOUR)).toBeNull();
    expect(greetingFor(at(12), at(12) - 7 * HOUR)).toEqual({
      copyId: "returning",
      durationMs: 4000,
    });
    expect(greetingFor(at(12), at(12) - 4 * 24 * HOUR)).toEqual({
      copyId: "returning_long",
      durationMs: 4000,
    });
    expect(greetingFor(at(12), at(13))).toBeNull();
  });
});
