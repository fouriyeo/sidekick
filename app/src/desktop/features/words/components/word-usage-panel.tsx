import { cn } from "cn";
import { RefreshCw } from "lucide-react";
import { formatCnyMicros, formatTokens } from "@/desktop/features/models/format";
import { ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
import { Button } from "@/shared/ui/button";
import { useWordsStore } from "../words-store";

/**
 * 页内 AI 用量：今日 / 近 30 天的调用次数、估算花费与语音合成。
 *
 * 与 DSH 账本分开统计，只算本机英语角的解释、造句与 TTS；金额永远是「估算」。
 * TTS 字段是后加的（旧数据可能没有），读的时候统一 `?? 0`。
 */
export function WordUsagePanel() {
  const usage = useWordsStore((state) => state.usage);
  const loading = useWordsStore((state) => state.usageLoading);
  const error = useWordsStore((state) => state.usageError);
  const loadUsage = useWordsStore((state) => state.loadUsage);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ListGroup
        title="AI 用量"
        action={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => void loadUsage()}
          >
            <RefreshCw aria-hidden="true" className={cn("size-3.5", loading && "animate-spin")} />
            刷新
          </Button>
        }
      >
        {usage ? (
          <>
            <ListRow
              title="今日"
              detail="解释与造句的本机调用"
              meta={`${formatTokens(usage.today.calls)} 次 · 估算 ${formatCnyMicros(
                usage.today.costCnyMicros,
              )}`}
            />
            <ListRow
              title="语音合成"
              detail="估算 · 今日"
              meta={`${formatTokens(usage.today.ttsCalls ?? 0)} 次 · ${formatTokens(
                usage.today.ttsCharacters ?? 0,
              )} 字符 · 约 ${formatCnyMicros(usage.today.ttsCostCnyMicros ?? 0)}`}
            />
            <ListRow
              title="近 30 天"
              detail={`输入 ${formatTokens(usage.last30Days.promptTokens)} · 输出 ${formatTokens(
                usage.last30Days.completionTokens,
              )} tokens`}
              meta={`${formatTokens(usage.last30Days.calls)} 次 · 估算 ${formatCnyMicros(
                usage.last30Days.costCnyMicros,
              )}`}
            />
            <ListRow
              title="语音合成"
              detail="估算 · 近 30 天"
              meta={`${formatTokens(usage.last30Days.ttsCalls ?? 0)} 次 · ${formatTokens(
                usage.last30Days.ttsCharacters ?? 0,
              )} 字符 · 约 ${formatCnyMicros(usage.last30Days.ttsCostCnyMicros ?? 0)}`}
            />
          </>
        ) : (
          <ListEmpty>{error ? error : loading ? "正在读取用量…" : "还没有用量记录。"}</ListEmpty>
        )}
      </ListGroup>

      {usage && (
        <p className="px-1.5 text-[13px] leading-[1.45] text-muted-foreground">
          估算：{usage.priceNote}
        </p>
      )}
      {usage && error && (
        <p role="alert" className="px-1.5 text-[13px] leading-[1.45] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
