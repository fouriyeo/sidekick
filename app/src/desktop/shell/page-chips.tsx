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

/**
 * 页头状态胶囊：小圆点 + 文字。
 * 新设计里页头优先用「服务 / 手机 / AI」这类简短值放在列表行里，胶囊只作补充。
 */
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
        "inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 rounded-full bg-card px-2 text-[11.5px] shadow-[var(--card-shadow)]",
        className,
      )}
      title={title}
    >
      <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[tone])} />
      <span className={cn("truncate font-medium", TEXT_CLASS[tone])}>{label}</span>
    </span>
  );
}

const TAG_CLASS: Record<PageTone, string> = {
  muted: "bg-muted text-muted-foreground",
  signal: "bg-wash text-signal",
  decide: "bg-muted text-decide",
  success: "bg-muted text-success",
  danger: "bg-muted text-destructive",
};

/** 行内状态标签：小圆角、无边框，颜色只是第二线索。 */
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
        "inline-flex shrink-0 items-center rounded-[6px] px-1.5 py-0.5 text-[11px] leading-none font-medium",
        TAG_CLASS[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
