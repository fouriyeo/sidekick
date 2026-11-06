import { cn } from "cn";
import { type ReactNode, useState } from "react";
import { PageScrollContext } from "@/desktop/shell/page-header";

/**
 * 页面滚动容器 + 内容列（iOS 分组列表 760 单列）。
 *
 * 滚动位置只用来告诉 PageHeader「要不要变成玻璃工具栏」；
 * 进入动画（`dsl-page-in`）在换页时自然重播，reduce-motion 下由 CSS 关掉。
 */
export function PageShell({
  children,
  className,
  transition = "fade",
}: {
  children: ReactNode;
  className?: string;
  /** fade = 一级页切换；push = 设置二级页从右侧推入（iOS push 动效）。 */
  transition?: "fade" | "push";
}) {
  const [scrolled, setScrolled] = useState(false);

  return (
    <PageScrollContext.Provider value={scrolled}>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          data-page-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          onScroll={(event) => {
            const next = event.currentTarget.scrollTop > 6;
            setScrolled((current) => (current === next ? current : next));
          }}
        >
          <div
            className={cn(
              "mx-auto flex w-full max-w-[730px] flex-col px-7 pb-16",
              transition === "push" ? "dsl-page-push" : "dsl-page-in",
              className,
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </PageScrollContext.Provider>
  );
}

/** 标题与列表之间：组与组固定 24，和 iOS 分组列表的呼吸感一致。 */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mt-6 flex flex-col gap-6", className)}>{children}</div>;
}

/** @deprecated 新设计没有页脚栏，保留导出仅为过渡期兼容。 */
export function PageFooter({ children }: { children?: ReactNode }) {
  void children;
  return null;
}
