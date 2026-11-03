import { cn } from "cn";
import { ChevronDown, ChevronUp, ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { pushBackHandler } from "@/mobile/system-back";
import { formatRelativeTime } from "@/shared/lib/format";
import { type SessionRow, useSessionStore, visibleSessions } from "./session-store";

type SessionPanelProps = {
  active: boolean;
  /** 触摸面板时唤醒变暗/控制栏。 */
  onInteract?: () => void;
};

const DOT_CLASS: Record<SessionRow["display"], string> = {
  asking: "bg-pet-coral",
  working: "bg-pet-primary",
  completed: "bg-pet-success",
  idle: "bg-pet-muted",
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

function sessionTitle(row: SessionRow): string {
  if (row.title) return row.title;
  return `新会话 ${row.id.slice(-4)}`;
}

function rowTime(row: SessionRow): string {
  const at = row.display === "completed" && row.completedAt ? row.completedAt : row.lastEventAt;
  return formatRelativeTime(at);
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
        <div className="rounded-2xl border border-pet-border bg-pet-bg shadow-lg">
          <p
            key={noticeId}
            role="status"
            aria-live="polite"
            className="px-3 py-2 text-[11px] leading-relaxed text-pet-muted"
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
      <div className="overflow-hidden rounded-2xl border border-pet-border bg-pet-bg shadow-lg">
        {expanded && (
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-xs font-medium text-pet-text">会话</span>
            <span className="min-w-0 truncate text-[11px] text-pet-muted">{summary}</span>
            <button
              type="button"
              aria-label="收起会话列表"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-pet-muted"
              onClick={toggle}
            >
              <ChevronUp className="size-4" />
            </button>
          </div>
        )}

        {expanded ? (
          <ul className="max-h-[240px] list-none overflow-y-auto border-t border-pet-border p-0">
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
            className="border-t border-pet-border px-3 py-1.5 text-[11px] leading-relaxed text-pet-muted"
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
      className={cn(
        "flex items-center gap-1.5 px-3 py-2",
        asking ? "bg-secondary" : undefined,
        expanded ? "border-t border-pet-border first:border-t-0" : undefined,
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        aria-label={actionLabel}
        onClick={onOpen}
      >
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", DOT_CLASS[row.display])}
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-xs font-medium",
              asking ? "text-pet-coral" : "text-pet-text",
            )}
          >
            {title}
          </span>
          <span className="mt-0.5 block text-[10px] text-pet-muted">
            {displayStateText(row)} · {rowTime(row)}
          </span>
        </span>
        {asking && <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 text-pet-coral" />}
        {pendingFocus && <Loader2 aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />}
      </button>

      <button
        type="button"
        aria-label={pendingClear ? `确认清除会话 ${title}` : `清除会话 ${title}`}
        className={cn(
          "flex h-8 shrink-0 items-center justify-center rounded-full px-1.5 text-pet-muted",
          pendingClear ? "text-pet-coral" : undefined,
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
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-pet-muted"
          onClick={onExpand}
        >
          <ChevronDown aria-hidden="true" className="size-4" />
        </button>
      )}
    </li>
  );
}
