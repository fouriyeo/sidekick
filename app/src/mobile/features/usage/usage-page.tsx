import { cn } from "cn";
import { Database } from "lucide-react";
import { useEffect, useState } from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useMobileUsageStore } from "@/mobile/features/usage/usage-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { useUiStore } from "@/mobile/ui-store";
import type { TokenUsageStats, UsageRow } from "@/protocol/messages";
import {
  costSourceLabel,
  formatCny,
  formatCount,
  formatPct,
  formatTokenCompact,
  formatUpdatedAt,
  formatUsageCost,
  RANGE_LABEL,
  TOKEN_PART_COLORS,
  USAGE_RANGES,
} from "@/shared/lib/usage";
import { Button } from "@/shared/ui/button";

const CARD_CLASS = "overflow-hidden rounded-2xl border-[0.5px] border-border bg-card";

type GroupMode = "client" | "session" | "model";

const GROUP_TABS: ReadonlyArray<{ value: GroupMode; label: string }> = [
  { value: "client", label: "客户端" },
  { value: "session", label: "会话" },
  { value: "model", label: "模型" },
];

/**
 * 手机「用量」：从宠物页顶栏的今日数字进入（v17），只读桌面广播的聚合快照，不直接读文件。
 *
 * 数据只在用量页请求；断连时保留最后快照并说明「等待电脑」，不显示假数字。
 * 模型分组受 D83 开关控制；录音中由 ui-store 拦截所有换页入口。
 */
export function UsagePage() {
  const range = useMobileUsageStore((state) => state.range);
  const data = useMobileUsageStore((state) => state.data);
  const loading = useMobileUsageStore((state) => state.loading);
  const error = useMobileUsageStore((state) => state.error);
  const request = useMobileUsageStore((state) => state.request);
  const setRange = useMobileUsageStore((state) => state.setRange);
  const connected = useConnectionStore((state) => state.status === "connected");
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);
  const [group, setGroup] = useState<GroupMode>("session");

  const current = data?.range === range ? data : null;
  const modelsHidden = current?.groups.modelsHidden === true;

  // 进入页面/连接恢复时请求一次；切区间由 store 发新请求。
  useEffect(() => {
    if (!connected) return;
    request();
  }, [connected, request]);

  useEffect(() => {
    if (modelsHidden && group === "model") setGroup("session");
  }, [group, modelsHidden]);

  return (
    <MobilePage aria-label="用量">
      <PageHeader
        title="用量"
        sub="DSH 本机账本 · 不上传"
        onBack={() => setView("pet")}
        backLabel="返回宠物"
      />

      <PageScroll className="px-0 pt-0 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <div className="mx-4 mt-3">
          <div className="grid grid-cols-4 gap-0.5 rounded-[10px] bg-muted p-0.5">
            {USAGE_RANGES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={range === item.value}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-[8px] text-[13px] leading-[15px] transition-colors",
                  range === item.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                onClick={() => setRange(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!current && (loading || connected) ? (
          <WaitingCard
            title="正在读账本…"
            description="只读取这台电脑的 DSH cost-meter，不上传。"
          />
        ) : !current ? (
          <WaitingCard
            title={connected ? "电脑还没回应" : "还没连上电脑"}
            description={
              connected
                ? "可以稍后再试；也可以点「去连接」检查。"
                : "用量来自电脑上的 DSH 账本，连上后再看。"
            }
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (error) request();
                  else openOffline();
                }}
              >
                {error ? "重试" : "去连接"}
              </Button>
            }
          />
        ) : (
          <>
            {error && (
              <p className="mx-4 mt-2 rounded-xl border-[0.5px] border-destructive/40 bg-card px-3 py-2 text-[12px] leading-[17px] text-destructive">
                {error}
              </p>
            )}
            {!connected && (
              <p className="mx-4 mt-2 rounded-xl border-[0.5px] border-decide/40 bg-card px-3 py-2 text-[12px] leading-[17px] text-decide">
                电脑未连接，显示最后一次快照；连上后会更新。
              </p>
            )}
            {current.ledger.available === false ? (
              <WaitingCard
                title="还没找到 DSH 账本"
                description="先在电脑上打开一次 DSH；账本只会出现在电脑本机。"
              />
            ) : (
              <>
                <SummaryCard stats={current} />
                <TrendCard stats={current} />
                <CompositionCard stats={current} />
                <GroupCard
                  stats={current}
                  group={group}
                  modelsHidden={modelsHidden}
                  onGroupChange={setGroup}
                />
                <PriceNote stats={current} />
                <p className="mx-4 mt-3 text-[12px] leading-[18px] text-muted-foreground">
                  只显示聚合数据：不包含提示词、文件路径、cwd 或工具参数。实际花费以 DSH
                  账单为准，缺价时按价格表估算并标 ≈。
                </p>
              </>
            )}
          </>
        )}
      </PageScroll>
    </MobilePage>
  );
}

function WaitingCard({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-4 mt-4 flex flex-col items-center gap-2 rounded-2xl border-[0.5px] border-dashed border-border bg-card px-5 py-8 text-center">
      <span className="grid size-10 place-items-center rounded-full border-[0.5px] border-border text-muted-foreground">
        <Database className="size-4" />
      </span>
      <p className="text-base leading-5 text-foreground">{title}</p>
      <p className="max-w-[20em] text-[13px] leading-[18px] text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

function SummaryCard({ stats }: { stats: TokenUsageStats }) {
  const { summary } = stats;
  return (
    <section aria-label="用量总览" className={cn(CARD_CLASS, "mx-4 mt-3 px-4 py-3.5")}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {RANGE_LABEL[stats.range]} · 总 TOKEN
        </span>
        <span className="text-[11px] text-muted-foreground">{stats.coverageDays} 天有数据</span>
      </div>
      <p className="mt-1 text-[30px] leading-none font-normal tabular-nums">
        {formatTokenCompact(summary.tokens)}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/70 pt-3">
        <Metric
          label={summary.costSource === "estimated" ? "估算花费" : "DSH 花费"}
          value={formatUsageCost(summary.costSource, summary.costCnyMicros)}
        />
        <Metric label="缓存命中" value={formatPct(summary.cacheHitPct)} />
        <Metric label="调用 / 会话" value={`${formatCount(summary.calls)} / ${summary.sessions}`} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] leading-[15px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[15px] leading-5 tabular-nums">{value}</p>
    </div>
  );
}

function TrendCard({ stats }: { stats: TokenUsageStats }) {
  const days = stats.days.slice(-14);
  const max = Math.max(...days.map((day) => day.costCnyMicros), 1);
  const total = days.reduce((sum, day) => sum + day.costCnyMicros, 0);
  const average = days.length > 0 ? total / days.length : 0;
  return (
    <section aria-label="近 14 天花费" className={cn(CARD_CLASS, "mx-4 mt-3 px-4 py-3.5")}>
      <div className="flex items-center justify-between">
        <span className="text-base leading-5 text-foreground">近 14 天花费</span>
        <span className="text-[11px] text-muted-foreground">日均 {formatCny(average)}</span>
      </div>
      <div className="mt-3 flex h-[76px] items-end gap-1">
        {days.map((day) => {
          const height = day.costCnyMicros > 0 ? (day.costCnyMicros / max) * 100 : 2;
          return (
            <div
              key={day.date}
              className="flex h-full min-w-0 flex-1 items-end"
              title={`${day.date} · ${formatCny(day.costCnyMicros)}`}
            >
              <i
                className="block w-full rounded-[2px] bg-signal/70"
                style={{ height: `${Math.max(2, height)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{days[0]?.date.slice(5)}</span>
        <span>{days[days.length - 1]?.date.slice(5)}</span>
      </div>
    </section>
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
    <section aria-label="Token 构成" className={cn(CARD_CLASS, "mx-4 mt-3 px-4 py-3.5")}>
      <p className="text-base leading-5 text-foreground">Token 构成</p>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
        {parts.map((part) => (
          <i
            key={part.key}
            style={{ width: `${(part.value / total) * 100}%`, background: part.color }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {parts.map((part) => (
          <div key={part.key} className="flex items-center gap-2 text-[13px] leading-[18px]">
            <i className="size-1.5 shrink-0 rounded-full" style={{ background: part.color }} />
            <span className="w-10 shrink-0 text-muted-foreground">{part.label}</span>
            <span className="min-w-0 flex-1 text-right tabular-nums">
              {formatTokenCompact(part.value)}
            </span>
            <span className="w-12 shrink-0 text-right text-muted-foreground tabular-nums">
              {((part.value / total) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function GroupCard({
  stats,
  group,
  modelsHidden,
  onGroupChange,
}: {
  stats: TokenUsageStats;
  group: GroupMode;
  modelsHidden: boolean;
  onGroupChange: (group: GroupMode) => void;
}) {
  const rows =
    group === "client"
      ? stats.groups.clients
      : group === "session"
        ? stats.groups.sessions
        : stats.groups.models;
  return (
    <section aria-label="分组明细" className={cn(CARD_CLASS, "mx-4 mt-3 px-4 py-3.5")}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-base leading-5 text-foreground">分组</span>
        <span
          role="tablist"
          aria-label="分组维度"
          className="flex items-center gap-0.5 rounded-[8px] bg-muted p-0.5"
        >
          {GROUP_TABS.filter((tab) => !(modelsHidden && tab.value === "model")).map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={group === tab.value}
              className={cn(
                "min-h-8 rounded-[6px] px-2 text-[12px] leading-[15px]",
                group === tab.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
              onClick={() => onGroupChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </span>
      </div>

      <div className="mt-2">
        {rows.length === 0 ? (
          <p className="py-5 text-center text-[13px] leading-[18px] text-muted-foreground">
            这个区间没有可展示的分组。
          </p>
        ) : (
          rows.map((row) => <GroupRow key={row.key} row={row} />)
        )}
        {group === "client" && (
          <p className="mt-2 text-[12px] leading-[17px] text-muted-foreground">
            Claude Code / Codex 解析器在 P1；当前只有 DSH 接入账本。
          </p>
        )}
        {modelsHidden && (
          <p className="mt-1 text-[12px] leading-[17px] text-muted-foreground">
            模型分组已在电脑端关闭（D83）；价格仍可在电脑上查看。
          </p>
        )}
      </div>
    </section>
  );
}

function GroupRow({ row }: { row: UsageRow }) {
  return (
    <div className="border-t border-border/60 py-2 first:border-t-0">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[14px] leading-5 text-foreground">
          {row.label}
        </span>
        <span className="shrink-0 text-[13px] leading-5 tabular-nums">
          {formatTokenCompact(row.tokens)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] leading-[17px] text-muted-foreground">
          {row.sub ?? ""} · {row.sharePct.toFixed(1)}%
          {` · ${formatUsageCost(row.costSource, row.costCnyMicros)}`}
        </span>
        <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
          <i
            className="block h-full rounded-full bg-signal/70"
            style={{ width: `${Math.min(100, row.sharePct)}%` }}
          />
        </span>
      </div>
    </div>
  );
}

function PriceNote({ stats }: { stats: TokenUsageStats }) {
  const priced = stats.groups.models.filter((row) => row.price).length;
  return (
    <section
      aria-label="价格表"
      className={cn(CARD_CLASS, "mx-4 mt-3 flex items-center gap-2 px-4 py-3.5")}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-[18px] text-foreground">价格表</p>
        <p className="mt-0.5 truncate text-[12px] leading-[17px] text-muted-foreground">
          {stats.groups.modelsHidden
            ? "模型分组已在电脑端关闭"
            : `${priced} 个模型有价 · ${formatUpdatedAt(stats.pricing.updatedAt)}`}
          {stats.groups.modelsHidden ? "" : ` · ${costSourceLabel(stats.summary.costSource)}`}
        </p>
      </div>
      <span className="shrink-0 text-[11px] text-muted-foreground">在电脑上刷新</span>
    </section>
  );
}
