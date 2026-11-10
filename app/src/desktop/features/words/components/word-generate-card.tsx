import { Loader2, Pause, Sparkles, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ListEmpty, ListGroup } from "@/desktop/shell/list";
import type { WordSummary } from "@/protocol/words";
import { useWordAudio } from "@/shared/hooks/use-word-audio";
import { Button } from "@/shared/ui/button";
import { MAX_GENERATE_WORDS, MIN_GENERATE_WORDS, useWordsStore } from "../words-store";

/**
 * 造句卡：只列「已解释」的词，多选 5–10 个 → 生成 3–5 句。
 *
 * 每句给英文 + 中文翻译，并把这句用到的词标成小胶囊；右侧喇叭用与详情页
 * 同款 hook 朗读整句（同一条再点即停）。生成结果留在页内，换选择不会自动清空。
 */
export function WordGenerateCard({
  items,
  canRequest,
}: {
  items: WordSummary[];
  canRequest: boolean;
}) {
  const generating = useWordsStore((state) => state.generating);
  const result = useWordsStore((state) => state.generateResult);
  const error = useWordsStore((state) => state.generateError);
  const generate = useWordsStore((state) => state.generate);

  const readyWords = useMemo(() => items.filter((item) => item.status === "ready"), [items]);
  const [selected, setSelected] = useState<string[]>([]);
  const {
    play: playAudio,
    playing: audioPlaying,
    pending: audioPending,
    error: audioError,
    clearError: clearAudioError,
  } = useWordAudio();

  // 词条被删除 / 重新解释后，把失效的选择剔掉。
  useEffect(() => {
    setSelected((current) =>
      current.filter((word) => readyWords.some((item) => item.word === word)),
    );
  }, [readyWords]);

  const toggle = (word: string) => {
    setSelected((current) => {
      if (current.includes(word)) return current.filter((item) => item !== word);
      if (current.length >= MAX_GENERATE_WORDS) return current;
      return [...current, word];
    });
  };

  const enough = selected.length >= MIN_GENERATE_WORDS;
  const disabled = !canRequest || generating || !enough;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ListGroup title="造句">
        {readyWords.length === 0 ? (
          <ListEmpty>还没有已解释的词。先查几个词，再回来造句。</ListEmpty>
        ) : (
          <div className="max-h-[360px] overflow-y-auto overscroll-contain">
            {readyWords.map((item) => {
              const checked = selected.includes(item.word);
              const full = !checked && selected.length >= MAX_GENERATE_WORDS;
              return (
                <label key={item.id} className="dsl-row cursor-pointer">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary"
                    checked={checked}
                    disabled={full}
                    aria-label={`选择 ${item.word}`}
                    onChange={() => toggle(item.word)}
                  />
                  <span className="min-w-0 flex-1 truncate text-[15px] leading-tight">
                    {item.word}
                  </span>
                  <span className="max-w-[45%] shrink-0 truncate text-[13px] text-muted-foreground">
                    {item.firstDefinition || "已解释"}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <div className="dsl-row">
          <span className="mr-auto min-w-0 text-[13px] leading-[1.45] text-muted-foreground">
            {!canRequest
              ? "配置好百炼 Key 并同意后才能造句。"
              : readyWords.length < MIN_GENERATE_WORDS
                ? `至少需要 ${MIN_GENERATE_WORDS} 个已解释的词，当前 ${readyWords.length} 个。`
                : `已选 ${selected.length} / ${MAX_GENERATE_WORDS}，生成 3–5 句。`}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => void generate(selected)}
          >
            {generating ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" className="size-3.5" />
            )}
            生成例句
          </Button>
        </div>
      </ListGroup>

      {error && (
        <p role="alert" className="px-1.5 text-[13px] leading-[1.45] text-destructive">
          {error}
        </p>
      )}

      {result && result.sentences.length > 0 && (
        <ListGroup title={`例句 · ${result.model}`}>
          {result.sentences.map((sentence) => {
            const playing = audioPlaying === sentence.en;
            const pending = audioPending === sentence.en;
            return (
              <div key={sentence.en} className="dsl-row flex-col items-start gap-1.5">
                <div className="flex w-full items-start gap-2">
                  <p className="m-0 min-w-0 flex-1 text-[15px] leading-[1.5] text-foreground">
                    {sentence.en}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={`h-11 w-11 shrink-0${playing ? " text-signal" : ""}`}
                    aria-label={pending ? "正在合成例句" : playing ? "停止朗读例句" : "朗读例句"}
                    disabled={pending}
                    onClick={() => void playAudio(sentence.en, "sentence")}
                  >
                    {pending ? (
                      <Loader2 aria-hidden="true" className="size-[18px] animate-spin" />
                    ) : playing ? (
                      <Pause aria-hidden="true" className="size-[18px]" strokeWidth={2} />
                    ) : (
                      <Volume2 aria-hidden="true" className="size-[18px]" />
                    )}
                  </Button>
                </div>
                <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">{sentence.zh}</p>
                {sentence.words.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {sentence.words.map((word) => (
                      <span
                        key={word}
                        className="rounded-full bg-muted px-2 py-0.5 text-[12px] leading-[1.4] text-signal"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </ListGroup>
      )}

      {audioError && (
        <div className="flex items-center gap-2 px-1.5">
          <p
            role="alert"
            className="m-0 min-w-0 flex-1 text-[13px] leading-[1.45] text-destructive"
          >
            {audioError}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0"
            onClick={clearAudioError}
          >
            关闭
          </Button>
        </div>
      )}
    </div>
  );
}
