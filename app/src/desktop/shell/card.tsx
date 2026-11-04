import { cn } from "cn";
import type { ReactNode } from "react";

type CardProps = {
  /** 卡头标题；可带一个 lucide 图标（`[&_svg]` 统一尺寸与弱化颜色）。 */
  title?: ReactNode;
  /** 卡头下的等宽小字副标，如 `VOICE · 最近一次`。 */
  subtitle?: string;
  /** 卡头右侧的状态标签 / 计数。 */
  pill?: ReactNode;
  children: ReactNode;
  /** 卡脚：低频动作与说明；有值时自动加顶部分隔线。 */
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/**
 * 指挥舱卡片：`--card` 底 + 1px 边框 + 14 圆角，卡头 = 标题 + mono 副标，
 * 卡脚只放低频动作。所有页面共用同一套间距，位置不漂移。
 */
export function Card({
  title,
  subtitle,
  pill,
  children,
  footer,
  className,
  bodyClassName,
}: CardProps) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-2 rounded-[14px] border border-border bg-card p-3.5",
        className,
      )}
    >
      {(title || pill) && (
        <header className="flex shrink-0 items-start justify-between gap-2.5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-[13px] leading-tight font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 truncate font-mono text-[9px] tracking-[0.13em] text-muted-foreground uppercase">
                {subtitle}
              </p>
            )}
          </div>
          {pill && <div className="shrink-0">{pill}</div>}
        </header>
      )}
      <div className={cn("flex min-h-0 flex-col gap-2", bodyClassName)}>{children}</div>
      {footer && (
        <footer className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-border pt-2">
          {footer}
        </footer>
      )}
    </section>
  );
}

/** 卡片里的键值行：左侧弱化标签、右侧值（可 mono）。 */
export function MetaRow({
  label,
  value,
  mono = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-6 items-center justify-between gap-3 text-[11px]", className)}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-foreground",
          mono && "font-mono text-[10px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** 卡片里的一句弱化提示。 */
export function CardHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[10.5px] leading-relaxed text-muted-foreground", className)}>
      {children}
    </p>
  );
}
