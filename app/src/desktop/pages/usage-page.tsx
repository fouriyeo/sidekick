import { cn } from "cn";
import { Activity, Database, Filter, Layers, RefreshCw, Zap } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/desktop/components/empty-state";
import { PricingSheet } from "@/desktop/features/usage/pricing-sheet";
import { type UsageGroupMode, useUsageStore } from "@/desktop/features/usage/usage-store";
import { Card, CardHint } from "@/desktop/shell/card";
import { PageChip } from "@/desktop/shell/page-chips";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageFooter, PageShell } from "@/desktop/shell/page-shell";
import type { TokenUsageStats, UsageRow } from "@/protocol/messages";
import {
  costSourceLabel,
  formatCny,
  formatCount,
  formatPct,
  formatTokenCompact,
  formatUpdatedAt,
  formatUsageCost,
  isEstimated,
  RANGE_LABEL,
  TOKEN_PART_COLORS,
  USAGE_RANGES,
} from "@/shared/lib/usage";
import { Button } from "@/shared/ui/button";

const GROUP_TABS: ReadonlyArray<{ value: UsageGroupMode; label: string }> = [
  { value: "client", label: "客户端" },
  { value: "session", label: "会话" },
  { value: "model", label: "模型" },
];

const PLANNED_CLIENTS = [
  { key: "claude-code", label: "Claude Code", sub: "P1 · 解析器未接入", tokens: null },
  { key: "codex", label: "Codex", sub: "P1 · 解析器未接入", tokens: null },
];

const LEDGER_REASON: Record<string, { title: string; description: string }> = {
  ledger_missing: {
    title: "还没找到 DSH 账本",
    description:
      "先把 DSH 打开一次，或在「系统 › 联动」确认联动已安装。账本只在本机读取，不会上传。",
  },
  ledger_invalid: {
    title: "账本格式暂时认不出来",
    description: "DSH 正在写入时可能短暂读不到；稍后点重试。不会显示猜测数字。",
  },
  ledger_too_large: {
    title: "账本文件异常偏大",
    description: "已超过 64MB 保护上限，看板停止读取。请检查 DSH cost-meter 账本。",
  },
};

/**
 * 用量（第 6 个桌面一级页）：只读 DSH cost-meter 账本。
 *
 * 首屏回答「用了多少 / 花了多少 / 缓存有多省」；分组卡可切
 * 客户端 / 会话 / 模型；价格表从模型行脚进入，只用于对照与缺价估算。
 */
export function UsagePage() {
  const range = useUsageStore((state) => state.range);
  const group = useUsageStore((state) => state.group);
  const stats = useUsageStore((state) => state.stats);
  const loading = useUsageStore((state) => state.loading);
  const error = useUsageStore((state) => state.error);
  const pricingBusy = useUsageStore((state) => state.pricingBusy);
  const pricingError = useUsageStore((state) => state.pricingError);
  const sheetOpen = useUsageStore((state) => state.sheetOpen);
  const setRange = useUsageStore((state) => state.setRange);
  const setGroup = useUsageStore((state) => state.setGroup);
  const setSheetOpen = useUsageStore((state) => state.setSheetOpen);
  const load = useUsageStore((state) => state.load);
  const refreshPricing = useUsageStore((state) => state.refreshPricing);
  const setAutoRefresh = useUsageStore((state) => state.setAutoRefresh);
  const setMobileModels = useUsageStore((state) => state.setMobileModels);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = stats?.summary;
  const ledgerUnavailable = stats != null && !stats.ledger.available;
  const reason = LEDGER_REASON[stats?.ledger.reason ?? ""] ?? LEDGER_REASON.ledger_missing;

  return (
    <PageShell>
      <PageHeader
        title="用量"
        description="DSH 本机账本；按客户端、会话、模型看 Token 与花费，价格表只做对照。"
        chips={
          <>
            <PageChip label="DSH 记账" tone="signal" />
            <PageChip label="本机 · 不上传" tone="muted" />
          </>
        }
        actions={
          <>
            <fieldset
              className="m-0 flex h-8 items-center rounded-lg border border-border bg-card p-0.5"
              aria-label="统计区间"
            >
              {USAGE_RANGES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    "h-7 rounded-md px-2.5 text-[11px] transition-colors",
                    range === item.value
                      ? "bg-wash text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-pressed={range === item.value}
                  onClick={() => setRange(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </fieldset>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden="true" />
              刷新
            </Button>
          </>
        }
      />

      <PageBody className="overflow-y-auto pr-0.5">
        {error && !stats ? (
          <div className="py-12">
            <EmptyState
              icon={<Database className="size-4" />}
              title="读取用量失败"
              description={error}
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                  重试
                </Button>
              }
            />
          </div>
        ) : ledgerUnavailable ? (
          <div className="py-12">
            <EmptyState
              icon={<Database className="size-4" />}
              title={reason.title}
              description={reason.description}
              action={
                <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                  重试
                </Button>
              }
            />
          </div>
        ) : !stats || !summary ? (
          <div className="flex flex-1 items-center justify-center py-16 text-[12px] text-muted-foreground">
            正在读取本机账本…
          </div>
        ) : (
          <>
            <StatsRow stats={stats} />
            <div className="grid min-h-0 shrink-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
              <TrendCard stats={stats} />
              <CacheCard stats={stats} />
            </div>
            <div className="grid min-h-0 shrink-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
              <CompositionCard stats={stats} />
              <GroupCard
                stats={stats}
                group={group}
                onGroupChange={setGroup}
                onOpenPricing={() => setSheetOpen(true)}
              />
            </div>
          </>
        )}
      </PageBody>

      <PageFooter>
        <span>DSH COST-METER · {RANGE_LABEL[range]}</span>
        <span className="normal-case">
          实际记账来自 DSH；缺价才按价格表估算（标 ≈）；百炼语音费用不并入
        </span>
        {stats?.pricing.stale && <span className="text-decide">价格表待更新</span>}
      </PageFooter>

      {stats && (
        <PricingSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          stats={stats}
          busy={pricingBusy}
          error={pricingError}
          onRefresh={(force) => void refreshPricing(force)}
          onAutoRefreshChange={(enabled) => void setAutoRefresh(enabled)}
          onMobileModelsChange={(enabled) => void setMobileModels(enabled)}
        />
      )}
    </PageShell>
  );
}

function StatsRow({ stats }: { stats: TokenUsageStats }) {
  const { summary, previous } = stats;
  const cacheRead = summary.cacheRead;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="总 TOKEN"
        value={formatTokenCompact(summary.tokens)}
        unit="tokens"
        hint="五桶合计"
        delta={deltaText(summary.tokens, previous.tokens, true)}
      />
      <Stat
        label={summary.costSource === "estimated" ? "估算花费" : "DSH 花费"}
        value={formatUsageCost(summary.costSource, summary.costCnyMicros)}
        hint={
          summary.costSource === "unknown"
            ? "缺价 · 不估算"
            : isEstimated(summary.costSource)
              ? "含估算 · 以账单为准"
              : "账本 costCny"
        }
        delta={deltaText(summary.costCnyMicros, previous.costCnyMicros)}
      />
      <Stat
        label="缓存命中率"
        value={formatPct(summary.cacheHitPct)}
        hint={`${formatTokenCompact(cacheRead)} 缓存读`}
        delta={`${formatTokenCompact(cacheRead)} 来自缓存`}
      />
      <Stat
        label="调用 / 会话"
        value={formatCount(summary.calls)}
        unit="次"
        hint="DSH 账本累计"
        delta={`${summary.sessions} 个会话`}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  hint,
  delta,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  delta?: string;
}) {
  return (
    <div className="rounded-[14px] border border-border bg-card px-3.5 py-3">
      <p className="font-mono text-[9px] tracking-[0.13em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1.5 flex items-baseline gap-1 text-[24px] leading-none font-semibold tabular-nums">
        {value}
        {unit && <span className="text-[10px] font-normal text-muted-foreground">{unit}</span>}
      </p>
      <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="truncate">{delta}</span>
        {hint && <span className="truncate text-muted-foreground/70">· {hint}</span>}
      </p>
    </div>
  );
}

function deltaText(current: number, previous: number, neutral = false): string {
  if (previous <= 0) return neutral ? "上一周期无数据" : "上一周期无数据";
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return "与上一周期持平";
  const arrow = pct > 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(pct).toFixed(1)}% 对比上一周期`;
}

function TrendCard({ stats }: { stats: TokenUsageStats }) {
  const days = stats.days.slice(-30);
  const max = Math.max(...days.map((day) => day.costCnyMicros), 1);
  const total = days.reduce((sum, day) => sum + day.costCnyMicros, 0);
  const average = days.length > 0 ? total / days.length : 0;
  const peak = Math.max(...days.map((day) => day.costCnyMicros), 0);
  return (
    <Card
      title={
        <>
          <Activity aria-hidden="true" />
          花费趋势
        </>
      }
      subtitle="COST · 近 30 天 · CNY"
      pill={<span className="text-[10px] text-muted-foreground">峰值 {formatCny(peak)}</span>}
      footer={
        <>
          <CardHint>末根高亮为今天；柱高按当天花费。</CardHint>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            日均 {formatCny(average)} · 合计 {formatCny(total)}
          </span>
        </>
      }
    >
      <div className="flex h-[132px] items-end gap-[3px] px-0.5">
        {days.map((day) => {
          const height = day.costCnyMicros > 0 ? (day.costCnyMicros / max) * 100 : 2;
          const isLast = day.date === days[days.length - 1]?.date;
          return (
            <div
              key={day.date}
              className="group flex h-full min-w-0 flex-1 flex-col items-stretch justify-end gap-1"
              title={`${day.date} · ${formatCny(day.costCnyMicros)} · ${formatTokenCompact(day.tokens)} tokens`}
            >
              <div
                className={cn(
                  "w-full rounded-[2px] transition-colors",
                  isLast ? "bg-signal" : "bg-signal/45 group-hover:bg-signal/70",
                )}
                style={{ height: `${Math.max(2, height)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between pt-1 text-[9px] text-muted-foreground">
        <span>{days[0]?.date.slice(5)}</span>
        <span>{days[days.length - 1]?.date.slice(5)}</span>
      </div>
    </Card>
  );
}

function CacheCard({ stats }: { stats: TokenUsageStats }) {
  const { summary } = stats;
  const hit = Math.max(0, Math.min(100, summary.cacheHitPct ?? 0));
  return (
    <Card
      title={
        <>
          <Zap aria-hidden="true" />
          缓存效率
        </>
      }
      subtitle={`CACHE · ${RANGE_LABEL[stats.range]}`}
      footer={<CardHint>命中率 = 缓存读 ÷（输入 + 缓存读 + 缓存写）</CardHint>}
    >
      <div className="flex items-center gap-4">
        <div
          className="relative grid size-[104px] shrink-0 place-items-center rounded-full"
          style={{
            background: `conic-gradient(var(--signal) ${hit}%, var(--border) ${hit}% 100%)`,
          }}
          role="img"
          aria-label={`缓存命中率 ${formatPct(summary.cacheHitPct)}`}
        >
          <div className="grid size-[86px] place-items-center rounded-full bg-card text-center">
            <div>
              <p className="text-[22px] leading-none font-semibold tabular-nums">
                {Math.round(hit)}%
              </p>
              <p className="mt-1 text-[9px] text-muted-foreground">命中率</p>
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <LegendRow
            label="缓存读"
            value={summary.cacheRead}
            total={summary.tokens}
            color="var(--chart-2)"
          />
          <LegendRow
            label="输入"
            value={summary.input}
            total={summary.tokens}
            color="var(--chart-1)"
          />
          <LegendRow
            label="输出"
            value={summary.output}
            total={summary.tokens}
            color="var(--chart-3)"
          />
          {summary.reasoning > 0 && (
            <LegendRow
              label="推理"
              value={summary.reasoning}
              total={summary.tokens}
              color="var(--chart-5)"
            />
          )}
        </div>
      </div>
    </Card>
  );
}

function LegendRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <i className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="w-[3em] shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right font-mono tabular-nums">
        {formatTokenCompact(value)}
      </span>
      <span className="w-[3.4em] shrink-0 text-right text-muted-foreground tabular-nums">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function CompositionCard({ stats }: { stats: TokenUsageStats }) {
  const { summary } = stats;
  const parts = [
    {
      key: "cacheRead",
      label: "缓存读",
      value: summary.cacheRead,
      color: TOKEN_PART_COLORS.cacheRead,
    },
    { key: "input", label: "输入", value: summary.input, color: TOKEN_PART_COLORS.input },
    { key: "output", label: "输出", value: summary.output, color: TOKEN_PART_COLORS.output },
    {
      key: "cacheWrite",
      label: "缓存写",
      value: summary.cacheWrite,
      color: TOKEN_PART_COLORS.cacheWrite,
    },
    {
      key: "reasoning",
      label: "推理",
      value: summary.reasoning,
      color: TOKEN_PART_COLORS.reasoning,
    },
  ].filter((part) => part.value > 0);
  const total = summary.tokens || 1;
  return (
    <Card
      title={
        <>
          <Layers aria-hidden="true" />
          Token 构成
        </>
      }
      subtitle={`BUCKETS · ${RANGE_LABEL[stats.range]}`}
      footer={<CardHint>5 个桶来自 DSH 账本；为 0 时自动省略。</CardHint>}
    >
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((part) => (
          <i
            key={part.key}
            title={`${part.label} ${formatTokenCompact(part.value)}`}
            style={{ width: `${(part.value / total) * 100}%`, background: part.color }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {parts.map((part) => (
          <div key={part.key} className="flex items-center gap-2 text-[10.5px]">
            <i className="size-1.5 shrink-0 rounded-full" style={{ background: part.color }} />
            <span className="w-[3em] shrink-0 text-muted-foreground">{part.label}</span>
            <span className="min-w-0 flex-1 text-right font-mono tabular-nums">
              {formatTokenCompact(part.value)}
            </span>
            <span className="w-[3.4em] shrink-0 text-right text-muted-foreground tabular-nums">
              {((part.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-[10.5px]">
        <span className="text-muted-foreground">每次调用平均</span>
        <span className="font-mono tabular-nums">
          {formatTokenCompact(summary.calls > 0 ? summary.tokens / summary.calls : 0)} tokens ·{" "}
          {formatCny(summary.calls > 0 ? summary.costCnyMicros / summary.calls : 0, 4)}
        </span>
      </div>
    </Card>
  );
}

function GroupCard({
  stats,
  group,
  onGroupChange,
  onOpenPricing,
}: {
  stats: TokenUsageStats;
  group: UsageGroupMode;
  onGroupChange: (group: UsageGroupMode) => void;
  onOpenPricing: () => void;
}) {
  const rows =
    group === "client"
      ? stats.groups.clients
      : group === "session"
        ? stats.groups.sessions
        : stats.groups.models;
  const priced = stats.groups.models.filter((row) => row.price).length;
  return (
    <Card
      title={
        <>
          <Filter aria-hidden="true" />
          分组明细
        </>
      }
      subtitle="GROUP · 客户端 / 会话 / 模型"
      pill={
        <div
          className="flex items-center rounded-lg border border-border bg-card p-0.5"
          role="tablist"
          aria-label="分组维度"
        >
          {GROUP_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              className={cn(
                "h-6 rounded-md px-2 text-[10.5px] transition-colors",
                group === tab.value
                  ? "bg-wash text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-selected={group === tab.value}
              onClick={() => onGroupChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
      footer={
        <>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 text-left text-[10px] text-muted-foreground hover:text-foreground"
            onClick={onOpenPricing}
          >
            <span className="truncate">
              价格表 · {priced} 个模型有价 · {formatUpdatedAt(stats.pricing.updatedAt)}
              {stats.pricing.stale ? " · 已过期" : ""}
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <CardHint>
            {stats.ledger.reason ? "展示上次成功读取的缓存" : `${stats.coverageDays} 天有数据`}
          </CardHint>
        </>
      }
    >
      <div className="flex flex-col">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">
            这个区间没有可展示的分组。
          </p>
        ) : (
          rows.map((row) => <GroupRow key={row.key} row={row} />)
        )}
        {group === "client" &&
          PLANNED_CLIENTS.map((client) => (
            <div
              key={client.key}
              className="flex items-center gap-2 border-t border-border/60 py-2"
            >
              <i className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                {client.label}
              </span>
              <span className="shrink-0 text-[9px] text-muted-foreground">{client.sub}</span>
              <span className="w-9 shrink-0 text-right text-[10px] text-muted-foreground">—</span>
            </div>
          ))}
      </div>
      {group === "client" && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          客户端 = AI 工具。当前只有 DSH 接入账本；Claude Code / Codex 在 P1 解析器接入后出现。
        </p>
      )}
    </Card>
  );
}

function GroupRow({ row }: { row: UsageRow }) {
  const estimated = isEstimated(row.costSource);
  return (
    <div className="group flex items-center gap-2 border-t border-border/60 py-2 first:border-t-0">
      <i
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          row.tag === "other" ? "bg-muted-foreground/40" : "bg-signal",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-[11.5px] font-medium" title={row.label}>
            {row.label}
          </span>
          {row.tag && row.tag !== "other" && (
            <span className="shrink-0 rounded border border-border px-1 py-px text-[8.5px] text-muted-foreground">
              {row.tag}
            </span>
          )}
          {estimated && (
            <span
              className="shrink-0 text-[9px] text-decide"
              title={costSourceLabel(row.costSource)}
            >
              ≈
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[9.5px] text-muted-foreground">
            {row.sub ?? ""}
          </span>
          <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
            <i
              className="block h-full rounded-full bg-signal/60"
              style={{ width: `${Math.min(100, row.sharePct)}%` }}
            />
          </span>
          <span className="w-9 shrink-0 text-right text-[9px] text-muted-foreground tabular-nums">
            {row.sharePct.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="flex w-[104px] shrink-0 flex-col items-end">
        <span className="text-[11px] tabular-nums">{formatTokenCompact(row.tokens)}</span>
        <span className="text-[9.5px] text-muted-foreground tabular-nums">
          {formatUsageCost(row.costSource, row.costCnyMicros)}
        </span>
      </div>
    </div>
  );
}
