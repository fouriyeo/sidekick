import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { GroupLedger, UsagePriceRow } from "@/desktop/features/usage/group-ledger";
import { PricingSheet } from "@/desktop/features/usage/pricing-sheet";
import { SpendProfile } from "@/desktop/features/usage/spend-profile";
import { TokenComposition } from "@/desktop/features/usage/token-composition";
import { UsageHero } from "@/desktop/features/usage/usage-hero";
import { type UsageGroupMode, useUsageStore } from "@/desktop/features/usage/usage-store";
import { UsageTabs } from "@/desktop/features/usage/usage-tabs";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageShell } from "@/desktop/shell/page-shell";
import type { TokenUsageStats } from "@/protocol/messages";
import { USAGE_RANGES } from "@/shared/lib/usage";
import { Button } from "@/shared/ui/button";

/** 只留一句结论；账本缺失/损坏/超限的排查说明不再进界面。 */
const LEDGER_TITLE: Record<string, string> = {
  ledger_missing: "还没找到 DSH 账本",
  ledger_invalid: "账本格式暂时认不出来",
  ledger_too_large: "账本文件异常偏大",
};

/**
 * 用量（一级页，D97）：只读 DSH cost-meter 账本。
 *
 * 宽幅数据页：花费 hero → 花费剖面 → Token 光谱 + 分组账本；
 * 不再有 2×2 白卡、胶囊分段、固定 30 天柱阵与页脚。
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
    <PageShell size="wide" tone="usage" bottomGap="compact">
      <div className="dsl-usage">
        <PageHeader
          compact
          title="用量"
          actions={
            <>
              <UsageTabs
                label="统计区间"
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

        {error && !stats ? (
          <UsageState label="读取用量失败" onRetry={() => void load()} />
        ) : ledgerUnavailable ? (
          <UsageState label={ledgerTitle} onRetry={() => void load()} />
        ) : !stats ? (
          <UsageState label="正在读取本机账本…" />
        ) : (
          <UsageContent
            stats={stats}
            group={group}
            onGroupChange={setGroup}
            onOpenPricing={() => setSheetOpen(true)}
          />
        )}
      </div>

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
function UsageState({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <div className="dsl-usage-state">
      <div className="dsl-usage-state-inner">
        <p className="dsl-usage-state-title">{label}</p>
        {onRetry && (
          <button type="button" className="dsl-usage-state-action" onClick={onRetry}>
            重试
          </button>
        )}
      </div>
    </div>
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
  const costAvailable = stats.summary.costSource !== "unknown" && stats.summary.costCnyMicros > 0;

  return (
    <>
      <UsageHero stats={stats} />
      <div className="dsl-usage-rule" />
      <SpendProfile
        range={stats.range}
        days={stats.days}
        previousCostCnyMicros={stats.previous.costCnyMicros}
        costAvailable={costAvailable}
      />
      <div className="dsl-usage-lower">
        <div className="dsl-usage-comp">
          <TokenComposition summary={stats.summary} />
          <UsagePriceRow pricing={stats.pricing} onOpen={onOpenPricing} />
        </div>
        <GroupLedger stats={stats} group={group} onGroupChange={onGroupChange} />
      </div>
    </>
  );
}
