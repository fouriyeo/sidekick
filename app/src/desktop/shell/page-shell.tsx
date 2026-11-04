import { cn } from "cn";
import type { ReactNode } from "react";

/** 内容区：左右 24、最大宽 880 居中；页头固定、页体滚动、页脚固定在底部。 */
export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-3">
      <div className={cn("mx-auto flex min-h-0 w-full max-w-[880px] flex-1 flex-col", className)}>
        {children}
      </div>
    </div>
  );
}

/**
 * 页头下方的内容区：自身纵向滚动（`overflow-y-auto` + `min-h-0`），
 * 窗口最小 960×640 时内容不会被窗口底裁切；页脚在滚动区之外保持可见。
 */
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5", className)}
    >
      {children}
    </div>
  );
}

/** 页脚：只有低频操作与版本，固定在内容区下方、不参与页体滚动。 */
export function PageFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
      {children}
    </div>
  );
}
