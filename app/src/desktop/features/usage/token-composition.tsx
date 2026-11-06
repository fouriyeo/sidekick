import type { TokenUsageSummary } from "@/protocol/messages";
import { formatTokenCompact } from "@/shared/lib/usage";
import { type CostBucketKey, costBuckets } from "@/shared/lib/usage-chart";

const COLOR_CLASS: Record<CostBucketKey, string> = {
  cacheRead: "dsl-usage-c1",
  input: "dsl-usage-c2",
  output: "dsl-usage-c3",
  cacheWrite: "dsl-usage-c4",
  reasoning: "dsl-usage-c5",
};

/**
 * Token 构成（D97）：一条光谱 + 五行精确读数。
 *
 * 缓存读是绝对大头，配色固定在 c1（薄荷），不再沿用 chart-2 的蓝色；
 * 百分比由 `costBuckets` 用最大余数法保证合计 100.0。
 */
export function TokenComposition({ summary }: { summary: TokenUsageSummary }) {
  const parts = costBuckets(summary);
  if (parts.length === 0) return null;

  return (
    <>
      <div className="dsl-usage-comp-head">
        <span>Token 构成</span>
        <span className="dsl-usage-comp-total">共 {formatTokenCompact(summary.tokens)}</span>
      </div>
      <div className="dsl-usage-stack" aria-hidden="true">
        {parts.map((part) => (
          <i key={part.key} className={COLOR_CLASS[part.key]} style={{ width: `${part.pct}%` }} />
        ))}
      </div>
      <div className="dsl-usage-legend">
        {parts.map((part) => (
          <div className="dsl-usage-legend-row" key={part.key}>
            <i className={`dsl-usage-dot ${COLOR_CLASS[part.key]}`} />
            <span className="dsl-usage-legend-label">{part.label}</span>
            <span className="dsl-usage-legend-value">{formatTokenCompact(part.value)}</span>
            <span className="dsl-usage-legend-pct">{part.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </>
  );
}
