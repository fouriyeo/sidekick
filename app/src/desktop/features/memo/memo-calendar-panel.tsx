import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SegmentedControl } from "@/desktop/shell/segmented-control";
import type { MemoSummary } from "@/protocol/memo";
import {
  addDays,
  dayKey,
  fullMonthLabel,
  groupByDay,
  isSameDay,
  monthMatrix,
  parseDayKey,
  weekDays,
  weekdayLabel,
} from "@/shared/lib/calendar";

export type DesktopCalendarViewMode = "week" | "month";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

/**
 * 桌面备忘录左栏日历（D124）：只读镜像的日期导航。
 *
 * 选中日是唯一真相：周视角箭头移动选中日（同星期），月视角箭头只翻月；
 * 点日期才改选中。与手机共用 `shared/lib/calendar` 的日期语义。
 */
export function MemoCalendarPanel({
  items,
  selectedKey,
  view,
  onSelect,
  onViewChange,
}: {
  items: MemoSummary[];
  selectedKey: string;
  view: DesktopCalendarViewMode;
  onSelect: (key: string) => void;
  onViewChange: (view: DesktopCalendarViewMode) => void;
}) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const [key, bucket] of groupByDay(items)) map.set(key, bucket.length);
    return map;
  }, [items]);

  const selected = parseDayKey(selectedKey);
  const [anchor, setAnchor] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );

  useEffect(() => {
    const next = parseDayKey(selectedKey);
    setAnchor((current) =>
      current.getFullYear() === next.getFullYear() && current.getMonth() === next.getMonth()
        ? current
        : new Date(next.getFullYear(), next.getMonth(), 1),
    );
  }, [selectedKey]);

  const days = useMemo(() => weekDays(parseDayKey(selectedKey)), [selectedKey]);
  const label =
    view === "week"
      ? fullMonthLabel(selected.getFullYear(), selected.getMonth())
      : fullMonthLabel(anchor.getFullYear(), anchor.getMonth());

  const move = (direction: -1 | 1) => {
    if (view === "week") {
      onSelect(dayKey(addDays(selected, direction * 7)));
      return;
    }
    setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1));
  };

  const today = new Date();

  return (
    <section aria-label="日历" className="dsl-card flex flex-col gap-1 p-3">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          aria-label={view === "week" ? "上一周" : "上个月"}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-signal hover:bg-wash"
          onClick={() => move(-1)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[14px] leading-none font-semibold text-foreground">
          {label}
        </span>
        <button
          type="button"
          aria-label={view === "week" ? "下一周" : "下个月"}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-signal hover:bg-wash"
          onClick={() => move(1)}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <SegmentedControl<DesktopCalendarViewMode>
          label="日历视角"
          value={view}
          options={[
            { value: "week", label: "周" },
            { value: "month", label: "月" },
          ]}
          onChange={onViewChange}
          className="w-[76px]"
        />
        <button
          type="button"
          disabled={selectedKey === dayKey(today)}
          className="h-7 rounded-full px-2 text-[12px] text-signal hover:bg-wash disabled:text-muted-foreground"
          onClick={() => onSelect(dayKey(today))}
        >
          今天
        </button>
      </div>

      {view === "week" ? (
        <div className="mt-1 grid grid-cols-7">
          {days.map((date) => {
            const key = dayKey(date);
            const count = counts.get(key) ?? 0;
            const active = key === selectedKey;
            const isToday = isSameDay(date, today);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                aria-label={`${date.getMonth() + 1} 月 ${date.getDate()} 日 ${weekdayLabel(date)}${
                  count > 0 ? `，${count} 条记录` : "，没有记录"
                }${isToday ? "，今天" : ""}`}
                onClick={() => onSelect(key)}
                className={cn(
                  "flex h-[52px] flex-col items-center justify-center gap-0.5 rounded-[10px]",
                  active ? "bg-signal text-white" : "text-muted-foreground hover:bg-wash",
                )}
              >
                <span className="text-[10px] leading-none">
                  {isToday ? "今天" : WEEKDAY_LABELS[(date.getDay() + 6) % 7]}
                </span>
                <span
                  className={cn(
                    "text-[13px] leading-[16px] font-medium tabular-nums",
                    active ? "text-white" : "text-foreground",
                    isToday && !active && "text-signal",
                  )}
                >
                  {date.getDate()}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1 rounded-full",
                    count > 0 ? (active ? "bg-white" : "bg-signal") : "bg-transparent",
                  )}
                />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-1">
          <div className="grid grid-cols-7" aria-hidden="true">
            {WEEKDAY_LABELS.map((weekday) => (
              <span
                key={weekday}
                className="flex h-5 items-center justify-center text-[10px] text-muted-foreground"
              >
                {weekday}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthMatrix(anchor.getFullYear(), anchor.getMonth()).map((cell) => {
              const count = counts.get(cell.key) ?? 0;
              const active = cell.key === selectedKey;
              const isToday = isSameDay(cell.date, today);
              return (
                <button
                  key={cell.key}
                  type="button"
                  aria-pressed={active}
                  aria-label={`${cell.date.getMonth() + 1} 月 ${cell.date.getDate()} 日 ${weekdayLabel(
                    cell.date,
                  )}${count > 0 ? `，${count} 条记录` : "，没有记录"}${isToday ? "，今天" : ""}`}
                  onClick={() => {
                    setAnchor(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
                    onSelect(cell.key);
                  }}
                  className="relative flex h-10 items-center justify-center"
                >
                  <span className="absolute bottom-0.5 flex gap-[2px]" aria-hidden="true">
                    {count > 0 && (
                      <span
                        className={cn("size-[3px] rounded-full", active ? "bg-white" : "bg-signal")}
                      />
                    )}
                    {count > 1 && (
                      <span
                        className={cn("size-[3px] rounded-full", active ? "bg-white" : "bg-signal")}
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-[12.5px] tabular-nums",
                      active
                        ? "bg-signal font-medium text-white"
                        : cell.inMonth
                          ? "text-foreground"
                          : "text-muted-foreground/50",
                      isToday && !active && "ring-[1.5px] ring-signal",
                    )}
                  >
                    {cell.date.getDate()}
                  </span>
                  <span className="sr-only">{count > 0 ? `${count} 条记录` : "没有记录"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
