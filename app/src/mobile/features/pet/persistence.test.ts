import { describe, expect, it } from "vitest";
import {
  createDefaultSave,
  createMemoryPetStorage,
  defaultPetState,
  normalizeName,
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
      name: "小跟班",
      energy: 100,
      affinity: 0,
    });
    expect(state.onboarded).toBe(false);
    expect(state.settings.posture).toBe("docked");
    expect(state.settings.dimMinutes).toBe(5);
    expect(state.settings.keepAwakeHours).toBe(2);
  });

  it("round-trips a save without transient state", () => {
    const state = {
      ...defaultPetState(NOW),
      onboarded: true,
      name: "小满",
      phase: "idle" as const,
      mood: "sleepy" as const,
      energy: 42,
      affinity: 12,
      affinityDate: "2026-10-31",
      affinityGainedToday: 3,
    };

    const save = petSaveFromState(state, NOW);
    expect(save.mood).toBe("sleepy");
    expect(save.lastSeenAt).toBe(NOW);

    const restored = petStateFromSave(save);
    expect(restored.name).toBe("小满");
    expect(restored.energy).toBe(42);
    expect(restored.onboarded).toBe(true);
  });

  it("returns null for a fresh install", () => {
    expect(parsePetSave(null, NOW)).toEqual({ save: null, corrupted: false });
  });

  it("recovers from corrupt JSON", () => {
    const parsed = parsePetSave("{broken", NOW);
    expect(parsed.corrupted).toBe(true);
    expect(parsed.save?.name).toBe("小跟班");
    expect(parsed.save?.onboarded).toBe(false);
  });

  it("migrates unknown versions and keeps a valid name", () => {
    const parsed = parsePetSave({ version: 0, name: "小满" }, NOW);
    expect(parsed.corrupted).toBe(true);
    expect(parsed.save?.name).toBe("小满");
    expect(parsed.save?.onboarded).toBe(true);
  });

  it("maps auto posture to docked and clamps values", () => {
    const parsed = parsePetSave(
      {
        version: 1,
        name: "小满",
        energy: 200,
        affinity: -4,
        affinityGainedToday: 9,
        settings: { posture: "auto", haptics: false },
      },
      NOW,
    );

    expect(parsed.save?.energy).toBe(100);
    expect(parsed.save?.affinity).toBe(0);
    expect(parsed.save?.affinityGainedToday).toBe(5);
    expect(parsed.save?.settings.posture).toBe("docked");
    expect(parsed.save?.settings.haptics).toBe(false);
    expect(parsed.save?.settings.keepAwake).toBe(true);
    expect(parsed.save?.settings.dimMinutes).toBe(5);
    expect(parsed.save?.settings.keepAwakeHours).toBe(2);
  });

  it("normalizes 变暗分钟数与常亮小时数，越界夹紧", () => {
    const parsed = parsePetSave(
      {
        version: 1,
        name: "小满",
        settings: { dimMinutes: 99, keepAwakeHours: -3 },
      },
      NOW,
    );

    expect(parsed.save?.settings.dimMinutes).toBe(60);
    expect(parsed.save?.settings.keepAwakeHours).toBe(0);

    const fallback = parsePetSave(
      { version: 1, name: "小满", settings: { dimMinutes: "soon", keepAwakeHours: null } },
      NOW,
    );
    expect(fallback.save?.settings.dimMinutes).toBe(5);
    expect(fallback.save?.settings.keepAwakeHours).toBe(2);
  });

  it("normalizes keepAwake: legacy 未接入 值落到默认开，显式关闭保留", () => {
    const legacy = parsePetSave(
      { version: 1, name: "小满", settings: { keepAwake: "never" } },
      NOW,
    );
    expect(legacy.save?.settings.keepAwake).toBe(true);

    const off = parsePetSave({ version: 1, name: "小满", settings: { keepAwake: false } }, NOW);
    expect(off.save?.settings.keepAwake).toBe(false);
  });

  it("validates names", () => {
    expect(normalizeName("  小满  ")).toBe("小满");
    expect(normalizeName("12345678")).toBe("12345678");
    expect(normalizeName("123456789")).toBeNull();
    expect(normalizeName("  ")).toBeNull();
    expect(normalizeName("a\nb")).toBeNull();
    expect(normalizeName("https://example.com")).toBeNull();
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
