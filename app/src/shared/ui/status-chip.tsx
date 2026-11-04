import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { SignalBars, type SignalLevel, type SignalTone } from "./signal-bars";

const TONE_BORDER: Record<SignalTone, string> = {
  signal: "border-border",
  muted: "border-border",
  decide: "border-decide",
  success: "border-border",
  danger: "border-destructive",
};

const TONE_TEXT: Record<SignalTone, string> = {
  signal: "text-signal",
  muted: "text-muted-foreground",
  decide: "text-decide",
  success: "text-success",
  danger: "text-destructive",
};

type StatusChipProps = {
  /** 状态文字（必须存在；颜色只是第二线索）。 */
  label: ReactNode;
  level: SignalLevel;
  tone?: SignalTone;
  /** 可选的弱化副文（如「· 1 台设备」「· 2 分钟前」）。 */
  detail?: string;
  /** 有 onClick 时渲染为按钮（状态即入口）。 */
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
  title?: string;
};

/**
 * 状态胶囊：文字 + 3 格信号 + 颜色，三线索缺一不可。
 * 与页面主题一起走 `--signal` / `--decide` 等语义令牌，不写死颜色。
 */
export function StatusChip({
  label,
  level,
  tone = "signal",
  detail,
  onClick,
  className,
  ariaLabel,
  title,
}: StatusChipProps) {
  const content = (
    <>
      <SignalBars level={level} tone={tone} />
      <span className={cn("truncate font-medium", TONE_TEXT[tone])}>{label}</span>
      {detail && <span className="min-w-0 truncate text-muted-foreground">{detail}</span>}
    </>
  );

  const classes = cn(
    "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border bg-card px-2.5 text-[12px] transition-colors",
    TONE_BORDER[tone],
    onClick &&
      "cursor-pointer hover:bg-wash focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none",
    className,
  );

  if (!onClick) {
    return (
      <span className={classes} title={title}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
    >
      {content}
    </button>
  );
}
