import { cn } from "cn";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
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
  size = "regular",
  tone = "default",
  bottomGap = "regular",
}: {
  children: ReactNode;
  className?: string;
  /** fade = 一级页切换；push = 设置二级页从右侧推入（iOS push 动效）。 */
  transition?: "fade" | "push";
  /** regular = 730 单列；wide = 956（用量等宽幅数据页，D97）。 */
  size?: "regular" | "wide";
  /** usage = 用量页的深海/海玻璃画布底色（页面级例外）。 */
  tone?: "default" | "usage";
  /** compact = 底部 24，宽幅数据页首屏尽量不出现滚动。 */
  bottomGap?: "regular" | "compact";
}) {
  const [scrolled, setScrolled] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  /**
   * 内容列到滚动视口两边的留白（1180 窗口 = 141px）。
   *
   * 页头那层「滚动边缘」必须铺满整个滚动视口：只铺内容列宽度的话，两侧会留下
   * 直边，看起来就是「中间一条白条」。列宽在 CSS 里是 max-w 固定值、视口宽度是
   * 任意值，所以这里量一次给 `.dsl-topbar-wrap` 做负外边距 + 等量内边距。
   */
  const [bleed, setBleed] = useState(0);

  useEffect(() => {
    const measure = () => {
      const scroller = scrollerRef.current;
      const column = columnRef.current;
      if (!scroller || !column) return;
      const columnPadding = 28 * 2; // px-7
      const inner = column.offsetWidth - columnPadding;
      setBleed(Math.max(0, Math.round((scroller.clientWidth - inner) / 2)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (scrollerRef.current) observer.observe(scrollerRef.current);
    if (columnRef.current) observer.observe(columnRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <PageScrollContext.Provider value={scrolled}>
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{ "--dsl-bleed": `${bleed}px` } as CSSProperties}
      >
        <div
          ref={scrollerRef}
          data-page-scroll
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            tone === "usage" && "dsl-usage-canvas",
          )}
          onScroll={(event) => {
            const next = event.currentTarget.scrollTop > 6;
            setScrolled((current) => (current === next ? current : next));
          }}
        >
          <div
            ref={columnRef}
            className={cn(
              "mx-auto flex w-full flex-col px-7",
              size === "wide" ? "max-w-[956px]" : "max-w-[730px]",
              bottomGap === "compact" ? "pb-6" : "pb-16",
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
