import { convertFileSrc } from "@tauri-apps/api/core";
import { Loader2, NotebookPen } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useDesktopMemoStore } from "@/desktop/features/memo/memo-store";
import { ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageShell } from "@/desktop/shell/page-shell";
import type { MemoSummary } from "@/protocol/memo";
import { memoStatusLabel, memoTypeLabel } from "@/protocol/memo";
import { formatDuration, formatRelativeTime } from "@/shared/lib/format";
import { subscribeMemoChanged } from "@/shared/lib/tauri";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

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
 * 桌面「备忘录」分段（D115/D118）：手机单写者、电脑只读。
 *
 * 数据来自桌面自己的 SQLite 镜像；收到手机推送/音频提交后由 `memo-changed`
 * 事件触发刷新。播放走 Tauri asset 协议，不把整段音频塞进 IPC。
 */
export function MemoSection({ topSlot }: { topSlot?: ReactNode }) {
  const items = useDesktopMemoStore((state) => state.items);
  const loading = useDesktopMemoStore((state) => state.loading);
  const error = useDesktopMemoStore((state) => state.error);
  const detail = useDesktopMemoStore((state) => state.detail);
  const detailLoading = useDesktopMemoStore((state) => state.detailLoading);
  const load = useDesktopMemoStore((state) => state.load);
  const open = useDesktopMemoStore((state) => state.open);
  const close = useDesktopMemoStore((state) => state.close);

  useEffect(() => {
    void load();
    return subscribeMemoChanged(() => {
      void load();
    });
  }, [load]);

  return (
    <PageShell>
      <PageHeader title="剪贴板" />
      <PageBody>
        {topSlot && <div className="w-fit">{topSlot}</div>}
        {error && (
          <p role="alert" className="px-1 text-[12px] leading-[1.4] text-destructive">
            {error}
          </p>
        )}
        <ListGroup title={loading && items.length === 0 ? "备忘录" : `备忘录 · ${items.length} 条`}>
          {items.length === 0 ? (
            <ListEmpty>
              {loading ? "正在读取…" : "手机还没同步过备忘录。在手机上录一条就会出现在这里。"}
            </ListEmpty>
          ) : (
            items.map((item) => (
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
                <span className="text-[12px] text-muted-foreground">全文</span>
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
