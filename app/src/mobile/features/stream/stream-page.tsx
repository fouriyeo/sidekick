import { cn } from "cn";
import { MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { SessionRow } from "@/mobile/features/sessions/session-row";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { MobileTabBar } from "@/mobile/shell/tab-bar";
import { useUiStore } from "@/mobile/ui-store";
import {
  type SessionDisplayState,
  visibleSessions as selectVisibleSessions,
} from "@/shared/lib/sessions";
import { SignalBars, type SignalLevel, type SignalTone } from "@/shared/ui/signal-bars";
import { ActivityFeed, useActivityEvents } from "./activity-feed";

const AGGREGATE: ReadonlyArray<{
  display: SessionDisplayState;
  label: string;
  level: SignalLevel;
  tone: SignalTone;
}> = [
  { display: "asking", label: "等你决定", level: 1, tone: "decide" },
  { display: "working", label: "工作中", level: 2, tone: "signal" },
  { display: "completed", label: "完成", level: 3, tone: "success" },
];

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn("overflow-hidden rounded-[14px] border border-border bg-card", className)}
    >
      {children}
    </section>
  );
}

/**
 * 动态页（底部第二档）：完整 AI 会话列表 + 最近发生。
 *
 * 数据复用 `status.sessionList` 与内存活动流；断连时保留最后一次快照并标注；
 * 不展示剪贴板内容与 AI 提问正文。asking 行保留 D78 的直接 focus。
 */
export function StreamPage() {
  const raw = useSessionStore((state) => state.raw);
  const cleared = useSessionStore((state) => state.cleared);
  const notice = useSessionStore((state) => state.notice);
  const noticeId = useSessionStore((state) => state.noticeId);
  const pendingFocusId = useSessionStore((state) => state.pendingFocusId);
  const pendingClearId = useSessionStore((state) => state.pendingClearId);
  const requestFocus = useSessionStore((state) => state.requestFocus);
  const clear = useSessionStore((state) => state.clear);
  const status = useConnectionStore((state) => state.status);
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);
  const events = useActivityEvents();

  const rows = useMemo(() => selectVisibleSessions(raw, cleared), [raw, cleared]);
  const counts = useMemo(() => {
    const map: Record<SessionDisplayState, number> = {
      asking: 0,
      working: 0,
      completed: 0,
      idle: 0,
    };
    for (const row of rows) map[row.display] += 1;
    return map;
  }, [rows]);
  const askingCount = counts.asking;
  const connected = status === "connected";

  return (
    <MobilePage aria-label="动态">
      <PageHeader
        title="动态"
        sub="AI 会话 · 只含状态与标题"
        right={
          <button
            type="button"
            aria-label="消息"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-wash hover:text-foreground"
            onClick={() => setView("chat")}
          >
            <MessageCircle className="size-5" />
          </button>
        }
      />

      <PageScroll>
        {!connected && (
          <div
            role="status"
            className="mb-2 flex items-center gap-2 rounded-[12px] border border-border bg-card px-3 py-2"
          >
            <SignalBars level={1} tone="muted" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {status === "connecting"
                ? "正在连接，AI 状态可能过期。"
                : "已断连，AI 状态可能过期。"}
            </span>
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-[10px] px-2 text-xs font-medium text-signal"
              onClick={openOffline}
            >
              去连接
            </button>
          </div>
        )}

        {rows.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {AGGREGATE.map((item) =>
              item.display === "asking" && counts.asking > 0 ? (
                <button
                  key={item.display}
                  type="button"
                  aria-label={`${item.label} ${counts.asking} 个，点按查看等你决定`}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-decide bg-card px-2.5 text-[11px] text-decide"
                  onClick={() => setView("asking")}
                >
                  <SignalBars level={item.level} tone={item.tone} />
                  {item.label}
                  <b className="font-mono font-medium">{counts.asking}</b>
                </button>
              ) : (
                <span
                  key={item.display}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[11px]",
                    "text-muted-foreground",
                  )}
                >
                  <SignalBars
                    level={item.level}
                    tone={counts[item.display] > 0 ? item.tone : "muted"}
                  />
                  {item.label}
                  <b className="font-mono font-medium">{counts[item.display]}</b>
                </span>
              ),
            )}
          </div>
        )}

        <Card>
          <div className="flex min-h-11 items-center justify-between gap-2 px-3">
            <span className="text-xs font-medium text-foreground">会话</span>
            <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
              最多 5 行 · 内部滚动{!connected && rows.length > 0 ? " · 最后一次快照" : ""}
            </span>
          </div>

          {rows.length === 0 ? (
            <div className="border-t border-border px-3 py-4">
              <p className="text-sm font-medium text-foreground">还没有 AI 会话</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                在电脑上开启「AI 联动」后，这里会显示 DeepSeek Harness
                在做什么。手机不显示提示词与回复。
              </p>
              {!connected && (
                <button
                  type="button"
                  className="mt-3 flex min-h-12 w-full items-center justify-center rounded-[12px] border border-signal bg-wash text-sm font-medium text-foreground"
                  onClick={openOffline}
                >
                  去连接电脑
                </button>
              )}
            </div>
          ) : (
            <ul className="max-h-[260px] list-none overflow-y-auto border-t border-border p-0">
              {rows.map((row) => (
                <SessionRow
                  key={row.id}
                  row={row}
                  pendingFocus={pendingFocusId === row.id}
                  pendingClear={pendingClearId === row.id}
                  onOpen={row.display === "asking" ? () => requestFocus(row.id) : undefined}
                  onClear={() => clear(row.id)}
                  className="border-t border-border first:border-t-0"
                />
              ))}
            </ul>
          )}

          {notice && (
            <p
              key={noticeId}
              role="status"
              aria-live="polite"
              className="border-t border-border px-3 py-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground"
            >
              {notice}
            </p>
          )}
        </Card>

        <div className="mt-2.5 flex items-center justify-between gap-2 px-1">
          <span className="text-xs font-medium text-foreground">最近发生</span>
          <span className="font-mono text-[10px] text-muted-foreground">只在本机保留</span>
        </div>
        <Card className="mt-1.5">
          <ActivityFeed events={events} />
        </Card>

        {askingCount > 0 && (
          <button
            type="button"
            className="mt-2.5 flex min-h-12 w-full items-center justify-center rounded-[12px] border border-decide bg-card text-sm font-medium text-decide"
            onClick={() => setView("asking")}
          >
            查看 {askingCount} 个等你决定
          </button>
        )}
      </PageScroll>

      <MobileTabBar active="stream" />
    </MobilePage>
  );
}
