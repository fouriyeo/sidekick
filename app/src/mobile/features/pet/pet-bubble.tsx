import { cn } from "cn";
import deepSea from "@/mobile/styles/deep-sea.module.css";
import { PetStatusCaption } from "./pet-status-caption";
import type { Bubble } from "./types";

type PetBubbleProps = {
  bubble: Bubble | null;
  /** AI 状态文案优先占用气泡槽位；可见文案 aria-hidden，由舞台 live region 播报。 */
  caption?: Bubble | null;
  className?: string;
};

/** 舞台闲聊气泡：深海卡、14px 圆角、1px 海水描边，不发光。 */
const BUBBLE_CLASS =
  "line-clamp-2 max-w-full rounded-[14px] border border-pet-border px-3.5 py-2.5 text-[15px] leading-relaxed text-pet-text";

export function PetBubble({ bubble, caption, className }: PetBubbleProps) {
  return (
    <div className={cn("pointer-events-none", className)}>
      {caption ? (
        <PetStatusCaption caption={caption} />
      ) : (
        <div aria-live="polite">
          {bubble && (
            <p key={bubble.id} className={cn(BUBBLE_CLASS, deepSea.surface)}>
              {bubble.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
