import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { SpendProfile } from "@/mobile/features/usage/spend-profile";
import { useMobileUsageStore } from "@/mobile/features/usage/usage-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { useUiStore } from "@/mobile/ui-store";
import type { TokenUsageDay, TokenUsageStats, UsageRow } from "@/protocol/messages";
import {
  formatCount,
  formatPct,
  formatTokenCompact,
  formatUpdatedAt,
  formatUsageCost,
  USAGE_RANGES,
} from "@/shared/lib/usage";
import type { CostBucketKey, SpendDelta } from "@/shared/lib/usage-chart";
import {
  costBuckets,
  daysForRange,
  periodLabel,
  rangeSpendLabel,
  rowCostShare,
  sortRowsByCost,
  spendDelta,
} from "@/shared/lib/usage-chart";

type GroupMode = "client" | "session" | "model";

const GROUP_TABS: ReadonlyArray<{ value: GroupMode; label: string }> = [
  { value: "client", label: "客户端" },
  { value: "session", label: "会话" },
  { value: "model", label: "模型" },
];

/** 五个 Token 桶的色块顺序，与 usage.css 的 --mu-c1..c5 对应（缓存读 = 薄荷）。 */
const BUCKET_COLOR: Record<CostBucketKey, string> = {
  cacheRead: "var(--mu-c1)",
  input: "var(--mu-c2)",
  output: "var(--mu-c3)",
  cacheWrite: "var(--mu-c4)",
  reasoning: "var(--mu-c5)",
};

/**
 * 手机「用量」：从宠物页顶栏的今日数字进入（v17），只读桌面广播的聚合快照，不直接读文件。
 *
 * D98 视觉重做：无卡片、hairline 分区；花费当主角，区间驱动剖面 + Token 光谱 + 带占比条
 * 的账本。数据只在用量页请求；断连时保留最后快照并说明「等待电脑」，不显示假数字。
 * 模型分组受 D83 开关控制；录音中由 ui-store 拦截所有换页入口。
 */
export function UsagePage() {
  const range = useMobileUsageStore((state) => state.range);
  const data = useMobileUsageStore((state) => state.data);
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
    <MobilePage className="mobile-usage" aria-label="用量">
      <PageHeader
        title="用量"
        sub="DSH 本机账本 · 不上传"
        onBack={() => setView("pet")}
        backLabel="返回宠物"
      />

      <PageScroll className="mu-scroll px-0 pt-0 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        <RangeTabs range={range} onChange={setRange} />

        {!current ? (
          !connected ? (
            <StateLine
              text="还没连上电脑。"
              action={
                <button type="button" className="mu-action" onClick={openOffline}>
                  去连接
                </button>
              }
            />
          ) : error ? (
            <StateLine
              text="电脑还没回应。"
              action={
                <button type="button" className="mu-action" onClick={() => request()}>
                  重试
                </button>
              }
            />
          ) : (
            <StateLine text="正在读账本…" />
          )
        ) : current.ledger.available === false ? (
          <StateLine
            text="还没找到 DSH 账本，先在电脑上打开 DSH。"
            action={
              <button type="button" className="mu-action" onClick={() => request()}>
                重试
              </button>
            }
          />
        ) : (
          <UsageDashboard
            stats={current}
            group={group}
            modelsHidden={modelsHidden}
            connected={connected}
            error={error}
            onGroupChange={setGroup}
            onRetry={() => request()}
          />
        )}
      </PageScroll>
    </MobilePage>
  );
}

function RangeTabs({
  range,
  onChange,
}: {
  range: TokenUsageStats["range"];
  onChange: (range: TokenUsageStats["range"]) => void;
}) {
  return (
    <fieldset className="mu-range">
      <legend className="sr-only">统计区间</legend>
      {USAGE_RANGES.map((item) => (
        <button
          key={item.value}
          type="button"
          className="mu-underline-tab"
          aria-pressed={range === item.value}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </fieldset>
  );
}

function StateLine({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="mu-state">
      <p className="mu-state-text">{text}</p>
      {action}
    </div>
  );
}

function UsageDashboard({
  stats,
  group,
  modelsHidden,
  connected,
  error,
  onGroupChange,
  onRetry,
}: {
  stats: TokenUsageStats;
  group: GroupMode;
  modelsHidden: boolean;
  connected: boolean;
  error: string | null;
  onGroupChange: (group: GroupMode) => void;
  onRetry: () => void;
}) {
  const hasActivity =
    stats.summary.tokens > 0 || stats.summary.costCnyMicros > 0 || stats.summary.calls > 0;
  // 快照 days 是最近 180 个真实日期，剖面/区间日期按当前区间过滤。
  const days = daysForRange(stats.days, stats.range, stats.generatedAt);

  return (
    <>
      {error && (
        <div className="mu-note mu-note-warn">
          <span className="min-w-0 flex-1 truncate">{error}</span>
          <button type="button" className="mu-action" onClick={onRetry}>
            重试
          </button>
        </div>
      )}
      {!connected && <p className="mu-note">电脑未连接，显示最后一次快照。</p>}

      <Hero stats={stats} days={days} />
      <ProfileSection stats={stats} days={days} />
      {hasActivity && <CompositionSection stats={stats} />}
      <GroupsSection
        stats={stats}
        group={group}
        modelsHidden={modelsHidden}
        onGroupChange={onGroupChange}
      />
      <PriceRow stats={stats} />
      <p className="mu-privacy">只显示聚合数据，不含提示词、路径或 cwd。</p>
    </>
  );
}

function Hero({ stats, days }: { stats: TokenUsageStats; days: TokenUsageDay[] }) {
  const { summary, previous, range } = stats;
  // 缺价时不编造金额，也不显示没有基数的环比。
  const delta =
    summary.costSource === "unknown"
      ? null
      : spendDelta(summary.costCnyMicros, previous.costCnyMicros);

  return (
    <section className="mu-hero" aria-label="花费总览">
      <div className="mu-hero-top">
        <span className="mu-hero-label">{rangeSpendLabel(range)}</span>
        <span className="mu-hero-period">{periodLabel(days)}</span>
      </div>
      <div className="mu-hero-line">
        <span className="mu-amount">
          {formatUsageCost(summary.costSource, summary.costCnyMicros)}
        </span>
        {delta && <DeltaBadge delta={delta} />}
      </div>
      <div className="mu-readouts">
        <Readout label="Token" value={formatTokenCompact(summary.tokens)} />
        <Readout label="会话" value={formatCount(summary.sessions)} />
        <Readout label="缓存命中" value={formatPct(summary.cacheHitPct)} />
      </div>
    </section>
  );
}

function DeltaBadge({ delta }: { delta: SpendDelta }) {
  const arrow = delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→";
  return (
    <span className={`mu-delta mu-delta-${delta.direction}`}>
      <span className="mu-delta-value">
        {arrow}
        {Math.abs(delta.pct).toFixed(1)}%
      </span>
      <span className="mu-delta-label">较上期</span>
    </span>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="mu-readout">
      <span className="mu-readout-label">{label}</span>
      <span className="mu-readout-value">{value}</span>
    </div>
  );
}

function ProfileSection({ stats, days }: { stats: TokenUsageStats; days: TokenUsageDay[] }) {
  const { summary, previous } = stats;
  const hasCost = days.some((day) => day.costCnyMicros > 0);
  const total = days.reduce((sum, day) => sum + day.costCnyMicros, 0);
  const singleDay = days.length === 1;
  const title = singleDay ? "今天" : "每日花费";
  const average = days.length > 0 ? total / days.length : 0;

  return (
    <section className="mu-section" aria-label={title}>
      <div className="mu-section-head">
        <span className="mu-section-title">{title}</span>
        {!singleDay && summary.costSource !== "unknown" && (
          <span className="mu-section-meta">
            日均 {formatUsageCost(summary.costSource, average)}
          </span>
        )}
      </div>
      {summary.costSource === "unknown" ? (
        <p className="mu-conclusion">缺价，画不出花费剖面。</p>
      ) : !hasCost ? (
        <p className="mu-conclusion">这个区间还没有花费记录。</p>
      ) : (
        <SpendProfile
          days={days}
          previousCostMicros={previous.costCnyMicros}
          costSource={summary.costSource}
        />
      )}
    </section>
  );
}

function CompositionSection({ stats }: { stats: TokenUsageStats }) {
  const buckets = costBuckets(stats.summary);
  if (buckets.length === 0) return null;

  return (
    <section className="mu-section" aria-label="Token 构成">
      <div className="mu-section-head">
        <span className="mu-section-title">Token 构成</span>
        <span className="mu-section-meta">共 {formatTokenCompact(stats.summary.tokens)}</span>
      </div>
      <div className="mu-spectrum" aria-hidden="true">
        {buckets.map((bucket) => (
          <i
            key={bucket.key}
            style={{ width: `${bucket.pct}%`, background: BUCKET_COLOR[bucket.key] }}
          />
        ))}
      </div>
      <ul className="mu-legend">
        {buckets.map((bucket) => (
          <li key={bucket.key} className="mu-legend-row">
            <i
              className="mu-legend-dot"
              aria-hidden="true"
              style={{ background: BUCKET_COLOR[bucket.key] }}
            />
            <span className="mu-legend-label">{bucket.label}</span>
            <span className="mu-legend-value">{formatTokenCompact(bucket.value)}</span>
            <span className="mu-legend-pct">{bucket.pct.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GroupsSection({
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
  const source =
    group === "client"
      ? stats.groups.clients
      : group === "session"
        ? stats.groups.sessions
        : stats.groups.models;
  const rows = sortRowsByCost(source);

  return (
    <section className="mu-section" aria-label="分组">
      <div className="mu-group-head">
        <fieldset className="mu-group-tabs">
          <legend className="sr-only">分组维度</legend>
          {GROUP_TABS.filter((tab) => !(modelsHidden && tab.value === "model")).map((tab) => (
            <button
              key={tab.value}
              type="button"
              className="mu-underline-tab"
              aria-pressed={group === tab.value}
              onClick={() => onGroupChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </fieldset>
        <span className="mu-sort">按花费</span>
      </div>

      {modelsHidden ? (
        <p className="mu-conclusion">模型分组已在电脑端关闭。</p>
      ) : rows.length === 0 ? (
        <p className="mu-conclusion">这个区间没有可展示的分组。</p>
      ) : (
        <ul className="mu-rows">
          {rows.map((row) => (
            <GroupRow key={row.key} row={row} share={rowCostShare(row, rows)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function GroupRow({ row, share }: { row: UsageRow; share: number }) {
  const other = row.tag === "other";
  return (
    <li className={other ? "mu-row mu-row-other" : "mu-row"}>
      <div className="mu-row-head">
        <div className="mu-row-main">
          <p className="mu-row-title">{row.label}</p>
          {row.sub && <p className="mu-row-sub">{row.sub}</p>}
        </div>
        <div className="mu-row-nums">
          <span className="mu-row-tokens">{formatTokenCompact(row.tokens)}</span>
          <span className="mu-row-cost">{formatUsageCost(row.costSource, row.costCnyMicros)}</span>
        </div>
      </div>
      <div className="mu-row-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
      </div>
    </li>
  );
}

/** 「刚刚更新 / 从未更新」已经自带后缀，其余相对时间补「更新」。 */
function updatedLabel(updatedAt: number | null): string {
  const text = formatUpdatedAt(updatedAt);
  return text.endsWith("更新") ? text : `${text}更新`;
}

function PriceRow({ stats }: { stats: TokenUsageStats }) {
  const { summary, groups, pricing } = stats;
  let meta: string;
  if (groups.modelsHidden) {
    meta = "模型分组已在电脑端关闭";
  } else if (summary.costSource === "unknown") {
    meta = "没有可用价格";
  } else if (summary.costSource === "estimated" || summary.costSource === "mixed") {
    meta = `按价格表估算 · ${updatedLabel(pricing.updatedAt)}`;
  } else {
    meta = `${pricing.modelCount} 个模型 · ${updatedLabel(pricing.updatedAt)}`;
  }

  return (
    <section className="mu-section mu-price" aria-label="价格表">
      <span className="mu-price-label">价格表</span>
      <span className="mu-price-meta">{meta}</span>
    </section>
  );
}
