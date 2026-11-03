import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusMessage, StatusState } from "@/protocol/messages";
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
    await store.getState().updateSettings({ haptics: false });
    await store.getState().resetPet();

    expect(store.getState().pet.onboarded).toBe(false);
    expect(store.getState().pet.name).toBe("小跟班");
    expect(store.getState().pet.settings.haptics).toBe(false);
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

function createFakeSounds() {
  return {
    unlock: vi.fn(),
    playWork: vi.fn(() => true),
    playComplete: vi.fn(() => true),
    startAsking: vi.fn(),
    stopAsking: vi.fn(),
  };
}

function aiMessage(state: StatusState, overrides: Partial<StatusMessage> = {}): StatusMessage {
  return {
    type: "status",
    v: 1,
    source: "dsh",
    state,
    sessions: 1,
    ts: NOW,
    ...overrides,
  };
}

type AiStoreOptions = {
  haptics?: boolean;
  appVisible?: boolean;
};

async function createAiStore(options: AiStoreOptions = {}) {
  const clock = { now: NOW };
  const storage = createStorage();
  const haptics = createHaptics();
  const sounds = createFakeSounds();
  const store = createPetStore({
    storage,
    haptics,
    now: () => clock.now,
    sounds,
    isAppVisible: () => options.appVisible ?? true,
  });

  await store.getState().hydrate();

  if (options.haptics === false) {
    await store.getState().updateSettings({ haptics: false });
    haptics.light.mockClear();
    haptics.success.mockClear();
  }

  return { store, storage, haptics, sounds, clock };
}

describe("pet store AI 联动", () => {
  it("进入 working：展示 5 秒文案并播放开工音", async () => {
    const { store, sounds, clock } = await createAiStore();

    store.getState().applyAiStatus(aiMessage("working"), { now: clock.now });

    expect(store.getState().ai.state).toBe("working");
    expect(store.getState().aiCaption?.copyId).toBe("ai_working");
    expect(sounds.playWork).toHaveBeenCalledTimes(1);

    clock.now = NOW + 5000;
    vi.advanceTimersByTime(5000);

    expect(store.getState().aiCaption).toBeNull();
    expect(store.getState().ai.state).toBe("working");
  });

  it("进入 asking：两次轻震 + 提问音，文案与状态一直保留", async () => {
    const { store, haptics, sounds, clock } = await createAiStore();

    store.getState().applyAiStatus(aiMessage("asking"), { now: clock.now });

    expect(store.getState().ai.state).toBe("asking");
    expect(store.getState().aiCaption?.copyId).toBe("ai_asking");
    expect(haptics.light).toHaveBeenCalledTimes(2);
    expect(sounds.startAsking).toHaveBeenCalledTimes(1);

    clock.now = NOW + 60 * 60_000;
    vi.advanceTimersByTime(60 * 60_000);

    expect(store.getState().ai.state).toBe("asking");
    expect(store.getState().aiCaption?.copyId).toBe("ai_asking");
  });

  it("completed：成功触感 + 完成音，3 秒后回到 resume 并清掉文案", async () => {
    const { store, haptics, sounds, clock } = await createAiStore();

    store.getState().applyAiStatus(aiMessage("working"), { now: clock.now });
    store.getState().applyAiStatus(aiMessage("completed", { resume: "working" }), {
      now: clock.now,
    });

    expect(store.getState().ai.state).toBe("completed");
    expect(store.getState().aiCaption?.copyId).toBe("ai_completed");
    expect(haptics.success).toHaveBeenCalledTimes(1);
    expect(sounds.playComplete).toHaveBeenCalledTimes(1);

    clock.now = NOW + 3000;
    vi.advanceTimersByTime(3000);

    expect(store.getState().ai.state).toBe("working");
    expect(store.getState().aiCaption).toBeNull();
  });

  it("过期的 completed 不重播触感/音效", async () => {
    const { store, haptics, sounds, clock } = await createAiStore();

    store.getState().applyAiStatus(aiMessage("asking"), { now: clock.now });
    haptics.success.mockClear();
    sounds.playWork.mockClear();
    sounds.playComplete.mockClear();

    store
      .getState()
      .applyAiStatus(aiMessage("completed", { resume: "idle", ts: clock.now - 5000 }), {
        now: clock.now,
      });

    expect(store.getState().ai.state).toBe("asking");
    expect(store.getState().aiCaption?.copyId).toBe("ai_asking");
    expect(haptics.success).not.toHaveBeenCalled();
    expect(sounds.playWork).not.toHaveBeenCalled();
    expect(sounds.playComplete).not.toHaveBeenCalled();
  });

  it("新状态取消旧的 completed 计时", async () => {
    const { store, clock } = await createAiStore();

    store.getState().applyAiStatus(aiMessage("completed", { resume: "idle" }), {
      now: clock.now,
    });
    store.getState().applyAiStatus(aiMessage("asking"), { now: clock.now + 500 });

    clock.now += 5000;
    vi.advanceTimersByTime(5000);

    expect(store.getState().ai.state).toBe("asking");
    expect(store.getState().ai.completedUntil).toBeNull();
  });

  it("从 asking/completed 切到 working 不补开工音", async () => {
    const { store, sounds, clock } = await createAiStore();

    store.getState().applyAiStatus(aiMessage("asking"), { now: clock.now });
    sounds.playWork.mockClear();
    store.getState().applyAiStatus(aiMessage("working"), { now: clock.now });

    expect(sounds.playWork).not.toHaveBeenCalled();
    expect(sounds.stopAsking).toHaveBeenCalled();

    store.getState().applyAiStatus(aiMessage("completed", { resume: "idle" }), {
      now: clock.now,
    });
    sounds.playWork.mockClear();
    store.getState().applyAiStatus(aiMessage("working"), { now: clock.now });
    expect(sounds.playWork).not.toHaveBeenCalled();
  });

  it("关闭震动、后台或录音中都不发 AI 触感", async () => {
    const disabled = await createAiStore({ haptics: false });
    disabled.store.getState().applyAiStatus(aiMessage("asking"), { now: disabled.clock.now });
    disabled.store
      .getState()
      .applyAiStatus(aiMessage("completed", { resume: "idle" }), { now: disabled.clock.now });
    expect(disabled.haptics.light).not.toHaveBeenCalled();
    expect(disabled.haptics.success).not.toHaveBeenCalled();

    const background = await createAiStore({ appVisible: false });
    background.store.getState().applyAiStatus(aiMessage("completed", { resume: "idle" }), {
      now: background.clock.now,
    });
    expect(background.haptics.success).not.toHaveBeenCalled();

    const mic = await createAiStore();
    mic.store.getState().applyAiStatus(aiMessage("completed", { resume: "idle" }), {
      now: mic.clock.now,
      micListening: true,
    });
    expect(mic.haptics.success).not.toHaveBeenCalled();
    expect(mic.store.getState().micListening).toBe(true);
  });

  it("切后台立即结束 completed 姿态，回前台不重播", async () => {
    const { store, haptics, clock } = await createAiStore();

    store.getState().applyAiStatus(aiMessage("completed", { resume: "idle" }), {
      now: clock.now,
    });
    expect(store.getState().ai.state).toBe("completed");

    store.getState().dispatch({ type: "VISIBILITY", now: clock.now, visible: false });
    expect(store.getState().ai.state).toBe("idle");
    expect(store.getState().aiCaption).toBeNull();

    store.getState().dispatch({ type: "VISIBILITY", now: clock.now + 1000, visible: true });
    clock.now += 4000;
    vi.advanceTimersByTime(4000);

    expect(store.getState().ai.state).toBe("idle");
    expect(haptics.success).toHaveBeenCalledTimes(1);
  });

  it("切后台再回前台，asking 文案恢复并补一次提问音", async () => {
    const { store, sounds, clock } = await createAiStore();

    store.getState().applyAiStatus(aiMessage("asking"), { now: clock.now });
    expect(sounds.startAsking).toHaveBeenCalledTimes(1);

    store.getState().dispatch({ type: "VISIBILITY", now: clock.now, visible: false });
    expect(store.getState().aiCaption).toBeNull();
    expect(store.getState().ai.state).toBe("asking");

    store.getState().dispatch({ type: "VISIBILITY", now: clock.now + 1000, visible: true });
    expect(store.getState().aiCaption?.copyId).toBe("ai_asking");
    expect(sounds.startAsking).toHaveBeenCalledTimes(2);
  });

  it("录音开始会停掉排队中的提问提醒", async () => {
    const { store, sounds } = await createAiStore();

    store.getState().setMicListening(true);
    expect(store.getState().micListening).toBe(true);
    expect(sounds.stopAsking).toHaveBeenCalledTimes(1);

    store.getState().setMicListening(false);
    expect(store.getState().micListening).toBe(false);
  });

  it("AI 状态不写进存档（PetSaveV1 不变）", async () => {
    const { store, storage, clock } = await createAiStore();

    store.getState().applyAiStatus(aiMessage("working"), { now: clock.now });
    await store.getState().flush();

    const saved = storage.value() as Record<string, unknown>;
    expect(saved).not.toHaveProperty("ai");
    expect(saved).not.toHaveProperty("aiCaption");
    expect(saved.version).toBe(1);
  });
});
