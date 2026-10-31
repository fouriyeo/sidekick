import { cn } from "cn";
import type { Bubble } from "./types";

type PetBubbleProps = {
  bubble: Bubble | null;
  className?: string;
};

export function PetBubble({ bubble, className }: PetBubbleProps) {
  return (
    <div aria-live="polite" className={cn("pointer-events-none", className)}>
      {bubble && (
        <p
          key={bubble.id}
          className="line-clamp-2 max-w-full rounded-2xl border border-pet-border bg-card/95 px-4 py-3 text-[15px] leading-relaxed text-pet-text shadow-sm"
        >
          {bubble.text}
        </p>
      )}
    </div>
  );
}
