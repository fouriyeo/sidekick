/**
 * 最近发生（活动流）的公共类型。
 *
 * 只在本机内存里保留最近 N 条，不落盘、不上传；手机端禁止出现桌面剪贴板内容
 * 与 AI 提问正文，桌面端只展示本机已有信息。
 */

export type ActivityKind = "voice" | "ai" | "connection" | "clipboard" | "system";

export type ActivityEvent = {
  id: number;
  at: number;
  kind: ActivityKind;
  /** 一行标题，≤ 80 字；不放大段文本。 */
  title: string;
  /** 可选副行，只放短说明（用时、字数等）。 */
  detail?: string;
};

export const ACTIVITY_LIMIT = 20;
