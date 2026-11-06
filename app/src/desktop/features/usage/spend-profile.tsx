import { motion, useReducedMotion } from "motion/react";
import { useId, useMemo, useState } from "react";
import type { TokenUsageDay, UsageRange } from "@/protocol/messages";
import { formatCny, formatTokenCompact } from "@/shared/lib/usage";
import {
  areaPath,
  axisLabel,
  isToday,
  niceAxisMax,
  shortDate,
  smoothLinePath,
  xLabelIndices,
} from "@/shared/lib/usage-chart";

const W = 900;
const H = 196;
const LEFT = 40;
const RIGHT = 898;
const TOP = 14;
const BOTTOM = 170;
const GROW_EASE: [number, number, number, number] = [0.22, 0.75, 0.2, 1];

type SpendProfileProps = {
  range: UsageRange;
  days: TokenUsageDay[];
  previousCostCnyMicros: number;
  /** 缺价 / 全 0 时不画空坐标轴，只留一行结论。 */
  costAvailable: boolean;
};

/**
 * 花费剖面（D97）：当前区间的每日花费折线 + 面积。
 *
 * - 左轴取整刻度，日均虚线，峰值直接标注；
 * - 今天未过完：末段虚线 + 呼吸点 + 竖虚线；
 * - 区间的最后一天不是今天（旧快照）时不做“今天”标记，避免撒谎；
 * - 单日区间退化成「今天柱 + 昨日基准线」；
 * - 悬停出十字线与气泡，另有 sr-only 每日表兜底。
 */
export function SpendProfile({
  range,
  days,
  previousCostCnyMicros,
  costAvailable,
}: SpendProfileProps) {
  const reduced = useReducedMotion();
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const areaId = `usage-area-${uid}`;
  const barId = `usage-bar-${uid}`;
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const n = days.length;
    const costs = days.map((day) => day.costCnyMicros);
    const total = costs.reduce((sum, value) => sum + value, 0);
    const single = n === 1;
    const lastIsToday = n > 0 && isToday(days[n - 1].date);
    // 单日：刻度只看今天本身；昨天只作为基准线（超出刻度时退成文字标注），
    // 避免「今天 ¥0.3、昨天 ¥54」把今天的柱子压成一条线。
    const domainMax = single ? Math.max(costs[0] * 1.35, 0.01) : Math.max(...costs, 0.01);
    const yMax = niceAxisMax(single ? domainMax : domainMax * 1.07);
    const yAt = (value: number) => BOTTOM - (value / yMax) * (BOTTOM - TOP);
    const xAt = (index: number) =>
      single ? (LEFT + RIGHT) / 2 : LEFT + (index / (n - 1)) * (RIGHT - LEFT);
    const points = days.map((day, index) => ({ x: xAt(index), y: yAt(day.costCnyMicros) }));
    const average = n > 0 ? total / n : 0;
    return { n, costs, total, single, lastIsToday, yMax, yAt, points, average };
  }, [days]);

  const { n, costs, total, single, lastIsToday, yMax, yAt, points, average } = model;

  if (!costAvailable || n === 0 || total <= 0) {
    return (
      <section aria-label="每日花费" className="dsl-usage-chart-block">
        <div className="dsl-usage-chart-head">
          <span>{single ? "今天" : "每日花费"}</span>
        </div>
        <p className="dsl-usage-chart-empty">这个区间还没有记账金额</p>
      </section>
    );
  }

  const last = points[n - 1];
  const previousOnScale = previousCostCnyMicros > 0 && previousCostCnyMicros <= yMax * 0.98;
  const donePoints = lastIsToday ? points.slice(0, -1) : points;
  const donePath = smoothLinePath(donePoints, { minY: TOP - 2, maxY: BOTTOM });
  const area = areaPath(points, BOTTOM);
  const cutPath =
    lastIsToday && donePoints.length > 0
      ? (() => {
          const from = donePoints[donePoints.length - 1];
          const midX = (from.x + last.x) / 2;
          const midY = (from.y + last.y) / 2 - 2;
          return `M${from.x.toFixed(2)} ${from.y.toFixed(2)} Q${midX.toFixed(2)} ${midY.toFixed(2)} ${last.x.toFixed(2)} ${last.y.toFixed(2)}`;
        })()
      : "";

  const peakEnd = lastIsToday ? n - 2 : n - 1;
  let peakIndex = 0;
  for (let index = 0; index <= peakEnd; index += 1) {
    if (costs[index] > costs[peakIndex]) peakIndex = index;
  }
  const peak = points[peakIndex];
  const showPeak = n > 1 && peakEnd >= 0 && costs[peakIndex] > 0;
  const peakAnchor = peak && peak.x > W - 96 ? "end" : "middle";

  const peakLabel = showPeak
    ? `，最高 ${shortDate(days[peakIndex].date)} ${formatCny(costs[peakIndex])}`
    : "";
  const ariaLabel = single
    ? `今天花费 ${formatCny(costs[0])}，昨天 ${formatCny(previousCostCnyMicros)}`
    : `近 ${n} 天每日花费，合计 ${formatCny(total)}，日均 ${formatCny(average)}${peakLabel}`;

  const pointerIndex = (event: React.PointerEvent<HTMLDivElement>): number | null => {
    if (single) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return null;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.round(ratio * (n - 1));
  };
  const hoverPoint = hover != null ? points[hover] : null;
  const tooltipLeft = hoverPoint ? Math.min(92, Math.max(8, (hoverPoint.x / W) * 100)) : 50;

  return (
    <section aria-label="每日花费" className="dsl-usage-chart-block">
      <div className="dsl-usage-chart-head">
        <span>{single ? "今天" : "每日花费"}</span>
        {!single && (
          <span className="dsl-usage-avg">
            <i />
            日均
            <b>{formatCny(average)}</b>
          </span>
        )}
      </div>

      <div
        className={`dsl-usage-chart${hover != null ? " is-hover" : ""}`}
        onPointerMove={(event) => setHover(pointerIndex(event))}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
          <defs>
            <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
              <stop className="dsl-usage-stop-top" offset="0" />
              <stop className="dsl-usage-stop-bottom" offset="1" />
            </linearGradient>
            <linearGradient id={barId} x1="0" y1="0" x2="0" y2="1">
              <stop className="dsl-usage-bar-top" offset="0" />
              <stop className="dsl-usage-bar-bottom" offset="1" />
            </linearGradient>
          </defs>

          {[yMax, yMax / 2].map((tick) => (
            <g key={tick}>
              <line
                className="dsl-usage-grid-line"
                x1={LEFT}
                x2={RIGHT}
                y1={yAt(tick)}
                y2={yAt(tick)}
              />
              <text
                className="dsl-usage-axis-label"
                x={LEFT - 10}
                y={yAt(tick) + 3}
                textAnchor="end"
              >
                ¥{axisLabel(tick / 1_000_000)}
              </text>
            </g>
          ))}
          <text className="dsl-usage-axis-label" x={LEFT - 10} y={BOTTOM + 3} textAnchor="end">
            ¥0
          </text>
          <line className="dsl-usage-base-line" x1={LEFT} x2={RIGHT} y1={BOTTOM} y2={BOTTOM} />

          {single ? (
            <>
              <path
                className="dsl-usage-avg-line"
                d={`M${LEFT} ${yAt(previousCostCnyMicros).toFixed(1)} H${RIGHT}`}
              />
              <rect
                x={last.x - 37}
                y={yAt(costs[0])}
                width={74}
                height={Math.max(0, BOTTOM - yAt(costs[0]))}
                rx={6}
                fill={`url(#${barId})`}
              />
              <text
                className="dsl-usage-bar-value"
                x={last.x}
                y={Math.max(TOP + 8, yAt(costs[0]) - 10)}
                textAnchor="middle"
              >
                {formatCny(costs[0])}
              </text>
              {previousCostCnyMicros > 0 && previousOnScale && (
                <>
                  <line
                    className="dsl-usage-ref-line"
                    x1={LEFT}
                    x2={RIGHT}
                    y1={yAt(previousCostCnyMicros)}
                    y2={yAt(previousCostCnyMicros)}
                  />
                  <text
                    className="dsl-usage-ref-label"
                    x={RIGHT}
                    y={Math.max(TOP + 8, yAt(previousCostCnyMicros) - 6)}
                    textAnchor="end"
                  >
                    昨天 {formatCny(previousCostCnyMicros)}
                  </text>
                </>
              )}
              {previousCostCnyMicros > 0 && !previousOnScale && (
                <text className="dsl-usage-ref-label" x={RIGHT} y={TOP + 8} textAnchor="end">
                  昨天 {formatCny(previousCostCnyMicros)}
                </text>
              )}
              <text className="dsl-usage-x-label now" x={last.x} y={H - 4} textAnchor="middle">
                今天
              </text>
            </>
          ) : (
            <>
              <line
                className="dsl-usage-avg-line"
                x1={LEFT}
                x2={RIGHT}
                y1={yAt(average)}
                y2={yAt(average)}
              />
              <motion.path
                key={`area-${range}-${n}`}
                className="dsl-usage-area"
                d={area}
                fill={`url(#${areaId})`}
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.12 }}
              />
              <motion.path
                key={`trace-${range}-${n}`}
                className="dsl-usage-trace"
                d={donePath}
                initial={reduced ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: reduced ? 0 : 1.05, ease: GROW_EASE }}
              />
              {cutPath && <path className="dsl-usage-trace-cut" d={cutPath} />}

              {showPeak && (
                <g key={`peak-${range}-${n}`} className="dsl-usage-anno">
                  <circle className="dsl-usage-peak-dot" cx={peak.x} cy={peak.y} r={2.6} />
                  <text
                    className="dsl-usage-peak-label"
                    x={peakAnchor === "end" ? peak.x - 8 : peak.x}
                    y={Math.max(TOP + 8, peak.y - 14)}
                    textAnchor={peakAnchor}
                  >
                    {formatCny(costs[peakIndex])}
                  </text>
                </g>
              )}

              <line className="dsl-usage-today-line" x1={last.x} x2={last.x} y1={TOP} y2={BOTTOM} />
              {lastIsToday && (
                <>
                  <circle className="dsl-usage-today-halo" cx={last.x} cy={last.y} r={3.4} />
                  <circle className="dsl-usage-today-dot" cx={last.x} cy={last.y} r={3.2} />
                </>
              )}

              {hoverPoint && (
                <>
                  <line
                    className="dsl-usage-hover-line"
                    x1={hoverPoint.x}
                    x2={hoverPoint.x}
                    y1={TOP}
                    y2={BOTTOM}
                  />
                  <circle
                    className="dsl-usage-hover-dot"
                    cx={hoverPoint.x}
                    cy={hoverPoint.y}
                    r={3.4}
                  />
                </>
              )}
            </>
          )}

          {!single &&
            xLabelIndices(n).map((index) => {
              const point = points[index];
              const current = index === n - 1;
              const label = current && lastIsToday ? "今天" : shortDate(days[index].date);
              const anchor = index === 0 ? "start" : current ? "end" : "middle";
              const x = index === 0 ? LEFT : current ? RIGHT : point.x;
              return (
                <text
                  key={days[index].date}
                  className={`dsl-usage-x-label${current && lastIsToday ? " now" : ""}`}
                  x={x}
                  y={H - 4}
                  textAnchor={anchor}
                >
                  {label}
                </text>
              );
            })}
        </svg>

        {hover != null && hoverPoint && (
          <div
            className="dsl-usage-tip"
            data-placement={hoverPoint.y < 64 ? "below" : "above"}
            style={{
              left: `${tooltipLeft}%`,
              top: `${(hoverPoint.y / H) * 100}%`,
            }}
          >
            <span className="tip-date">{days[hover].date}</span>
            <span className="tip-value">{formatCny(days[hover].costCnyMicros)}</span>
            <span className="tip-tokens">{formatTokenCompact(days[hover].tokens)} Token</span>
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>{single ? "今天花费" : `近 ${n} 天每日花费`}</caption>
        <thead>
          <tr>
            <th scope="col">日期</th>
            <th scope="col">花费</th>
            <th scope="col">Token</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{formatCny(day.costCnyMicros)}</td>
              <td>{formatTokenCompact(day.tokens)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
