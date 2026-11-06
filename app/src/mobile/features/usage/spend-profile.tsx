import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/mobile/features/pet/use-reduced-motion";
import type { TokenUsageDay, UsageCostSource } from "@/protocol/messages";
import { formatTokenCompact, formatUsageCost } from "@/shared/lib/usage";
import {
  areaPath,
  isToday,
  niceAxisMax,
  shortDate,
  smoothLinePath,
} from "@/shared/lib/usage-chart";

/** 图表可用宽度兜底（jsdom 测不到宽度时用 390 屏的内容宽）。 */
const FALLBACK_WIDTH = 358;
const HEIGHT = 150;
const PAD_X = 6;
const PAD_TOP = 16;
const BASELINE_Y = 124;
const X_LABEL_Y = 144;
/** 水平位移超过该值才捕获指针；纵向手势交给页面滚动。 */
const ENGAGE_PX = 8;
/** 松手后气泡停留时长。 */
const TIP_HIDE_MS = 1200;
/** 气泡半宽，用于左右贴边收拢。 */
const TIP_HALF = 58;

type ChartPoint = { x: number; y: number };

type ChartLabel = { x: number; text: string; anchor: "start" | "middle" | "end"; now: boolean };

type ChartGeometry = {
  width: number;
  count: number;
  points: ChartPoint[];
  /** 已完成天数的折线（今天未结束时不含末段）。 */
  trace: string;
  /** 末段虚线（仅「今天」）。 */
  cut: string;
  area: string;
  /** 单日柱（今天区间）。 */
  bar: { x: number; y: number; width: number; height: number } | null;
  /** 单日柱顶部的金额文字位置。 */
  barLabel: { x: number; y: number } | null;
  /** 昨日基准线（今天区间，上期金额 > 0）。 */
  previousY: number | null;
  averageY: number | null;
  todayPoint: ChartPoint | null;
  nodePoints: ChartPoint[];
  labels: ChartLabel[];
};

/** 只负责坐标与路径，不碰 DOM；宽度变化时重算。 */
function buildGeometry(
  days: ReadonlyArray<TokenUsageDay>,
  width: number,
  previousCostMicros: number,
): ChartGeometry {
  const count = days.length;
  const maxCost = Math.max(...days.map((day) => day.costCnyMicros), 0);
  const yMax = niceAxisMax(
    Math.max(maxCost, count === 1 ? Math.max(0, previousCostMicros) : 0, 1) * 1.12,
  );
  const yAt = (value: number): number =>
    BASELINE_Y - (Math.max(0, value) / yMax) * (BASELINE_Y - PAD_TOP);
  const usable = Math.max(1, width - PAD_X * 2);
  const xAt = (index: number): number =>
    count === 1 ? width / 2 : PAD_X + (index / (count - 1)) * usable;

  const points = days.map((day, index) => ({ x: xAt(index), y: yAt(day.costCnyMicros) }));
  const last = days[count - 1];
  const today = last ? isToday(last.date) : false;

  if (count === 1) {
    const point = points[0];
    const barWidth = Math.min(72, Math.max(44, width * 0.22));
    const barHeight = Math.max(2, BASELINE_Y - point.y);
    return {
      width,
      count,
      points,
      trace: "",
      cut: "",
      area: "",
      bar: {
        x: point.x - barWidth / 2,
        y: BASELINE_Y - barHeight,
        width: barWidth,
        height: barHeight,
      },
      barLabel: { x: point.x, y: Math.max(PAD_TOP + 10, point.y - 9) },
      previousY: previousCostMicros > 0 ? yAt(previousCostMicros) : null,
      averageY: null,
      todayPoint: null,
      nodePoints: [],
      labels: [
        {
          x: point.x,
          text: today ? "今天" : shortDate(last.date),
          anchor: "middle",
          now: today,
        },
      ],
    };
  }

  const total = days.reduce((sum, day) => sum + day.costCnyMicros, 0);
  const clamp = { minY: PAD_TOP, maxY: BASELINE_Y };
  const averageY = total > 0 ? yAt(total / count) : null;
  const todayPoint = today ? points[count - 1] : null;

  let trace = smoothLinePath(points, clamp);
  let cut = "";
  let nodePoints = points;
  if (today && count > 1) {
    const done = points.slice(0, -1);
    const lastDone = done[done.length - 1];
    const current = points[count - 1];
    trace = smoothLinePath(done, clamp);
    const midX = (lastDone.x + current.x) / 2;
    const midY = (lastDone.y + current.y) / 2 - 2;
    cut = `M${lastDone.x.toFixed(2)} ${lastDone.y.toFixed(2)} Q${midX.toFixed(2)} ${midY.toFixed(2)} ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
    nodePoints = done;
  }
  // 超过 14 天时点太密，不再画小圆点。
  if (count > 14) nodePoints = [];

  const labelIndices = count <= 2 ? [0, count - 1] : [0, Math.floor((count - 1) / 2), count - 1];
  const labels: ChartLabel[] = labelIndices.map((index) => ({
    x: xAt(index),
    text: index === count - 1 && today ? "今天" : shortDate(days[index].date),
    anchor: index === 0 ? "start" : index === count - 1 ? "end" : "middle",
    now: index === count - 1 && today,
  }));

  return {
    width,
    count,
    points,
    trace,
    cut,
    area: areaPath(points, BASELINE_Y),
    bar: null,
    barLabel: null,
    previousY: null,
    averageY,
    todayPoint,
    nodePoints,
    labels,
  };
}

function indexAtX(geometry: ChartGeometry, x: number): number {
  if (geometry.count <= 1) return 0;
  const usable = Math.max(1, geometry.width - PAD_X * 2);
  const index = Math.round(((x - PAD_X) / usable) * (geometry.count - 1));
  return Math.max(0, Math.min(geometry.count - 1, index));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type SpendProfileProps = {
  days: ReadonlyArray<TokenUsageDay>;
  /** 上一区间同长度花费，用于「今天」单日柱的昨日基准。 */
  previousCostMicros: number;
  /** 估算/混合来源时金额带 ≈。 */
  costSource: UsageCostSource;
};

/**
 * 手机花费剖面：无 y 轴、面积 + 折线 + 今天端点；
 * 触摸/拖动出 HTML 气泡，松手 1.2s 收起；纵向滚动始终交给页面。
 */
export function SpendProfile({ days, previousCostMicros, costSource }: SpendProfileProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [active, setActive] = useState<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    engaged: boolean;
  } | null>(null);
  /** 拖动过图表后吞掉紧随其后的 click，避免误触上层内容。 */
  const draggedRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const gradientId = `mu-area-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const barGradientId = `mu-bar-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const geometry = useMemo(
    () => buildGeometry(days, width, previousCostMicros),
    [days, width, previousCostMicros],
  );
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;

  useLayoutEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const update = () => {
      const next = element.clientWidth;
      if (next > 0) setWidth(next);
    };
    update();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current === null) return;
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setActive(null);
    }, TIP_HIDE_MS);
  }, [clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  // 拖动结束后浏览器仍会补发一次 click：在捕获阶段吞掉，不影响正常点按。
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const swallow = (event: MouseEvent) => {
      if (!draggedRef.current) return;
      draggedRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    element.addEventListener("click", swallow, true);
    return () => element.removeEventListener("click", swallow, true);
  }, []);

  // 换区间/收到新快照时收起气泡，避免旧读数留在新图上。
  // biome-ignore lint/correctness/useExhaustiveDependencies: days 身份变化即换图
  useEffect(() => {
    clearHideTimer();
    setActive(null);
  }, [days, clearHideTimer]);

  const indexFromClientX = useCallback((clientX: number) => {
    const element = wrapRef.current;
    const current = geometryRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const x = ((clientX - rect.left) / rect.width) * current.width;
    return indexAtX(current, x);
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (gestureRef.current) return;
      clearHideTimer();
      draggedRef.current = false;
      gestureRef.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        engaged: false,
      };
    },
    [clearHideTimer],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture) {
        // 鼠标/触控笔悬停时直接读数；手机触摸没有 hover，不影响滚动。
        if (event.pointerType === "mouse") {
          clearHideTimer();
          setActive(indexFromClientX(event.clientX));
        }
        return;
      }
      if (gesture.id !== event.pointerId) return;

      const dx = event.clientX - gesture.startX;
      if (!gesture.engaged) {
        if (Math.abs(dx) < ENGAGE_PX) return;
        // 纵向为主时交给页面滚动，不抢手势。
        if (Math.abs(dx) <= Math.abs(event.clientY - gesture.startY)) return;
        gesture.engaged = true;
        draggedRef.current = true;
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // 合成事件 / 指针已失效时 capture 会抛 NotFoundError；不影响取值。
        }
      }
      setActive(indexFromClientX(event.clientX));
    },
    [clearHideTimer, indexFromClientX],
  );

  const settle = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.id !== event.pointerId) return;
      gestureRef.current = null;
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {
        // 没有 capture 时释放会抛 NotFoundError，忽略。
      }
      // click 在 pointerup 之后、下一个宏任务之前派发；延后一帧复位标志。
      if (gesture.engaged) {
        window.setTimeout(() => {
          draggedRef.current = false;
        }, 0);
      } else {
        // 原地轻点：抬手时再出气泡，纵向滚动时不会先闪一下。
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        if (Math.abs(dx) < ENGAGE_PX && Math.abs(dy) < ENGAGE_PX) {
          setActive(indexFromClientX(event.clientX));
        }
      }
      if (event.pointerType !== "mouse") scheduleHide();
    },
    [indexFromClientX, scheduleHide],
  );

  const onPointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse" || gestureRef.current) return;
      clearHideTimer();
      setActive(null);
    },
    [clearHideTimer],
  );

  const activeDay = active !== null ? days[active] : null;
  const activePoint = active !== null ? geometry.points[active] : null;
  const activeBelow = activePoint ? activePoint.y < 64 : false;
  const total = days.reduce((sum, day) => sum + day.costCnyMicros, 0);
  const ariaLabel =
    geometry.count === 1
      ? `今天花费 ${formatUsageCost(costSource, days[0]?.costCnyMicros ?? 0)}`
      : `每日花费，${geometry.count} 天合计 ${formatUsageCost(costSource, total)}，日均 ${formatUsageCost(costSource, total / geometry.count)}`;
  const thin = geometry.count > 90;

  return (
    <div className="mu-chart-wrap">
      <div
        ref={wrapRef}
        className="mu-chart"
        role="img"
        aria-label={ariaLabel}
        data-motion={reducedMotion ? "off" : "on"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={settle}
        onPointerCancel={settle}
        onPointerLeave={onPointerLeave}
      >
        <svg
          className="mu-chart-svg"
          viewBox={`0 0 ${geometry.width} ${HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--mu-c1)", stopOpacity: 0.2 }} />
              <stop offset="100%" style={{ stopColor: "var(--mu-c1)", stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id={barGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--mu-c1)", stopOpacity: 0.9 }} />
              <stop offset="100%" style={{ stopColor: "var(--mu-c1)", stopOpacity: 0.3 }} />
            </linearGradient>
          </defs>

          <line
            className="mu-base"
            x1={PAD_X}
            x2={geometry.width - PAD_X}
            y1={BASELINE_Y}
            y2={BASELINE_Y}
          />

          {geometry.averageY !== null && (
            <line
              className="mu-avg"
              x1={PAD_X}
              x2={geometry.width - PAD_X}
              y1={geometry.averageY}
              y2={geometry.averageY}
            />
          )}

          {geometry.count > 1 && (
            <path className="mu-area" d={geometry.area} fill={`url(#${gradientId})`} />
          )}

          {geometry.count > 1 && (
            <path
              className={thin ? "mu-trace mu-trace-thin" : "mu-trace"}
              d={geometry.trace}
              pathLength={1}
            />
          )}

          {geometry.cut && <path className="mu-trace-cut" d={geometry.cut} />}

          {geometry.bar && (
            <rect
              className="mu-bar"
              x={geometry.bar.x}
              y={geometry.bar.y}
              width={geometry.bar.width}
              height={geometry.bar.height}
              rx={5}
              fill={`url(#${barGradientId})`}
            />
          )}

          {geometry.barLabel && (
            <text
              className="mu-bar-value"
              x={geometry.barLabel.x}
              y={geometry.barLabel.y}
              textAnchor="middle"
            >
              {formatUsageCost(costSource, days[0]?.costCnyMicros ?? 0)}
            </text>
          )}

          {geometry.previousY !== null && (
            <>
              <line
                className="mu-ref-line"
                x1={PAD_X}
                x2={geometry.width - PAD_X}
                y1={geometry.previousY}
                y2={geometry.previousY}
              />
              <text
                className="mu-ref-label"
                x={geometry.width - PAD_X}
                y={Math.max(PAD_TOP + 8, geometry.previousY - 6)}
                textAnchor="end"
              >
                昨天 {formatUsageCost(costSource, previousCostMicros)}
              </text>
            </>
          )}

          {geometry.nodePoints.map((point) => (
            <circle
              key={`${point.x}-${point.y}`}
              className="mu-node"
              cx={point.x}
              cy={point.y}
              r={1.8}
            />
          ))}

          {geometry.todayPoint && (
            <>
              <circle
                className="mu-halo"
                cx={geometry.todayPoint.x}
                cy={geometry.todayPoint.y}
                r={7}
              />
              <circle
                className="mu-dot"
                cx={geometry.todayPoint.x}
                cy={geometry.todayPoint.y}
                r={3.2}
              />
            </>
          )}

          {geometry.labels.map((label) => (
            <text
              key={label.text + label.x}
              className={label.now ? "mu-x-label mu-x-label-now" : "mu-x-label"}
              x={label.x}
              y={X_LABEL_Y}
              textAnchor={label.anchor}
            >
              {label.text}
            </text>
          ))}
        </svg>

        {activeDay && activePoint && (
          <div
            className={activeBelow ? "mu-tip mu-tip-below" : "mu-tip"}
            style={{
              left: `${clamp(activePoint.x, TIP_HALF, geometry.width - TIP_HALF)}px`,
              top: `${activePoint.y}px`,
            }}
          >
            <span className="mu-tip-date">{shortDate(activeDay.date)}</span>
            <span className="mu-tip-value">
              {formatUsageCost(costSource, activeDay.costCnyMicros)}
            </span>
            <span className="mu-tip-tokens">Token {formatTokenCompact(activeDay.tokens)}</span>
          </div>
        )}
      </div>

      <ul className="sr-only" aria-label="每日花费明细">
        {days.map((day) => (
          <li key={day.date}>
            {day.date} · {formatUsageCost(costSource, day.costCnyMicros)} · Token{" "}
            {formatTokenCompact(day.tokens)}
          </li>
        ))}
      </ul>
    </div>
  );
}
