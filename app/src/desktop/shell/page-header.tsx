import { cn } from "cn";
import { ChevronLeft } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";

/** 页面滚动状态：PageShell 提供，PageHeader 用来切换「大标题 → 玻璃工具栏」。 */
const PageScrollContext = createContext(false);

export function usePageScrolled(): boolean {
  return useContext(PageScrollContext);
}

export { PageScrollContext };

type PageHeaderProps = {
  title: string;
  /** @deprecated 新设计不在标题下写说明句；旧页面过渡期仍可传。 */
  description?: string;
  /** 标题右侧的状态胶囊。 */
  chips?: ReactNode;
  /** 右侧动作：最多两个，放进玻璃工具栏。 */
  actions?: ReactNode;
  /** 二级页（设置里点进去的页）的返回回调；有值时工具栏左侧出现「‹ 返回」。 */
  onBack?: () => void;
  backLabel?: string;
  /** 宽幅数据页：不显示 34/600 大标题，工具栏标题常显（用量页，D97）。 */
  compact?: boolean;
  className?: string;
};

/**
 * 页面标题：sticky 玻璃工具栏 + 可滚动的大标题（iOS 26 观感）。
 *
 * - 未滚动：工具栏透明，只显示右侧动作；大标题 34/600 在工具栏下方。
 * - 滚动后：工具栏浮成玻璃胶囊，左侧淡入 17/600 紧凑标题，内容从玻璃下滚过。
 * - 二级页：返回按钮在工具栏左侧，工具栏本身是窗口拖动区。
 */
export function PageHeader({
  title,
  description,
  chips,
  actions,
  onBack,
  backLabel = "返回",
  compact = false,
  className,
}: PageHeaderProps) {
  const scrolled = usePageScrolled();

  return (
    <>
      <div
        className={cn("dsl-topbar-wrap sticky top-0 z-30 pt-2 pb-1", className)}
        data-scrolled={scrolled ? "true" : "false"}
      >
        <header
          data-tauri-drag-region="deep"
          className="dsl-topbar flex h-12 items-center gap-2 rounded-[18px] px-2"
          data-scrolled={scrolled ? "true" : "false"}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex h-8 items-center gap-0.5 rounded-full pr-2.5 pl-1.5 text-[14px] text-signal transition-colors outline-none hover:bg-accent active:scale-[0.97]"
              >
                <ChevronLeft aria-hidden="true" className="size-[18px]" strokeWidth={2.5} />
                {backLabel}
              </button>
            )}
            <span
              aria-hidden="true"
              className={cn(
                "truncate text-[17px] font-semibold tracking-[-0.015em] transition-all duration-300",
                compact || scrolled ? "opacity-100" : "translate-y-1 opacity-0",
              )}
            >
              {title}
            </span>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2 pr-1">{actions}</div>}
        </header>
      </div>

      {compact ? (
        <h1 className="sr-only">{title}</h1>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3 pt-1 pb-1">
            <h1 className="truncate text-[34px] leading-none font-semibold tracking-[-0.022em]">
              {title}
            </h1>
            {chips && <div className="flex shrink-0 items-center gap-1.5 pb-1">{chips}</div>}
          </div>
          {description && (
            <p className="max-w-[62ch] truncate text-[14px] leading-[1.45] text-muted-foreground">
              {description}
            </p>
          )}
        </>
      )}
    </>
  );
}
