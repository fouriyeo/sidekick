import { cn } from "cn";
import { ChevronRight, Mic, RefreshCw, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatClock, formatDuration, groupByDay } from "@/mobile/features/memo/format";
import { MemoDetailPage } from "@/mobile/features/memo/memo-detail-page";
import { useMemoRecorder } from "@/mobile/features/memo/memo-recorder";
import { useMemoStore } from "@/mobile/features/memo/memo-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { useUiStore } from "@/mobile/ui-store";
import { type MemoStatus, type MemoSummary, memoStatusLabel, memoTypeLabel } from "@/protocol/memo";
import { memoSyncNow } from "@/shared/lib/tauri";

const CARD = "overflow-hidden rounded-2xl border-[0.5px] border-border bg-card";
const ROW = "flex min-h-[60px] w-full items-center gap-3 px-4 text-left";

/** 状态色：失败珊瑚、等网络琥珀、处理中薄荷、其余中性。 */
function statusClass(status: MemoStatus): string {
  switch (status) {
    case "failed":
      return "text-destructive";
    case "offline":
      return "text-decide";
    case "transcribing":
    case "structuring":
    case "pending":
      return "text-signal";
    case "done":
      return "text-muted-foreground";
  }
}

function MemoRow({ item, onOpen }: { item: MemoSummary; onOpen: () => void }) {
  const processing =
    item.status !== "done" && item.status !== "failed" && item.status !== "offline";
  return (
    <button type="button" className={cn(ROW, "active:bg-wash")} onClick={onOpen}>
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-[13px] font-medium text-muted-foreground"
      >
        {memoTypeLabel(item.memoType).slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-[21px] text-foreground">
          {item.title.trim() || (item.status === "done" ? "未命名备忘" : "正在整理…")}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] leading-[17px] text-muted-foreground">
          <span>{formatClock(item.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDuration(item.durationMs)}</span>
          {item.status !== "done" && (
            <>
              <span aria-hidden="true">·</span>
              <span className={statusClass(item.status)}>
                {processing ? "处理中" : memoStatusLabel(item.status)}
              </span>
            </>
          )}
        </span>
      </span>
      {item.status === "done" && !item.synced && (
        <span
          role="img"
          aria-label="还没同步到电脑"
          className="size-1.5 shrink-0 rounded-full bg-decide"
        />
      )}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70" />
    </button>
  );
}

function Group({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: MemoSummary[];
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="mt-4">
      <h2 className="mb-2 px-1 text-[12px] leading-[17px] font-normal text-muted-foreground">
        {title}
      </h2>
      <div className={CARD}>
        {items.map((item, index) => (
          <div key={item.id}>
            {index > 0 && <div aria-hidden="true" className="ml-[60px] h-[0.5px] bg-border" />}
            <MemoRow item={item} onOpen={() => onOpen(item.id)} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * 手机「备忘录」全屏页（D115/D118）：从宠物页顶栏进入，不加底部 tab。
 *
 * 录音仅在前台/亮屏；锁屏、切后台或离开页面会停止并保存（WebView 录音的现实约束）。
 * 列表只读本地 SQLite；点条目进详情。AI 整理在后台进行，状态按管道事件刷新。
 */
export function MemoPage() {
  const items = useMemoStore((state) => state.items);
  const loading = useMemoStore((state) => state.loading);
  const error = useMemoStore((state) => state.error);
  const key = useMemoStore((state) => state.key);
  const load = useMemoStore((state) => state.load);
  const loadKey = useMemoStore((state) => state.loadKey);
  const setView = useUiStore((state) => state.setView);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const recorder = useMemoRecorder({
    onSaved: () => {
      toast.success("已保存，正在整理");
      void load();
    },
    onError: (message) => toast.error(message),
  });

  useEffect(() => {
    void load();
    void loadKey();
    void memoSyncNow().catch(() => undefined);
  }, [load, loadKey]);

  const groups = useMemo(() => groupByDay(items), [items]);
  const recording = recorder.phase === "recording";
  const busy = recorder.phase === "starting" || recorder.phase === "saving";

  if (selectedId) {
    return <MemoDetailPage id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <MobilePage aria-label="备忘录">
      <PageHeader
        title="备忘录"
        onBack={() => setView("pet")}
        backLabel="返回宠物"
        right={
          <button
            type="button"
            aria-label="刷新备忘录"
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground active:bg-wash"
            onClick={() => {
              void load();
              void loadKey();
            }}
          >
            <RefreshCw aria-hidden="true" className={cn("size-4", loading && "animate-spin")} />
          </button>
        }
      />

      <PageScroll className="px-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {key && !key.hasKey && (
          <button
            type="button"
            className="mt-2 flex w-full items-center gap-2 rounded-2xl border-[0.5px] border-decide bg-card px-4 py-3 text-left"
            onClick={() => setView("settings")}
          >
            <span className="min-w-0 flex-1 text-[13px] leading-[19px] text-foreground">
              还没有百炼 Key。先在电脑「语音」页配对，或去设置里粘贴。
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-decide" />
          </button>
        )}

        <section aria-label="录音" className={cn(CARD, "mt-2 px-4 py-5")}>
          <div className="flex items-center gap-4">
            {recording ? (
              <>
                <button
                  type="button"
                  aria-label="停止并保存"
                  className="flex size-[64px] shrink-0 items-center justify-center rounded-full bg-[#2C2C2E] text-white shadow-[0_-6px_18px_rgba(0,0,0,0.18)] active:scale-[0.98]"
                  onClick={() => void recorder.stop()}
                >
                  <Square aria-hidden="true" className="size-5 fill-current" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[24px] leading-[30px] font-medium tabular-nums text-foreground">
                    {formatDuration(recorder.elapsedMs)}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-[17px] text-muted-foreground">
                    正在录音 · 锁屏或切走会自动保存
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-full px-3 py-2 text-[13px] text-destructive active:bg-wash"
                  onClick={() => void recorder.cancel()}
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  aria-label="开始录音"
                  disabled={busy}
                  className={cn(
                    "flex size-[64px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity active:scale-[0.98]",
                    busy && "opacity-50",
                  )}
                  onClick={() => void recorder.start()}
                >
                  <Mic aria-hidden="true" className="size-6" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[15px] leading-[21px] text-foreground">
                    {recorder.phase === "starting"
                      ? "正在打开麦克风…"
                      : recorder.phase === "saving"
                        ? "正在保存…"
                        : "说一句，存下来"}
                  </p>
                  <p className="mt-1 text-[12px] leading-[17px] text-muted-foreground">
                    仅在前台录音 · 单次最长 2 小时
                  </p>
                </div>
              </>
            )}
          </div>
          {recording && (
            <div className="mt-4 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-signal transition-[width] duration-200"
                  style={{ width: `${Math.max(4, Math.round(recorder.level * 100))}%` }}
                />
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">录音中</span>
            </div>
          )}
        </section>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-3 text-[13px] text-destructive"
          >
            {error}
          </p>
        )}

        {items.length === 0 && !loading ? (
          <div className="mt-10 px-6 text-center">
            <p className="m-0 text-[15px] leading-[21px] text-foreground">还没有备忘录</p>
            <p className="mt-1 text-[13px] leading-[19px] text-muted-foreground">
              点上面的麦克风，说一句就存下来。
            </p>
          </div>
        ) : (
          <>
            <Group title="今天" items={groups.today} onOpen={setSelectedId} />
            <Group title="更早" items={groups.earlier} onOpen={setSelectedId} />
          </>
        )}
      </PageScroll>
    </MobilePage>
  );
}
