import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultSave } from "./persistence";
import { createPetStore } from "./pet-store";
import type { PetSaveV1 } from "./types";

const NOW = new Date(2026, 9, 31, 12, 0, 0, 0).getTime();

function createStorage(initial: unknown = null) {
  let value = initial;
  const load = vi.fn(async (): Promise<{ raw: unknown }> => ({ raw: value }));
  const save = vi.fn(async (saveValue: PetSaveV1): Promise<void> => {
    value = saveValue;
  });
  const clear = vi.fn(async (): Promise<void> => {
    value = null;
  });

  return {
    load,
    save,
    clear,
    value: () => value,
  };
}

function createHaptics() {
  return {
    light: vi.fn(),
    medium: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("pet store", () => {
  it("hydrates once and restores a saved pet", async () => {
    const now = NOW;
    const save = {
      ...createDefaultSave(now),
      onboarded: true,
      name: "小满",
      lastSeenAt: now,
    };
    const storage = createStorage(save);
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });

    await store.getState().hydrate();
    await store.getState().hydrate();

    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().pet.name).toBe("小满");
    expect(storage.load).toHaveBeenCalledTimes(1);
  });

  it("shows a bubble and clears it after four seconds", async () => {
    const now = NOW;
    const save = { ...createDefaultSave(now), onboarded: true, name: "小满", lastSeenAt: now };
    const storage = createStorage(save);
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });
    await store.getState().hydrate();

    store.getState().dispatch({ type: "POKE", now });
    expect(store.getState().bubble?.copyId).toBe("poke");

    vi.advanceTimersByTime(4000);
    expect(store.getState().bubble).toBeNull();
  });

  it("rate-limits bubbles within thirty seconds", async () => {
    let now = NOW;
    const storage = createStorage();
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });
    await store.getState().hydrate();

    store.getState().dispatch({ type: "POKE", now });
    vi.advanceTimersByTime(4000);
    now += 4000;
    store.getState().dispatch({ type: "POKE", now });

    expect(store.getState().bubble).toBeNull();
  });

  it("completes petting from the pet-start timer when the finger stops", async () => {
    const now = NOW;
    const save = { ...createDefaultSave(now), onboarded: true, name: "小满", lastSeenAt: now };
    const storage = createStorage(save);
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });
    await store.getState().hydrate();

    store.getState().handleGesture({ type: "pet-start", at: now });
    vi.advanceTimersByTime(3000);

    expect(store.getState().pet.mood).toBe("happy");
    expect(store.getState().heartBurst?.count).toBe(6);
  });

  it("caps heart bursts at six", async () => {
    let now = NOW;
    const storage = createStorage();
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });
    await store.getState().hydrate();

    store.getState().handleGesture({ type: "pet-start", at: now });
    now += 3000;
    store.getState().handleGesture({ type: "pet-complete", at: now, duration: 3000 });

    expect(store.getState().heartBurst?.count).toBe(6);
    expect(store.getState().pet.mood).toBe("happy");
  });

  it("saves a valid name and rejects an invalid one", async () => {
    const now = NOW;
    const storage = createStorage();
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });
    await store.getState().hydrate();

    await expect(store.getState().setName("小满")).resolves.toBe(true);
    expect(store.getState().pet.name).toBe("小满");
    expect(storage.value()).toMatchObject({ name: "小满", onboarded: true });

    await expect(store.getState().setName("123456789")).resolves.toBe(false);
    expect(store.getState().pet.name).toBe("小满");
  });

  it("rolls settings back when saving fails", async () => {
    const now = NOW;
    const storage = createStorage();
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });
    await store.getState().hydrate();

    storage.save.mockRejectedValueOnce(new Error("disk full"));
    await expect(store.getState().updateSettings({ haptics: false })).resolves.toBe(false);
    expect(store.getState().pet.settings.haptics).toBe(true);
    expect(store.getState().saveStatus).toBe("error");
  });

  it("resets pet data but keeps settings", async () => {
    const now = NOW;
    const storage = createStorage();
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });
    await store.getState().hydrate();

    await store.getState().setName("小满");
    await store.getState().updateSettings({ posture: "handheld" });
    await store.getState().resetPet();

    expect(store.getState().pet.onboarded).toBe(false);
    expect(store.getState().pet.name).toBe("小跟班");
    expect(store.getState().pet.settings.posture).toBe("handheld");
  });

  it("survives a storage load failure", async () => {
    const now = NOW;
    const storage = createStorage();
    storage.load.mockRejectedValueOnce(new Error("unavailable"));
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });

    await store.getState().hydrate();

    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().saveStatus).toBe("error");
    expect(store.getState().pet.onboarded).toBe(false);
  });
});
