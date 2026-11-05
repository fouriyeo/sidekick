import { cn } from "cn";
import { Check, Dot, Loader2, X } from "lucide-react";
import {
  displayStateText,
  rowTime,
  type SessionRow as SessionRowData,
  sessionTitle,
  workingActionText,
} from "@/shared/lib/sessions";

/**
 * v16 消息区的一行会话（16/400 标题 + 13/400「状态 · 相对时间」）。
 *
 * 左侧 20 状态图标：working = 薄荷 spinner / completed = 灰 check /
 * asking = 8px 琥珀点 + 轻外圈 / idle = 灰点；不再用信号格、mono、字重。
 * 右侧 14 ×（28×28 热区，tertiary）；pendingClear 时变「再点」并转 destructive。
 */
const TERTIARY_TEXT = "text-[color:var(--tertiary,var(--muted-foreground))]";

/** 状态图标：只做第二线索，文案仍在副行里。 */
function StatusIcon({ display }: { display: SessionRowData["display"] }) {
  switch (display) {
    case "working":
      return (
        <Loader2
          aria-hidden="true"
          className="size-5 animate-spin text-signal motion-reduce:animate-none"
        />
      );
    case "completed":
      return <Check aria-hidden="true" className={cn("size-5", TERTIARY_TEXT)} />;
    case "asking":
      return (
        <span aria-hidden="true" className="relative flex size-4 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-decide opacity-30" />
          <span className="size-2 rounded-full bg-decide" />
        </span>
      );
    default:
      return <Dot aria-hidden="true" className="size-5 text-muted-foreground" strokeWidth={3} />;
  }
}

type SessionRowProps = {
  row: SessionRowData;
  /** 请求电脑唤起中的行尾反馈（只有非宠物页会用到）。 */
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
 * 不展示提示词/回复/路径。D78：工作中显示「正在<动作>」（无工具类别时「正在思考」），
 * 行尾保留相对时间；v16 把 spinner 移到左侧状态图标，副行不再重复放 spinner。
 */
export function SessionRow({
  row,
  pendingFocus = false,
  pendingClear = false,
  onOpen,
  onClear,
  className,
}: SessionRowProps) {
  const asking = row.display === "asking";
  const title = sessionTitle(row);
  const actionLabel = asking ? `在电脑上打开 ${title}` : `会话 ${title}`;
  const statusText =
    row.display === "working" ? workingActionText(row.tool) : displayStateText(row);

  const text = (
    <>
      <span className="block truncate text-[15px] leading-5 text-foreground">{title}</span>
      <span
        className={cn(
          "mt-px block truncate text-[13px] leading-[17px] font-normal",
          asking ? "text-decide" : "text-muted-foreground",
        )}
      >
        {statusText} · {rowTime(row)}
      </span>
    </>
  );

  return (
    <li
      data-session-tool={row.tool ?? "none"}
      className={cn(
        "relative flex h-[52px] items-center gap-2.5 px-3.5",
        row.display === "working" && "bg-[var(--wash)]",
        className,
      )}
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
          onClick={onOpen}
        >
          {text}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col justify-center">{text}</div>
      )}

      {pendingFocus && (
        <Loader2
          aria-hidden="true"
          className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
        />
      )}

      {onClear && (
        <button
          type="button"
          aria-label={pendingClear ? `确认清除会话 ${title}` : `清除会话 ${title}`}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
            pendingClear ? "text-destructive" : cn(TERTIARY_TEXT, "hover:text-foreground"),
          )}
          onClick={onClear}
        >
          {pendingClear ? (
            <span className="text-[10px] leading-none">再点</span>
          ) : (
            <X aria-hidden="true" className="size-3.5" />
          )}
        </button>
      )}
    </li>
  );
}
