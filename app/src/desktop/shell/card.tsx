import { cn } from "cn";
import type { ReactNode } from "react";
import { ListGroup } from "@/desktop/shell/list";

/**
 * 兼容层：旧 Card / MetaRow / CardHint 语义保留，外观换成 iOS 分组卡。
 * 新界面优先用 `ListGroup` / `ListRow`；这三个只给还没重写的 Section 用。
 */
export function Card({
  title,
  pill,
  children,
  footer,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  /** @deprecated 新设计不显示 mono 副标，传了也不会渲染。 */
  subtitle?: string;
  pill?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <ListGroup title={title} action={pill} className={className}>
      <div className={cn("px-4 py-4", bodyClassName)}>{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">{footer}</div>
      )}
    </ListGroup>
  );
}

/** 卡内键值行：左侧弱化标签、右侧值（可 mono）。 */
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
    <div
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 border-b border-[var(--separator)] py-2 text-[15px] last:border-b-0",
        className,
      )}
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-foreground tabular-nums",
          mono && "font-mono text-[13px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** 卡内一句弱化说明；新设计里只在确实需要时才用。 */
export function CardHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[13px] leading-[1.45] text-muted-foreground", className)}>{children}</p>
  );
}
