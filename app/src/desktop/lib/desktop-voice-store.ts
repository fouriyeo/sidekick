import { create } from "zustand";
import type { MicResultOutcome } from "@/protocol/messages";

/**
 * 总览「最近一次语音输入」的唯一数据源。
 *
 * 数据只来自本机 WS 收到的 `mic.result`（文本、结果、原因、时间），只放内存、不落盘；
 * 更完整的历史在「剪贴板」页（kind=voice，D119 前叫「内容」）。重启后为空是预期行为。
 */
export type DesktopVoiceEntry = {
  /** 最终转写文本；失败/空结果时可能为空串。 */
  text: string;
  outcome: MicResultOutcome;
  reason: string | null;
  at: number;
};

type DesktopVoiceState = {
  last: DesktopVoiceEntry | null;
  record: (entry: DesktopVoiceEntry) => void;
  reset: () => void;
};

export const useDesktopVoiceStore = create<DesktopVoiceState>((set) => ({
  last: null,
  record: (entry) => set({ last: entry }),
  reset: () => set({ last: null }),
}));
