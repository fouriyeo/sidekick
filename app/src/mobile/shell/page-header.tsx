import { cn } from "cn";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  /** 一行 13/400 说明；不再用 mono 大写英文副标。 */
  sub?: string;
  onBack?: () => void;
  backLabel?: string;
  /** 右侧只放一个状态或动作（44dp）。 */
  right?: ReactNode;
  className?: string;
};

/**
 * 二级页页头 44（v16）：返回 44 热区 + 居中 inline 标题 17/400，
 * 可选一行 13/400 说明；右侧最多一个动作（44dp）。
 *
 * 标题绝对居中，不因返回键/右侧动作的宽度偏移；标题层不拦截指针，
 * 返回与右侧动作仍可点。一级页面自己的顶栏不走这个组件。
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
    <header className={cn("relative flex min-h-11 flex-none items-center px-5", className)}>
      {onBack ? (
        <button
          type="button"
          aria-label={backLabel}
          className="relative z-10 -ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-wash focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          onClick={onBack}
        >
          <ArrowLeft className="size-5" />
        </button>
      ) : (
        <span aria-hidden="true" className="size-11 shrink-0" />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex min-h-11 flex-col items-center justify-center px-14 text-center">
        <h1 className="max-w-full truncate text-[17px] leading-[22px] font-normal text-foreground">
          {title}
        </h1>
        {sub && (
          <span className="mt-0.5 block max-w-full truncate text-[13px] leading-[18px] font-normal text-muted-foreground">
            {sub}
          </span>
        )}
      </div>

      <span className="relative z-10 ml-auto flex size-11 shrink-0 items-center justify-center text-muted-foreground">
        {right}
      </span>
    </header>
  );
}
