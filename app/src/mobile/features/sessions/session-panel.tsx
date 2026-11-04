import { cn } from "cn";
import { ChevronDown, ChevronUp, ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import deepSea from "@/mobile/styles/deep-sea.module.css";
import { pushBackHandler } from "@/mobile/system-back";
import type { SessionTool } from "@/protocol/messages";
import { formatRelativeTime } from "@/shared/lib/format";
import { type SessionRow, useSessionStore, visibleSessions } from "./session-store";

type SessionPanelProps = {
  active: boolean;
  /** 触摸面板时唤醒变暗/控制栏。 */
  onInteract?: () => void;
};

/** 方向 B：状态用 1–3 格信号强度表达，颜色只是第二线索（色弱也能读）。 */
const SIGNAL_LEVEL: Record<SessionRow["display"], number> = {
  asking: 1,
  working: 2,
  completed: 3,
  idle: 1,
};

const TONE_CLASS: Record<SessionRow["display"], string> = {
  asking: "text-pet-ask",
  working: "text-pet-signal",
  completed: "text-pet-success",
  idle: "text-pet-muted",
};

function displayStateText(row: SessionRow): string {
  switch (row.display) {
    case "asking":
      return row.askKind === "approval" ? "等你审批" : "等你决定";
    case "working":
      return "工作中";
    case "completed":
      return "已完成";
    default:
      return "空闲";
  }
}

/** 工作中行第二行的中文动作：只展示协议白名单里的粗粒度类别。 */
const TOOL_ACTION_TEXT: Record<SessionTool, string> = {
  bash: "运行命令",
  read: "阅读文件",
  edit: "修改文件",
  search: "搜索代码",
  web: "查资料",
  agent: "处理子任务",
  plan: "整理计划",
  tool: "使用工具",
};

function workingActionText(tool: SessionTool | null | undefined): string {
  return tool ? `正在${TOOL_ACTION_TEXT[tool]}` : "正在思考";
}

function sessionTitle(row: SessionRow): string {
  if (row.title) return row.title;
  return `新会话 ${row.id.slice(-4)}`;
}

function rowTime(row: SessionRow): string {
  const at = row.display === "completed" && row.completedAt ? row.completedAt : row.lastEventAt;
  return formatRelativeTime(at);
}

/** 三格信号条：asking 1 格、working 2 格、completed 3 格、idle 1 格（灰）。 */
function SignalBars({ display }: { display: SessionRow["display"] }) {
  const level = SIGNAL_LEVEL[display];
  return (
    <span
      aria-hidden="true"
      data-signal-bars={level}
      className={cn("inline-flex h-2.5 shrink-0 items-end gap-0.5", TONE_CLASS[display])}
    >
      {[4, 7, 10].map((height, index) => (
        <i
          key={height}
          className={cn(
            "w-0.5 rounded-[1px] bg-current",
            index < level ? "opacity-100" : "opacity-30",
          )}
          style={{ height }}
        />
      ))}
    </span>
  );
}

/** 工作中：小圆环 + 「正在<动作>」，颜色 pet-signal；相对时间仍跟在行尾。 */
function WorkingStatus({ tool }: { tool: SessionTool | null | undefined }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-pet-signal">
      <span
        aria-hidden="true"
        data-session-spinner
        className="size-2.5 shrink-0 animate-spin rounded-full border border-current border-t-transparent motion-reduce:animate-none"
      />
      <span className="min-w-0 truncate">{workingActionText(tool)} ·</span>
    </span>
  );
}

export function SessionPanel({ active, onInteract }: SessionPanelProps) {
  const raw = useSessionStore((state) => state.raw);
  const cleared = useSessionStore((state) => state.cleared);
  const hydrated = useSessionStore((state) => state.hydrated);
  const expanded = useSessionStore((state) => state.expanded);
  const notice = useSessionStore((state) => state.notice);
  const noticeId = useSessionStore((state) => state.noticeId);
  const pendingFocusId = useSessionStore((state) => state.pendingFocusId);
  const pendingClearId = useSessionStore((state) => state.pendingClearId);
  const toggle = useSessionStore((state) => state.toggle);
  const clear = useSessionStore((state) => state.clear);
  const requestFocus = useSessionStore((state) => state.requestFocus);

  const rows = useMemo(() => visibleSessions(raw, cleared), [raw, cleared]);
  const top = rows[0];

  // 展开时消费返回键：先收起列表，再退回根页面的退出逻辑。
  useEffect(() => {
    if (!expanded) return;
    return pushBackHandler(() => {
      toggle();
      return true;
    });
  }, [expanded, toggle]);

  if (!active || !hydrated) return null;

  // 最后一个会话被清除时面板暂时只留一条提示，避免「点了清除没有任何反馈」。
  if (!top) {
    if (!notice) return null;
    return (
      <section
        aria-label="AI 会话列表"
        className="absolute left-0 right-0 z-20 mx-auto w-[min(92vw,520px)] pointer-events-auto top-[calc(env(safe-area-inset-top)+64px)]"
        onPointerDown={onInteract}
      >
        <div className={cn("rounded-[14px] border border-pet-border", deepSea.surface)}>
          <p
            key={noticeId}
            role="status"
            aria-live="polite"
            className="px-3 py-2 font-mono text-[10.5px] leading-relaxed text-pet-muted"
          >
            {notice}
          </p>
        </div>
      </section>
    );
  }

  const askingCount = rows.filter((row) => row.display === "asking").length;
  const summary =
    askingCount > 0 ? `${rows.length} 个 · ${askingCount} 个等你决定` : `${rows.length} 个`;

  function openRow(row: SessionRow) {
    if (row.display === "asking") {
      requestFocus(row.id);
      return;
    }
    if (!expanded) toggle();
  }

  return (
    <section
      aria-label="AI 会话列表"
      className="absolute left-0 right-0 z-20 mx-auto w-[min(92vw,520px)] pointer-events-auto top-[calc(env(safe-area-inset-top)+64px)]"
      onPointerDown={onInteract}
    >
      <div
        className={cn("overflow-hidden rounded-[14px] border border-pet-border", deepSea.surface)}
      >
        {expanded && (
          <div className="flex min-h-11 items-center justify-between gap-2 px-3">
            <span className="flex shrink-0 items-baseline gap-1.5">
              <span className="text-xs font-medium text-pet-text">会话</span>
              <span className="font-mono text-[10px] tracking-[0.14em] text-pet-muted">
                · {String(rows.length).padStart(2, "0")}
              </span>
            </span>
            <span className="min-w-0 truncate font-mono text-[10px] text-pet-muted">{summary}</span>
            <button
              type="button"
              aria-label="收起会话列表"
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-pet-muted hover:text-pet-text"
              onClick={toggle}
            >
              <ChevronUp className="size-4" />
            </button>
          </div>
        )}

        {expanded ? (
          <ul className="max-h-[244px] list-none overflow-y-auto border-t border-pet-border p-0">
            {rows.map((row) => (
              <SessionRowItem
                key={row.id}
                row={row}
                expanded
                pendingFocus={pendingFocusId === row.id}
                pendingClear={pendingClearId === row.id}
                onOpen={() => openRow(row)}
                onClear={() => clear(row.id)}
              />
            ))}
          </ul>
        ) : (
          <ul className="list-none p-0">
            <SessionRowItem
              row={top}
              expanded={false}
              pendingFocus={pendingFocusId === top.id}
              pendingClear={pendingClearId === top.id}
              onOpen={() => openRow(top)}
              onClear={() => clear(top.id)}
              onExpand={toggle}
            />
          </ul>
        )}

        {notice && (
          <p
            key={noticeId}
            role="status"
            aria-live="polite"
            className="border-t border-pet-border px-3 py-2 font-mono text-[10.5px] leading-relaxed text-pet-muted"
          >
            {notice}
          </p>
        )}
      </div>
    </section>
  );
}

function SessionRowItem({
  row,
  expanded,
  pendingFocus,
  pendingClear,
  onOpen,
  onClear,
  onExpand,
}: {
  row: SessionRow;
  expanded: boolean;
  pendingFocus: boolean;
  pendingClear: boolean;
  onOpen: () => void;
  onClear: () => void;
  onExpand?: () => void;
}) {
  const asking = row.display === "asking";
  const title = sessionTitle(row);
  const actionLabel = asking ? `在电脑上打开 ${title}` : `会话 ${title}`;

  return (
    <li
      data-session-tool={row.tool ?? "none"}
      className={cn(
        "flex min-h-12 items-center gap-1 px-2",
        asking ? deepSea.wash : undefined,
        expanded ? "border-t border-pet-border first:border-t-0" : undefined,
      )}
    >
      <button
        type="button"
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 py-1 text-left"
        aria-label={actionLabel}
        onClick={onOpen}
      >
        <SignalBars display={row.display} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-pet-text">{title}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-[10px] whitespace-nowrap">
            {row.display === "working" ? (
              <WorkingStatus tool={row.tool} />
            ) : (
              <span className={cn("shrink-0", TONE_CLASS[row.display])}>
                {displayStateText(row)} ·
              </span>
            )}
            <span className="min-w-0 truncate text-pet-muted">{rowTime(row)}</span>
          </span>
        </span>
        {asking && (
          <ExternalLink
            aria-hidden="true"
            className={cn("size-3.5 shrink-0", TONE_CLASS[row.display])}
          />
        )}
        {pendingFocus && (
          <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-pet-muted" />
        )}
      </button>

      <button
        type="button"
        aria-label={pendingClear ? `确认清除会话 ${title}` : `清除会话 ${title}`}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full text-pet-muted hover:text-pet-text",
          pendingClear ? "text-pet-danger hover:text-pet-danger" : undefined,
        )}
        onClick={onClear}
      >
        {pendingClear ? (
          <span className="text-[10px]">再点一次</span>
        ) : (
          <X aria-hidden="true" className="size-3.5" />
        )}
      </button>

      {onExpand && (
        <button
          type="button"
          aria-label="展开会话列表"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-pet-muted hover:text-pet-text"
          onClick={onExpand}
        >
          <ChevronDown aria-hidden="true" className="size-4" />
        </button>
      )}
    </li>
  );
}
