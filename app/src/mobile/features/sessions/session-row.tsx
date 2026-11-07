import { cn } from "cn";
import { ChevronRight, Dot } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  displayStateText,
  rowTime,
  type SessionRow as SessionRowData,
  sessionTitle,
  workingActionText,
} from "@/shared/lib/sessions";
import { HintAsk, HintCheck, LoadingOrbit } from "@/shared/ui/motion";
import { useSwipeRow } from "./use-swipe-row";

/**
 * 宠物页会话行（v16）。
 *
 * 左侧 20 状态图标（统一取自 shared/ui/motion，D109）：working = 薄荷轨道弧 /
 * completed = 薄荷描线对勾 + 行尾 › / asking = 琥珀涟漪 / idle = 灰点；
 * 标题 13/18、副行 11.5/16，行高 50（D107）。
 *
 * 清除：左滑行内容露出右侧 72×52「清除」按钮，点按钮才清除（D95）。
 * 行内容整体左移，分隔线/白卡底随内容一起走；按钮常驻 DOM、可聚焦，
 * TalkBack / 键盘聚焦时自动展开，作为滑动手势的无障碍兜底。
 */
const TERTIARY_TEXT = "text-[color:var(--tertiary,var(--muted-foreground))]";

/** 状态图标：只做第二线索，文案仍在副行里。 */
function StatusIcon({ display }: { display: SessionRowData["display"] }) {
  switch (display) {
    case "working":
      return <LoadingOrbit size={20} className="shrink-0 text-signal" />;
    case "completed":
      // 薄荷对勾 = 可以点它把电脑上的 DSH 切到前台（D107），描线动画只在挂载时播一次。
      return <HintCheck size={20} mode="draw" className="shrink-0 text-signal" />;
    case "asking":
      return <HintAsk size={20} className="shrink-0 text-decide" />;
    default:
      return <Dot aria-hidden="true" className="size-5 text-muted-foreground" strokeWidth={3} />;
  }
}

type SessionRowProps = {
  row: SessionRowData;
  /** 请求电脑唤起中的行尾反馈（只有非宠物页会用到）。 */
  pendingFocus?: boolean;
  /** 左滑展开态；由 SessionFeed 统一管理，一次只开一行。 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 拖动越过展开阈值（触感）。 */
  onReveal?: () => void;
  /** 缺省表示只读行（不渲染主按钮），清除等动作仍可用。 */
  onOpen?: () => void;
  onClear?: () => void;
  /** 刚完成：行内容铺 1.4s 薄荷脉冲，帮用户指出是哪一条（D107）。 */
  fresh?: boolean;
  className?: string;
};

/**
 * AI 会话行（手机端共用）。
 *
 * 只展示协议白名单里的信息：标题、状态、相对时间、粗粒度工具动作；
 * 不展示提示词/回复/路径。D78：工作中显示「正在<动作>」（无工具类别时「正在思考」），
 * 行尾保留相对时间；v16 把 spinner 移到左侧状态图标，副行不再重复放 spinner。
 */
export function SessionRow({
  row,
  pendingFocus = false,
  open = false,
  onOpenChange,
  onReveal,
  onOpen,
  onClear,
  fresh = false,
  className,
}: SessionRowProps) {
  const asking = row.display === "asking";
  const completed = row.display === "completed";
  const title = sessionTitle(row);
  // 可点行（asking / 已完成）统一说「在电脑上打开」；只读行不渲染按钮。
  const actionLabel = `在电脑上打开 ${title}`;
  const statusText =
    row.display === "working" ? workingActionText(row.tool) : displayStateText(row);

  const rootRef = useRef<HTMLLIElement | null>(null);
  const { contentRef, consumeClickSuppression, handlers } = useSwipeRow({
    open,
    onOpenChange: onOpenChange ?? (() => undefined),
    onReveal,
  });

  // 点行外收起（capture：先于目标行自己的手势/点击）。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (event.target instanceof Node && root.contains(event.target)) return;
      onOpenChange?.(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, onOpenChange]);

  const text = (
    <>
      <span className="block truncate text-[13px] leading-[18px] font-normal text-foreground">
        {title}
      </span>
      {completed ? (
        <span className="mt-[3px] block truncate text-[11.5px] leading-4 font-normal text-muted-foreground">
          <span className="text-signal">{statusText}</span> · {rowTime(row)}
        </span>
      ) : (
        <span
          className={cn(
            "mt-[3px] block truncate text-[11.5px] leading-4 font-normal",
            asking ? "text-decide" : "text-muted-foreground",
          )}
        >
          {statusText} · {rowTime(row)}
        </span>
      )}
    </>
  );

  return (
    <li
      ref={rootRef}
      data-session-tool={row.tool ?? "none"}
      className={cn("ms-row relative h-[50px] overflow-hidden", className)}
    >
      <div
        ref={contentRef}
        data-swipe-content=""
        className={cn(
          "ms-swipe-content relative z-10 flex h-full items-center gap-2.5 px-3.5",
          row.display === "working" ? "bg-[var(--wash)]" : "bg-card",
          fresh && "ms-row-fresh",
        )}
        {...handlers}
        onClickCapture={(event) => {
          // 拖动结束后浏览器仍可能补一个 click；只吞这一次。
          if (!consumeClickSuppression()) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {/* 行分隔线从图标右侧起始（14 padding + 20 图标 + 10 gap = 44）。 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 left-[44px] h-[0.5px] bg-border"
        />

        <span className="flex size-5 shrink-0 items-center justify-center">
          <StatusIcon display={row.display} />
        </span>

        {onOpen ? (
          <button
            type="button"
            className="flex h-full min-w-0 flex-1 flex-col justify-center text-left"
            aria-label={actionLabel}
            onClick={(event) => {
              if (open) {
                event.stopPropagation();
                onOpenChange?.(false);
                return;
              }
              onOpen();
            }}
          >
            {text}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col justify-center">{text}</div>
        )}

        {pendingFocus ? (
          <LoadingOrbit size={14} className="shrink-0 text-muted-foreground" />
        ) : onOpen && completed ? (
          <ChevronRight aria-hidden="true" className={cn("size-3.5 shrink-0", TERTIARY_TEXT)} />
        ) : null}
      </div>

      {/* 露出的清除按钮：在行内容下面，内容左移后可见。 */}
      <button
        type="button"
        aria-label={`清除会话 ${title}`}
        className="absolute inset-y-0 right-0 z-0 flex w-[72px] items-center justify-center bg-destructive text-[14px] leading-none text-destructive-foreground"
        onFocus={() => onOpenChange?.(true)}
        onClick={() => {
          onOpenChange?.(false);
          onClear?.();
        }}
      >
        清除
      </button>
    </li>
  );
}
