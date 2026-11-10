import { cn } from "cn";
import { Loader2, Pause, RotateCcw, Trash2, Volume2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useWordsStore,
  WORD_STATUS_LABEL,
  wordErrorText,
} from "@/mobile/features/words/words-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { pushBackHandler } from "@/mobile/system-back";
import type { WordDetail as WordDetailData, WordStatus } from "@/protocol/words";
import { useWordAudio } from "@/shared/hooks/use-word-audio";

const CARD = "rounded-2xl border-[0.5px] border-border bg-card px-4 py-3";
const ACTION =
  "flex min-h-11 items-center gap-1.5 text-[13px] leading-[19px] font-medium disabled:opacity-50";

const STATUS_DOT: Record<WordStatus, string> = {
  pending: "bg-decide",
  ready: "bg-signal",
  failed: "bg-destructive",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="mt-4">
      <h2 className="m-0 mb-2 px-1 text-[12px] leading-[17px] font-normal text-muted-foreground">
        {title}
      </h2>
      <div className={CARD}>{children}</div>
    </section>
  );
}

/** 完整解释：只渲染模型真的给出的部分，缺省不占位。 */
function ExplanationBody({
  detail,
  pending,
  playing,
  onPlay,
}: {
  detail: WordDetailData;
  pending: string | null;
  playing: string | null;
  onPlay: (text: string) => void;
}) {
  const explanation = detail.explanation;
  const definitions = (explanation?.definitions ?? []).filter((item) => item.zh.trim());
  const examples = (explanation?.examples ?? []).filter((item) => item.en.trim());
  const collocations = (explanation?.collocations ?? []).filter((item) => item.trim());
  const mistakes = explanation?.mistakes?.trim();
  const roots = explanation?.roots?.trim();

  return (
    <>
      {definitions.length > 0 && (
        <Section title="释义">
          <ul className="m-0 list-none p-0">
            {definitions.map((item, index) => (
              <li
                key={item.zh}
                className={cn(index > 0 && "mt-2 border-t-[0.5px] border-border pt-2")}
              >
                <p className="m-0 text-[15px] leading-[22px] text-foreground">{item.zh}</p>
                {item.en && (
                  <p className="m-0 mt-0.5 text-[12px] leading-[18px] text-muted-foreground">
                    {item.en}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {examples.length > 0 && (
        <Section title="例句">
          <ol className="m-0 list-none p-0">
            {examples.map((item, index) => {
              const speakingSentence = playing === item.en;
              const pendingSentence = pending === item.en;
              return (
                <li
                  key={item.en}
                  className={cn(index > 0 && "mt-2 border-t-[0.5px] border-border pt-2")}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[14px] leading-[21px] text-foreground">{item.en}</p>
                      <p className="m-0 mt-0.5 text-[12px] leading-[18px] text-muted-foreground">
                        {item.zh}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={
                        pendingSentence
                          ? `正在合成例句 ${index + 1}`
                          : speakingSentence
                            ? `停止朗读例句 ${index + 1}`
                            : `朗读例句 ${index + 1}`
                      }
                      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-wash"
                      onClick={() => onPlay(item.en)}
                    >
                      {pendingSentence ? (
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                      ) : speakingSentence ? (
                        <Pause aria-hidden="true" className="size-4" strokeWidth={2} />
                      ) : (
                        <Volume2 aria-hidden="true" className="size-[18px]" strokeWidth={1.6} />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>
      )}

      {collocations.length > 0 && (
        <Section title="搭配">
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {collocations.map((item) => (
              <li
                key={item}
                className="rounded-full bg-muted px-2.5 py-1 text-[12px] leading-[17px] text-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {mistakes && (
        <Section title="常见错误">
          <p className="m-0 whitespace-pre-wrap text-[13px] leading-[20px] text-foreground">
            {mistakes}
          </p>
        </Section>
      )}

      {roots && (
        <Section title="词根">
          <p className="m-0 whitespace-pre-wrap text-[13px] leading-[20px] text-foreground">
            {roots}
          </p>
        </Section>
      )}
    </>
  );
}

/**
 * 单词详情：完整解释 + 语境 + 备注 + 删除/重试。
 *
 * 新增后跳进来的第一屏会带 `autoExplain`，挂载后自动补一次解释；
 * 失败不弹走，就在本页显示错误与重试，用户不用退回去再点一次。
 */
export function WordDetail({
  word,
  autoExplain = false,
  onBack,
}: {
  word: string;
  autoExplain?: boolean;
  onBack: () => void;
}) {
  const detail = useWordsStore((state) => state.detail);
  const detailLoading = useWordsStore((state) => state.detailLoading);
  const detailError = useWordsStore((state) => state.detailError);
  const explaining = useWordsStore((state) => state.explaining);
  const loadDetail = useWordsStore((state) => state.loadDetail);
  const clearDetail = useWordsStore((state) => state.clearDetail);
  const explain = useWordsStore((state) => state.explain);
  const remove = useWordsStore((state) => state.remove);
  const saveNote = useWordsStore((state) => state.saveNote);
  const { pending, playing, error: audioError, play: playAudio } = useWordAudio();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const autoExplainRef = useRef(false);

  const current = detail?.word === word ? detail : null;

  useEffect(() => {
    // 换词时重置自动解释与删除确认，避免把上一个词的状态带过来。
    autoExplainRef.current = false;
    setConfirmDelete(false);
    setEditingNote(false);
    setNoteError(null);
    void loadDetail(word);
  }, [loadDetail, word]);

  useEffect(
    () => () => {
      clearDetail();
    },
    [clearDetail],
  );

  useEffect(
    () =>
      pushBackHandler(() => {
        onBack();
        return true;
      }),
    [onBack],
  );

  // 新增流程：词条刚入库是 pending，加载到详情后自动解释一次（失败留给重试）。
  useEffect(() => {
    if (!autoExplain || autoExplainRef.current) return;
    if (!current) return;
    if (current.status === "ready") {
      autoExplainRef.current = true;
      return;
    }
    if (current.status !== "pending") return;
    autoExplainRef.current = true;
    void explain(word, current.context);
  }, [autoExplain, current, explain, word]);

  const runExplain = () => {
    void explain(word, current?.context).then((next) => {
      if (next) toast.success("解释完成");
    });
  };

  const deleteWord = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    void remove(word)
      .then(() => {
        toast.success("已删除");
        onBack();
      })
      .catch((error: unknown) => toast.error(wordErrorText(error)));
  };

  const playWord = () => {
    if (!current) return;
    void playAudio(current.word, "word");
  };

  const playSentence = (text: string) => {
    void playAudio(text, "sentence");
  };

  const startEditNote = () => {
    setNoteDraft(current?.note ?? "");
    setNoteError(null);
    setEditingNote(true);
  };

  const cancelEditNote = () => {
    setEditingNote(false);
    setNoteError(null);
  };

  const commitNote = () => {
    if (noteSaving) return;
    setNoteSaving(true);
    setNoteError(null);
    void saveNote(word, noteDraft)
      .then(() => {
        toast.success("备注已保存");
        setEditingNote(false);
      })
      .catch((error: unknown) => {
        // 失败保留编辑态与草稿，用户改完可以直接再存。
        setNoteError(wordErrorText(error));
      })
      .finally(() => setNoteSaving(false));
  };

  const headerSub = [current?.phonetic, current?.pos].filter(Boolean).join(" · ");

  return (
    <MobilePage aria-label="单词详情">
      <PageHeader
        title={current?.word ?? word}
        sub={headerSub || undefined}
        onBack={onBack}
        backLabel="返回英语角"
        right={
          current ? (
            <button
              type="button"
              aria-label={
                pending === current.word
                  ? `正在合成 ${current.word}`
                  : playing === current.word
                    ? `停止朗读 ${current.word}`
                    : `朗读 ${current.word}`
              }
              className="flex size-11 items-center justify-center rounded-full text-primary active:bg-wash"
              onClick={playWord}
            >
              {pending === current.word ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin" />
              ) : playing === current.word ? (
                <Pause aria-hidden="true" className="size-5" strokeWidth={2} />
              ) : (
                <Volume2 aria-hidden="true" className="size-5" strokeWidth={1.6} />
              )}
            </button>
          ) : undefined
        }
      />
      <PageScroll className="px-4 pt-0 pb-[calc(env(safe-area-inset-bottom)+28px)]">
        {audioError && (
          <p
            role="alert"
            className="mb-2 mt-1 rounded-xl border-[0.5px] border-destructive bg-card px-3 py-2 text-[12px] leading-[18px] text-destructive"
          >
            {audioError}
          </p>
        )}

        {!current && !detailError && (
          <div className="mt-16 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            正在读取…
          </div>
        )}

        {!current && detailError && (
          <div
            role="alert"
            className="mt-4 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-3"
          >
            <p className="m-0 text-[13px] leading-[19px] text-foreground">{detailError}</p>
            <button
              type="button"
              className={`${ACTION} mt-1 text-destructive`}
              onClick={() => void loadDetail(word)}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              重新读取
            </button>
          </div>
        )}

        {current && (
          <>
            <div className="flex items-center gap-2 px-1 pt-1">
              <span
                role="img"
                aria-label={`状态：${WORD_STATUS_LABEL[current.status]}`}
                className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[current.status])}
              />
              <span className="text-[12px] leading-[17px] text-muted-foreground">
                {WORD_STATUS_LABEL[current.status]}
              </span>
              {current.status === "ready" && (
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] leading-[16px] text-muted-foreground">
                  AI 生成
                </span>
              )}
            </div>

            {current.status === "failed" && (
              <div
                role="alert"
                className="mt-3 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-3"
              >
                <p className="m-0 text-[13px] leading-[19px] text-foreground">
                  {wordErrorText(current.lastError) || "解释失败了，可以重试。"}
                </p>
                <button
                  type="button"
                  className={`${ACTION} mt-1 text-destructive`}
                  disabled={explaining}
                  onClick={runExplain}
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  {explaining ? "正在重试…" : "重试解释"}
                </button>
              </div>
            )}

            {current.status === "pending" && explaining && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl border-[0.5px] border-border bg-card px-4 py-3 text-[13px] leading-[19px] text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                正在让 AI 解释…
              </div>
            )}

            {current.status === "pending" && !explaining && (
              <div className="mt-3 rounded-2xl border-[0.5px] border-border bg-card px-4 py-3">
                <p className="m-0 text-[13px] leading-[19px] text-muted-foreground">
                  这个词还没解释。
                </p>
                <button
                  type="button"
                  className={`${ACTION} mt-1 text-primary`}
                  onClick={runExplain}
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />让 AI 解释
                </button>
              </div>
            )}

            {current.status === "ready" && !current.explanation && (
              <div className="mt-3 rounded-2xl border-[0.5px] border-border bg-card px-4 py-3">
                <p className="m-0 text-[13px] leading-[19px] text-muted-foreground">
                  解释内容是空的，可以重新生成一次。
                </p>
                <button
                  type="button"
                  className={`${ACTION} mt-1 text-primary`}
                  onClick={runExplain}
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  重新解释
                </button>
              </div>
            )}

            {current.context && (
              <Section title="语境">
                <p className="m-0 whitespace-pre-wrap text-[13px] leading-[20px] text-foreground">
                  {current.context}
                </p>
              </Section>
            )}

            <ExplanationBody
              detail={current}
              pending={pending}
              playing={playing}
              onPlay={playSentence}
            />

            <Section title="备注">
              {editingNote ? (
                <>
                  <textarea
                    aria-label="备注内容"
                    rows={3}
                    className="w-full resize-none rounded-xl border-[0.5px] border-border bg-background px-3 py-2 text-[13px] leading-[20px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                    placeholder="写点自己的记忆点，比如在哪儿见过"
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                  />
                  {noteError && (
                    <p
                      role="alert"
                      className="m-0 mt-1.5 text-[12px] leading-[18px] text-destructive"
                    >
                      {noteError}
                    </p>
                  )}
                  <div className="mt-2 flex justify-end gap-1">
                    <button
                      type="button"
                      className="flex min-h-11 items-center rounded-full px-3 text-[13px] leading-[19px] text-muted-foreground active:bg-wash disabled:opacity-50"
                      disabled={noteSaving}
                      onClick={cancelEditNote}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="flex min-h-11 items-center rounded-full px-4 text-[13px] leading-[19px] font-medium text-primary active:bg-wash disabled:opacity-50"
                      disabled={noteSaving}
                      onClick={commitNote}
                    >
                      {noteSaving ? "保存中…" : "保存"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2">
                  <p className="m-0 min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-[20px] text-foreground">
                    {current.note || <span className="text-muted-foreground">还没有备注。</span>}
                  </p>
                  <button
                    type="button"
                    aria-label="编辑备注"
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-[13px] leading-[19px] text-primary active:bg-wash"
                    onClick={startEditNote}
                  >
                    编辑
                  </button>
                </div>
              )}
            </Section>

            <section aria-label="操作" className={cn(CARD, "mt-6 flex flex-col gap-1 p-1")}>
              <button
                type="button"
                className="flex min-h-12 items-center justify-between rounded-xl px-3 text-left text-[14px] leading-[20px] text-destructive active:bg-wash"
                onClick={deleteWord}
              >
                <span>{confirmDelete ? "再点一次删除这个词" : "删除这个词"}</span>
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </section>

            {detailLoading && (
              <p className="mt-3 text-center text-[12px] text-muted-foreground">正在刷新…</p>
            )}
          </>
        )}
      </PageScroll>
    </MobilePage>
  );
}
