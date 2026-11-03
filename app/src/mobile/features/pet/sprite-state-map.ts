import type { AiState } from "./ai-status";
import type { PetPhase } from "./types";

/**
 * App 语义 → 图集状态名。
 *
 * 图集可以有任意多行状态，这里只维护「候选链」：按优先级尝试，
 * 渲染器选第一个在图集里存在的状态。以后补了 sleeping / listening 等行，
 * 只需要在图里加行、在 manifest 登记，不用改渲染器；若想改优先级才动本文件。
 */
export const SPRITE_STATES = {
  idle: "idle",
  working: "working",
  attention: "attention",
  done: "done",
  /** 以下为预留状态名：当前资产没有这些行，候选链会自动回落到 idle。 */
  sleeping: "sleeping",
  listening: "listening",
  celebrate: "celebrate",
  concerned: "concerned",
  away: "away",
} as const;

function aiChain(ai: AiState): string[] {
  switch (ai) {
    case "working":
      return [SPRITE_STATES.working, SPRITE_STATES.idle];
    case "asking":
      return [SPRITE_STATES.attention, SPRITE_STATES.idle];
    case "completed":
      return [SPRITE_STATES.done, SPRITE_STATES.celebrate, SPRITE_STATES.idle];
    default:
      return [SPRITE_STATES.idle];
  }
}

/**
 * 返回候选状态链（从左到右优先级递减）。
 *
 * - 倾听 / 庆祝 / 担心 / 离开：交互优先，AI 状态让位（与 hook SPEC §2 一致）。
 * - 睡觉：只在 AI 静态时生效；夜间正在进行 AI 任务时仍展示 AI 状态。
 * - 其余情况跟随 AI 四态。
 */
export function spriteStateChain(phase: PetPhase, ai: AiState): string[] {
  switch (phase) {
    case "listening":
      // 不落到 attention：倾听是安静地听，不是「等你决定」的感叹号。
      return [SPRITE_STATES.listening, SPRITE_STATES.idle];
    case "celebrating":
      return [SPRITE_STATES.celebrate, SPRITE_STATES.done, SPRITE_STATES.idle];
    case "concerned":
      return [SPRITE_STATES.concerned, SPRITE_STATES.idle];
    case "away":
      return [SPRITE_STATES.away, SPRITE_STATES.idle];
    case "sleeping":
      return ai === "idle" ? [SPRITE_STATES.sleeping, SPRITE_STATES.idle] : aiChain(ai);
    default:
      return aiChain(ai);
  }
}

/**
 * 从候选链里挑第一个 manifest 里存在的状态；都不存在时回落到
 * defaultState → idle → 第一个状态。返回 null 表示图集不可用。
 */
export function resolveSpriteState(
  chain: readonly string[],
  states: Record<string, unknown>,
  defaultState: string,
): string | null {
  for (const name of chain) {
    if (states[name]) return name;
  }
  if (states[defaultState]) return defaultState;
  if (states[SPRITE_STATES.idle]) return SPRITE_STATES.idle;
  const first = Object.keys(states)[0];
  return first ?? null;
}
