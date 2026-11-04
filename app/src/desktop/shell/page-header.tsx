import { cn } from "cn";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  /** 标题右侧的状态胶囊（PageChip）。 */
  chips?: ReactNode;
  /** 右侧动作：最多一个主按钮，其余为次级。 */
  actions?: ReactNode;
  className?: string;
};

/**
 * 页头：高 56、标题 20/600、右侧最多一个主按钮。
 * 每个一级页 / 系统分段共用这一个骨架，标题位置永远一致。
 */
export function PageHeader({ title, description, chips, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center justify-between gap-5 border-b border-border",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col justify-center">
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-[20px] leading-none font-semibold tracking-[-0.01em]">
            {title}
          </h1>
          {chips}
        </div>
        {description && (
          <p className="mt-1 truncate text-[12px] leading-none text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
