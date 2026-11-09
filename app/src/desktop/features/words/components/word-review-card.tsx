import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ListGroup } from "@/desktop/shell/list";
import type { WordSummary } from "@/protocol/words";
import { wordGet } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import { wordErrorText } from "../words-store";

/** 一组 5 个词；ready 不足 5 个时有多少复习多少。 */
const REVIEW_SIZE = 5;

function sampleWords(items: WordSummary[], size: number): WordSummary[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = pool[index];
    const target = pool[swap];
    if (current === undefined || target === undefined) continue;
    pool[index] = target;
    pool[swap] = current;
  }
  return pool.slice(0, size);
}

/**
 * 今天复习：从已解释的词里随机抽 5 个，先看单词、再揭释义与第一条例句。
 *
 * 例句不在列表行里，所以「看释义」时才按需拉一次详情；只看本机数据，不调模型。
 * 没有已解释的词时整卡不渲染。
 */
export function WordReviewCard({ items }: { items: WordSummary[] }) {
  const ready = useMemo(() => items.filter((item) => item.status === "ready"), [items]);
  const [round, setRound] = useState(0);
  const [queue, setQueue] = useState<WordSummary[]>([]);
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [example, setExample] = useState<string | null>(null);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: round 是「再来一组」的触发源，不参与抽词计算。
  useEffect(() => {
    setQueue(sampleWords(ready, REVIEW_SIZE));
    setCursor(0);
    setRevealed(false);
    setExample(null);
    setReviewError(null);
  }, [ready, round]);

  if (ready.length === 0) return null;

  const current = queue[cursor];
  const finished = current === undefined;

  const reveal = async () => {
    if (!current) return;
    setRevealed(true);
    setExample(null);
    setReviewError(null);
    setExampleLoading(true);
    try {
      const detail = await wordGet(current.word);
      const first = detail?.explanation?.examples?.[0];
      setExample(first ? `${first.en} — ${first.zh}` : null);
    } catch (cause) {
      setReviewError(wordErrorText(cause));
    } finally {
      setExampleLoading(false);
    }
  };

  const next = () => {
    setCursor((value) => value + 1);
    setRevealed(false);
    setExample(null);
    setReviewError(null);
  };

  return (
    <ListGroup title="今天复习">
      {finished || !current ? (
        <div className="dsl-row flex-col items-start gap-2">
          <p className="m-0 text-[15px] leading-[1.5] text-foreground">复习完成</p>
          <Button type="button" size="sm" onClick={() => setRound((value) => value + 1)}>
            再来一组
          </Button>
        </div>
      ) : (
        <>
          <div className="dsl-row items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[13px] leading-none text-muted-foreground">
                {cursor + 1} / {queue.length}
              </span>
              <span className="truncate text-[22px] leading-tight font-semibold tracking-[-0.01em] text-foreground">
                {current.word}
              </span>
              {current.phonetic && (
                <span className="truncate font-mono text-[13px] leading-none text-muted-foreground">
                  {current.phonetic}
                </span>
              )}
            </div>
          </div>

          {revealed && (
            <div className="dsl-row flex-col items-start gap-1.5">
              <p className="m-0 text-[15px] leading-[1.5] text-foreground">
                {current.firstDefinition || "还没有释义。"}
              </p>
              {exampleLoading ? (
                <p className="m-0 flex items-center gap-1.5 text-[13px] leading-[1.45] text-muted-foreground">
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  正在读取例句…
                </p>
              ) : example ? (
                <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">{example}</p>
              ) : (
                <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">还没有例句。</p>
              )}
              {reviewError && (
                <p role="alert" className="m-0 text-[13px] leading-[1.45] text-destructive">
                  {reviewError}
                </p>
              )}
            </div>
          )}

          <div className="dsl-row">
            {revealed ? (
              <Button type="button" size="sm" className="ml-auto" onClick={next}>
                下一个
              </Button>
            ) : (
              <Button type="button" size="sm" className="ml-auto" onClick={() => void reveal()}>
                看释义
              </Button>
            )}
          </div>
        </>
      )}
    </ListGroup>
  );
}
