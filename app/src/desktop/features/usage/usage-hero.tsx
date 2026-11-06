import type { TokenUsageDay, TokenUsageStats } from "@/protocol/messages";
import { formatCount, formatPct, formatTokenCompact, isEstimated } from "@/shared/lib/usage";
import { periodLabel, rangeSpendLabel, spendDelta } from "@/shared/lib/usage-chart";
import { AnimatedNumber } from "./animated-number";

/**
 * 用量页 hero：花费当主角，Token / 会话 / 缓存命中退成右侧读数条（D97）。
 *
 * 缺价（costSource=unknown）时不伪装成 ¥0：大数显示「—」，环比隐藏；
 * 估算/混合沿用现有口径加 `≈`。首帧直接显示终值，切区间才补间。
 */
export function UsageHero({
  stats,
  days,
}: {
  stats: TokenUsageStats;
  /** 已按当前区间过滤的日期（快照 days 是最近 180 天）。 */
  days: TokenUsageDay[];
}) {
  const { summary, previous } = stats;
  const costKnown = summary.costSource !== "unknown";
  const estimated = isEstimated(summary.costSource);
  const delta = costKnown ? spendDelta(summary.costCnyMicros, previous.costCnyMicros) : null;

  return (
    <section aria-label="花费总览" className="dsl-usage-hero">
      <div className="dsl-usage-hero-top">
        <p className="dsl-usage-eyebrow">{rangeSpendLabel(stats.range)}</p>
        <span className="dsl-usage-period">{periodLabel(days) || "—"}</span>
      </div>

      <div className="dsl-usage-hero-row">
        <div className="dsl-usage-amount-line">
          {costKnown ? (
            <>
              <span className="dsl-usage-cur">{estimated ? "≈¥" : "¥"}</span>
              <AnimatedNumber
                value={summary.costCnyMicros}
                format={(micros) => (micros / 1_000_000).toFixed(2)}
                className="dsl-usage-amount"
              />
            </>
          ) : (
            <span className="dsl-usage-amount">—</span>
          )}
          {delta && (
            <span className="dsl-usage-delta" data-direction={delta.direction}>
              <span aria-hidden="true">
                {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→"}
              </span>
              {Math.abs(delta.pct).toFixed(1)}%<span className="label">较上期</span>
            </span>
          )}
        </div>

        <div className="dsl-usage-readouts">
          <div className="dsl-usage-readout">
            <span className="ro-label">Token</span>
            <AnimatedNumber
              value={summary.tokens}
              format={formatTokenCompact}
              className="ro-value"
            />
          </div>
          <div className="dsl-usage-readout">
            <span className="ro-label">会话</span>
            <AnimatedNumber value={summary.sessions} format={formatCount} className="ro-value" />
          </div>
          <div className="dsl-usage-readout">
            <span className="ro-label">缓存命中</span>
            <AnimatedNumber
              value={summary.cacheHitPct}
              format={formatPct}
              fallback="—"
              className="ro-value"
            />
          </div>
        </div>
      </div>

      {stats.ledger.reason && <p className="dsl-usage-cache-note">展示上次成功读取的缓存</p>}
    </section>
  );
}
