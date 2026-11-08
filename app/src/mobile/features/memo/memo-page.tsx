import { cn } from "cn";
import { ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatClock, formatDuration } from "@/mobile/features/memo/format";
import {
  MemoCalendarView,
  type MemoCalendarViewMode,
} from "@/mobile/features/memo/memo-calendar-view";
import { MemoDetailPage } from "@/mobile/features/memo/memo-detail-page";
import { MemoRecordBar } from "@/mobile/features/memo/memo-record-bar";
import { useMemoRecorder } from "@/mobile/features/memo/memo-recorder";
import { useMemoStore } from "@/mobile/features/memo/memo-store";
import { MobilePage } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { pushBackHandler } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import { type MemoStatus, type MemoSummary, memoStatusLabel, memoTypeLabel } from "@/protocol/memo";
import { dayKey, formatDayTitle, groupByDay } from "@/shared/lib/calendar";
import { memoSyncNow } from "@/shared/lib/tauri";

const CARD = "overflow-hidden rounded-2xl border-[0.5px] border-border bg-card";
const ROW = "flex min-h-[60px] w-full items-center gap-3 px-4 text-left";
const CALENDAR_KEY = "sidekick:memo:calendar";

/** 浏览器 QA 用：?memoView=month 直接打开月视角（仅 dev）。 */
function initialCalendarView(): MemoCalendarViewMode {
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const requested = new URLSearchParams(window.location.search).get("memoView");
    if (requested === "month" || requested === "week") return requested;
  }
  return readCalendarView();
}

function readCalendarView(): MemoCalendarViewMode {
  if (typeof localStorage === "undefined") return "week";
  try {
    return localStorage.getItem(CALENDAR_KEY) === "month" ? "month" : "week";
  } catch {
    return "week";
  }
}

function writeCalendarView(view: MemoCalendarViewMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CALENDAR_KEY, view);
  } catch {
    // localStorage 不可用只影响记忆，不影响日历。
  }
}

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

function MemoRow({
  item,
  disabled,
  onOpen,
}: {
  item: MemoSummary;
  disabled: boolean;
  onOpen: () => void;
}) {
  const processing =
    item.status !== "done" && item.status !== "failed" && item.status !== "offline";
  return (
    <button
      type="button"
      className={cn(ROW, !disabled && "active:bg-wash", disabled && "opacity-60")}
      disabled={disabled}
      onClick={onOpen}
    >
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

/**
 * 手机「备忘录」全屏页（D124）：顶部周/月日历 + 当日列表 + 底部录音条。
 *
 * 录音仅在前台/亮屏；录音中禁止切换日期、进入详情、离开页面（返回先停存）。
 * 列表只读本地 SQLite；AI 整理在后台进行，状态按管道事件刷新。
 */
export function MemoPage() {
  const items = useMemoStore((state) => state.items);
  const loading = useMemoStore((state) => state.loading);
  const error = useMemoStore((state) => state.error);
  const key = useMemoStore((state) => state.key);
  const load = useMemoStore((state) => state.load);
  const loadKey = useMemoStore((state) => state.loadKey);
  const setRecorderPhase = useMemoStore((state) => state.setRecorderPhase);
  const setView = useUiStore((state) => state.setView);

  const [selectedKey, setSelectedKey] = useState(() => dayKey(Date.now()));
  const [calendarView, setCalendarView] = useState<MemoCalendarViewMode>(initialCalendarView);
  const [todayNonce, setTodayNonce] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const recorder = useMemoRecorder({
    onSaved: (memo) => {
      toast.success("已保存，正在整理");
      setSelectedKey(dayKey(memo.createdAt));
      void load();
    },
    onError: (message) => toast.error(message),
  });

  useEffect(() => {
    void load();
    void loadKey();
    void memoSyncNow().catch(() => undefined);
  }, [load, loadKey]);

  // 让 ui-store / 返回键知道备忘录正在录音。
  useEffect(() => {
    setRecorderPhase(recorder.phase);
  }, [recorder.phase, setRecorderPhase]);
  useEffect(() => () => setRecorderPhase("idle"), [setRecorderPhase]);

  const goBack = useCallback(() => {
    if (recorder.phase === "starting") {
      toast("正在打开麦克风…");
      return;
    }
    if (recorder.phase === "saving") {
      toast("正在保存…");
      return;
    }
    if (recorder.phase === "recording") {
      void recorder.stop();
      toast("录音已停止并保存");
      return;
    }
    if (selectedId) {
      setSelectedId(null);
      return;
    }
    if (calendarView === "month") {
      setCalendarView("week");
      return;
    }
    setView("pet");
  }, [calendarView, recorder, selectedId, setView]);

  useEffect(
    () =>
      pushBackHandler(() => {
        if (recorder.phase === "starting") {
          toast("正在打开麦克风…");
          return true;
        }
        if (recorder.phase === "saving") {
          toast("正在保存…");
          return true;
        }
        if (recorder.phase === "recording") {
          void recorder.stop();
          toast("录音已停止并保存");
          return true;
        }
        if (calendarView === "month") {
          setCalendarView("week");
          return true;
        }
        return false;
      }),
    [calendarView, recorder],
  );

  const groups = useMemo(() => groupByDay(items), [items]);
  const dayItems = groups.get(selectedKey) ?? [];
  const todayLanded = selectedKey === dayKey(Date.now());
  const recording = recorder.phase !== "idle";

  const changeView = (next: MemoCalendarViewMode) => {
    setCalendarView(next);
    writeCalendarView(next);
  };

  const openItem = (id: string) => {
    if (recording) {
      toast("录音中，先结束后再打开");
      return;
    }
    setSelectedId(id);
  };

  if (selectedId) {
    return <MemoDetailPage id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <MobilePage aria-label="备忘录">
      <PageHeader
        title="备忘录"
        onBack={goBack}
        backLabel="返回"
        right={
          <button
            type="button"
            aria-label="回到今天"
            aria-disabled={recording || undefined}
            disabled={recording}
            className={cn(
              "flex size-11 items-center justify-center text-[13px] active:bg-wash disabled:opacity-50",
              todayLanded ? "text-muted-foreground" : "text-primary",
            )}
            onClick={() => {
              setSelectedKey(dayKey(Date.now()));
              setTodayNonce((value) => value + 1);
            }}
          >
            今天
          </button>
        }
      />

      <div className="flex-none px-4 pt-1">
        <MemoCalendarView
          items={items}
          selectedKey={selectedKey}
          view={calendarView}
          disabled={recording}
          resetToken={todayNonce}
          onSelect={setSelectedKey}
          onViewChange={changeView}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-4">
        {key && !key.hasKey && (
          <button
            type="button"
            className={cn(
              "mb-2 flex w-full items-center gap-2 rounded-2xl border-[0.5px] border-decide bg-card px-4 py-3 text-left",
              recording && "opacity-60",
            )}
            disabled={recording}
            onClick={() => setView("settings")}
          >
            <span className="min-w-0 flex-1 text-[13px] leading-[19px] text-foreground">
              还没有百炼 Key。先在电脑「语音」页配对，或去设置里粘贴。
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-decide" />
          </button>
        )}

        <div className="flex items-baseline justify-between px-1 py-2">
          <h2 className="m-0 text-[13px] leading-[18px] font-semibold text-foreground">
            {formatDayTitle(selectedKey)}
          </h2>
          <span className="text-[11.5px] text-muted-foreground">{dayItems.length} 条</span>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-2 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-3 text-[13px] text-destructive"
          >
            {error}
          </p>
        )}

        {loading && items.length === 0 ? (
          <div className="mt-6 text-center text-[13px] text-muted-foreground">正在读取…</div>
        ) : dayItems.length > 0 ? (
          <div className={CARD}>
            {dayItems.map((item, index) => (
              <div key={item.id}>
                {index > 0 && <div aria-hidden="true" className="ml-[60px] h-[0.5px] bg-border" />}
                <MemoRow item={item} disabled={recording} onOpen={() => openItem(item.id)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-8 px-6 text-center">
            <p className="m-0 text-[15px] leading-[21px] text-foreground">
              {items.length === 0 ? "还没有备忘录" : "这一天还没有记录"}
            </p>
            <p className="mt-1 text-[13px] leading-[19px] text-muted-foreground">
              {items.length === 0
                ? "点下面的麦克风，说一句就存下来。"
                : "点下面的麦克风，开始记一条。"}
            </p>
          </div>
        )}

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            aria-label="刷新备忘录"
            className="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] text-muted-foreground active:bg-wash disabled:opacity-50"
            disabled={recording}
            onClick={() => {
              void load();
              void loadKey();
            }}
          >
            <RefreshCw aria-hidden="true" className={cn("size-3.5", loading && "animate-spin")} />
            刷新
          </button>
        </div>
      </div>

      <MemoRecordBar recorder={recorder} disabled={false} />
    </MobilePage>
  );
}
