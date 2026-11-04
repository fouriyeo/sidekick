import { cn } from "cn";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  /** mono 副标：一句上下文，不重复标题。 */
  sub?: string;
  onBack?: () => void;
  backLabel?: string;
  /** 右侧只放一个状态或动作（44dp）。 */
  right?: ReactNode;
  className?: string;
};

/**
 * 二级页页头 44：返回 44 热区 + 居中标题（15–17/600）+ mono 副标；右侧最多一个动作。
 * 底部三档里的「动态 / 更多」没有返回按钮（返回键仍回宠物），布局用等宽占位保持标题居中。
 */
export function PageHeader({
  title,
  sub,
  onBack,
  backLabel = "返回",
  right,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-h-11 flex-none items-center gap-1 px-[calc(env(safe-area-inset-left)+6px)] pr-[calc(env(safe-area-inset-right)+6px)]",
        className,
      )}
    >
      {onBack ? (
        <button
          type="button"
          aria-label={backLabel}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-wash hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          onClick={onBack}
        >
          <ArrowLeft className="size-5" />
        </button>
      ) : (
        <span aria-hidden="true" className="size-11 shrink-0" />
      )}

      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate text-[15px] leading-tight font-semibold tracking-[-0.01em]">
          {title}
        </h1>
        {sub && (
          <span className="mt-0.5 block truncate font-mono text-[9.5px] tracking-[0.14em] text-muted-foreground uppercase">
            {sub}
          </span>
        )}
      </div>

      <span className="flex size-11 shrink-0 items-center justify-center">{right}</span>
    </header>
  );
}
