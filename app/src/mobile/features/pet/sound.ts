/** 三种 AI 联动提示音；合成参数固定，不依赖任何音频资源。 */
export type PetSoundKind = "work-start" | "ask" | "complete";

export type PetSoundGates = {
  /** 设置页「声音」开关，默认关。 */
  enabled: () => boolean;
  /** App 在前台（document 可见）。 */
  visible: () => boolean;
  /** 宠物页在前台（不在聊天/设置/后台）。 */
  petVisible: () => boolean;
  /** 录音中静音。 */
  micListening: () => boolean;
};

export type PetSoundEnvironment = {
  createContext?: () => AudioContext | null;
};

export type PetSounds = {
  /** 首次用户手势时调用；成功拿到 AudioContext 返回 true。 */
  unlock: () => boolean;
  /** 所有自动播放门都打开时返回 true。 */
  canPlay: () => boolean;
  play: (kind: PetSoundKind) => boolean;
  playWork: () => boolean;
  playAsk: () => boolean;
  playComplete: () => boolean;
  /** 进入「等你决定」：立刻播一次，12 秒后仍 asking 最多再提醒一次。 */
  startAsking: () => void;
  /** 离开 asking / 后台 / 录音时停掉 pending 的提醒。 */
  stopAsking: () => void;
  /** 设置页试听：忽略声音开关（用户主动点的），但同样要求已解锁。 */
  preview: (kind: PetSoundKind) => void;
  dispose: () => void;
};

type Tone = {
  frequency: number;
  /** 相对播放起点的偏移（秒）。 */
  delay: number;
  duration: number;
  gain: number;
  type: OscillatorType;
};

const E5 = 659.25;
const B5 = 987.77;
const A5 = 880;
const C5 = 523.25;
const G5 = 783.99;

/**
 * 音色设计（总时长按听觉尾巴算，约等于 pattern 里最后一个 tone 的结束点）：
 * - 开工：E5 + B5 轻柔木琴/叮，约 220ms；
 * - 提问：E5 → A5 两个上行音，约 350ms；
 * - 完成：C5-E5-G5 琶音，约 420ms。
 */
const PATTERNS: Record<PetSoundKind, Tone[]> = {
  "work-start": [
    { frequency: E5, delay: 0, duration: 0.18, gain: 0.16, type: "sine" },
    { frequency: B5, delay: 0.04, duration: 0.18, gain: 0.1, type: "sine" },
  ],
  ask: [
    { frequency: E5, delay: 0, duration: 0.16, gain: 0.18, type: "triangle" },
    { frequency: A5, delay: 0.18, duration: 0.17, gain: 0.14, type: "triangle" },
  ],
  complete: [
    { frequency: C5, delay: 0, duration: 0.12, gain: 0.13, type: "sine" },
    { frequency: E5, delay: 0.13, duration: 0.12, gain: 0.14, type: "sine" },
    { frequency: G5, delay: 0.26, duration: 0.16, gain: 0.15, type: "sine" },
  ],
};

/** asking 最多提醒两次：进入时一次，12 秒后仍 asking 再补一次。 */
export const ASK_REPEAT_MS = 12_000;

/**
 * 总音量倍数：1 = 原始设计音量，2 = 放大一倍，3 = 在放大一倍的基础上再 +50%。
 * 单音峰值最高 0.18 × 3 = 0.54；开工音 E5+B5 有 0.04s 重叠，峰值和 0.78 < 1，不削波。
 */
const MASTER_GAIN = 3;

function defaultContextFactory(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

export function createPetSounds(
  getGates: () => PetSoundGates,
  environment: PetSoundEnvironment = {},
): PetSounds {
  const createContext = environment.createContext ?? defaultContextFactory;
  let context: AudioContext | null = null;
  let unlocked = false;
  let disposed = false;
  let askActive = false;
  let askTimer: ReturnType<typeof setTimeout> | null = null;

  function ensureContext(): AudioContext | null {
    if (disposed) return null;
    if (context && context.state === "closed") context = null;
    if (!context) {
      try {
        context = createContext();
      } catch {
        context = null;
      }
    }
    return context;
  }

  /** 挂起时尽力恢复；没有用户手势时可能被拒绝，失败静默。 */
  function resumeIfSuspended(current: AudioContext): void {
    if (current.state !== "suspended") return;
    try {
      void current.resume().catch(() => undefined);
    } catch {
      // 部分 WebView 上 resume 会同步抛错，忽略即可。
    }
  }

  function unlock(): boolean {
    const current = ensureContext();
    if (!current) return false;

    unlocked = true;
    resumeIfSuspended(current);
    return true;
  }

  function canPlay(): boolean {
    try {
      const gates = getGates();
      return gates.enabled() && gates.visible() && gates.petVisible() && !gates.micListening();
    } catch {
      return false;
    }
  }

  function emit(kind: PetSoundKind): boolean {
    if (!unlocked) return false;
    const current = ensureContext();
    if (!current) return false;

    // 切后台/音频焦点丢失后 WebView 可能把 AudioContext 挂起；
    // 首次解锁只发生一次，这里再补一次 resume，避免之后永久静音。
    resumeIfSuspended(current);

    const start = current.currentTime || 0;
    try {
      for (const tone of PATTERNS[kind]) {
        const oscillator = current.createOscillator();
        const gain = current.createGain();
        const toneStart = start + tone.delay;

        oscillator.type = tone.type;
        oscillator.frequency.setValueAtTime(tone.frequency, toneStart);
        const peak = Math.min(1, tone.gain * MASTER_GAIN);
        gain.gain.setValueAtTime(0.0001, toneStart);
        gain.gain.linearRampToValueAtTime(peak, toneStart + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + tone.duration);

        oscillator.connect(gain);
        gain.connect(current.destination);
        oscillator.start(toneStart);
        oscillator.stop(toneStart + tone.duration + 0.03);
      }
      return true;
    } catch {
      // 音频节点在部分 WebView 上可能被限制，静默降级为无声音。
      return false;
    }
  }

  function stopAsking(): void {
    askActive = false;
    if (askTimer !== null) {
      clearTimeout(askTimer);
      askTimer = null;
    }
  }

  function startAsking(): void {
    stopAsking();
    askActive = true;

    if (canPlay()) emit("ask");

    askTimer = setTimeout(() => {
      askTimer = null;
      if (!askActive || disposed) return;
      // 12 秒后如果还在 asking 且门仍开着，才补最后一次；不再排下一次。
      if (canPlay()) emit("ask");
    }, ASK_REPEAT_MS);
  }

  function preview(kind: PetSoundKind): void {
    // 用户点击预览本身就是手势，顺手解锁；预览不受「声音开关」限制。
    unlock();
    emit(kind);
  }

  function playKind(kind: PetSoundKind): boolean {
    if (!canPlay()) return false;
    return emit(kind);
  }

  return {
    unlock,
    canPlay,
    play: playKind,
    playWork: () => playKind("work-start"),
    playAsk: () => playKind("ask"),
    playComplete: () => playKind("complete"),
    startAsking,
    stopAsking,
    preview,
    dispose: () => {
      stopAsking();
      disposed = true;
      unlocked = false;
      const current = context;
      context = null;
      if (current && current.state !== "closed") {
        try {
          void current.close().catch(() => undefined);
        } catch {
          // 忽略关闭失败。
        }
      }
    },
  };
}

let previewSounds: PetSounds | null = null;

/**
 * 设置页试听入口：独立于宠物 store 的静音门（用户主动点击），
 * 但同样需要 Web Audio 可用；系统静音/勿扰无法从 Web 层完全规避。
 */
export function previewPetSound(kind: PetSoundKind): void {
  if (!previewSounds) {
    previewSounds = createPetSounds(() => ({
      enabled: () => true,
      visible: () => true,
      petVisible: () => true,
      micListening: () => false,
    }));
  }
  previewSounds.preview(kind);
}

/** 文案展示用：设置页三个试听按钮的标题。 */
export const PET_SOUND_LABEL: Record<PetSoundKind, string> = {
  "work-start": "开工",
  ask: "提问",
  complete: "完成",
};
