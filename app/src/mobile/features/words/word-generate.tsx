import { cn } from "cn";
import { Loader2, Sparkles, Square, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useWordsStore } from "@/mobile/features/words/words-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { pushBackHandler } from "@/mobile/system-back";
import { useWordAudio } from "@/shared/hooks/use-word-audio";

const CARD = "rounded-2xl border-[0.5px] border-border bg-card px-4 py-3";
const ROW = "flex min-h-12 w-full items-center gap-3 px-4 text-left active:bg-wash";
const MIN_WORDS = 5;
const MAX_WORDS = 10;

/**
 * 造句：从已解释的词里多选 5–10 个，让百炼生成 3–5 句。
 *
 * 只把选中的单词（不带上整本词库）发出去；每句带中文翻译与「用到的词」标注。
 */
export function WordGenerate({ onBack }: { onBack: () => void }) {
  const items = useWordsStore((state) => state.items);
  const loading = useWordsStore((state) => state.loading);
  const load = useWordsStore((state) => state.load);
  const generated = useWordsStore((state) => state.generated);
  const generating = useWordsStore((state) => state.generating);
  const generateError = useWordsStore((state) => state.generateError);
  const generateSentences = useWordsStore((state) => state.generateSentences);

  const [selected, setSelected] = useState<string[]>([]);
  const { playing, error: audioError, play: playAudio } = useWordAudio();

  const ready = items.filter((item) => item.status === "ready");

  useEffect(() => {
    if (items.length === 0) void load();
  }, [items.length, load]);

  useEffect(
    () =>
      pushBackHandler(() => {
        onBack();
        return true;
      }),
    [onBack],
  );

  const toggle = (word: string) => {
    setSelected((previous) => {
      if (previous.includes(word)) return previous.filter((item) => item !== word);
      if (previous.length >= MAX_WORDS) {
        toast(`最多选 ${MAX_WORDS} 个词`);
        return previous;
      }
      return [...previous, word];
    });
  };

  const run = () => {
    if (selected.length < MIN_WORDS || selected.length > MAX_WORDS) return;
    void generateSentences(selected);
  };

  return (
    <MobilePage aria-label="造句">
      <PageHeader
        title="造句"
        sub="选 5–10 个已解释的词，生成 3–5 句"
        onBack={onBack}
        backLabel="返回英语角"
      />

      <PageScroll className="pt-1">
        {ready.length < MIN_WORDS ? (
          <div className="mt-12 px-6 text-center">
            <p className="m-0 text-[15px] leading-[21px] text-foreground">已解释的词还不够</p>
            <p className="mt-1 text-[13px] leading-[19px] text-muted-foreground">
              先去词库添加并解释至少 {MIN_WORDS} 个词，再回来造句。
            </p>
            <button
              type="button"
              className="mt-4 flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-[14px] leading-[20px] text-primary-foreground active:opacity-90"
              onClick={onBack}
            >
              回词库
            </button>
          </div>
        ) : (
          <>
            {generateError && (
              <div
                role="alert"
                className="mb-2 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-3"
              >
                <p className="m-0 text-[13px] leading-[19px] text-foreground">{generateError}</p>
                <button
                  type="button"
                  className="mt-1 flex min-h-11 items-center text-[13px] font-medium text-destructive"
                  onClick={run}
                >
                  重试
                </button>
              </div>
            )}

            <div className="mb-2 px-1 text-[12px] leading-[17px] text-muted-foreground">
              已选 {selected.length} 个 · 需要 {MIN_WORDS}–{MAX_WORDS} 个
            </div>

            <div className="overflow-hidden rounded-2xl border-[0.5px] border-border bg-card">
              {ready.map((item, index) => {
                const checked = selected.includes(item.word);
                return (
                  <div key={item.id}>
                    {index > 0 && <div aria-hidden="true" className="ml-9 h-[0.5px] bg-border" />}
                    <label className={ROW}>
                      <input
                        type="checkbox"
                        aria-label={`选择 ${item.word}`}
                        className="size-5 shrink-0 accent-primary"
                        checked={checked}
                        onChange={() => toggle(item.word)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] leading-[21px] text-foreground">
                          {item.word}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] leading-[17px] text-muted-foreground">
                          {item.firstDefinition?.trim() || "已解释"}
                        </span>
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>

            {generated && (
              <section aria-label="生成结果" className="mt-5">
                <h2 className="m-0 mb-2 px-1 text-[12px] leading-[17px] font-normal text-muted-foreground">
                  生成的句子
                </h2>
                {audioError && (
                  <p
                    role="alert"
                    className="mb-2 rounded-xl border-[0.5px] border-destructive bg-card px-3 py-2 text-[12px] leading-[18px] text-destructive"
                  >
                    {audioError}
                  </p>
                )}
                {generated.sentences.map((sentence, index) => {
                  const speakingSentence = playing === sentence.en;
                  return (
                    <div key={sentence.en} className={cn(CARD, "mt-2")}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="m-0 text-[14px] leading-[21px] text-foreground">
                            {sentence.en}
                          </p>
                          <p className="m-0 mt-1 text-[12px] leading-[18px] text-muted-foreground">
                            {sentence.zh}
                          </p>
                          {sentence.words.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              <span className="text-[11px] leading-[16px] text-muted-foreground">
                                用到：
                              </span>
                              {sentence.words.map((word) => (
                                <span
                                  key={word}
                                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] leading-[16px] text-foreground"
                                >
                                  {word}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          aria-label={
                            speakingSentence ? `停止朗读例句 ${index + 1}` : `朗读例句 ${index + 1}`
                          }
                          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-wash"
                          onClick={() => void playAudio(sentence.en, "sentence")}
                        >
                          {speakingSentence ? (
                            <Square aria-hidden="true" className="size-4" strokeWidth={1.8} />
                          ) : (
                            <Volume2 aria-hidden="true" className="size-[18px]" strokeWidth={1.6} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <p className="mt-2 text-center text-[11px] leading-[16px] text-muted-foreground">
                  AI 生成 · {generated.model}
                </p>
              </section>
            )}
          </>
        )}
      </PageScroll>

      {ready.length >= MIN_WORDS && (
        <div className="flex-none border-t-[0.5px] border-border px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] leading-[21px] text-primary-foreground active:opacity-90 disabled:opacity-50"
            disabled={generating || selected.length < MIN_WORDS || selected.length > MAX_WORDS}
            onClick={run}
          >
            {generating ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" className="size-4" />
            )}
            {generating
              ? "正在造句…"
              : selected.length < MIN_WORDS
                ? `再选 ${MIN_WORDS - selected.length} 个`
                : `生成例句（${selected.length} 个词）`}
          </button>
        </div>
      )}

      {loading && ready.length === 0 && (
        <p className="pb-3 text-center text-[12px] text-muted-foreground">正在读取词库…</p>
      )}
    </MobilePage>
  );
}
