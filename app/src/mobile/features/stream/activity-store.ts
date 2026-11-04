import { createActivityStore } from "@/shared/lib/activity-store";

/** 手机端「最近发生」：AI 状态 / 语音结果 / 连接 / focus 结果。内存 cap 20，不落盘。 */
export const useMobileActivityStore = createActivityStore();
