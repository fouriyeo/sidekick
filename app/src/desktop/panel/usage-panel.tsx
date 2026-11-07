import { ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type UsageGroupMode, useUsageStore } from "@/desktop/features/usage/usage-store";
import type { TokenUsageDay, TokenUsageStats, UsageRange } from "@/protocol/messages";
import { hideUsagePanel, openUsagePage } from "@/shared/lib/tauri";
import {
  formatCny,
  formatCount,
  formatPct,
  formatTokenCompact,
  formatUsageCost,
} from "@/shared/lib/usage";
import {
  daysForRange,
  isToday,
  rangeSpendLabel,
  rowCostShare,
  shortDate,
  sortRowsByCost,
  spendDelta,
} from "@/shared/lib/usage-chart";

const RANGE_TABS: ReadonlyArray<{ value: UsageRange; label: string }> = [
  { value: "today", label: "今天" },
  { value: "7d", label: "7 天" },
];

/** 分组维度与用量页一致（D102 默认「模型」）；小窗只展示 Top 3。 */
const GROUP_TABS: ReadonlyArray<{ value: UsageGroupMode; label: string }> = [
  { value: "client", label: "客户端" },
  { value: "session", label: "会话" },
  { value: "model", label: "模型" },
];

/** 账本缺失/损坏的排查说明不进小窗，只留一句结论。 */
const LEDGER_TITLE: Record<string, string> = {
  ledger_missing: "还没找到 DSH 账本",
  ledger_invalid: "账本格式暂时认不出来",
  ledger_too_large: "账本文件异常偏大",
};

/** 同一帧内 focus/visibility 可能连着触发，去抖避免两次读取。 */
const RELOAD_THROTTLE_MS = 700;

/**
 * 菜单栏用量小看板（D108）。
 *
 * 只读本机 DSH 账本（复用主窗口的 `token_usage_stats` 与 `useUsageStore`），
 * 固定「今天 / 7 天」两个区间，展示花费 / 三读数 / 近 7 天迷你柱 / Top 3 模型，
 * 底部一个「打开用量页」。窗口的显示/收起/定位都在 Rust（`usage_panel.rs`）。
 *
 * 刷新时机：挂载、窗口重新获得焦点、页面重新可见；旧快照保留，避免打开瞬间闪空。
 */
export function UsagePanel() {
  const range = useUsageStore((state) => state.range);
  const group = useUsageStore((state) => state.group);
  const stats = useUsageStore((state) => state.stats);
  const loading = useUsageStore((state) => state.loading);
  const error = useUsageStore((state) => state.error);
  const setRange = useUsageStore((state) => state.setRange);
  const setGroup = useUsageStore((state) => state.setGroup);
  const load = useUsageStore((state) => state.load);

  const lastLoadedAt = useRef(0);

  const loadNow = useCallback(() => {
    lastLoadedAt.current = Date.now();
    void load();
  }, [load]);

  const loadIfStale = useCallback(() => {
    const now = Date.now();
    if (now - lastLoadedAt.current < RELOAD_THROTTLE_MS) return;
    lastLoadedAt.current = now;
    void load();
  }, [load]);

  useEffect(() => {
    loadNow();
    const onFocus = () => loadIfStale();
    const onVisibility = () => {
      if (!document.hidden) loadIfStale();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadIfStale, loadNow]);

  // Esc 只收起，不销毁窗口（再由 Rust 的 CloseRequested/Focused 兜底）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void hideUsagePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const ledgerUnavailable = stats != null && !stats.ledger.available;
  const ledgerTitle = LEDGER_TITLE[stats?.ledger.reason ?? ""] ?? LEDGER_TITLE.ledger_missing;

  return (
    <main className="dsl-panel" aria-busy={loading}>
      <div className="dsl-panel-card">
        <header className="dsl-panel-head">
          <span className="dsl-panel-title">用量</span>
          <fieldset className="dsl-panel-tabs" aria-label="统计区间">
            {RANGE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className="dsl-panel-tab"
                aria-pressed={range === tab.value}
                onClick={() => setRange(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            className="dsl-panel-refresh"
            aria-label="刷新"
            aria-busy={loading}
            disabled={loading}
            onClick={loadNow}
          >
            <RefreshCw aria-hidden="true" size={13} strokeWidth={2.2} />
          </button>
        </header>

        <div className="dsl-panel-body">
          {error && !stats ? (
            <PanelState label="读取用量失败" onRetry={loadNow} />
          ) : ledgerUnavailable ? (
            <PanelState label={ledgerTitle} onRetry={loadNow} />
          ) : !stats ? (
            <PanelState label="正在读取本机账本…" />
          ) : (
            <PanelContent stats={stats} group={group} onGroupChange={setGroup} />
          )}
        </div>

        <footer className="dsl-panel-foot">
          <button type="button" className="dsl-panel-open" onClick={() => void openUsagePage()}>
            打开用量页
            <ChevronRight aria-hidden="true" size={13} strokeWidth={2.4} />
          </button>
        </footer>
      </div>
    </main>
  );
}

function PanelContent({
  stats,
  group,
  onGroupChange,
}: {
  stats: TokenUsageStats;
  group: UsageGroupMode;
  onGroupChange: (group: UsageGroupMode) => void;
}) {
  const { summary } = stats;
  const costKnown = summary.costSource !== "unknown";
  const delta = costKnown ? spendDelta(summary.costCnyMicros, stats.previous.costCnyMicros) : null;
  // 快照的 days 是最近 180 个真实日期，迷你柱固定取最近 7 天（与当前区间无关）。
  const week = daysForRange(stats.days, "7d", stats.generatedAt);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const groupRows =
    group === "client"
      ? stats.groups.clients
      : group === "session"
        ? stats.groups.sessions
        : stats.groups.models;
  const topRows = sortRowsByCost(groupRows).slice(0, 3);
  const empty = summary.tokens === 0 && summary.costCnyMicros === 0;

  return (
    <>
      <section className="dsl-panel-hero" aria-label="花费总览">
        <p className="dsl-panel-eyebrow">{rangeSpendLabel(stats.range)}</p>
        <div className="dsl-panel-amount-line">
          <span className="dsl-panel-amount">
            {formatUsageCost(summary.costSource, summary.costCnyMicros)}
          </span>
          {delta && (
            <span className="dsl-panel-delta" data-direction={delta.direction}>
              <span aria-hidden="true">
                {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→"}
              </span>
              {Math.abs(delta.pct).toFixed(1)}%<span className="sr-only">较上期</span>
            </span>
          )}
        </div>
      </section>

      <div className="dsl-panel-readouts">
        <Readout label="Token" value={formatTokenCompact(summary.tokens)} />
        <Readout label="会话" value={formatCount(summary.sessions)} />
        <Readout label="缓存命中" value={formatPct(summary.cacheHitPct)} />
      </div>

      {empty ? (
        <p className="dsl-panel-note">这个区间还没有记账</p>
      ) : (
        <section aria-label="近 7 天花费">
          <div className="dsl-panel-chart-head">
            <span>近 7 天</span>
            <span>{weekTotalLabel(week)}</span>
          </div>
          <MiniBars
            days={week}
            hover={hoverDay}
            onHover={(ratio) => {
              if (week.length === 0) return;
              setHoverDay(
                Math.min(week.length - 1, Math.max(0, Math.round(ratio * (week.length - 1)))),
              );
            }}
            onLeave={() => setHoverDay(null)}
          />
        </section>
      )}

      <section className="dsl-panel-groups" aria-label="分组花费">
        <div className="dsl-panel-groups-head">
          <fieldset className="dsl-panel-group-tabs" aria-label="分组维度">
            {GROUP_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className="dsl-panel-group-tab"
                aria-pressed={group === tab.value}
                onClick={() => onGroupChange(tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </fieldset>
          <span className="dsl-panel-groups-sort">花费</span>
        </div>
        {topRows.length === 0 ? (
          <p className="dsl-panel-note">这个区间没有数据</p>
        ) : (
          topRows.map((row) => {
            // 占比按**整组**（不截断）金额算，前三行相加不一定是 100%。
            const share = rowCostShare(row, groupRows);
            return (
              <div className="dsl-panel-group" key={row.key}>
                <span className="dsl-panel-group-track" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
                </span>
                <span className="dsl-panel-group-name" title={row.label}>
                  {row.label}
                </span>
                <span className="dsl-panel-group-tokens">{formatTokenCompact(row.tokens)}</span>
                <span className="dsl-panel-group-cost">
                  {formatUsageCost(row.costSource, row.costCnyMicros)}
                </span>
              </div>
            );
          })
        )}
      </section>

      {stats.ledger.reason && <p className="dsl-panel-note">展示上次成功读取的缓存</p>}
    </>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="dsl-panel-readout">
      <span className="dsl-panel-readout-label">{label}</span>
      <span className="dsl-panel-readout-value">{value}</span>
    </div>
  );
}

/**
 * 近 7 天迷你柱：今天高亮；全 0 时留 4% 的矮桩，不画假高度。
 *
 * 鼠标移动时按横向比例命中一根柱子：柱子加亮 + 顶部气泡显示「日期 · 金额」。
 * 气泡 `pointer-events: none`，不会打断 mousemove。
 */
function MiniBars({
  days,
  hover,
  onHover,
  onLeave,
}: {
  days: TokenUsageDay[];
  hover: number | null;
  onHover: (ratio: number) => void;
  onLeave: () => void;
}) {
  const max = Math.max(...days.map((day) => day.costCnyMicros), 0);
  const active = hover != null ? days[hover] : undefined;

  return (
    <div
      className="dsl-panel-chart"
      role="img"
      aria-label={`近 7 天每日花费${active ? `，${active.date} ${formatCny(active.costCnyMicros)}` : ""}`}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width) return;
        onHover(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
      }}
      onMouseLeave={onLeave}
    >
      {days.map((day, index) => {
        const ratio = max > 0 ? day.costCnyMicros / max : 0;
        // 柱顶至少 4%，零花费也有一根可见的基线，鼠标悬浮仍可看日期/金额。
        const height = ratio > 0 ? Math.max(8, ratio * 100) : 4;
        return (
          <i
            key={day.date}
            data-today={isToday(day.date) ? "true" : "false"}
            data-hover={hover === index ? "true" : "false"}
            style={{ height: `${height}%` }}
          />
        );
      })}
      {hover != null && active && (
        <span
          className="dsl-panel-chart-tip"
          style={{ left: `${((hover + 0.5) / days.length) * 100}%` }}
        >
          {isToday(active.date) ? "今天" : shortDate(active.date)} ·{" "}
          {formatCny(active.costCnyMicros)}
        </span>
      )}
    </div>
  );
}

function weekTotalLabel(days: TokenUsageDay[]): string {
  const total = days.reduce((sum, day) => sum + day.costCnyMicros, 0);
  if (total <= 0) return "—";
  return `合计 ${formatCny(total)}`;
}

function PanelState({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <div className="dsl-panel-state">
      <p>{label}</p>
      {onRetry && (
        <button type="button" className="dsl-panel-retry" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}
