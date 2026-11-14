import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASK_REPEAT_MS,
  createPetSounds,
  PET_SOUND_LABEL,
  type PetSoundGates,
  previewPetSound,
} from "./sound";

type FakeParam = {
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
};

type FakeOscillator = {
  type: string;
  frequency: FakeParam;
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  currentTime = 0;
  state: AudioContextState = "running";
  destination = { connect: vi.fn() };
  oscillators: FakeOscillator[] = [];
  gains: FakeParam[] = [];
  resume = vi.fn(async () => undefined);
  close = vi.fn(async () => undefined);

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createOscillator(): FakeOscillator {
    const oscillator: FakeOscillator = {
      type: "sine",
      frequency: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    const gain: FakeParam = {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    };
    this.gains.push(gain);
    return { gain, connect: vi.fn() };
  }

  static context(): FakeAudioContext {
    const instance = FakeAudioContext.instances[0];
    if (!instance) throw new Error("AudioContext 未创建");
    return instance;
  }
}

function createGateValues(overrides: Partial<Record<keyof PetSoundGates, boolean>> = {}) {
  const values = {
    enabled: true,
    visible: true,
    petVisible: true,
    micListening: false,
    ...overrides,
  };

  return {
    values,
    gates: {
      enabled: () => values.enabled,
      visible: () => values.visible,
      petVisible: () => values.petVisible,
      micListening: () => values.micListening,
    } satisfies PetSoundGates,
  };
}

function createSounds(overrides: Partial<Record<keyof PetSoundGates, boolean>> = {}) {
  const gateState = createGateValues(overrides);
  const sounds = createPetSounds(() => gateState.gates, {
    createContext: () => new FakeAudioContext() as unknown as AudioContext,
  });
  return { sounds, gateState };
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("createPetSounds 门禁", () => {
  it("没有用户手势解锁时保持静音", () => {
    const { sounds } = createSounds();

    expect(sounds.canPlay()).toBe(true);
    expect(sounds.play("work-start")).toBe(false);
    expect(sounds.unlock()).toBe(true);
    expect(sounds.play("work-start")).toBe(true);
  });

  it("声音开关/前台/宠物页/录音任一关闭都不自动播放", () => {
    const cases: Array<Partial<Record<keyof PetSoundGates, boolean>>> = [
      { enabled: false },
      { visible: false },
      { petVisible: false },
      { micListening: true },
    ];

    for (const override of cases) {
      FakeAudioContext.instances = [];
      const { sounds } = createSounds(override);
      sounds.unlock();

      expect(sounds.canPlay()).toBe(false);
      expect(sounds.play("complete")).toBe(false);
      expect(sounds.playCompleteSoft()).toBe(false);
      expect(FakeAudioContext.instances[0]?.oscillators.length ?? 0).toBe(0);
    }
  });

  it("解锁后按 pattern 播放三种音效", () => {
    const { sounds } = createSounds();
    sounds.unlock();

    expect(sounds.play("work-start")).toBe(true);
    expect(
      FakeAudioContext.context().oscillators.map(
        (osc) => osc.frequency.setValueAtTime.mock.calls[0]?.[0],
      ),
    ).toEqual([659.25, 987.77]);

    FakeAudioContext.context().oscillators.length = 0;
    expect(sounds.play("ask")).toBe(true);
    expect(
      FakeAudioContext.context().oscillators.map(
        (osc) => osc.frequency.setValueAtTime.mock.calls[0]?.[0],
      ),
    ).toEqual([659.25, 880]);

    FakeAudioContext.context().oscillators.length = 0;
    expect(sounds.play("complete")).toBe(true);
    expect(
      FakeAudioContext.context().oscillators.map(
        (osc) => osc.frequency.setValueAtTime.mock.calls[0]?.[0],
      ),
    ).toEqual([523.25, 659.25, 783.99]);
  });

  it("asking 下的完成轻提示：单音 E6，比完整完成音更轻更短", () => {
    const { sounds } = createSounds();
    sounds.unlock();

    expect(sounds.playCompleteSoft()).toBe(true);
    const context = FakeAudioContext.context();
    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0]?.frequency.setValueAtTime.mock.calls[0]?.[0]).toBe(1318.51);
    expect(context.gains.map((gain) => gain.linearRampToValueAtTime.mock.calls[0]?.[0])).toEqual([
      0.39,
    ]);
  });

  it("播放音量是设计值的 3.9 倍（MASTER_GAIN = 3.9，+30%）", () => {
    const { sounds } = createSounds();
    sounds.unlock();

    expect(sounds.play("complete")).toBe(true);
    expect(
      FakeAudioContext.context().gains.map((gain) =>
        Number(
          ((gain.linearRampToValueAtTime.mock.calls[0]?.[0] as number | undefined) ?? 0).toFixed(6),
        ),
      ),
    ).toEqual([0.507, 0.546, 0.585]);
  });
});

describe("asking 提醒上限", () => {
  it("进入 asking 播一次，12 秒后仍 asking 再播一次，最多两次", () => {
    const { sounds } = createSounds();
    sounds.unlock();

    sounds.startAsking();
    expect(FakeAudioContext.context().oscillators).toHaveLength(2);

    vi.advanceTimersByTime(ASK_REPEAT_MS);
    expect(FakeAudioContext.context().oscillators).toHaveLength(4);

    vi.advanceTimersByTime(ASK_REPEAT_MS * 3);
    expect(FakeAudioContext.context().oscillators).toHaveLength(4);
  });

  it("停止 asking 后取消未播放的提醒", () => {
    const { sounds } = createSounds();
    sounds.unlock();

    sounds.startAsking();
    expect(FakeAudioContext.context().oscillators).toHaveLength(2);

    sounds.stopAsking();
    vi.advanceTimersByTime(ASK_REPEAT_MS * 2);
    expect(FakeAudioContext.context().oscillators).toHaveLength(2);
  });

  it("12 秒时录音/切后台会跳过提醒", () => {
    const { sounds, gateState } = createSounds();
    sounds.unlock();

    sounds.startAsking();
    expect(FakeAudioContext.context().oscillators).toHaveLength(2);

    gateState.values.micListening = true;
    vi.advanceTimersByTime(ASK_REPEAT_MS);
    expect(FakeAudioContext.context().oscillators).toHaveLength(2);

    gateState.values.micListening = false;
    gateState.values.visible = false;
    sounds.startAsking();
    expect(FakeAudioContext.context().oscillators).toHaveLength(2);

    vi.advanceTimersByTime(ASK_REPEAT_MS);
    expect(FakeAudioContext.context().oscillators).toHaveLength(2);

    gateState.values.visible = true;
    gateState.values.petVisible = false;
    sounds.startAsking();
    expect(FakeAudioContext.context().oscillators).toHaveLength(2);

    vi.advanceTimersByTime(ASK_REPEAT_MS);
    expect(FakeAudioContext.context().oscillators).toHaveLength(2);

    // 门重新打开后：进入时一次 + 12 秒后一次，仍然最多两次。
    gateState.values.petVisible = true;
    sounds.startAsking();
    expect(FakeAudioContext.context().oscillators).toHaveLength(4);

    vi.advanceTimersByTime(ASK_REPEAT_MS);
    expect(FakeAudioContext.context().oscillators).toHaveLength(6);
  });

  it("声音开关关闭时 asking 完全静音", () => {
    const { sounds } = createSounds({ enabled: false });
    sounds.unlock();

    sounds.startAsking();
    vi.advanceTimersByTime(ASK_REPEAT_MS);
    expect(FakeAudioContext.context().oscillators).toHaveLength(0);
  });
});

describe("预览", () => {
  it("试听忽略声音开关，并自动解锁", () => {
    const { sounds } = createSounds({ enabled: false });

    sounds.preview("complete");
    expect(FakeAudioContext.context().oscillators).toHaveLength(3);
  });

  it("设置页 previewPetSound 在无 AudioContext 时静默降级", () => {
    vi.stubGlobal("AudioContext", undefined);

    expect(() => previewPetSound("ask")).not.toThrow();
  });

  it("导出三个试听按钮标题", () => {
    expect(Object.values(PET_SOUND_LABEL)).toEqual(["开工", "提问", "完成"]);
  });
});
