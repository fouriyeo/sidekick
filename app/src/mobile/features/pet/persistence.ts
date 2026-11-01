import type {
  PetSaveV1,
  PetSettings,
  PetState,
  PetStorage,
  Posture,
  ReduceMotionSetting,
} from "./types";

export const DEFAULT_NAME = "小跟班";

export const DEFAULT_SETTINGS: PetSettings = {
  haptics: true,
  sound: false,
  reduceMotion: "system",
  posture: "docked",
  keepAwake: true,
  dimMinutes: 5,
  keepAwakeHours: 2,
};

/** 自动变暗分钟数的合法范围（1 分钟起，最多 1 小时）。 */
export const DIM_MINUTES_RANGE = { min: 1, max: 60 } as const;
/** 屏幕常亮最长小时数的合法范围（0 = 不限，最多 24 小时）。 */
export const KEEP_AWAKE_HOURS_RANGE = { min: 0, max: 24 } as const;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createDefaultSave(now: number): PetSaveV1 {
  return {
    version: 1,
    onboarded: false,
    name: DEFAULT_NAME,
    mood: "content",
    energy: 100,
    affinity: 0,
    affinityDate: null,
    affinityGainedToday: 0,
    lastSeenAt: now,
    lastInteractionAt: now,
    lastEnergyAt: now,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function defaultPetState(now: number): PetState {
  return {
    phase: "idle",
    mood: "content",
    onboarded: false,
    name: DEFAULT_NAME,
    energy: 100,
    affinity: 0,
    affinityDate: null,
    affinityGainedToday: 0,
    lastSeenAt: now,
    lastInteractionAt: now,
    lastEnergyAt: now,
    cooldownUntil: 0,
    phaseUntil: 0,
    pettingStartedAt: null,
    pettingCompleted: false,
    resumeMood: null,
    overlayOpen: false,
    visible: true,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function petStateFromSave(save: PetSaveV1): PetState {
  return {
    ...defaultPetState(save.lastEnergyAt),
    mood: save.mood,
    onboarded: save.onboarded,
    name: save.name,
    energy: clampNumber(save.energy, 0, 100),
    affinity: clampNumber(save.affinity, 0, 100),
    affinityDate: save.affinityDate,
    affinityGainedToday: clampNumber(save.affinityGainedToday, 0, 5),
    lastSeenAt: save.lastSeenAt,
    lastInteractionAt: save.lastInteractionAt,
    lastEnergyAt: save.lastEnergyAt,
    settings: { ...DEFAULT_SETTINGS, ...save.settings },
  };
}

export function petSaveFromState(state: PetState, now: number): PetSaveV1 {
  const mood = state.phase === "sleeping" || state.mood === "sleepy" ? "sleepy" : "content";

  return {
    version: 1,
    onboarded: state.onboarded,
    name: state.name,
    mood,
    energy: clampNumber(state.energy, 0, 100),
    affinity: clampNumber(state.affinity, 0, 100),
    affinityDate: state.affinityDate,
    affinityGainedToday: clampNumber(state.affinityGainedToday, 0, 5),
    lastSeenAt: now,
    lastInteractionAt: state.lastInteractionAt,
    lastEnergyAt: state.lastEnergyAt,
    settings: { ...state.settings },
  };
}

function graphemes(value: string): string[] {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment: (input: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;

  if (Segmenter) {
    return Array.from(
      new Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      (item) => {
        return item.segment;
      },
    );
  }

  return Array.from(value);
}

export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed || /[\r\n]/.test(trimmed)) return null;
  if (trimmed.includes("/") || trimmed.includes("://") || /^www\./i.test(trimmed)) return null;

  const parts = graphemes(trimmed);
  if (parts.length < 1 || parts.length > 8) return null;

  return parts.join("");
}

function normalizeReduceMotion(value: unknown): ReduceMotionSetting {
  return value === "on" || value === "off" || value === "system" ? value : "system";
}

function normalizeDimMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.dimMinutes;
  return Math.round(clampNumber(value, DIM_MINUTES_RANGE.min, DIM_MINUTES_RANGE.max));
}

function normalizeKeepAwakeHours(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.keepAwakeHours;
  return Math.round(clampNumber(value, KEEP_AWAKE_HOURS_RANGE.min, KEEP_AWAKE_HOURS_RANGE.max));
}

function normalizePosture(value: unknown): Posture {
  return value === "handheld" || value === "auto"
    ? value === "auto"
      ? "docked"
      : "handheld"
    : "docked";
}

function normalizeSettings(raw: unknown): PetSettings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };
  const value = raw as Record<string, unknown>;

  return {
    haptics: typeof value.haptics === "boolean" ? value.haptics : DEFAULT_SETTINGS.haptics,
    sound: typeof value.sound === "boolean" ? value.sound : DEFAULT_SETTINGS.sound,
    reduceMotion: normalizeReduceMotion(value.reduceMotion),
    posture: normalizePosture(value.posture),
    // 旧存档写的是 "never"（当时未接入），统一落到新默认 true：宠物页面默认常亮。
    keepAwake: typeof value.keepAwake === "boolean" ? value.keepAwake : DEFAULT_SETTINGS.keepAwake,
    dimMinutes: normalizeDimMinutes(value.dimMinutes),
    keepAwakeHours: normalizeKeepAwakeHours(value.keepAwakeHours),
  };
}

export function parsePetSave(
  raw: unknown,
  now: number,
): { save: PetSaveV1 | null; corrupted: boolean } {
  if (raw === null || raw === undefined) return { save: null, corrupted: false };

  let input: unknown = raw;
  if (typeof raw === "string") {
    try {
      input = JSON.parse(raw);
    } catch {
      return { save: createDefaultSave(now), corrupted: true };
    }
  }

  if (typeof input !== "object" || input === null) {
    return { save: createDefaultSave(now), corrupted: true };
  }

  const value = input as Record<string, unknown>;
  if (value.version !== 1) {
    const salvagedName = normalizeName(value.name);
    return {
      save: {
        ...createDefaultSave(now),
        name: salvagedName ?? DEFAULT_NAME,
        onboarded: salvagedName !== null,
      },
      corrupted: true,
    };
  }

  let corrupted = false;
  const name = normalizeName(value.name);
  if (name === null) corrupted = true;

  const readNumber = (field: unknown, fallback: number, min: number, max: number) => {
    if (typeof field !== "number" || !Number.isFinite(field)) {
      corrupted = true;
      return fallback;
    }
    return clampNumber(field, min, max);
  };

  const onboarded = typeof value.onboarded === "boolean" ? value.onboarded : name !== null;

  return {
    save: {
      version: 1,
      onboarded,
      name: name ?? DEFAULT_NAME,
      mood: value.mood === "sleepy" ? "sleepy" : "content",
      energy: readNumber(value.energy, 100, 0, 100),
      affinity: readNumber(value.affinity, 0, 0, 100),
      affinityDate: typeof value.affinityDate === "string" ? value.affinityDate : null,
      affinityGainedToday: readNumber(value.affinityGainedToday, 0, 0, 5),
      lastSeenAt: readNumber(value.lastSeenAt, now, 0, Number.MAX_SAFE_INTEGER),
      lastInteractionAt: readNumber(value.lastInteractionAt, now, 0, Number.MAX_SAFE_INTEGER),
      lastEnergyAt: readNumber(value.lastEnergyAt, now, 0, Number.MAX_SAFE_INTEGER),
      settings: normalizeSettings(value.settings),
    },
    corrupted,
  };
}

export type MemoryPetStorage = PetStorage & {
  readonly value: unknown;
};

export function createMemoryPetStorage(initial: unknown = null): MemoryPetStorage {
  let value = initial;

  return {
    get value() {
      return value;
    },
    async load() {
      return { raw: value };
    },
    async save(save) {
      value = save;
    },
    async clear() {
      value = null;
    },
  };
}
