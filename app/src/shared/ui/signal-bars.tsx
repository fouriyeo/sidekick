import { cn } from "@/shared/lib/utils";

export type SignalLevel = 1 | 2 | 3;

export type SignalTone = "signal" | "muted" | "decide" | "success" | "danger";

const TONE_CLASS: Record<SignalTone, string> = {
  signal: "text-signal",
  muted: "text-muted-foreground",
  decide: "text-decide",
  success: "text-success",
  danger: "text-destructive",
};

const BAR_HEIGHT: Record<SignalLevel, string> = {
  1: "h-[4px]",
  2: "h-[7px]",
  3: "h-[10px]",
};

type SignalBarsProps = {
  level: SignalLevel;
  tone?: SignalTone;
  className?: string;
};

/**
 * 3 格信号：文字永远由调用方提供，这里只做第二线索。
 * 高度 4/7/10、宽度 2、间距 2；只改透明度，不做动画。
 */
export function SignalBars({ level, tone = "signal", className }: SignalBarsProps) {
  return (
    <span
      aria-hidden="true"
      data-signal-bars={level}
      className={cn("inline-flex shrink-0 items-end gap-[2px]", TONE_CLASS[tone], className)}
    >
      {[1, 2, 3].map((bar) => {
        const active = bar <= level;
        return (
          <span
            key={bar}
            className={cn(
              "w-[2px] rounded-full bg-current",
              BAR_HEIGHT[bar as SignalLevel],
              active ? "opacity-100" : "opacity-25",
            )}
          />
        );
      })}
    </span>
  );
}
