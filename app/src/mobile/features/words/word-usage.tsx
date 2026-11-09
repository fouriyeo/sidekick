import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useWordsStore } from "@/mobile/features/words/words-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import type { WordUsageSummary } from "@/protocol/words";
import { formatCny, formatTokenCompact } from "@/shared/lib/usage";

const CARD = "rounded-2xl border-[0.5px] border-border bg-card px-4 py-3";

function calls(summary: WordUsageSummary): string {
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(summary.calls)));
}

/** 一行汇总：次数是主信息，花费标「估算」。 */
function UsageCard({ title, summary }: { title: string; summary: WordUsageSummary }) {
  const tokens = summary.promptTokens + summary.completionTokens;
  return (
    <section aria-label={title} className={CARD}>
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-[13px] leading-[19px] font-normal text-muted-foreground">
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] leading-[16px] text-muted-foreground">
          估算
        </span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="m-0 text-[22px] leading-[28px] text-foreground">
          {calls(summary)}
          <span className="ml-1 text-[12px] leading-[17px] text-muted-foreground">次</span>
        </p>
        <p className="m-0 text-[15px] leading-[21px] text-foreground">
          {formatCny(summary.costCnyMicros, 4)}
        </p>
      </div>
      <p className="m-0 mt-1 text-[11.5px] leading-[17px] text-muted-foreground">
        约 {formatTokenCompact(tokens)} Token
      </p>
    </section>
  );
}

/**
 * 英语角用量：只统计本机对百炼的调用，展示今日 / 近 30 天次数与估算花费。
 *
 * 价格是代码里的常量，不是账单；所以页面上所有金额都明确标「估算」。
 */
export function WordUsage({ onBack }: { onBack: () => void }) {
  const usage = useWordsStore((state) => state.usage);
  const usageLoading = useWordsStore((state) => state.usageLoading);
  const usageError = useWordsStore((state) => state.usageError);
  const loadUsage = useWordsStore((state) => state.loadUsage);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const days = usage ? [...usage.days].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 7) : [];

  return (
    <MobilePage aria-label="英语角用量">
      <PageHeader title="用量" sub="百炼 · 估算" onBack={onBack} backLabel="返回英语角" />
      <PageScroll className="px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {usageError && (
          <div
            role="alert"
            className="mb-3 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-3"
          >
            <p className="m-0 text-[13px] leading-[19px] text-foreground">{usageError}</p>
            <button
              type="button"
              className="mt-1 flex min-h-11 items-center text-[13px] font-medium text-destructive"
              onClick={() => void loadUsage()}
            >
              重试
            </button>
          </div>
        )}

        {!usage && usageLoading && (
          <div className="mt-16 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            正在读取用量…
          </div>
        )}

        {usage && (
          <>
            <div className="flex flex-col gap-3">
              <UsageCard title="今天" summary={usage.today} />
              <UsageCard title="近 30 天" summary={usage.last30Days} />
            </div>

            {days.length > 0 && (
              <section aria-label="按天明细" className="mt-5">
                <h2 className="m-0 mb-2 px-1 text-[12px] leading-[17px] font-normal text-muted-foreground">
                  最近几天
                </h2>
                <div className="overflow-hidden rounded-2xl border-[0.5px] border-border bg-card">
                  {days.map((day, index) => (
                    <div key={day.date}>
                      {index > 0 && <div aria-hidden="true" className="ml-4 h-[0.5px] bg-border" />}
                      <div className="flex min-h-11 items-center justify-between px-4 text-[13px] leading-[19px]">
                        <span className="text-foreground">{day.date}</span>
                        <span className="text-muted-foreground">
                          {new Intl.NumberFormat("zh-CN").format(day.calls)} 次 ·{" "}
                          {formatCny(day.costCnyMicros, 4)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <p className="mt-4 px-1 text-[11.5px] leading-[17px] text-muted-foreground">
              {usage.priceNote || "按代码里的价格常量估算，实际以百炼账单为准。"}
            </p>
            <p className="mt-1 px-1 text-[11.5px] leading-[17px] text-muted-foreground">
              只统计这台手机发起、经百炼生成的解释与造句；桌面端的调用不在这里。
            </p>
          </>
        )}
      </PageScroll>
    </MobilePage>
  );
}
