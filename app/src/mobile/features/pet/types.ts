import type { StatusMessage } from "@/protocol/messages";
import type { AiApplyOptions, AiStatus } from "./ai-status";

export type Mood = "content" | "happy" | "curious" | "sleepy" | "listening" | "proud" | "concerned";

export type BaselineMood = "content" | "sleepy";

export type PetPhase =
  | "idle"
  | "interacting"
  | "listening"
  | "celebrating"
  | "concerned"
  | "sleeping"
  | "away";

export type Posture = "docked" | "handheld";

export type ReduceMotionSetting = "system" | "on" | "off";

export type PetSettings = {
  haptics: boolean;
  sound: boolean;
  reduceMotion: ReduceMotionSetting;
  posture: Posture;
  /** 宠物页面前台时是否阻止系统熄屏；旧存档里的 "never" 归一化为 true。 */
  keepAwake: boolean;
  /** 宠物页无操作多少分钟后自动变暗（防 OLED 烧屏）；默认 5 分钟。 */
  dimMinutes: number;
  /** 屏幕常亮最多保持多少小时，到点释放让系统熄屏；0 表示不限；默认 2 小时。 */
  keepAwakeHours: number;
};

export type PetState = {
  phase: PetPhase;
  mood: Mood;
  onboarded: boolean;
  name: string;
  energy: number;
  affinity: number;
  affinityDate: string | null;
  affinityGainedToday: number;
  lastSeenAt: number;
  lastInteractionAt: number;
  lastEnergyAt: number;
  cooldownUntil: number;
  phaseUntil: number;
  pettingStartedAt: number | null;
  pettingCompleted: boolean;
  resumeMood: Mood | null;
  overlayOpen: boolean;
  visible: boolean;
  settings: PetSettings;
};

export type PetSaveV1 = {
  version: 1;
  onboarded: boolean;
  name: string;
  mood: BaselineMood;
  energy: number;
  affinity: number;
  affinityDate: string | null;
  affinityGainedToday: number;
  lastSeenAt: number;
  lastInteractionAt: number;
  lastEnergyAt: number;
  settings: PetSettings;
};

export type RiveTrigger =
  | "trigger_pet"
  | "trigger_poke"
  | "trigger_listen"
  | "trigger_success"
  | "trigger_cancel"
  | "trigger_error"
  | "trigger_wake";

export type CopyId =
  | "first_meet"
  | "named"
  | "petting"
  | "petting_more"
  | "poke"
  | "returning"
  | "returning_long"
  | "night"
  | "mic_success"
  | "mic_error"
  | "corrupted"
  | "ai_working"
  | "ai_asking"
  | "ai_completed";

export type PetEvent =
  | { type: "BOOT"; now: number; save: PetSaveV1 | null; corrupted?: boolean }
  | { type: "NAME_SET"; now: number; name: string; skipped: boolean }
  | { type: "PET_START"; now: number }
  | { type: "PET_PROGRESS"; now: number }
  | { type: "PET_END"; now: number }
  | { type: "POKE"; now: number }
  | { type: "TICK"; now: number }
  | { type: "VISIBILITY"; now: number; visible: boolean }
  | { type: "OVERLAY"; now: number; open: boolean }
  | { type: "MIC_START"; now: number }
  | { type: "MIC_SUCCESS"; now: number }
  | { type: "MIC_CANCEL"; now: number }
  | { type: "MIC_ERROR"; now: number }
  | { type: "SET_POSTURE"; now: number; posture: Posture }
  | { type: "RESET"; now: number };

export type HapticStyle = "light" | "medium" | "success" | "error";

export type PetEffect =
  | { type: "rive"; trigger: RiveTrigger }
  | { type: "haptic"; style: HapticStyle }
  | { type: "bubble"; copyId: CopyId; durationMs?: number }
  | { type: "hearts"; count: number };

export type GestureEvent =
  | { type: "pet-start"; at: number }
  | { type: "pet-progress"; at: number; elapsed: number }
  | { type: "pet-complete"; at: number; duration: number }
  | { type: "pet-end"; at: number; duration: number }
  | { type: "poke"; at: number };

export type PetStorage = {
  load: () => Promise<{ raw: unknown | null }>;
  save: (save: PetSaveV1) => Promise<void>;
  clear: () => Promise<void>;
};

export type SaveStatus = "idle" | "saving" | "error";

export type Bubble = {
  id: number;
  copyId: CopyId;
  text: string;
};

export type HeartBurst = {
  id: number;
  count: number;
};

export type RiveSignal = {
  id: number;
  trigger: RiveTrigger;
};

export type PetStoreState = {
  pet: PetState;
  hydrated: boolean;
  saveStatus: SaveStatus;
  bubble: Bubble | null;
  heartBurst: HeartBurst | null;
  riveSignal: RiveSignal | null;
  /** AI 联动四态；不落盘，App 重启后从 idle/静态重新开始。 */
  ai: AiStatus;
  /** 状态气泡（asking 常驻 / working 5 秒 / completed 3 秒），与闲聊气泡共享槽位。 */
  aiCaption: Bubble | null;
  /** 录音中：AI 触感/音效静音（由 PetStage/MobileApp 同步）。 */
  micListening: boolean;
  hydrate: () => Promise<void>;
  dispatch: (event: PetEvent) => void;
  handleGesture: (event: GestureEvent) => void;
  applyAiStatus: (message: StatusMessage, options?: AiApplyOptions) => void;
  setMicListening: (listening: boolean) => void;
  /** 首次用户手势时解锁 Web Audio（自动播放策略）。 */
  unlockSound: () => void;
  setName: (name: string) => Promise<boolean>;
  setPosture: (posture: Posture) => Promise<boolean>;
  updateSettings: (patch: Partial<PetSettings>) => Promise<boolean>;
  resetPet: () => Promise<void>;
  flush: () => Promise<void>;
};
