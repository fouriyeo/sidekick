import { cn } from "cn";
import { RefreshCw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { AnimatedNumber } from "@/desktop/features/usage/animated-number";
import { PricingSheet } from "@/desktop/features/usage/pricing-sheet";
import { type UsageGroupMode, useUsageStore } from "@/desktop/features/usage/usage-store";
import { ListActionRow, ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageShell } from "@/desktop/shell/page-shell";
import { SegmentedControl } from "@/desktop/shell/segmented-control";
import type { TokenUsageStats, UsageRow } from "@/protocol/messages";
import {
  formatCny,
  formatCount,
  formatPct,
  formatTokenCompact,
  formatUsageCost,
  USAGE_RANGES,
} from "@/shared/lib/usage";
import { Button } from "@/shared/ui/button";

const GROUP_OPTIONS: ReadonlyArray<{ value: UsageGroupMode; label: string }> = [
  { value: "client", label: "客户端" },
  { value: "session", label: "会话" },
  { value: "model", label: "模型" },
];

/** 只留一句结论；账本缺失/损坏/超限的排查说明不再进界面。 */
const LEDGER_TITLE: Record<string, string> = {
  ledger_missing: "还没找到 DSH 账本",
  ledger_invalid: "账本格式暂时认不出来",
  ledger_too_large: "账本文件异常偏大",
};

/**
 * 用量（一级页）：只读 DSH cost-meter 账本。
 *
 * 首屏是 2×2 汇总，随后是「客户端 / 会话 / 模型」分组列表与价格表入口；
 * 趋势与 Token 构成放在分组之后做补充。不再有页面说明句、状态胶囊、页脚，
 * 也没有 Claude Code / Codex「P1 未接入」占位。
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

  const ledgerUnavailable = stats != null && !stats.ledger.available;
  const ledgerTitle = LEDGER_TITLE[stats?.ledger.reason ?? ""] ?? LEDGER_TITLE.ledger_missing;

  return (
    <PageShell>
      <PageHeader
        title="用量"
        actions={
          <>
            <SegmentedControl
              label="统计区间"
              className="w-[232px]"
              value={range}
              options={USAGE_RANGES}
              onChange={setRange}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="刷新"
              aria-busy={loading}
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw
                aria-hidden="true"
                className={loading ? "size-3.5 animate-spin" : "size-3.5"}
              />
            </Button>
          </>
        }
      />

      <PageBody>
        {error && !stats ? (
          <StateGroup label="读取用量失败" onRetry={() => void load()} />
        ) : ledgerUnavailable ? (
          <StateGroup label={ledgerTitle} onRetry={() => void load()} />
        ) : !stats ? (
          <StateGroup label="正在读取本机账本…" />
        ) : (
          <UsageContent
            stats={stats}
            group={group}
            onGroupChange={setGroup}
            onOpenPricing={() => setSheetOpen(true)}
          />
        )}
      </PageBody>

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

/** 空态 / 错误态：一行结论 + 一个动作，不画插画、不写长说明。 */
function StateGroup({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <ListGroup>
      <ListEmpty>{label}</ListEmpty>
      {onRetry && <ListActionRow onClick={onRetry}>重试</ListActionRow>}
    </ListGroup>
  );
}

function UsageContent({
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
  const modelsHidden = group === "model" && (stats.groups.modelsHidden ?? false);

  return (
    <>
      <SummaryCard stats={stats} />

      <section className="flex flex-col gap-2">
        <div className="px-1">
          <SegmentedControl
            label="分组维度"
            className="w-full"
            value={group}
            options={GROUP_OPTIONS}
            onChange={onGroupChange}
          />
        </div>
        <ListGroup>
          {modelsHidden ? (
            <ListEmpty>模型分组已在电脑端关闭</ListEmpty>
          ) : rows.length === 0 ? (
            <ListEmpty>这个区间没有数据</ListEmpty>
          ) : (
            rows.map((row) => (
              <GroupListRow key={row.key} row={row} showDetail={group !== "client"} />
            ))
          )}
          <ListActionRow onClick={onOpenPricing}>
            {stats.pricing.stale ? "价格表 · 待更新" : "价格表"}
          </ListActionRow>
        </ListGroup>
      </section>

      <TrendGroup stats={stats} />
      <CompositionGroup stats={stats} />
    </>
  );
}

/** 汇总：花费 / Token / 会话 / 缓存命中，2×2 网格；数字换区间时补间到新值。 */
function SummaryCard({ stats }: { stats: TokenUsageStats }) {
  const summary = stats.summary;
  const items: ReadonlyArray<{
    label: string;
    value: number | null;
    format: (value: number) => string;
  }> = [
    {
      label: "花费",
      value: summary.costSource === "unknown" ? null : summary.costCnyMicros,
      format: (value) => formatUsageCost(summary.costSource, value),
    },
    { label: "Token", value: summary.tokens, format: formatTokenCompact },
    { label: "会话", value: summary.sessions, format: formatCount },
    { label: "缓存命中", value: summary.cacheHitPct, format: (value) => formatPct(value) },
  ];

  return (
    <div className="dsl-card grid grid-cols-2">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={cn(
            "px-5 py-4",
            index % 2 === 1 && "border-l border-border",
            index < 2 && "border-b border-border",
          )}
        >
          <p className="text-[12px] leading-none text-muted-foreground">{item.label}</p>
          <p className="mt-2.5 text-[30px] leading-none font-semibold tracking-[-0.022em] tabular-nums">
            <AnimatedNumber value={item.value} format={item.format} />
          </p>
        </div>
      ))}
      {stats.ledger.reason && (
        <p className="col-span-2 border-t border-border px-5 py-2 text-[12px] leading-[1.45] text-muted-foreground">
          展示上次成功读取的缓存
        </p>
      )}
    </div>
  );
}

function GroupListRow({ row, showDetail }: { row: UsageRow; showDetail: boolean }) {
  const detail = showDetail && row.sub ? row.sub : undefined;
  return (
    <ListRow
      title={row.label}
      detail={detail}
      meta={`${formatTokenCompact(row.tokens)} · ${formatUsageCost(row.costSource, row.costCnyMicros)}`}
      titleAttr={row.label}
      tone={row.tag === "other" ? "muted" : "default"}
    />
  );
}

/** 花费柱入场：从底部按 20ms 错峰拉高，落定柔和收尾。 */
const BAR_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const BAR_GROW_DURATION = 0.42;
const BAR_STAGGER = 0.02;
/** 背景网格：3 条内部分隔线 + 一条基线，只用来读高度，不抢柱子。 */
const GRID_RATIOS = [0.25, 0.5, 0.75] as const;

/** 区间内最近 30 天花费柱阵：柱子按 20ms 错峰生长，网格线用 hairline 令牌。 */
function TrendGroup({ stats }: { stats: TokenUsageStats }) {
  const reduced = useReducedMotion();
  const days = stats.days.slice(-30);
  if (days.length === 0) return null;

  const peak = Math.max(...days.map((day) => day.costCnyMicros), 1);
  // 留 6% 顶空：最高的柱子不贴住卡片上沿，网格线也读得出来。
  const scale = peak * 1.06;
  const total = days.reduce((sum, day) => sum + day.costCnyMicros, 0);
  const average = total / days.length;
  // 只有日期窗口变了才重挂重播入场；同区间刷新账本不重播，避免闪一下。
  const windowKey = `${stats.range}-${days[0]?.date ?? ""}-${days[days.length - 1]?.date ?? ""}`;

  return (
    <ListGroup
      title="花费趋势"
      action={
        <span className="text-[12px] tabular-nums text-muted-foreground">
          合计 {formatCny(total)}
        </span>
      }
    >
      <div
        role="img"
        aria-label={`近 ${days.length} 天花费合计 ${formatCny(total)}，日均 ${formatCny(average)}`}
        className="px-4 pt-3 pb-2.5"
      >
        <div className="relative h-[96px]">
          <div key={windowKey} className="relative flex h-full items-end gap-[2px]">
            {days.map((day, index) => {
              const height = day.costCnyMicros > 0 ? (day.costCnyMicros / scale) * 100 : 1.5;
              const isToday = index === days.length - 1;
              return (
                <div
                  key={day.date}
                  title={`${day.date} · ${formatCny(day.costCnyMicros)} · ${formatTokenCompact(day.tokens)} tokens`}
                  className="flex h-full min-w-0 flex-1 flex-col justify-end"
                >
                  <motion.div
                    initial={reduced ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            duration: BAR_GROW_DURATION,
                            ease: BAR_EASE,
                            delay: index * BAR_STAGGER,
                          }
                    }
                    className={cn(
                      "w-full rounded-[2px]",
                      day.costCnyMicros <= 0
                        ? "bg-[var(--separator)]"
                        : isToday
                          ? "bg-[var(--ios-blue)]"
                          : "bg-signal",
                    )}
                    style={{ height: `${Math.max(1.5, height)}%`, transformOrigin: "bottom" }}
                  />
                </div>
              );
            })}
          </div>
          {/* 网格压在柱阵上面才看得见：柱子常常贴顶，画在背后等于没画。 */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {GRID_RATIOS.map((ratio) => (
              <span
                key={ratio}
                className="absolute inset-x-0 h-[0.5px] bg-[var(--separator)]"
                style={{ top: `${ratio * 100}%` }}
              />
            ))}
            <span className="absolute inset-x-0 bottom-0 h-[0.5px] bg-[var(--separator)]" />
          </div>
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span>{days[0]?.date.slice(5)}</span>
          <span>{days[days.length - 1]?.date.slice(5)}</span>
        </div>
      </div>
    </ListGroup>
  );
}

/** Token 五桶：一行一个桶（名称 + 数量 · 占比），不画堆叠条和图例。 */
function CompositionGroup({ stats }: { stats: TokenUsageStats }) {
  const summary = stats.summary;
  const parts = [
    { key: "cacheRead", label: "缓存读", value: summary.cacheRead },
    { key: "input", label: "输入", value: summary.input },
    { key: "output", label: "输出", value: summary.output },
    { key: "cacheWrite", label: "缓存写", value: summary.cacheWrite },
    { key: "reasoning", label: "推理", value: summary.reasoning },
  ].filter((part) => part.value > 0);
  if (parts.length === 0) return null;

  const total = summary.tokens || 1;
  return (
    <ListGroup title="Token 构成">
      {parts.map((part) => (
        <ListRow
          key={part.key}
          title={part.label}
          meta={`${formatTokenCompact(part.value)} · ${formatPct((part.value / total) * 100)}`}
        />
      ))}
    </ListGroup>
  );
}
