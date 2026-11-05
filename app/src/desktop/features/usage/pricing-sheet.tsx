import { RefreshCw } from "lucide-react";
import type { TokenUsageStats, UsageRow } from "@/protocol/messages";
import { costSourceLabel, formatCnyPerM, formatUpdatedAt } from "@/shared/lib/usage";
import { Button } from "@/shared/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { Switch } from "@/shared/ui/switch";

const PRICING_SOURCE_LABEL: Record<string, string> = {
  remote: "OpenRouter 公开目录",
  seed: "内置价格表",
  override: "本地覆盖",
  mixed: "多来源合并",
};

type PricingSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: TokenUsageStats;
  busy: boolean;
  error: string | null;
  onRefresh: (force: boolean) => void;
  onAutoRefreshChange: (enabled: boolean) => void;
  onMobileModelsChange: (enabled: boolean) => void;
};

/**
 * 模型价格表：展示当前区间用到的模型单价、来源与刷新状态。
 *
 * 价格只用于对照与缺价估算；实际花费以 DSH 账本 costCny 为准。
 */
export function PricingSheet({
  open,
  onOpenChange,
  stats,
  busy,
  error,
  onRefresh,
  onAutoRefreshChange,
  onMobileModelsChange,
}: PricingSheetProps) {
  const pricing = stats.pricing;
  const rows = stats.groups.models.filter((row) => row.price);
  const pricedCount = rows.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[460px] gap-0 p-0 sm:max-w-[460px]">
        <SheetHeader className="border-b border-border">
          <SheetTitle>模型价格</SheetTitle>
          <SheetDescription>
            只拉取公开价格目录，不上传用量、模型名或任何本机数据。
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            <Meta label="来源" value={PRICING_SOURCE_LABEL[pricing.source] ?? pricing.source} />
            <Meta label="更新" value={formatUpdatedAt(pricing.updatedAt)} />
            <Meta label="模型数" value={`${pricing.modelCount} 个`} />
            <Meta
              label="汇率"
              value={`1 USD = ${pricing.fxCnyPerUsd.toFixed(4)} CNY`}
              title={`汇率来源：${pricing.fxSource}`}
            />
            <Meta label="自动刷新" value={pricing.autoRefresh ? "每天最多一次" : "已关闭"} />
            <Meta label="手机模型分组" value={pricing.mobileModels ? "显示" : "隐藏"} />
          </div>

          {pricing.stale && (
            <p className="mt-2 rounded-md border border-decide/30 bg-decide/10 px-2 py-1.5 text-[11px] leading-relaxed text-decide">
              价格表已超过 7 天未更新；估算可能偏离账单。
            </p>
          )}
          {error && (
            <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] leading-relaxed text-destructive">
              {error}
            </p>
          )}
          {pricing.lastError && !error && (
            <p className="mt-2 rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1.5 text-[11px] leading-relaxed text-destructive/90">
              上次刷新失败：{pricing.lastError}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <h3 className="text-[12px] font-medium">本区间用到的模型</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onRefresh(true)}
            >
              <RefreshCw className={busy ? "animate-spin" : undefined} aria-hidden="true" />
              {busy ? "刷新中" : "刷新价格"}
            </Button>
          </div>

          {pricedCount === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-[11.5px] leading-relaxed text-muted-foreground">
              当前区间没有可匹配的模型价格。价格表只影响缺价估算，不影响 DSH 账本里的实际花费。
            </p>
          ) : (
            <div className="mt-2 overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.1fr)_repeat(4,minmax(0,0.65fr))] gap-1 border-b border-border bg-muted/40 px-2 py-1.5 font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                <span>模型</span>
                <span>接入方</span>
                <span className="text-right">输入</span>
                <span className="text-right">输出</span>
                <span className="text-right">缓存读</span>
                <span className="text-right">来源</span>
              </div>
              {rows.map((row) => (
                <PriceRow key={row.key} row={row} />
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-card/60 px-3 py-2.5">
            <ToggleRow
              label="自动刷新价格"
              description="打开用量页时若超过 24 小时，后台刷新一次"
              checked={pricing.autoRefresh}
              onCheckedChange={onAutoRefreshChange}
            />
            <ToggleRow
              label="在手机显示模型分组"
              description="只同步模型 ID 与接入方；不含提示词、路径或用量原文"
              checked={pricing.mobileModels}
              onCheckedChange={onMobileModelsChange}
            />
          </div>

          <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">
            单价单位：人民币 / 百万 tokens。价格来自 OpenRouter 公开目录、DeepSeek 官方峰谷价与
            `~/.sidekick/token_pricing_overrides.json`；实际花费以 DSH cost-meter
            为准，估算仅作参考。
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PriceRow({ row }: { row: UsageRow }) {
  const price = row.price;
  if (!price) return null;
  return (
    <div className="grid grid-cols-[minmax(0,1.8fr)_minmax(0,1.1fr)_repeat(4,minmax(0,0.65fr))] items-center gap-1 border-b border-border/60 px-2 py-1.5 last:border-b-0">
      <span className="min-w-0 truncate text-[11px]" title={row.modelId ?? row.label}>
        {row.modelId ?? row.label}
      </span>
      <span className="min-w-0 truncate text-[10px] text-muted-foreground">
        {row.provider ?? "—"}
      </span>
      <span className="text-right font-mono text-[10px] tabular-nums">
        {formatCnyPerM(price.inputCnyPerM)}
      </span>
      <span className="text-right font-mono text-[10px] tabular-nums">
        {formatCnyPerM(price.outputCnyPerM)}
      </span>
      <span className="text-right font-mono text-[10px] tabular-nums">
        {formatCnyPerM(price.cacheReadCnyPerM)}
      </span>
      <span
        className="truncate text-right text-[9px] text-muted-foreground"
        title={costSourceLabel(row.costSource)}
      >
        {price.source}
      </span>
    </div>
  );
}

function Meta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2" title={title}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-foreground">{value}</span>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11.5px] text-foreground">{label}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} size="sm" />
    </div>
  );
}
