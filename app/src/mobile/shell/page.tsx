import { cn } from "cn";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type MobilePageProps = ComponentPropsWithoutRef<"section"> & {
  /** 宠物页用 pet 舞台令牌；其余页面用页面壳层令牌。 */
  tone?: "page" | "stage";
};

/**
 * 手机全屏页外壳：固定竖屏、安全区避让、不产生横向滚动。
 * 页面自己决定内部滚动区域（`PageScroll` 或聊天页的 flex 流）。
 */
export function MobilePage({ tone = "page", className, children, ...props }: MobilePageProps) {
  return (
    <section
      className={cn(
        "relative flex h-dvh w-full flex-col overflow-hidden pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
        tone === "stage" ? "bg-pet-bg text-pet-text" : "bg-background text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

/** 页内可滚动内容区（左右 12–20、底部留白）；内部列表再单独限高滚动。 */
export function PageScroll({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-6", className)}
    >
      {children}
    </div>
  );
}
