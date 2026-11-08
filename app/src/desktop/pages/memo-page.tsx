import { convertFileSrc } from "@tauri-apps/api/core";
import { Loader2, NotebookPen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type DesktopCalendarViewMode,
  MemoCalendarPanel,
} from "@/desktop/features/memo/memo-calendar-panel";
import { useDesktopMemoStore } from "@/desktop/features/memo/memo-store";
import { ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageShell } from "@/desktop/shell/page-shell";
import { type MemoSummary, memoStatusLabel, memoTypeLabel } from "@/protocol/memo";
import { dayKey, formatDayTitle, groupByDay } from "@/shared/lib/calendar";
import { copyText } from "@/shared/lib/clipboard";
import { formatDuration, formatRelativeTime } from "@/shared/lib/format";
import { subscribeMemoChanged } from "@/shared/lib/tauri";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

const CALENDAR_KEY = "sidekick:desktop:memo:calendar";

/** 浏览器 QA 用：?memoView=week 直接打开周视角（仅 dev）。 */
function initialCalendarView(): DesktopCalendarViewMode {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const requested = new URLSearchParams(window.location.search).get("memoView");
    if (requested === "week" || requested === "month") return requested;
  }
  return readCalendarView();
}

function readCalendarView(): DesktopCalendarViewMode {
  if (typeof localStorage === "undefined") return "month";
  try {
    return localStorage.getItem(CALENDAR_KEY) === "week" ? "week" : "month";
  } catch {
    return "month";
  }
}

function writeCalendarView(view: DesktopCalendarViewMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CALENDAR_KEY, view);
  } catch {
    // localStorage 不可用只影响记忆，不影响日历。
  }
}

/** 字节 → 0 B / 12.3 MB。桌面端只显示数量级。 */
function bytesLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function metaLine(item: MemoSummary): string {
  const parts = [memoTypeLabel(item.memoType), formatDuration(item.durationMs)];
  if (item.status !== "done") parts.push(memoStatusLabel(item.status));
  else if (!item.synced) parts.push("待同步");
  return parts.join(" · ");
}

/**
 * 桌面「备忘录」一级页（D123 / D124）：手机单写者、电脑只读。
 *
 * 左栏日历（周/月）+ 右栏当日列表；数据来自桌面自己的 SQLite 镜像，
 * 收到手机推送/音频提交后由 `memo-changed` 事件触发刷新。
 */
export function MemoPage() {
  const items = useDesktopMemoStore((state) => state.items);
  const loading = useDesktopMemoStore((state) => state.loading);
  const error = useDesktopMemoStore((state) => state.error);
  const detail = useDesktopMemoStore((state) => state.detail);
  const detailLoading = useDesktopMemoStore((state) => state.detailLoading);
  const load = useDesktopMemoStore((state) => state.load);
  const open = useDesktopMemoStore((state) => state.open);
  const close = useDesktopMemoStore((state) => state.close);

  const [selectedKey, setSelectedKey] = useState(() => dayKey(Date.now()));
  const [calendarView, setCalendarView] = useState<DesktopCalendarViewMode>(initialCalendarView);

  useEffect(() => {
    void load();
    return subscribeMemoChanged(() => {
      void load();
    });
  }, [load]);

  const groups = useMemo(() => groupByDay(items), [items]);
  const dayItems = groups.get(selectedKey) ?? [];

  const changeView = (next: DesktopCalendarViewMode) => {
    setCalendarView(next);
    writeCalendarView(next);
  };

  return (
    <PageShell size="wide">
      <PageHeader title="备忘录" />
      <PageBody>
        {error && (
          <p role="alert" className="px-1 text-[12px] leading-[1.4] text-destructive">
            {error}
          </p>
        )}

        <div className="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-6">
          <MemoCalendarPanel
            items={items}
            selectedKey={selectedKey}
            view={calendarView}
            onSelect={setSelectedKey}
            onViewChange={changeView}
          />

          <ListGroup title={`${formatDayTitle(selectedKey)} · ${dayItems.length} 条`}>
            {dayItems.length === 0 ? (
              <ListEmpty>
                {loading && items.length === 0
                  ? "正在读取…"
                  : "这一天还没有记录。手机这天录的备忘录会同步到这里。"}
              </ListEmpty>
            ) : (
              dayItems.map((item) => (
                <ListRow
                  key={item.id}
                  icon={<NotebookPen aria-hidden="true" className="size-4" />}
                  title={item.title.trim() || "未命名备忘"}
                  detail={item.summary ?? metaLine(item)}
                  meta={formatRelativeTime(item.createdAt)}
                  chevron
                  onClick={() => void open(item.id)}
                />
              ))
            )}
          </ListGroup>
        </div>
      </PageBody>

      <Dialog open={detail !== null || detailLoading} onOpenChange={(next) => !next && close()}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{detail?.title.trim() || "备忘详情"}</DialogTitle>
            <DialogDescription>
              {detail
                ? `${memoTypeLabel(detail.memoType)} · ${formatDuration(detail.durationMs)}`
                : "正在读取…"}
            </DialogDescription>
          </DialogHeader>

          {detailLoading && !detail && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              正在读取…
            </div>
          )}

          {detail && (
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
              {detail.summary && (
                <p className="m-0 text-[14px] leading-[22px] text-foreground">{detail.summary}</p>
              )}

              {detail.todos.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] text-muted-foreground">待办</span>
                  {detail.todos.map((todo) => (
                    <span
                      key={todo}
                      className="flex items-center gap-2 text-[14px] text-foreground"
                    >
                      <span
                        aria-hidden="true"
                        className="size-3.5 shrink-0 rounded-full border-[1.5px] border-muted-foreground/50"
                      />
                      {todo}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-muted-foreground">全文</span>
                  {detail.transcript && (
                    <button
                      type="button"
                      className="flex h-7 items-center rounded-full px-2 text-[12px] text-signal hover:bg-wash"
                      onClick={() => {
                        void copyText(detail.transcript)
                          .then(() => toast.success("全文已复制"))
                          .catch(() => toast.error("复制失败"));
                      }}
                    >
                      复制全文
                    </button>
                  )}
                </div>
                <p className="m-0 whitespace-pre-wrap text-[14px] leading-[23px] text-foreground">
                  {detail.transcript || "没有识别到文字。"}
                </p>
              </div>

              {detail.audioPath && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] text-muted-foreground">
                    录音 · {bytesLabel(detail.audioBytes)}
                  </span>
                  {/* biome-ignore lint/a11y/useMediaCaption: 用户自己的录音，没有字幕轨。 */}
                  <audio
                    controls
                    preload="metadata"
                    src={convertFileSrc(detail.audioPath)}
                    className="w-full"
                  />
                </div>
              )}

              <p className="m-0 text-[12px] leading-[1.5] text-muted-foreground">
                电脑端只读；修改和删除请到手机上操作。
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
