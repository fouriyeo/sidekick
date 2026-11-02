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

function SummaryCard({ label, summary }: { label: string; summary: UsageSummary }) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <p className="text-xs text-muted-foreground">{label}费用</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {formatCnyMicros(summary.costCnyMicros)}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">总 Token</dt>
          <dd className="tabular-nums">{formatTokens(summary.totalTokens)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">输入 / 输出</dt>
          <dd className="tabular-nums">
            {formatTokens(summary.inputTokens)} / {formatTokens(summary.outputTokens)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">会话</dt>
          <dd className="tabular-nums">{formatTokens(summary.sessions)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">音频时长</dt>
          <dd className="tabular-nums">{formatAudioDuration(summary.audioDurationMs)}</dd>
        </div>
      </dl>
    </div>
  );
}

function UsageRowLine({ row, maxCost }: { row: UsageRow; maxCost: number }) {
  const ratio = maxCost > 0 ? Math.max(0, Math.min(1, row.costCnyMicros / maxCost)) : 0;
  return (
    <div className="grid grid-cols-[64px_48px_76px_76px_84px_78px_minmax(60px,1fr)] items-center gap-2 border-t border-border/60 px-1 py-1.5 text-[11px] tabular-nums">
      <span className="text-muted-foreground">{row.label}</span>
      <span>{formatTokens(row.sessions)}</span>
      <span>{formatTokens(row.inputTokens)}</span>
      <span>{formatTokens(row.outputTokens)}</span>
      <span>{formatTokens(row.totalTokens)}</span>
      <span className="text-right">{formatCnyMicros(row.costCnyMicros)}</span>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary/60"
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
    <section aria-label="用量统计" className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="size-4 text-muted-foreground" />
            用量统计
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            只统计这台电脑上的识别会话；金额按百炼价格估算。
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
            className="mt-3 grid w-full max-w-md grid-cols-4 gap-1 rounded-lg bg-muted p-1"
          >
            {RANGE_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={range === item.key}
                className={
                  range === item.key
                    ? "inline-flex h-7 items-center justify-center rounded-md bg-background px-2 text-xs font-medium text-foreground shadow-sm"
                    : "inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                }
                onClick={() => setRange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-3">
            <SummaryCard label={selected.label} summary={stats[selected.key]} />
          </div>

          {rows.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-background/60">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-[64px_48px_76px_76px_84px_78px_minmax(60px,1fr)] gap-2 px-1 py-2 text-[10px] text-muted-foreground">
                  <span>{range === "last365Days" ? "月份" : "日期"}</span>
                  <span>会话</span>
                  <span>输入 Token</span>
                  <span>输出 Token</span>
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
            <p className="mt-3 text-[11px] text-muted-foreground">
              今天只展示汇总；切到近 7 天/近 1 个月可看按天明细。
            </p>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            {stats.priceNote}
          </p>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
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
