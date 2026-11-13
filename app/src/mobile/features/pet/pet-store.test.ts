import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary, StatusMessage, StatusState } from "@/protocol/messages";
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
      energy: 42,
      lastSeenAt: now,
    };
    const storage = createStorage(save);
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });

    await store.getState().hydrate();
    await store.getState().hydrate();

    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().pet.energy).toBe(42);
    expect(store.getState().pet).not.toHaveProperty("name");
    expect(storage.load).toHaveBeenCalledTimes(1);
  });

  it("restores an old save that still carries a name", async () => {
    const now = NOW;
    const storage = createStorage({
      version: 1,
      onboarded: true,
      name: "小满",
      mood: "content",
      energy: 42,
      lastSeenAt: now,
      lastInteractionAt: now,
      lastEnergyAt: now,
      settings: { haptics: false, sound: true, dimMinutes: 10, keepAwakeHours: 4 },
    });
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });

    await expect(store.getState().hydrate()).resolves.toBeUndefined();

    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().pet.energy).toBe(42);
    expect(store.getState().pet).not.toHaveProperty("name");
    expect(store.getState().pet.settings.haptics).toBe(false);
    expect(store.getState().pet.settings.sound).toBe(true);
    expect(store.getState().pet.settings.dimMinutes).toBe(10);
    expect(store.getState().pet.settings.keepAwakeHours).toBe(4);
    // 旧 name 不迁移，下一次落盘也不再有 name。
    await store.getState().flush();
    expect(storage.value()).not.toHaveProperty("name");
  });

  it("first boot greets once, marks onboarded and persists it", async () => {
    const now = NOW;
    const storage = createStorage();
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });

    await store.getState().hydrate();

    expect(store.getState().bubble?.copyId).toBe("first_meet");
    expect(store.getState().bubble?.text).toBe("你来了。我是小跟班。");
    expect(store.getState().pet.onboarded).toBe(true);

    await store.getState().flush();
    expect(storage.value()).toMatchObject({ version: 1, onboarded: true });
    expect(storage.value()).not.toHaveProperty("name");
  });

  it("shows a bubble and clears it after four seconds", async () => {
    const now = NOW;
    const store = createPetStore({
      storage: createStorage(),
      haptics: createHaptics(),
      now: () => now,
    });
    await store.getState().hydrate();

    store.getState().dispatch({ type: "BOOT", now, save: null });
    expect(store.getState().bubble?.copyId).toBe("first_meet");

    vi.advanceTimersByTime(4000);
    expect(store.getState().bubble).toBeNull();
  });

  it("rate-limits bubbles within thirty seconds", async () => {
    let now = NOW;
    const storage = createStorage();
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });
    await store.getState().hydrate();

    store.getState().dispatch({ type: "BOOT", now, save: null });
    expect(store.getState().bubble?.copyId).toBe("first_meet");

    vi.advanceTimersByTime(4000);
    expect(store.getState().bubble).toBeNull();

    now += 4000;
    store.getState().dispatch({ type: "BOOT", now, save: null });
    expect(store.getState().bubble).toBeNull();
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

    await store.getState().updateSettings({ haptics: false });
    await store.getState().resetPet();

    expect(store.getState().pet.onboarded).toBe(false);
    expect(store.getState().pet.settings.haptics).toBe(false);
    expect(store.getState().bubble).toBeNull();
  });

  it("survives a storage load failure", async () => {
    const now = NOW;
    const storage = createStorage();
    storage.load.mockRejectedValueOnce(new Error("unavailable"));
    const store = createPetStore({ storage, haptics: createHaptics(), now: () => now });

    await store.getState().hydrate();

    expect(store.getState().hydrated).toBe(true);
    expect(store.getState().saveStatus).toBe("error");
    // 存储读失败也会走一次 BOOT：没有可迁移的用户数据，按首次见面对待。
    expect(store.getState().pet.onboarded).toBe(true);
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
      .applyAiStatus(aiMessage("completed", { resume: "idle", ts: clock.now - 9000 }), {
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

  describe("开工音按会话触发", () => {
    function sessionSummary(
      id: string,
      state: "working" | "idle" | "asking" = "working",
    ): SessionSummary {
      return {
        id,
        title: id,
        source: "dsh",
        state,
        askKind: null,
        lastEventAt: NOW,
        completedAt: null,
      };
    }

    it("聚合已是 working 时，新会话开工也响开工音", async () => {
      const { store, sounds, clock } = await createAiStore();

      store.getState().applyAiStatus(aiMessage("working", { sessionList: [sessionSummary("a")] }), {
        now: clock.now,
      });
      expect(sounds.playWork).toHaveBeenCalledTimes(1);

      sounds.playWork.mockClear();
      clock.now = NOW + 6000;
      store
        .getState()
        .applyAiStatus(
          aiMessage("working", { sessionList: [sessionSummary("a"), sessionSummary("b")] }),
          { now: clock.now },
        );

      expect(store.getState().ai.state).toBe("working");
      expect(sounds.playWork).toHaveBeenCalledTimes(1);
    });

    it("同一份会话列表的心跳不重复响；新开工 5 秒内最多一次", async () => {
      const { store, sounds, clock } = await createAiStore();

      store
        .getState()
        .applyAiStatus(
          aiMessage("working", { sessionList: [sessionSummary("a"), sessionSummary("b")] }),
          { now: clock.now },
        );
      sounds.playWork.mockClear();

      // 1 秒后新会话 c 开工：被 5 秒限流吞掉，但仍进入基线。
      clock.now = NOW + 1000;
      store.getState().applyAiStatus(
        aiMessage("working", {
          sessionList: [sessionSummary("a"), sessionSummary("b"), sessionSummary("c")],
        }),
        { now: clock.now },
      );
      expect(sounds.playWork).not.toHaveBeenCalled();

      // 心跳重复同一列表：不响。
      clock.now = NOW + 5000;
      store.getState().applyAiStatus(
        aiMessage("working", {
          sessionList: [sessionSummary("a"), sessionSummary("b"), sessionSummary("c")],
        }),
        { now: clock.now },
      );
      expect(sounds.playWork).not.toHaveBeenCalled();

      // 限流窗口过后新会话 d 开工：重新响一次。
      clock.now = NOW + 12_000;
      store.getState().applyAiStatus(
        aiMessage("working", {
          sessionList: [
            sessionSummary("a"),
            sessionSummary("b"),
            sessionSummary("c"),
            sessionSummary("d"),
          ],
        }),
        { now: clock.now },
      );
      expect(sounds.playWork).toHaveBeenCalledTimes(1);
    });

    it("会话完成后再开工（聚合仍 working）会重新响", async () => {
      const { store, sounds, clock } = await createAiStore();

      store
        .getState()
        .applyAiStatus(
          aiMessage("working", { sessionList: [sessionSummary("a"), sessionSummary("b")] }),
          { now: clock.now },
        );
      sounds.playWork.mockClear();

      clock.now = NOW + 6000;
      store.getState().applyAiStatus(
        aiMessage("working", {
          sessionList: [sessionSummary("a"), sessionSummary("b", "idle")],
        }),
        { now: clock.now },
      );
      expect(sounds.playWork).not.toHaveBeenCalled();

      clock.now = NOW + 7000;
      store
        .getState()
        .applyAiStatus(
          aiMessage("working", { sessionList: [sessionSummary("a"), sessionSummary("b")] }),
          { now: clock.now },
        );
      expect(sounds.playWork).toHaveBeenCalledTimes(1);
    });

    it("首份列表不会因为基线初始化额外响一次", async () => {
      const { store, sounds, clock } = await createAiStore();

      store
        .getState()
        .applyAiStatus(
          aiMessage("working", { sessionList: [sessionSummary("a"), sessionSummary("b")] }),
          { now: clock.now },
        );

      // 只有聚合 idle→working 的那一次，不因两条会话重复计数。
      expect(sounds.playWork).toHaveBeenCalledTimes(1);
    });
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
