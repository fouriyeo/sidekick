import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MemoSummary } from "@/protocol/memo";
import {
  addDays,
  dayKey,
  groupByDay,
  isSameDay,
  monthLabel,
  monthMatrix,
  parseDayKey,
  weekDays,
  weekdayLabel,
} from "@/shared/lib/calendar";

export type MemoCalendarViewMode = "week" | "month";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

function Dot({ visible }: { visible: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-1 rounded-full", visible ? "bg-primary" : "bg-transparent")}
    />
  );
}

/**
 * 手机备忘录日历（D124）：工具行（翻页 + 周/月）+ 周条 / 月网格。
 *
 * 选中日是唯一真相；周视角箭头移动选中日（同星期），月视角箭头只翻月。
 * 录音中整体禁用，避免录着音切日期。
 */
export function MemoCalendarView({
  items,
  selectedKey,
  view,
  disabled = false,
  resetToken = 0,
  onSelect,
  onViewChange,
}: {
  items: MemoSummary[];
  selectedKey: string;
  view: MemoCalendarViewMode;
  disabled?: boolean;
  /** 页头「今天」每次点击 +1：把月视角的锚点拉回本月。 */
  resetToken?: number;
  onSelect: (key: string) => void;
  onViewChange: (view: MemoCalendarViewMode) => void;
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
  const weekRef = useRef<HTMLDivElement | null>(null);

  // 外部改选中日（例如保存后跳回今天）时，月视角跟着定位到那个月。
  useEffect(() => {
    if (resetToken === 0) return;
    const now = new Date();
    setAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
  }, [resetToken]);

  useEffect(() => {
    const next = parseDayKey(selectedKey);
    setAnchor((current) =>
      current.getFullYear() === next.getFullYear() && current.getMonth() === next.getMonth()
        ? current
        : new Date(next.getFullYear(), next.getMonth(), 1),
    );
  }, [selectedKey]);

  const days = useMemo(() => weekDays(parseDayKey(selectedKey)), [selectedKey]);

  // 选中日滚到“第 2 格”，左边露出一天，暗示可以横滑看更早。
  useEffect(() => {
    if (view !== "week") return;
    const wrap = weekRef.current;
    if (!wrap) return;
    const current = wrap.querySelector<HTMLElement>(`[data-key="${selectedKey}"]`);
    if (!current) return;
    wrap.scrollLeft = Math.max(0, current.offsetLeft - 44);
  }, [view, selectedKey]);

  const label =
    view === "week"
      ? monthLabel(selected.getFullYear(), selected.getMonth())
      : monthLabel(anchor.getFullYear(), anchor.getMonth());

  const move = (direction: -1 | 1) => {
    if (disabled) return;
    if (view === "week") {
      onSelect(dayKey(addDays(selected, direction * 7)));
      return;
    }
    setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1));
  };

  return (
    <section
      aria-label="日历"
      className={cn("flex-none select-none", disabled && "opacity-60")}
      aria-disabled={disabled || undefined}
    >
      <div className="flex h-11 items-center gap-1">
        <button
          type="button"
          aria-label={view === "week" ? "上一周" : "上个月"}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary active:bg-wash disabled:text-muted-foreground"
          disabled={disabled}
          onClick={() => move(-1)}
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <span className="min-w-0 flex-1 text-center text-[13px] leading-[18px] font-semibold text-foreground">
          {label}
        </span>
        <button
          type="button"
          aria-label={view === "week" ? "下一周" : "下个月"}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-primary active:bg-wash disabled:text-muted-foreground"
          disabled={disabled}
          onClick={() => move(1)}
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>

        <fieldset
          aria-label="日历视角"
          className="relative m-0 ml-1 flex h-11 w-[88px] shrink-0 items-center rounded-full border-0 bg-muted p-0"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-[6px] left-[6px] h-8 w-[38px] rounded-full bg-card shadow-sm transition-transform duration-200"
            style={{ transform: view === "month" ? "translateX(38px)" : "translateX(0)" }}
          />
          <button
            type="button"
            aria-pressed={view === "week"}
            disabled={disabled}
            className={cn(
              "relative z-10 flex h-11 w-11 items-center justify-center text-[12px] font-medium",
              view === "week" ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={() => onViewChange("week")}
          >
            周
          </button>
          <button
            type="button"
            aria-pressed={view === "month"}
            disabled={disabled}
            className={cn(
              "relative z-10 flex h-11 w-11 items-center justify-center text-[12px] font-medium",
              view === "month" ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={() => onViewChange("month")}
          >
            月
          </button>
        </fieldset>
      </div>

      {view === "week" ? (
        <div
          ref={weekRef}
          className="flex gap-0.5 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {days.map((date) => {
            const key = dayKey(date);
            const count = counts.get(key) ?? 0;
            const selectedDay = key === selectedKey;
            const today = isSameDay(date, new Date());
            return (
              <button
                key={key}
                type="button"
                data-key={key}
                aria-pressed={selectedDay}
                aria-label={`${date.getMonth() + 1} 月 ${date.getDate()} 日 ${weekdayLabel(date)}${
                  count > 0 ? `，${count} 条记录` : "，没有记录"
                }${today ? "，今天" : ""}`}
                disabled={disabled}
                onClick={() => onSelect(key)}
                className={cn(
                  "flex h-[52px] w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[14px]",
                  selectedDay
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground active:bg-wash",
                )}
              >
                <span className="text-[10.5px] leading-none">
                  {today ? "今天" : WEEKDAY_LABELS[(date.getDay() + 6) % 7]}
                </span>
                <span
                  className={cn(
                    "text-[15px] leading-[18px] font-medium tabular-nums",
                    selectedDay ? "text-primary-foreground" : "text-foreground",
                    today && !selectedDay && "text-primary",
                  )}
                >
                  {date.getDate()}
                </span>
                <Dot visible={count > 0} />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="-mx-2.5 pb-1 min-[360px]:mx-0">
          <div className="grid grid-cols-7 pb-0.5" aria-hidden="true">
            {WEEKDAY_LABELS.map((label) => (
              <span
                key={label}
                className="flex h-6 items-center justify-center text-[10.5px] text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthMatrix(anchor.getFullYear(), anchor.getMonth()).map((cell) => {
              const count = counts.get(cell.key) ?? 0;
              const selectedDay = cell.key === selectedKey;
              const today = isSameDay(cell.date, new Date());
              return (
                <button
                  key={cell.key}
                  type="button"
                  aria-pressed={selectedDay}
                  aria-label={`${cell.date.getMonth() + 1} 月 ${cell.date.getDate()} 日 ${weekdayLabel(
                    cell.date,
                  )}${count > 0 ? `，${count} 条记录` : "，没有记录"}${today ? "，今天" : ""}`}
                  disabled={disabled}
                  onClick={() => {
                    setAnchor(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
                    onSelect(cell.key);
                  }}
                  className="relative flex h-11 items-center justify-center"
                >
                  <span className="absolute bottom-0.5 flex gap-[2px]" aria-hidden="true">
                    {count > 0 && (
                      <span
                        className={cn(
                          "size-[3px] rounded-full",
                          selectedDay ? "bg-primary-foreground" : "bg-primary",
                        )}
                      />
                    )}
                    {count > 1 && (
                      <span
                        className={cn(
                          "size-[3px] rounded-full",
                          selectedDay ? "bg-primary-foreground" : "bg-primary",
                        )}
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-[13.5px] tabular-nums",
                      selectedDay
                        ? "bg-primary font-medium text-primary-foreground"
                        : cell.inMonth
                          ? "text-foreground"
                          : "text-muted-foreground/50",
                      today && !selectedDay && "ring-[1.5px] ring-primary",
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
