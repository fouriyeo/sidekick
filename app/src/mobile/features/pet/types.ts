import type { StatusMessage } from "@/protocol/messages";
import type { AiApplyOptions, AiStatus } from "./ai-status";

export type Mood = "content" | "happy" | "curious" | "sleepy";

export type BaselineMood = "content" | "sleepy";

export type PetPhase = "idle" | "celebrating" | "sleeping" | "away";

export type ReduceMotionSetting = "system" | "on" | "off";

export type PetSettings = {
  haptics: boolean;
  sound: boolean;
  reduceMotion: ReduceMotionSetting;
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
  lastSeenAt: number;
  lastInteractionAt: number;
  lastEnergyAt: number;
  phaseUntil: number;
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
  lastSeenAt: number;
  lastInteractionAt: number;
  lastEnergyAt: number;
  settings: PetSettings;
};

export type CopyId =
  | "first_meet"
  | "named"
  | "returning"
  | "returning_long"
  | "night"
  | "corrupted"
  | "ai_working"
  | "ai_asking"
  | "ai_completed";

export type PetEvent =
  | { type: "BOOT"; now: number; save: PetSaveV1 | null; corrupted?: boolean }
  | { type: "NAME_SET"; now: number; name: string; skipped: boolean }
  | { type: "TICK"; now: number }
  | { type: "VISIBILITY"; now: number; visible: boolean }
  | { type: "OVERLAY"; now: number; open: boolean }
  | { type: "RESET"; now: number };

export type HapticStyle = "light" | "medium" | "success" | "error";

export type PetEffect =
  | { type: "haptic"; style: HapticStyle }
  | { type: "bubble"; copyId: CopyId; durationMs?: number }
  | { type: "hearts"; count: number };

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

export type PetStoreState = {
  pet: PetState;
  hydrated: boolean;
  saveStatus: SaveStatus;
  bubble: Bubble | null;
  heartBurst: HeartBurst | null;
  /** AI 联动四态；不落盘，App 重启后从 idle/静态重新开始。 */
  ai: AiStatus;
  /** 状态气泡（asking 常驻 / working 5 秒 / completed 3 秒），与闲聊气泡共享槽位。 */
  aiCaption: Bubble | null;
  /** 录音中：AI 触感/音效静音（由 PetStage/MobileApp 同步）。 */
  micListening: boolean;
  hydrate: () => Promise<void>;
  dispatch: (event: PetEvent) => void;
  applyAiStatus: (message: StatusMessage, options?: AiApplyOptions) => void;
  setMicListening: (listening: boolean) => void;
  /** 首次用户手势时解锁 Web Audio（自动播放策略）。 */
  unlockSound: () => void;
  setName: (name: string) => Promise<boolean>;
  updateSettings: (patch: Partial<PetSettings>) => Promise<boolean>;
  resetPet: () => Promise<void>;
  flush: () => Promise<void>;
};
