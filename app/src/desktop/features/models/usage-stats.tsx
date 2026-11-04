import { cn } from "cn";
import { Loader2, RefreshCw, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import type { UsageDay, UsageSummary } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { formatAudioDuration, formatCnyMicros, formatDayLabel, formatTokens } from "./format";
import { useUsageStore } from "./usage-store";

type RangeKey = "today" | "last7Days" | "last30Days" | "last365Days";

const RANGE_OPTIONS: ReadonlyArray<{ key: RangeKey; label: string; days: number }> = [
  { key: "today", label: "今天", days: 0 },
  { key: "last7Days", label: "近 7 天", days: 7 },
  { key: "last30Days", label: "近 1 个月", days: 30 },
  { key: "last365Days", label: "近 1 年", days: 365 },
];

type UsageRow = {
  label: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costCnyMicros: number;
};

/** 仪表盘统计格：标签用小号全大写等宽字，数字 tabular 对齐。 */
function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3.5 py-3">
      <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-[22px] leading-none tracking-[-0.01em] tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[10.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SummaryCard({ label, summary }: { label: string; summary: UsageSummary }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile
          label={`${label} · 费用`}
          value={formatCnyMicros(summary.costCnyMicros)}
          hint="按百炼价格估算"
        />
        <StatTile label="总 Token" value={formatTokens(summary.totalTokens)} hint="输入 + 输出" />
        <StatTile label="会话" value={formatTokens(summary.sessions)} hint="本机识别次数" />
        <StatTile
          label="音频时长"
          value={formatAudioDuration(summary.audioDurationMs)}
          hint={`输入 ${formatTokens(summary.inputTokens)} · 输出 ${formatTokens(summary.outputTokens)}`}
        />
      </div>
    </div>
  );
}

type BarPoint = { label: string; value: number };

function barPoints(range: RangeKey, days: UsageDay[]): BarPoint[] {
  if (range === "today") return [];
  if (range === "last365Days") {
    const months = new Map<string, number>();
    for (const day of days) {
      const month = day.date.slice(0, 7);
      months.set(month, (months.get(month) ?? 0) + day.totalTokens);
    }
    return [...months.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, value]) => ({ label, value }));
  }
  const count = range === "last7Days" ? 7 : 30;
  return days
    .slice(0, count)
    .reverse()
    .map((day) => ({ label: day.date.slice(5), value: day.totalTokens }));
}

function UsageBars({ range, days }: { range: RangeKey; days: UsageDay[] }) {
  const points = barPoints(range, days);
  if (points.length === 0) return null;

  const max = Math.max(...points.map((point) => point.value), 1);
  const label =
    range === "last365Days"
      ? "近 1 年 · 按月 Token"
      : range === "last30Days"
        ? "近 30 天 · 按天 Token"
        : "近 7 天 · 按天 Token";

  return (
    <div className="mt-3 rounded-lg border border-border bg-popover px-3.5 pt-3 pb-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </span>
        <span className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
          峰值 {formatTokens(max)}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="mt-2 flex h-12 items-end gap-[3px] border-b border-border pb-0.5"
      >
        {points.map((point, index) => (
          <span
            key={point.label}
            className={cn(
              "min-w-px flex-1 rounded-t-[1px]",
              index >= points.length - 2 ? "bg-signal" : "bg-whale/55",
            )}
            style={{ height: `${Math.max(4, Math.round((point.value / max) * 46))}px` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[8.5px] tracking-[0.08em] text-muted-foreground uppercase">
        <span>{range === "last365Days" ? "更早" : "更早"}</span>
        <span>{range === "last365Days" ? "本月" : "今天"}</span>
      </div>
      <span className="sr-only">
        {label}：共 {points.length} 组数据，峰值 {formatTokens(max)} tokens。
      </span>
    </div>
  );
}

function UsageRowLine({ row, maxCost }: { row: UsageRow; maxCost: number }) {
  const ratio = maxCost > 0 ? Math.max(0, Math.min(1, row.costCnyMicros / maxCost)) : 0;
  return (
    <div className="grid grid-cols-[58px_44px_70px_70px_76px_74px_minmax(52px,1fr)] items-center gap-2 border-t border-border px-1 py-1.5 text-[11px] tabular-nums">
      <span className="font-mono text-[10px] text-muted-foreground">{row.label}</span>
      <span>{formatTokens(row.sessions)}</span>
      <span>{formatTokens(row.inputTokens)}</span>
      <span>{formatTokens(row.outputTokens)}</span>
      <span>{formatTokens(row.totalTokens)}</span>
      <span className="text-right">{formatCnyMicros(row.costCnyMicros)}</span>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-signal/70"
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
    </div>
  );
}

function dailyRows(days: UsageDay[], count: number): UsageRow[] {
  return days.slice(0, count).map((day) => ({
    label: formatDayLabel(day.date),
    sessions: day.sessions,
    inputTokens: day.inputTokens,
    outputTokens: day.outputTokens,
    totalTokens: day.totalTokens,
    costCnyMicros: day.costCnyMicros,
  }));
}

/** 近 1 年按自然月汇总，避免 365 行把页面撑爆。 */
function monthlyRows(days: UsageDay[]): UsageRow[] {
  const months = new Map<string, UsageRow>();
  for (const day of days) {
    const month = day.date.slice(0, 7);
    const row = months.get(month) ?? {
      label: month,
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costCnyMicros: 0,
    };
    row.sessions += day.sessions;
    row.inputTokens += day.inputTokens;
    row.outputTokens += day.outputTokens;
    row.totalTokens += day.totalTokens;
    row.costCnyMicros += day.costCnyMicros;
    months.set(month, row);
  }
  return [...months.values()].sort((left, right) => right.label.localeCompare(left.label));
}

export function UsageStatsPanel() {
  const stats = useUsageStore((state) => state.stats);
  const loading = useUsageStore((state) => state.loading);
  const clearing = useUsageStore((state) => state.clearing);
  const error = useUsageStore((state) => state.error);
  const load = useUsageStore((state) => state.load);
  const clear = useUsageStore((state) => state.clear);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [range, setRange] = useState<RangeKey>("today");

  const selected = RANGE_OPTIONS.find((item) => item.key === range) ?? RANGE_OPTIONS[0];
  const rows: UsageRow[] = stats
    ? range === "today"
      ? []
      : range === "last365Days"
        ? monthlyRows(stats.days)
        : dailyRows(stats.days, selected.days)
    : [];
  const maxCost = rows.reduce((max, row) => Math.max(max, row.costCnyMicros), 0);

  return (
    <section aria-label="用量统计" className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="size-4 text-muted-foreground" />
            用量统计
          </h3>
          <p className="mt-1 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
            Usage · 百炼估算
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || clearing}
            onClick={() => void load()}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            刷新
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || clearing || !stats}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-3.5" />
            清空统计
          </Button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      {!stats && !error && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          正在读取用量统计…
        </p>
      )}

      {stats && (
        <>
          <div
            role="tablist"
            aria-label="统计区间"
            className="mt-3 inline-flex w-full max-w-md flex-wrap items-center gap-0.5 rounded-full border border-border bg-popover p-0.5"
          >
            {RANGE_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={range === item.key}
                className={cn(
                  "inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-full px-2 text-[12px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  range === item.key
                    ? "bg-wash text-signal shadow-[inset_0_0_0_1px_var(--border)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setRange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <SummaryCard label={selected.label} summary={stats[selected.key]} />
          </div>

          <UsageBars range={range} days={stats.days} />

          {rows.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-popover">
              <div className="min-w-[520px]">
                <div className="grid grid-cols-[58px_44px_70px_70px_76px_74px_minmax(52px,1fr)] gap-2 px-1 py-2 font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                  <span>{range === "last365Days" ? "月份" : "日期"}</span>
                  <span>会话</span>
                  <span>输入</span>
                  <span>输出</span>
                  <span>总 Token</span>
                  <span className="text-right">金额</span>
                  <span>占比</span>
                </div>
                {rows.map((row) => (
                  <UsageRowLine key={row.label} row={row} maxCost={maxCost} />
                ))}
              </div>
            </div>
          )}

          {range === "today" && (
            <p className="mt-3 font-mono text-[10px] tracking-[0.06em] text-muted-foreground">
              今天只展示汇总；切到近 7 天 / 近 1 个月可看按天明细。
            </p>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {stats.priceNote}
          </p>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <p className="font-mono text-[9px] tracking-[0.16em] text-destructive uppercase">
            确认 · 破坏性操作
          </p>
          <DialogHeader>
            <DialogTitle>清空用量统计？</DialogTitle>
            <DialogDescription>只删除本机统计，不影响百炼账单；删除后不能恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={clearing}
              onClick={() => {
                void clear().then(() => setConfirmOpen(false));
              }}
            >
              清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
