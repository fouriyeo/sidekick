import { cn } from "cn";

export type PageTone = "muted" | "signal" | "decide" | "success" | "danger";

const DOT_CLASS: Record<PageTone, string> = {
  muted: "bg-muted-foreground",
  signal: "bg-signal",
  decide: "bg-decide",
  success: "bg-success",
  danger: "bg-destructive",
};

const TEXT_CLASS: Record<PageTone, string> = {
  muted: "text-muted-foreground",
  signal: "text-signal",
  decide: "text-decide",
  success: "text-success",
  danger: "text-destructive",
};

/** 页头状态胶囊：小圆点 + 文字；文字永远在，颜色只是第二线索。 */
export function PageChip({
  label,
  tone = "muted",
  title,
  className,
}: {
  label: string;
  tone?: PageTone;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2 text-[11px]",
        className,
      )}
      title={title}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[tone])} />
      <span className={cn("truncate font-medium", TEXT_CLASS[tone])}>{label}</span>
    </span>
  );
}

/** 行内状态标签（会话行、列表行用）：更小、方角，和页头胶囊区分。 */
export function StateTag({
  label,
  tone = "muted",
  className,
}: {
  label: string;
  tone?: PageTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[5px] border border-border bg-popover px-1.5 py-0.5 text-[10px] leading-none font-medium",
        TEXT_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
