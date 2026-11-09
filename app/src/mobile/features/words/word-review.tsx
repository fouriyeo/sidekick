import { cn } from "cn";
import { BookOpenCheck, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { wordErrorText } from "@/mobile/features/words/words-store";
import type { WordDetail, WordSummary } from "@/protocol/words";
import { wordGet } from "@/shared/lib/tauri";

const REVIEW_SIZE = 5;
const CARD = "rounded-2xl border-[0.5px] border-border bg-card px-4 py-4";
const PRIMARY =
  "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-[13px] leading-[19px] text-primary-foreground active:opacity-90 disabled:opacity-50";

/** 从 ready 词里随机抽一组（Fisher–Yates，不改原数组）。 */
function pickRandom(words: WordSummary[], count: number): WordSummary[] {
  const copy = [...words];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swap];
    copy[swap] = current;
  }
  return copy.slice(0, count);
}

function firstExample(detail: WordDetail | null): { en: string; zh: string } | null {
  const example = detail?.explanation?.examples?.[0];
  if (!example?.en?.trim()) return null;
  return { en: example.en, zh: example.zh };
}

/**
 * 「今天复习」卡（列表上方）：从已解释的词里随机抽 5 个。
 *
 * 先只看单词，点「看释义」才拉详情（显示首条释义 + 第一条例句），
 * 避免一进页面就把 5 个词的详情全部读出来。ready 词为 0 时整卡隐藏。
 */
export function WordReview({ items }: { items: WordSummary[] }) {
  const ready = items.filter((item) => item.status === "ready");
  const [round, setRound] = useState<WordSummary[]>(() =>
    pickRandom(
      items.filter((item) => item.status === "ready"),
      REVIEW_SIZE,
    ),
  );
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [detail, setDetail] = useState<WordDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 快速点「下一个」时，别把上一个词的详情回填到新词上。
  const requestRef = useRef<string | null>(null);

  // 词库异步加载完成（首屏 items 还是空）时补开一组；已有进度不重抽。
  useEffect(() => {
    const candidates = items.filter((item) => item.status === "ready");
    if (candidates.length === 0) {
      setRound([]);
      setIndex(0);
      setRevealed(false);
      return;
    }
    setRound((previous) => (previous.length > 0 ? previous : pickRandom(candidates, REVIEW_SIZE)));
  }, [items]);

  const current = round[index];
  const done = round.length > 0 && index >= round.length;

  const startAgain = () => {
    const candidates = items.filter((item) => item.status === "ready");
    setRound(pickRandom(candidates, REVIEW_SIZE));
    setIndex(0);
    setRevealed(false);
    setDetail(null);
    setError(null);
    requestRef.current = null;
  };

  const reveal = () => {
    if (!current) return;
    const word = current.word;
    requestRef.current = word;
    setRevealed(true);
    setDetail(null);
    setError(null);
    setLoading(true);
    void wordGet(word)
      .then((value) => {
        if (requestRef.current === word) setDetail(value);
      })
      .catch((err: unknown) => {
        if (requestRef.current === word) setError(wordErrorText(err));
      })
      .finally(() => {
        if (requestRef.current === word) setLoading(false);
      });
  };

  const next = () => {
    requestRef.current = null;
    setIndex((value) => value + 1);
    setRevealed(false);
    setDetail(null);
    setError(null);
    setLoading(false);
  };

  if (ready.length === 0 || round.length === 0) return null;

  const example = firstExample(detail);
  const definition =
    detail?.firstDefinition?.trim() ||
    detail?.explanation?.definitions?.[0]?.zh?.trim() ||
    current?.firstDefinition?.trim();

  return (
    <section aria-label="今天复习" className={cn(CARD, "mb-3 mt-1")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 flex items-center gap-1.5 text-[13px] leading-[19px] text-foreground">
          <BookOpenCheck aria-hidden="true" className="size-4 text-primary" strokeWidth={1.6} />
          今天复习
        </h2>
        <span className="text-[11.5px] leading-[17px] text-muted-foreground">
          {done
            ? `${round.length} 个词`
            : `第 ${Math.min(index + 1, round.length)} / ${round.length} 个`}
        </span>
      </div>

      {done ? (
        <div className="mt-3">
          <p className="m-0 text-[15px] leading-[21px] text-foreground">复习完成</p>
          <p className="m-0 mt-1 text-[12px] leading-[18px] text-muted-foreground">
            这一组 {round.length} 个词都过了一遍。
          </p>
          <button type="button" className={cn(PRIMARY, "mt-3 w-full")} onClick={startAgain}>
            再来一组
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <p className="m-0 break-words text-[22px] leading-[30px] text-foreground">
            {current?.word}
          </p>
          {revealed && (
            <div className="mt-1">
              {loading && (
                <p className="m-0 flex items-center gap-1.5 text-[12px] leading-[18px] text-muted-foreground">
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                  正在读取释义…
                </p>
              )}
              {error && (
                <p role="alert" className="m-0 text-[12px] leading-[18px] text-destructive">
                  {error}
                </p>
              )}
              {!loading && !error && (
                <>
                  <p className="m-0 text-[13px] leading-[20px] text-foreground">
                    {definition || "还没有释义。"}
                  </p>
                  {example && (
                    <p className="m-0 mt-1 text-[12px] leading-[18px] text-muted-foreground">
                      {example.en}
                      {example.zh ? ` · ${example.zh}` : ""}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {!revealed ? (
              <button type="button" className={PRIMARY} onClick={reveal}>
                看释义
              </button>
            ) : (
              <button type="button" className={PRIMARY} disabled={loading} onClick={next}>
                下一个
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
