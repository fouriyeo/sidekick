import type { MicPhase } from "@/mobile/features/mic/mic-store";
import type { AiState } from "./ai-status";
import type { PetPhase } from "./types";

/**
 * 宠物能演的动作（BoopFace 的子集）。
 *
 * 只收录「Sidekick 有真实触发源」的动作：angry / refuse / random / wake 没有
 * 对应事件，先用不到；以后有信号（例如策略拦截、彩蛋）再接。
 * 等待动作用 waiting-wave（眼睛轮流上下浮动），不用 spin（会重叠成独眼）。
 */
export type PetAction =
  | "idle"
  | "bored"
  | "sleep"
  | "waiting"
  | "wary"
  | "success"
  | "input"
  | "inspect"
  | "affirm"
  | "failure"
  | "surprise"
  | "love";

/** 一次性反应：到期前压过所有稳定状态。 */
export type PetReaction = {
  action: PetAction;
  until: number;
};

export type PetActionInput = {
  phase: PetPhase;
  ai: AiState;
  mic: MicPhase;
  reaction: PetReaction | null;
  now: number;
};

/**
 * 优先级（高 → 低）：
 * 瞬态反应 > 转写中 > 录音中 > AI 等你决定 > AI 工作 > AI 完成 > 睡着 > 离开 > 待机。
 *
 * 「睡着」只能压静态：夜间正在跑 AI 任务时仍然展示 AI 状态（沿用 D20 的规则）。
 * 录音相关的三档是 D133 新增：录音时用户正看着麦克风，麦胜过 AI。
 */
export function resolvePetAction({ phase, ai, mic, reaction, now }: PetActionInput): PetAction {
  if (reaction && reaction.until > now) return reaction.action;
  if (mic === "processing") return "inspect";
  if (mic === "arming" || mic === "listening") return "input";
  if (ai === "asking") return "wary";
  if (ai === "working") return "waiting";
  if (ai === "completed") return "success";
  if (phase === "sleeping") return "sleep";
  if (phase === "away") return "bored";
  return "idle";
}

/** 循环播放的动作（其余要么一次性，要么由状态保持）。 */
export function isContinuous(action: PetAction): boolean {
  return action === "waiting";
}
