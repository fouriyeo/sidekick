import { cn } from "cn";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { ListActionRow, ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
import { SegmentedControl } from "@/desktop/shell/segmented-control";
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

const RANGE_OPTIONS: ReadonlyArray<{ value: RangeKey; label: string; days: number }> = [
  { value: "today", label: "今天", days: 0 },
  { value: "last7Days", label: "7 天", days: 7 },
  { value: "last30Days", label: "30 天", days: 30 },
  { value: "last365Days", label: "1 年", days: 365 },
];

type UsageRow = {
  label: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costCnyMicros: number;
};

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

function SummaryRows({ summary }: { summary: UsageSummary }) {
  return (
    <>
      <ListRow title="费用" meta={formatCnyMicros(summary.costCnyMicros)} />
      <ListRow title="Token" meta={formatTokens(summary.totalTokens)} />
      <ListRow title="会话" meta={`${formatTokens(summary.sessions)} 次`} />
      <ListRow title="时长" meta={formatAudioDuration(summary.audioDurationMs)} />
    </>
  );
}

/**
 * 设置 › 语音输入 › 语音用量：区间分段 + 四行汇总 + 明细分组列表。
 *
 * 明细按 ListRow 铺开（7/30 天按天、1 年按月），不做横向滚动的表格；
 * 「今天」只有汇总，不显示明细组。清空统计是危险操作，二次确认。
 */
export function UsageStatsPanel() {
  const stats = useUsageStore((state) => state.stats);
  const loading = useUsageStore((state) => state.loading);
  const clearing = useUsageStore((state) => state.clearing);
  const error = useUsageStore((state) => state.error);
  const load = useUsageStore((state) => state.load);
  const clear = useUsageStore((state) => state.clear);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [range, setRange] = useState<RangeKey>("today");

  const selected = RANGE_OPTIONS.find((item) => item.value === range) ?? RANGE_OPTIONS[0];
  const rows: UsageRow[] = stats
    ? range === "today"
      ? []
      : range === "last365Days"
        ? monthlyRows(stats.days)
        : dailyRows(stats.days, selected.days)
    : [];
  const summary = stats?.[selected.value] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <ListGroup
        title="语音用量"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading || clearing}
            onClick={() => void load()}
          >
            <RefreshCw aria-hidden="true" className={cn("size-3.5", loading && "animate-spin")} />
            刷新
          </Button>
        }
      >
        <ListRow
          title="区间"
          control={
            <SegmentedControl<RangeKey>
              label="统计区间"
              className="w-[232px]"
              value={range}
              options={RANGE_OPTIONS}
              onChange={setRange}
            />
          }
        />
        {summary ? (
          <SummaryRows summary={summary} />
        ) : (
          <ListEmpty>{error ? "读取用量失败" : "正在读取用量…"}</ListEmpty>
        )}
        <ListActionRow
          tone="danger"
          disabled={!stats || loading || clearing}
          onClick={() => setConfirmOpen(true)}
        >
          清空统计
        </ListActionRow>
      </ListGroup>

      {rows.length > 0 && (
        <ListGroup title="明细">
          {rows.map((row) => (
            <ListRow
              key={row.label}
              title={row.label}
              detail={`${formatTokens(row.sessions)} 次 · ${formatTokens(row.totalTokens)} tokens`}
              meta={formatCnyMicros(row.costCnyMicros)}
            />
          ))}
        </ListGroup>
      )}

      {(error || stats) && (
        <div className="flex flex-col gap-1 px-1.5">
          {error && (
            <p role="alert" className="text-[13px] leading-[1.45] text-destructive">
              {error}
            </p>
          )}
          {stats && (
            <p className="text-[13px] leading-[1.45] text-muted-foreground">{stats.priceNote}</p>
          )}
        </div>
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
    </div>
  );
}
