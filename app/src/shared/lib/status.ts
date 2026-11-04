import type { StatusState } from "@/protocol/messages";

/**
 * AI 四态的固定文案与展示口径（桌面 / 手机共用）。
 *
 * 注意：会话对象自己的状态词（进行中/已完成）不在这里；
 * 这里只描述「AI 聚合态」，即状态条、总览现在卡、宠物「现在」行用的词。
 */
export const AI_STATE_LABEL: Record<StatusState, string> = {
  idle: "空闲",
  working: "工作中",
  asking: "等你决定",
  completed: "完成",
};

/** 新增的「等你决定」副行，只用于 askKind=approval。 */
export const AI_ASK_APPROVAL_DETAIL = "等你审批";

export type StatusTone = "muted" | "signal" | "decide" | "success" | "danger";

export const AI_STATE_TONE: Record<StatusState, StatusTone> = {
  idle: "muted",
  working: "signal",
  asking: "decide",
  completed: "success",
};

/** 3 格信号：稳定/进行中/需要你。颜色只是第二线索，文字永远在场。 */
export const AI_STATE_LEVEL: Record<StatusState, 1 | 2 | 3> = {
  idle: 1,
  working: 2,
  asking: 1,
  completed: 3,
};

/** 聚合优先级：等你决定 > 工作中 > 完成 > 空闲。 */
export const AI_STATE_PRIORITY: Record<StatusState, number> = {
  asking: 0,
  working: 1,
  completed: 2,
  idle: 3,
};

/** 把多个会话/来源的状态聚合成一个可展示的 AI 状态。 */
export function aggregateAiState(states: readonly StatusState[]): StatusState {
  if (states.length === 0) return "idle";
  return [...states].sort((left, right) => AI_STATE_PRIORITY[left] - AI_STATE_PRIORITY[right])[0];
}

/** 状态条、气泡、卡片统一用这一句；null 表示没有可展示的状态。 */
export function aiStateLabel(state: StatusState): string {
  return AI_STATE_LABEL[state];
}

/** 聚合态是否存在「需要用户处理」的会话。 */
export function needsAttention(state: StatusState): boolean {
  return state === "asking";
}
