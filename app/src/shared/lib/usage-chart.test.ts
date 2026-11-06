import { describe, expect, it } from "vitest";
import type { TokenUsageSummary } from "@/protocol/messages";
import {
  areaPath,
  axisLabel,
  costBuckets,
  isToday,
  localDayKey,
  niceAxisMax,
  periodLabel,
  rowCostShare,
  smoothLinePath,
  sortRowsByCost,
  spendDelta,
  xLabelIndices,
} from "./usage-chart";

function summary(overrides: Partial<TokenUsageSummary> = {}): TokenUsageSummary {
  return {
    tokens: 10_000,
    input: 500,
    output: 300,
    cacheRead: 8_900,
    cacheWrite: 100,
    reasoning: 200,
    costCnyMicros: 1_000_000,
    estimatedCostMicros: 0,
    costSource: "ledger",
    calls: 10,
    sessions: 2,
    cacheHitPct: 93.6,
    ...overrides,
  };
}

describe("usage-chart", () => {
  it("五桶百分比合计 100.0，0 值桶省略", () => {
    const parts = costBuckets(summary({ cacheWrite: 0 }));
    expect(parts.map((part) => part.key)).toEqual(["cacheRead", "input", "output", "reasoning"]);
    const total = parts.reduce((sum, part) => sum + part.pct, 0);
    expect(total).toBeCloseTo(100, 5);
    expect(parts[0].label).toBe("缓存读");
  });

  it("全零摘要返回空构成", () => {
    expect(
      costBuckets(summary({ cacheRead: 0, input: 0, output: 0, cacheWrite: 0, reasoning: 0 })),
    ).toEqual([]);
  });

  it("环比：上期为 0 或负数时隐藏，小于 0.05% 视为持平", () => {
    expect(spendDelta(100, 0)).toBeNull();
    expect(spendDelta(100, -1)).toBeNull();
    expect(spendDelta(100, 80)).toEqual({ pct: 25, direction: "up" });
    expect(spendDelta(100, 120)?.pct).toBeCloseTo(-100 / 6, 6);
    expect(spendDelta(100, 120)?.direction).toBe("down");
    expect(spendDelta(100, 100.01)?.direction).toBe("flat");
  });

  it("坐标轴取整档，标签去尾 0", () => {
    expect(niceAxisMax(8.2)).toBe(10);
    expect(niceAxisMax(4.8)).toBe(5);
    expect(niceAxisMax(0.42)).toBe(0.5);
    expect(niceAxisMax(0)).toBe(1);
    expect(axisLabel(10)).toBe("10");
    expect(axisLabel(2.5)).toBe("2.5");
    expect(axisLabel(3)).toBe("3");
  });

  it("X 轴标签：<=8 全显，更多取 6 个含首尾", () => {
    expect(xLabelIndices(1)).toEqual([0]);
    expect(xLabelIndices(7)).toHaveLength(7);
    expect(xLabelIndices(30)).toEqual([0, 6, 12, 17, 23, 29]);
    expect(xLabelIndices(180)).toHaveLength(6);
    expect(xLabelIndices(180)[0]).toBe(0);
    expect(xLabelIndices(180)[xLabelIndices(180).length - 1]).toBe(179);
  });

  it("平滑路径：空/单点/多点都不产生 NaN", () => {
    expect(smoothLinePath([])).toBe("");
    expect(smoothLinePath([{ x: 1, y: 2 }])).toBe("M1.00 2.00");
    const path = smoothLinePath([
      { x: 0, y: 10 },
      { x: 5, y: 2 },
      { x: 10, y: 8 },
    ]);
    expect(path.startsWith("M0.00 10.00 C")).toBe(true);
    expect(path).not.toContain("NaN");
  });

  it("面积路径闭合到底边", () => {
    const path = areaPath(
      [
        { x: 0, y: 10 },
        { x: 10, y: 4 },
      ],
      20,
    );
    expect(path.endsWith("L10.00 20.00 L0.00 20.00 Z")).toBe(true);
  });

  it("日期：本地日、今天判定、区间文案", () => {
    const now = new Date(2026, 10, 6, 23, 0, 0);
    expect(localDayKey(now)).toBe("2026-11-06");
    expect(isToday("2026-11-06", now)).toBe(true);
    expect(isToday("2026-11-05", now)).toBe(false);
    expect(periodLabel([{ date: "2026-10-31" }, { date: "2026-11-06" }])).toBe("10-31 – 11-06");
    expect(periodLabel([{ date: "2026-11-06" }])).toBe("11-06");
    expect(periodLabel([])).toBe("");
  });

  it("组内排序按金额，其他垫底；占比按金额、无金额退回 Token", () => {
    const rows = [
      { key: "other", costCnyMicros: 100, tokens: 1, tag: "other" },
      { key: "a", costCnyMicros: 10, tokens: 3 },
      { key: "b", costCnyMicros: 90, tokens: 1 },
    ];
    expect(sortRowsByCost(rows).map((row) => row.key)).toEqual(["b", "a", "other"]);
    expect(rowCostShare(rows[1], rows)).toBeCloseTo(5, 5);
    expect(
      rowCostShare({ costCnyMicros: 0, tokens: 3 }, [
        { costCnyMicros: 0, tokens: 3 },
        { costCnyMicros: 0, tokens: 1 },
      ]),
    ).toBe(75);
  });
});
