import { create } from "zustand";
import type { PetAction, PetReaction } from "./pet-action";

/**
 * 瞬态反应总线（D133）。
 *
 * 只存「最近一次一次性动作」：录音成功/失败、断连/重连、新会话、回来问候。
 * 到期自动清空；同一动作在有效期内重复触发不重播（连续状态消息不会把动画打断重来）。
 */
export const MIN_REACTION_MS = 1200;

type PetReactionStore = {
  reaction: PetReaction | null;
};

export const usePetReactionStore = create<PetReactionStore>(() => ({ reaction: null }));

let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** 触发一次性动作；`durationMs` 会被抬到 `MIN_REACTION_MS` 以上。 */
export function firePetReaction(
  action: PetAction,
  durationMs = MIN_REACTION_MS,
  now = Date.now(),
): void {
  const current = usePetReactionStore.getState().reaction;
  if (current?.action === action && current.until > now) return;

  const until = now + Math.max(MIN_REACTION_MS, durationMs);
  clearTimer();
  usePetReactionStore.setState({ reaction: { action, until } });
  timer = setTimeout(() => {
    timer = null;
    usePetReactionStore.setState({ reaction: null });
  }, until - now);
}

/** 清空（切页/测试用）。 */
export function clearPetReaction(): void {
  clearTimer();
  usePetReactionStore.setState({ reaction: null });
}
