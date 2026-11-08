import { cn } from "cn";
import { Gauge, MessageCircle, NotebookPen, RadioTower, Settings } from "lucide-react";
import { useEffect } from "react";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useConnectionView } from "@/mobile/features/connect/connection-view";
import { useMobileUsageStore } from "@/mobile/features/usage/usage-store";
import { useUiStore } from "@/mobile/ui-store";
import type { TokenUsageStats } from "@/protocol/messages";
import { formatTokenCompact, formatUsageCost } from "@/shared/lib/usage";
import type { SignalTone } from "@/shared/ui/signal-bars";

const HIT_CLASS =
  "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--wash)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pet-bg)] focus-visible:outline-none";

const ICON_CLASS = "size-5 shrink-0";

/** 信号塔颜色跟随连接口径：连上是薄荷，其它一律中性灰（琥珀只留给 AI「等你决定」）。 */
const TOWER_CLASS: Record<SignalTone, string> = {
  signal: "text-signal",
  muted: "text-muted-foreground",
  decide: "text-decide",
  success: "text-success",
  danger: "text-destructive",
};

/** 顶栏数字：账本不可用/没快照时返回 null，退回图标；缺价显示 — 也当没有数字。 */
function todayNumbers(stats: TokenUsageStats | null): { cost: string; tokens: string } | null {
  if (!stats?.ledger.available) return null;
  const cost = formatUsageCost(stats.summary.costSource, stats.summary.costCnyMicros);
  if (cost === "—") return null;
  return { cost, tokens: formatTokenCompact(stats.summary.tokens) };
}

/**
 * 宠物页顶部 44 条（v17）：左侧 gear（→ 设置）+ 连接状态信号塔图标（→ 连接页），
 * 右侧今日用量数字（→ 用量页）+ chat（→ 消息）。
 *
 * 连接状态不再是主要信息：连上时只显示 20 的信号塔图标（不写「已连接 · 局域网」），
 * 没连上时才在图标旁补最短状态词（连接中 / 重连中 / 重连 Ns / 未连接）；
 * 完整文案保留在 aria-label 与连接页。
 */
export function PetTopBar() {
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);
  const connection = useConnectionView();
  const connected = useConnectionStore((state) => state.status === "connected");
  const today = useMobileUsageStore((state) => state.today);
  const requestToday = useMobileUsageStore((state) => state.requestToday);

  // 顶栏数字只读「今天」快照：连上后静默拉一次，失败就继续显示图标，不弹错。
  useEffect(() => {
    if (connected && today === null) requestToday();
  }, [connected, requestToday, today]);

  const numbers = todayNumbers(today);

  return (
    <header className="flex h-11 flex-none items-center justify-between gap-1 px-3">
      <div className="flex min-w-0 items-center gap-0.5">
        <button
          type="button"
          aria-label="设置"
          className={cn(HIT_CLASS, "size-11")}
          onClick={() => setView("settings")}
        >
          <Settings aria-hidden="true" className={ICON_CLASS} strokeWidth={1.6} />
        </button>

        <button
          type="button"
          aria-label={`连接状态：${connection.label}${
            connection.detail ? ` · ${connection.detail}` : ""
          }，点按查看连接`}
          className={cn(HIT_CLASS, "gap-1.5 px-2.5")}
          onClick={openOffline}
        >
          <RadioTower
            aria-hidden="true"
            className={cn(ICON_CLASS, TOWER_CLASS[connection.tone])}
            strokeWidth={1.6}
          />
          {connection.shortLabel && (
            <span className="hidden max-w-[92px] truncate text-[13px] leading-[18px] whitespace-nowrap min-[360px]:inline">
              {connection.shortLabel}
            </span>
          )}
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={
            numbers
              ? `用量：今天 ${numbers.tokens} Token、花费 ${numbers.cost}，点按查看详情`
              : "用量，点按查看详情"
          }
          className={cn(HIT_CLASS, "gap-1 px-2.5 tabular-nums")}
          onClick={() => setView("usage")}
        >
          {numbers ? (
            <span className="max-w-[92px] truncate text-[13px] leading-[18px] whitespace-nowrap">
              {numbers.cost}
            </span>
          ) : (
            <Gauge aria-hidden="true" className={ICON_CLASS} strokeWidth={1.6} />
          )}
        </button>

        <button
          type="button"
          aria-label="备忘录"
          className={cn(HIT_CLASS, "size-11")}
          onClick={() => setView("memo")}
        >
          <NotebookPen aria-hidden="true" className={ICON_CLASS} strokeWidth={1.6} />
        </button>

        <button
          type="button"
          aria-label="消息"
          className={cn(HIT_CLASS, "size-11")}
          onClick={() => setView("chat")}
        >
          <MessageCircle aria-hidden="true" className={ICON_CLASS} strokeWidth={1.6} />
        </button>
      </div>
    </header>
  );
}
