import { cn } from "cn";
import { PetStatusCaption } from "./pet-status-caption";
import type { Bubble } from "./types";

type PetBubbleProps = {
  bubble: Bubble | null;
  /** AI 状态文案优先占用气泡槽位；可见文案 aria-hidden，由舞台 live region 播报。 */
  caption?: Bubble | null;
  className?: string;
};

const BUBBLE_CLASS =
  "line-clamp-2 max-w-full rounded-2xl border bg-card px-4 py-3 text-[15px] leading-relaxed text-pet-text shadow-sm";

export function PetBubble({ bubble, caption, className }: PetBubbleProps) {
  return (
    <div className={cn("pointer-events-none", className)}>
      {caption ? (
        <PetStatusCaption caption={caption} />
      ) : (
        <div aria-live="polite">
          {bubble && (
            <p key={bubble.id} className={cn(BUBBLE_CLASS, "border-pet-border")}>
              {bubble.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
