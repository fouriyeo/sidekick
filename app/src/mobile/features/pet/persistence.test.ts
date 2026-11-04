import { describe, expect, it } from "vitest";
import {
  createDefaultSave,
  createMemoryPetStorage,
  defaultPetState,
  parsePetSave,
  petSaveFromState,
  petStateFromSave,
} from "./persistence";

const NOW = new Date(2026, 9, 31, 12, 0, 0, 0).getTime();

describe("pet persistence", () => {
  it("creates a first-run save and state", () => {
    const save = createDefaultSave(NOW);
    const state = defaultPetState(NOW);

    expect(save).toMatchObject({
      version: 1,
      onboarded: false,
      energy: 100,
    });
    expect(save).not.toHaveProperty("name");
    expect(save).not.toHaveProperty("affinity");
    expect(state).not.toHaveProperty("name");
    expect(state.onboarded).toBe(false);
    expect(state.settings.dimMinutes).toBe(5);
    expect(state.settings.keepAwakeHours).toBe(2);
  });

  it("round-trips a save without transient state", () => {
    const state = {
      ...defaultPetState(NOW),
      onboarded: true,
      phase: "idle" as const,
      mood: "sleepy" as const,
      energy: 42,
    };

    const save = petSaveFromState(state, NOW);
    expect(save.mood).toBe("sleepy");
    expect(save.lastSeenAt).toBe(NOW);
    expect(save).not.toHaveProperty("name");

    const restored = petStateFromSave(save);
    expect(restored.energy).toBe(42);
    expect(restored.onboarded).toBe(true);
    expect(restored).not.toHaveProperty("name");
  });

  it("returns null for a fresh install", () => {
    expect(parsePetSave(null, NOW)).toEqual({ save: null, corrupted: false });
  });

  it("recovers from corrupt JSON", () => {
    const parsed = parsePetSave("{broken", NOW);
    expect(parsed.corrupted).toBe(true);
    expect(parsed.save?.onboarded).toBe(false);
    expect(parsed.save).not.toHaveProperty("name");
  });

  it("falls back to defaults for unknown versions", () => {
    const parsed = parsePetSave({ version: 0, name: "小满", energy: 42 }, NOW);
    expect(parsed.corrupted).toBe(true);
    expect(parsed.save).not.toHaveProperty("name");
    expect(parsed.save?.energy).toBe(100);
    expect(parsed.save?.onboarded).toBe(false);
  });

  it("ignores the removed name field and restores everything else", () => {
    const parsed = parsePetSave(
      {
        version: 1,
        onboarded: true,
        name: "小满",
        mood: "sleepy",
        energy: 42,
        lastSeenAt: NOW - 1000,
        lastInteractionAt: NOW - 2000,
        lastEnergyAt: NOW - 3000,
        settings: { haptics: false, dimMinutes: 10 },
      },
      NOW,
    );

    // 旧 name 字段忽略、不迁移；存档 version 仍 1，其他字段照常恢复。
    expect(parsed.corrupted).toBe(false);
    expect(parsed.save).not.toHaveProperty("name");
    expect(parsed.save).toMatchObject({
      version: 1,
      onboarded: true,
      mood: "sleepy",
      energy: 42,
      lastSeenAt: NOW - 1000,
      lastInteractionAt: NOW - 2000,
      lastEnergyAt: NOW - 3000,
    });
    expect(parsed.save?.settings.haptics).toBe(false);
    expect(parsed.save?.settings.dimMinutes).toBe(10);
  });

  it("ignores removed fields and clamps values", () => {
    const parsed = parsePetSave(
      {
        version: 1,
        energy: 200,
        affinity: -4,
        affinityGainedToday: 9,
        settings: { posture: "auto", haptics: false },
      },
      NOW,
    );

    expect(parsed.save?.energy).toBe(100);
    expect(parsed.save).not.toHaveProperty("affinity");
    expect(parsed.save?.settings).not.toHaveProperty("posture");
    expect(parsed.save?.settings.haptics).toBe(false);
    expect(parsed.save?.settings.keepAwake).toBe(true);
    expect(parsed.save?.settings.dimMinutes).toBe(5);
    expect(parsed.save?.settings.keepAwakeHours).toBe(2);
  });

  it("normalizes 变暗分钟数与常亮小时数，越界夹紧", () => {
    const parsed = parsePetSave(
      {
        version: 1,
        settings: { dimMinutes: 99, keepAwakeHours: -3 },
      },
      NOW,
    );

    expect(parsed.save?.settings.dimMinutes).toBe(60);
    expect(parsed.save?.settings.keepAwakeHours).toBe(0);

    const fallback = parsePetSave(
      { version: 1, settings: { dimMinutes: "soon", keepAwakeHours: null } },
      NOW,
    );
    expect(fallback.save?.settings.dimMinutes).toBe(5);
    expect(fallback.save?.settings.keepAwakeHours).toBe(2);
  });

  it("normalizes keepAwake: legacy 未接入 值落到默认开，显式关闭保留", () => {
    const legacy = parsePetSave({ version: 1, settings: { keepAwake: "never" } }, NOW);
    expect(legacy.save?.settings.keepAwake).toBe(true);

    const off = parsePetSave({ version: 1, settings: { keepAwake: false } }, NOW);
    expect(off.save?.settings.keepAwake).toBe(false);
  });

  it("provides a memory storage adapter", async () => {
    const storage = createMemoryPetStorage();
    expect((await storage.load()).raw).toBeNull();
    const save = createDefaultSave(NOW);
    await storage.save(save);
    expect((await storage.load()).raw).toEqual(save);
    await storage.clear();
    expect((await storage.load()).raw).toBeNull();
  });
});
