import { cn } from "cn";
import type { Bubble } from "./types";

type PetStatusCaptionProps = {
  /** AI 状态文案；null 时什么都不渲染。 */
  caption: Bubble | null;
  className?: string;
};

const CAPTION_CLASS =
  "line-clamp-2 max-w-full rounded-2xl border bg-card px-4 py-3 text-[15px] leading-relaxed text-pet-text shadow-sm";

const CAPTION_BORDER: Record<string, string> = {
  ai_working: "border-pet-primary",
  ai_asking: "border-pet-coral",
  ai_completed: "border-pet-success",
};

/**
 * AI 状态文案：与宠物闲聊气泡共享槽位，但优先级更高。
 * 可见文案 aria-hidden，播报统一交给舞台的 aria-live region，避免重复。
 */
export function PetStatusCaption({ caption, className }: PetStatusCaptionProps) {
  if (!caption) return null;

  return (
    <p
      key={`ai-${caption.id}`}
      aria-hidden="true"
      data-ai-caption={caption.copyId}
      className={cn(
        CAPTION_CLASS,
        CAPTION_BORDER[caption.copyId] ?? "border-pet-border",
        className,
      )}
    >
      {caption.text}
    </p>
  );
}
