import { cn } from "cn";
import deepSea from "@/mobile/styles/deep-sea.module.css";
import type { Bubble } from "./types";

type PetStatusCaptionProps = {
  /** AI 状态文案；null 时什么都不渲染。 */
  caption: Bubble | null;
  className?: string;
};

type CaptionMeta = {
  /** mono 眉标，仪器读数语气。 */
  code: string;
  /** mono 副行：一句可执行的话，不靠颜色单独表达状态。 */
  hint: string;
  /** 状态色只做第二线索：asking 琥珀、working 信号、completed 完成绿。 */
  accent: string;
  border: string;
};

const META: Record<string, CaptionMeta> = {
  ai_working: {
    code: "WORKING",
    hint: "信号稳定 · 正在同步",
    accent: "text-pet-signal",
    border: "border-pet-signal",
  },
  ai_asking: {
    code: "AWAITING",
    hint: "请到电脑上确认",
    accent: "text-pet-ask",
    border: "border-pet-ask",
  },
  ai_completed: {
    code: "DONE",
    hint: "已同步到手机",
    accent: "text-pet-success",
    border: "border-pet-success",
  },
};

/**
 * AI 状态文案：与宠物闲聊气泡共享槽位，但优先级更高。
 *
 * 方向 B：深海卡 + 14px 圆角；21px 状态 + mono 眉标/副行。
 * 琥珀（--pet-ask）只给「等你决定」，珊瑚（--pet-coral）留给录音。
 * 可见文案 aria-hidden，播报统一交给舞台的 aria-live region，避免重复。
 */
export function PetStatusCaption({ caption, className }: PetStatusCaptionProps) {
  if (!caption) return null;

  const meta = META[caption.copyId];

  return (
    <p
      key={`ai-${caption.id}`}
      aria-hidden="true"
      data-ai-caption={caption.copyId}
      className={cn(
        "max-w-full rounded-[14px] border px-3.5 py-2.5",
        deepSea.surface,
        meta?.border ?? "border-pet-border",
        className,
      )}
    >
      {meta && (
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("inline-block size-1 rounded-full bg-current", meta.accent)}
          />
          <span className={cn("font-mono text-[9.5px] uppercase tracking-[0.16em]", meta.accent)}>
            {meta.code}
          </span>
        </span>
      )}
      <span
        aria-hidden="true"
        data-ai-caption={caption.copyId}
        className="mt-1 block text-[21px] leading-[1.3] font-semibold tracking-[-0.01em] text-pet-text"
      >
        {caption.text}
      </span>
      {meta && (
        <span className={cn("mt-1 block font-mono text-[9.5px] tracking-[0.12em]", meta.accent)}>
          {meta.hint}
        </span>
      )}
    </p>
  );
}
