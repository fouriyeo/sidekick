import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { SessionRow } from "@/mobile/features/sessions/session-row";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { useUiStore } from "@/mobile/ui-store";
import {
  displayStateText,
  rowTime,
  visibleSessions as selectVisibleSessions,
  sessionTitle,
} from "@/shared/lib/sessions";
import { SignalBars } from "@/shared/ui/signal-bars";

const COPY_FEEDBACK_MS = 1600;

/**
 * 等你决定页：AI 暂停时的一键处理页。
 *
 * 主行动只有一个「在电脑上继续」（focus.request）；手机不提供批准/拒绝。
 * 没有 asking 时回退动态页。
 */
export function AskingPage() {
  const raw = useSessionStore((state) => state.raw);
  const cleared = useSessionStore((state) => state.cleared);
  const hydrated = useSessionStore((state) => state.hydrated);
  const notice = useSessionStore((state) => state.notice);
  const noticeId = useSessionStore((state) => state.noticeId);
  const pendingFocusId = useSessionStore((state) => state.pendingFocusId);
  const requestFocus = useSessionStore((state) => state.requestFocus);
  const connected = useConnectionStore((state) => state.status === "connected");
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);

  const rows = useMemo(() => selectVisibleSessions(raw, cleared), [raw, cleared]);
  const askingRows = useMemo(() => rows.filter((row) => row.display === "asking"), [rows]);
  const first = askingRows[0];
  const others = askingRows.slice(1);

  const [copied, setCopied] = useState<string | null>(null);

  // 没有 asking 可处理时回退动态页（例如在页内被清除或电脑上已处理）。
  useEffect(() => {
    if (hydrated && askingRows.length === 0) setView("stream");
  }, [askingRows.length, hydrated, setView]);

  const copyTitle = useCallback(() => {
    if (!first) return;
    const title = sessionTitle(first);
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    void clipboard
      .writeText(title)
      .then(() => {
        setCopied("已复制会话标题");
        window.setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
      })
      .catch(() => {
        setCopied("复制失败，可以手动选中标题");
        window.setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
      });
  }, [first]);

  if (hydrated && askingRows.length === 0) return null;

  return (
    <MobilePage aria-label="等你决定">
      <PageHeader
        title="等你决定"
        sub="DEEPSEEK HARNESS 已暂停"
        onBack={() => setView("stream")}
        backLabel="返回动态"
        right={<SignalBars level={1} tone="decide" />}
      />

      <PageScroll>
        {!connected && (
          <div
            role="status"
            className="mb-2 flex items-center gap-2 rounded-[12px] border border-decide bg-card px-3 py-2.5"
          >
            <SignalBars level={1} tone="muted" />
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
              <b className="font-medium">还没连上电脑。</b> 手机只能提醒，唤起需要在电脑上完成。
            </span>
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-[10px] px-2 text-xs font-medium text-decide"
              onClick={openOffline}
            >
              去连接
            </button>
          </div>
        )}

        {first && (
          <section
            aria-label="当前等你决定的会话"
            className="rounded-[14px] border border-decide bg-card px-3.5 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <SignalBars level={1} tone="decide" />
              <span className="text-xs font-medium text-decide">{displayStateText(first)}</span>
              <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
                {first.askKind === "approval" ? "等你审批" : "等你决定"} · 提出于 {rowTime(first)}
              </span>
            </div>
            <h2 className="mt-1.5 text-lg leading-snug font-semibold break-words text-foreground">
              {sessionTitle(first)}
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              DeepSeek Harness 已暂停，等你的选择；手机不能批准或拒绝，只负责提醒。
            </p>

            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-center rounded-[12px] bg-decide px-4 text-sm font-medium text-background disabled:opacity-50"
                disabled={!connected || pendingFocusId === first.id}
                onClick={() => requestFocus(first.id)}
              >
                在电脑上继续
              </button>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-center rounded-[12px] border border-border bg-transparent px-4 text-sm font-medium text-foreground"
                onClick={copyTitle}
              >
                复制标题
              </button>
            </div>

            <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {copied ??
                (connected
                  ? "失败会显示原因；成功时手机会收到 focus.result 回执。"
                  : "先连接电脑，才能让 DeepSeek Harness 到前台。")}
            </p>

            {notice && (
              <p
                key={noticeId}
                role="status"
                aria-live="polite"
                className="mt-2 border-t border-border pt-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground"
              >
                {notice}
              </p>
            )}
          </section>
        )}

        {others.length > 0 && (
          <section
            aria-label="其它等你决定"
            className="mt-2.5 overflow-hidden rounded-[14px] border border-border bg-card"
          >
            <div className="flex min-h-11 items-center justify-between gap-2 px-3">
              <span className="text-xs font-medium text-foreground">其它等你决定</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                最多 5 条 · 内部滚动
              </span>
            </div>
            <ul className="max-h-[260px] list-none overflow-y-auto border-t border-border p-0">
              {others.slice(0, 5).map((row) => (
                <SessionRow
                  key={row.id}
                  row={row}
                  pendingFocus={pendingFocusId === row.id}
                  onOpen={() => requestFocus(row.id)}
                  className="border-t border-border first:border-t-0"
                />
              ))}
            </ul>
          </section>
        )}

        <p className="mt-3 text-center font-mono text-[10px] leading-relaxed text-muted-foreground">
          也可以在电脑上直接处理，手机只负责提醒。
        </p>
      </PageScroll>
    </MobilePage>
  );
}
