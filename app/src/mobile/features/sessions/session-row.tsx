import { cn } from "cn";
import { ExternalLink, Loader2, X } from "lucide-react";
import type { SessionTool } from "@/protocol/messages";
import {
  displayStateText,
  rowTime,
  type SessionRow as SessionRowData,
  sessionTitle,
  workingActionText,
} from "@/shared/lib/sessions";
import { SignalBars, type SignalLevel, type SignalTone } from "@/shared/ui/signal-bars";

const SIGNAL_LEVEL: Record<SessionRowData["display"], SignalLevel> = {
  asking: 1,
  working: 2,
  completed: 3,
  idle: 1,
};

const SIGNAL_TONE: Record<SessionRowData["display"], SignalTone> = {
  asking: "decide",
  working: "signal",
  completed: "success",
  idle: "muted",
};

const STATE_TEXT_CLASS: Record<SessionRowData["display"], string> = {
  asking: "text-decide",
  working: "text-signal",
  completed: "text-success",
  idle: "text-muted-foreground",
};

/** 工作中：小圆环 + 「正在<动作>」，相对时间仍跟在行尾（D78）。 */
function WorkingStatus({ tool }: { tool: SessionTool | null | undefined }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-signal">
      <span
        aria-hidden="true"
        data-session-spinner
        className="size-2.5 shrink-0 animate-spin rounded-full border border-current border-t-transparent motion-reduce:animate-none"
      />
      <span className="min-w-0 truncate">{workingActionText(tool)} ·</span>
    </span>
  );
}

type SessionRowProps = {
  row: SessionRowData;
  /** compact = 宠物页最近 1 条（无清除按钮）；full = 动态页/等你决定页。 */
  variant?: "compact" | "full";
  pendingFocus?: boolean;
  pendingClear?: boolean;
  /** 缺省表示只读行（不渲染主按钮），清除等动作仍可用。 */
  onOpen?: () => void;
  onClear?: () => void;
  className?: string;
};

/**
 * AI 会话行（手机端共用）。
 *
 * 只展示协议白名单里的信息：标题、状态、相对时间、粗粒度工具动作；
 * 不展示提示词/回复/路径。D78：工作中行显示 spinner + 「正在<动作>」，
 * 无工具类别时「正在思考」；行尾保留相对时间。
 */
export function SessionRow({
  row,
  variant = "full",
  pendingFocus = false,
  pendingClear = false,
  onOpen,
  onClear,
  className,
}: SessionRowProps) {
  const asking = row.display === "asking";
  const title = sessionTitle(row);
  const actionLabel =
    variant === "compact"
      ? `最近会话 ${title}`
      : asking
        ? `在电脑上打开 ${title}`
        : `会话 ${title}`;

  const main = (
    <>
      <SignalBars
        level={SIGNAL_LEVEL[row.display]}
        tone={SIGNAL_TONE[row.display]}
        className="self-center"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[10px] whitespace-nowrap">
          {row.display === "working" ? (
            <WorkingStatus tool={row.tool} />
          ) : (
            <span className={cn("shrink-0", STATE_TEXT_CLASS[row.display])}>
              {displayStateText(row)} ·
            </span>
          )}
          <span className="min-w-0 truncate text-muted-foreground">{rowTime(row)}</span>
        </span>
      </span>
      {asking && (
        <ExternalLink
          aria-hidden="true"
          className={cn("size-3.5 shrink-0", STATE_TEXT_CLASS[row.display])}
        />
      )}
      {pendingFocus && (
        <Loader2
          aria-hidden="true"
          className="size-3.5 shrink-0 animate-spin text-muted-foreground"
        />
      )}
    </>
  );

  return (
    <li
      data-session-tool={row.tool ?? "none"}
      className={cn(
        "flex min-h-12 items-center gap-1 px-2",
        asking && "border-l-2 border-decide",
        className,
      )}
    >
      {onOpen ? (
        <button
          type="button"
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 py-1 text-left"
          aria-label={actionLabel}
          onClick={onOpen}
        >
          {main}
        </button>
      ) : (
        <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 py-1">{main}</div>
      )}

      {variant === "full" && onClear && (
        <button
          type="button"
          aria-label={pendingClear ? `确认清除会话 ${title}` : `清除会话 ${title}`}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
            pendingClear && "text-destructive hover:text-destructive",
          )}
          onClick={onClear}
        >
          {pendingClear ? (
            <span className="text-[10px]">再点一次</span>
          ) : (
            <X aria-hidden="true" className="size-3.5" />
          )}
        </button>
      )}
    </li>
  );
}
