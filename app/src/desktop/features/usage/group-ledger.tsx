import { ChevronRight } from "lucide-react";
import type { PricingStatus, TokenUsageStats, UsageRow } from "@/protocol/messages";
import { formatTokenCompact, formatUpdatedAt, formatUsageCost } from "@/shared/lib/usage";
import { rowCostShare, sortRowsByCost } from "@/shared/lib/usage-chart";
import type { UsageGroupMode } from "./usage-store";
import { UsageTabs } from "./usage-tabs";

const GROUP_OPTIONS: ReadonlyArray<{ value: UsageGroupMode; label: string }> = [
  { value: "client", label: "客户端" },
  { value: "session", label: "会话" },
  { value: "model", label: "模型" },
];

/**
 * 分组账本（D97）：返回的 Top 行内按金额降序，行尾一根占比小柱。
 *
 * 后端 Top 8 仍按 Token 选（已知限制）；这里只做展示顺序与占比，
 * 不编造行、不把「其他」拆开。
 */
export function GroupLedger({
  stats,
  group,
  onGroupChange,
}: {
  stats: TokenUsageStats;
  group: UsageGroupMode;
  onGroupChange: (group: UsageGroupMode) => void;
}) {
  const rows =
    group === "client"
      ? stats.groups.clients
      : group === "session"
        ? stats.groups.sessions
        : stats.groups.models;
  const modelsHidden = group === "model" && (stats.groups.modelsHidden ?? false);
  const sorted = sortRowsByCost(rows);
  const shares = sorted.map((row) => rowCostShare(row, sorted));
  const maxShare = Math.max(...shares, 0.001);

  return (
    <section aria-label="分组明细" className="dsl-usage-groups">
      <div className="dsl-usage-groups-head">
        <UsageTabs
          label="分组维度"
          value={group}
          options={GROUP_OPTIONS}
          onChange={onGroupChange}
        />
        <span className="dsl-usage-sort">按花费</span>
      </div>

      <div className="dsl-usage-thead" aria-hidden="true">
        <span />
        <span />
        <span>Token</span>
        <span>花费</span>
      </div>

      <div className="dsl-usage-rows">
        {modelsHidden ? (
          <p className="dsl-usage-empty">模型分组已在电脑端关闭</p>
        ) : rows.length === 0 ? (
          <p className="dsl-usage-empty">这个区间没有数据</p>
        ) : (
          sorted.map((row, index) => (
            <Row
              key={row.key}
              row={row}
              barWidth={(shares[index] / maxShare) * 100}
              showSub={group !== "client"}
            />
          ))
        )}
      </div>
    </section>
  );
}

function Row({ row, barWidth, showSub }: { row: UsageRow; barWidth: number; showSub: boolean }) {
  const other = row.tag === "other";
  return (
    <div className="dsl-usage-row" data-other={other ? "true" : "false"}>
      <div className="dsl-usage-row-main">
        <span className="dsl-usage-row-title" title={row.label}>
          {row.label}
        </span>
        {showSub && row.sub && <span className="dsl-usage-row-sub">{row.sub}</span>}
      </div>
      <span className="dsl-usage-row-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, Math.max(0, barWidth))}%` }} />
      </span>
      <span className="dsl-usage-row-tokens">{formatTokenCompact(row.tokens)}</span>
      <span className="dsl-usage-row-cost">
        {formatUsageCost(row.costSource, row.costCnyMicros)}
      </span>
    </div>
  );
}

/** 价格表入口：桌面打开 Sheet；手机端没有这个组件（只读价格行）。 */
export function UsagePriceRow({ pricing, onOpen }: { pricing: PricingStatus; onOpen: () => void }) {
  return (
    <div className="dsl-usage-price">
      <button type="button" className="dsl-usage-price-link" onClick={onOpen}>
        {pricing.stale ? "价格表 · 待更新" : "价格表"}
        <ChevronRight aria-hidden="true" size={13} strokeWidth={2} />
      </button>
      <span className="dsl-usage-price-meta">
        {pricing.modelCount} 个模型 · {formatUpdatedAt(pricing.updatedAt)}
      </span>
    </div>
  );
}
