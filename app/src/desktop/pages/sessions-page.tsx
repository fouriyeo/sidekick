import { cn } from "cn";
import { ListChecks, Loader2 } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/desktop/components/empty-state";
import { describeHookStatus, useHookStore } from "@/desktop/features/hook/hook-store";
import type { DesktopNav } from "@/desktop/lib/desktop-nav";
import { useDesktopStatusStore } from "@/desktop/lib/desktop-status-store";
import { CardHint } from "@/desktop/shell/card";
import { PageChip, type PageTone, StateTag } from "@/desktop/shell/page-chips";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageFooter, PageShell } from "@/desktop/shell/page-shell";
import type { DesktopConnection } from "@/desktop/use-desktop-connection";
import { formatRelativeTime } from "@/shared/lib/format";
import {
  displayStateText,
  rowTime,
  type SessionDisplayState,
  type SessionRow,
  sessionTitle,
  visibleSessions,
  workingActionText,
} from "@/shared/lib/sessions";
import { Button } from "@/shared/ui/button";
import { SignalBars } from "@/shared/ui/signal-bars";

type SessionFilter = "all" | "asking" | "working" | "completed";

const FILTERS: ReadonlyArray<{ id: SessionFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "asking", label: "等你决定" },
  { id: "working", label: "工作中" },
  { id: "completed", label: "已完成" },
];

const DISPLAY_TONE: Record<SessionDisplayState, PageTone> = {
  asking: "decide",
  working: "signal",
  completed: "success",
  idle: "muted",
};

const DISPLAY_LEVEL: Record<SessionDisplayState, 1 | 2 | 3> = {
  asking: 1,
  working: 2,
  completed: 3,
  idle: 1,
};

type SessionsPageProps = {
  connection: DesktopConnection;
  nav: DesktopNav;
};

/**
 * 会话：AI 在做什么、谁在等决定。
 *
 * 数据来自 `status.sessionList`（D78 起含粗粒度工具类别），asking 置顶，
 * 工作行显示「正在<动作>」+ spinner；断线时保留最后一次快照并明确标注过期。
 * 「在 DSH 打开」经本地 WS 发 focus.request（复用手机同一条协议），结果用 toast 反馈。
 */
export function SessionsPage({ connection, nav }: SessionsPageProps) {
  const status = useDesktopStatusStore((state) => state.status);
  const sessionList = useDesktopStatusStore((state) => state.sessionList);
  const updatedAt = useDesktopStatusStore((state) => state.updatedAt);
  const hookStatus = useHookStore((state) => state.status);
  const [filter, setFilter] = useState<SessionFilter>("all");

  const rows = visibleSessions(sessionList, {});
  const asking = rows.filter((row) => row.display === "asking");
  const working = rows.filter((row) => row.display === "working");
  const completed = rows.filter((row) => row.display === "completed");
  const counts: Record<SessionFilter, number> = {
    all: rows.length,
    asking: asking.length,
    working: working.length,
    completed: completed.length,
  };
  const filtered = filter === "all" ? rows : rows.filter((row) => row.display === filter);
  const disconnected = connection.status !== "connected";
  const showStale = disconnected && (status !== null || rows.length > 0);
  const hookSummary = describeHookStatus(hookStatus);

  return (
    <PageShell>
      <PageHeader
        title="会话"
        description="AI 在做什么、谁在等自己决定；数据来自 DeepSeek Harness 的 status 广播，只含状态与标题。"
        chips={
          <>
            {asking.length > 0 && <PageChip label={`等你决定 ${asking.length}`} tone="decide" />}
            {working.length > 0 && <PageChip label={`工作中 ${working.length}`} tone="signal" />}
          </>
        }
        actions={
          asking.length > 0 ? (
            <Button
              type="button"
              size="sm"
              className="border-decide/40 bg-decide/15 text-decide hover:bg-decide/25"
              onClick={() => connection.requestFocus(asking[0].id)}
            >
              处理第一个
            </Button>
          ) : undefined
        }
      />

      <PageBody>
        {showStale && (
          <div
            role="alert"
            className="flex shrink-0 items-center gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11.5px] text-destructive"
          >
            <span className="min-w-0 flex-1">
              <b>连接断了，下面是最后一次快照。</b>{" "}
              <span className="text-muted-foreground">
                最近更新 {updatedAt ? formatRelativeTime(updatedAt) : "时间未知"}
                ；恢复连接后会自动刷新。
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={connection.retry}
            >
              重新连接
            </Button>
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(active && item.id !== "all" ? "all" : item.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  active
                    ? "border-border bg-wash text-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                <span className="font-mono text-[10px] text-muted-foreground">
                  {counts[item.id]}
                </span>
              </button>
            );
          })}
          <span className="ml-auto text-[10.5px] text-muted-foreground">点是筛选，再点取消</span>
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-border bg-card">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-[13px] leading-tight font-semibold">
                <ListChecks aria-hidden="true" className="size-3.5 text-muted-foreground" />
                {filter === "all" ? "全部会话" : FILTERS.find((item) => item.id === filter)?.label}
              </h2>
              <p className="mt-0.5 font-mono text-[9px] tracking-[0.13em] text-muted-foreground uppercase">
                SESSIONS · 标题 ≤ 80 字 · 不含对话内容
              </p>
            </div>
            <StateTag label="最多 50 条" tone="muted" />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-1">
            {rows.length === 0 ? (
              <div className="flex h-full min-h-[200px] items-center justify-center">
                <EmptyState
                  icon={<ListChecks className="size-4" />}
                  title={status === null ? "还没有会话快照" : "现在没有会话"}
                  description={
                    status === null
                      ? "开启 AI 联动后，这里会显示 DeepSeek Harness 在做什么。会话标题最多 80 字，不含提示词与回复。"
                      : "DSH 里还没有进行中的会话；开始一轮对话后就会出现在这里。"
                  }
                  action={
                    status === null ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button type="button" size="sm" onClick={() => nav.goSystem("hook")}>
                          去开启 AI 联动
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => nav.go("overview")}
                        >
                          回总览
                        </Button>
                      </div>
                    ) : undefined
                  }
                />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-full min-h-[160px] items-center justify-center">
                <EmptyState
                  icon={<ListChecks className="size-4" />}
                  title="这个筛选下没有会话"
                  description="切回「全部」看看其他状态的会话。"
                />
              </div>
            ) : (
              <ul className="flex list-none flex-col p-0">
                {filtered.map((row) => (
                  <SessionRowItem
                    key={row.id}
                    row={row}
                    onFocus={() => connection.requestFocus(row.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-3.5 py-2">
            <CardHint>
              完成态会话保留到下一轮开始；「在 DSH 打开」只唤起电脑上的 DeepSeek Harness。
            </CardHint>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                AI 联动 {hookSummary.label}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => nav.goSystem("hook")}>
                联动状态
              </Button>
            </div>
          </footer>
        </section>
      </PageBody>

      <PageFooter>
        <span>小跟班 Sidekick</span>
        <span>v0.1 · 深海声呐</span>
        <span className="ml-auto">只同步状态与会话标题 · 不含提示词与回复</span>
      </PageFooter>
    </PageShell>
  );
}

function SessionRowItem({ row, onFocus }: { row: SessionRow; onFocus: () => void }) {
  const tone = DISPLAY_TONE[row.display];
  const actionable = row.display === "asking" || row.display === "working";
  return (
    <li
      className={cn(
        "flex items-start gap-2.5 border-b border-border/60 py-2 last:border-0",
        row.display === "asking" && "bg-decide/[0.04]",
      )}
    >
      <SignalBars level={DISPLAY_LEVEL[row.display]} tone={tone} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] leading-snug font-medium">{sessionTitle(row)}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-muted-foreground">
          {/* D78：工作行只显示动态动作（spinner + 「正在<动作>」），不再重复「工作中」状态词。 */}
          {row.display !== "working" && <StateTag label={displayStateText(row)} tone={tone} />}
          <span>DSH</span>
          <span aria-hidden="true">·</span>
          <span>{rowTime(row)}</span>
          {row.display === "working" && (
            <span
              className="inline-flex items-center gap-1 text-signal"
              data-testid="session-working-action"
            >
              <Loader2 aria-hidden="true" className="size-3 animate-spin" />
              {workingActionText(row.tool)}
            </span>
          )}
        </div>
      </div>
      {actionable && (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className={cn(
            "shrink-0",
            row.display === "asking" &&
              "border-decide/40 bg-decide/10 text-decide hover:bg-decide/20",
          )}
          onClick={onFocus}
        >
          在 DSH 打开
        </Button>
      )}
    </li>
  );
}
