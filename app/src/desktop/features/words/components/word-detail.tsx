import { cn } from "cn";
import { Loader2, RefreshCw, Trash2, Volume2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { ListActionRow, ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageShell } from "@/desktop/shell/page-shell";
import type { WordExplanation, WordStatus } from "@/protocol/words";
import { useWordAudio, type WordAudioState } from "@/shared/hooks/use-word-audio";
import { formatRelativeTime } from "@/shared/lib/format";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { useWordsStore, WORD_STATUS_LABEL, wordErrorText } from "../words-store";

const LABEL = "text-[13px] leading-[1.4] text-muted-foreground";

function StatusChip({ status }: { status: WordStatus }) {
  return (
    <span
      className={cn(
        "text-[13px] leading-none",
        status === "ready" && "text-signal",
        status === "failed" && "text-destructive",
        status === "pending" && "text-muted-foreground",
      )}
    >
      {WORD_STATUS_LABEL[status]}
    </span>
  );
}

/** 多行文本块：标题在上、内容在下，沿用 `dsl-row` 的内缩与分隔线。 */
function TextBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="dsl-row flex-col items-start gap-1.5">
      <span className={LABEL}>{label}</span>
      <div className="min-w-0 text-[15px] leading-[1.5] text-foreground">{children}</div>
    </div>
  );
}

function ExplanationGroups({
  explanation,
  audio,
}: {
  explanation: WordExplanation;
  audio: WordAudioState;
}) {
  const definitions = explanation.definitions ?? [];
  const examples = explanation.examples ?? [];

  return (
    <>
      {explanation.phonetic && <ListRow title="音标" meta={explanation.phonetic} mono />}
      {explanation.pos && <ListRow title="词性" meta={explanation.pos} />}

      {definitions.length > 0 && (
        <TextBlock label="释义">
          <div className="flex flex-col gap-1">
            {definitions.map((definition) => (
              <p key={`${definition.zh}-${definition.en ?? ""}`} className="m-0">
                {definition.zh}
                {definition.en && (
                  <span className="ml-1.5 text-[13px] text-muted-foreground">{definition.en}</span>
                )}
              </p>
            ))}
          </div>
        </TextBlock>
      )}

      {examples.length > 0 && (
        <TextBlock label="例句">
          <div className="flex flex-col gap-1">
            {examples.map((example) => {
              const playing = audio.playing === example.en;
              return (
                <div key={`${example.en}-${example.zh}`} className="flex items-start gap-2 py-1">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="m-0 text-[15px] leading-[1.5]">{example.en}</p>
                    <p className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
                      {example.zh}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn("h-11 w-11 shrink-0", playing && "text-signal")}
                    aria-label={playing ? "停止朗读例句" : "朗读例句"}
                    onClick={() => void audio.play(example.en, "sentence")}
                  >
                    <Volume2 aria-hidden="true" className="size-[18px]" />
                  </Button>
                </div>
              );
            })}
          </div>
        </TextBlock>
      )}

      {explanation.collocations && explanation.collocations.length > 0 && (
        <TextBlock label="搭配">
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {explanation.collocations.map((collocation) => (
              <span
                key={collocation}
                className="rounded-full bg-muted px-2.5 py-0.5 text-[13px] leading-[1.5] text-foreground"
              >
                {collocation}
              </span>
            ))}
          </div>
        </TextBlock>
      )}

      {explanation.mistakes && (
        <TextBlock label="常见错误">
          <p className="m-0 whitespace-pre-wrap">{explanation.mistakes}</p>
        </TextBlock>
      )}

      {explanation.roots && (
        <TextBlock label="词根">
          <p className="m-0 whitespace-pre-wrap">{explanation.roots}</p>
        </TextBlock>
      )}
    </>
  );
}

/**
 * 词条详情（页内 push）：完整解释 / 备注 / 删除 / 失败重试。
 *
 * 缺省字段不占行；音标等解释内容统一在组标题上标「AI 生成」。
 * 删除是墓碑同步，二次确认后回词库列表。
 */
export function WordDetailView({ canRequest }: { canRequest: boolean }) {
  const detail = useWordsStore((state) => state.detail);
  const loading = useWordsStore((state) => state.detailLoading);
  const error = useWordsStore((state) => state.detailError);
  const retrying = useWordsStore((state) => state.retrying);
  const deleting = useWordsStore((state) => state.deleting);
  const deleteError = useWordsStore((state) => state.deleteError);
  const close = useWordsStore((state) => state.close);
  const retry = useWordsStore((state) => state.retry);
  const saveNote = useWordsStore((state) => state.saveNote);
  const remove = useWordsStore((state) => state.remove);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const audio = useWordAudio();
  const {
    play: playAudio,
    playing: speaking,
    error: speakError,
    clearError: clearAudioError,
  } = audio;

  const explanation = detail?.status === "ready" ? detail.explanation : undefined;
  // 换词或详情重新加载（解释完成 / 同步落库）时退出编辑并丢弃草稿。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 触发源就是 detail 的 word/updatedAt。
  useEffect(() => {
    setEditingNote(false);
    setNoteDraft("");
    setNoteError(null);
  }, [detail?.word, detail?.updatedAt]);

  const speak = () => {
    if (!detail) return;
    // qwen-audio-3.1-tts-plus（本地缓存）；桌面云端失败时回退系统 say。
    void playAudio(detail.word, "word");
  };

  const startEditNote = () => {
    setNoteDraft(detail?.note ?? "");
    setNoteError(null);
    setEditingNote(true);
  };

  const cancelEditNote = () => {
    setEditingNote(false);
    setNoteDraft("");
    setNoteError(null);
  };

  const commitNote = () => {
    if (!detail || noteSaving) return;
    setNoteSaving(true);
    setNoteError(null);
    void saveNote(detail.word, noteDraft)
      .then(() => {
        setEditingNote(false);
        setNoteDraft("");
      })
      .catch((cause: unknown) => {
        // 失败保留编辑态与草稿，用户改完可以直接再存。
        setNoteError(wordErrorText(cause));
      })
      .finally(() => setNoteSaving(false));
  };

  return (
    <PageShell transition="push">
      <PageHeader
        title={detail?.word ?? "词条详情"}
        backLabel="词库"
        onBack={close}
        chips={detail ? <StatusChip status={detail.status} /> : null}
        actions={
          detail ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              aria-label={speaking === detail?.word ? "停止朗读" : "发音"}
              onClick={speak}
            >
              <Volume2 aria-hidden="true" className="size-[18px]" />
            </Button>
          ) : null
        }
      />

      <PageBody>
        {speakError && (
          <div className="flex items-center gap-2 px-1.5">
            <p
              role="alert"
              className="m-0 min-w-0 flex-1 text-[13px] leading-[1.45] text-destructive"
            >
              {speakError}
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

        {loading && !detail && (
          <ListGroup title="词条">
            <ListEmpty>正在读取词条…</ListEmpty>
          </ListGroup>
        )}

        {!loading && !detail && (
          <ListGroup title="词条">
            <ListEmpty>{error ?? "没有找到这个词条，可能已被删除。"}</ListEmpty>
            <ListActionRow onClick={close}>返回词库</ListActionRow>
          </ListGroup>
        )}

        {detail && (
          <>
            <ListGroup
              title="解释"
              action={
                detail.status === "ready" ? (
                  <span className="text-[12px] leading-none text-muted-foreground">AI 生成</span>
                ) : null
              }
            >
              {explanation ? (
                <ExplanationGroups explanation={explanation} audio={audio} />
              ) : detail.status === "failed" ? (
                <ListEmpty>
                  解释失败{detail.lastError ? `（${detail.lastError}）` : ""}，可以重试。
                </ListEmpty>
              ) : (
                <ListEmpty>还没有解释。点下面的「开始解释」。</ListEmpty>
              )}

              {detail.status !== "ready" && (
                <div className="dsl-row">
                  <span className="mr-auto min-w-0 text-[13px] leading-[1.45] text-muted-foreground">
                    {canRequest ? "解释会发送这个单词和语境句。" : "先完成同意 / 配置 Key。"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!canRequest || retrying}
                    onClick={() => void retry(detail.word)}
                  >
                    {retrying ? (
                      <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw aria-hidden="true" className="size-3.5" />
                    )}
                    {detail.status === "failed" ? "重试解释" : "开始解释"}
                  </Button>
                </div>
              )}
            </ListGroup>

            <ListGroup title="备注">
              {editingNote ? (
                <div className="dsl-row flex-col items-stretch gap-2">
                  <textarea
                    aria-label="备注内容"
                    rows={3}
                    className="w-full resize-none rounded-xl border-[0.5px] border-border bg-background px-3 py-2 text-[15px] leading-[1.5] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                    placeholder="写点自己的记忆点，比如在哪儿见过"
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                  />
                  {noteError && (
                    <p role="alert" className="m-0 text-[13px] leading-[1.45] text-destructive">
                      {noteError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11"
                      disabled={noteSaving}
                      onClick={cancelEditNote}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-11"
                      disabled={noteSaving}
                      onClick={commitNote}
                    >
                      {noteSaving ? "保存中…" : "保存"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="dsl-row items-start">
                  <p className="m-0 min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-[1.55] text-foreground">
                    {detail.note || <span className="text-muted-foreground">还没有备注。</span>}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 shrink-0"
                    onClick={startEditNote}
                  >
                    编辑
                  </Button>
                </div>
              )}
            </ListGroup>

            {detail.context && (
              <ListGroup title="语境">
                <TextBlock label="语境句">{detail.context}</TextBlock>
              </ListGroup>
            )}

            <ListGroup title="词条信息">
              <ListRow title="状态" meta={WORD_STATUS_LABEL[detail.status]} />
              <ListRow title="加入时间" meta={formatRelativeTime(detail.createdAt)} />
              <ListRow title="更新时间" meta={formatRelativeTime(detail.updatedAt)} />
              {detail.model && <ListRow title="解释模型" meta={detail.model} mono />}
            </ListGroup>

            <ListGroup title="删除">
              <ListActionRow tone="danger" disabled={deleting} onClick={() => setConfirmOpen(true)}>
                <Trash2 aria-hidden="true" className="mr-1.5 size-4" />
                删除词条
              </ListActionRow>
            </ListGroup>

            {error && (
              <p role="alert" className="px-1.5 text-[13px] leading-[1.45] text-destructive">
                {error}
              </p>
            )}
            {deleteError && (
              <p role="alert" className="px-1.5 text-[13px] leading-[1.45] text-destructive">
                {deleteError}
              </p>
            )}
            {detail.status === "ready" && (
              <p className="px-1.5 text-[13px] leading-[1.45] text-muted-foreground">
                解释由 {detail.model ?? "模型"} 生成，只存本机。
              </p>
            )}
          </>
        )}
      </PageBody>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除「{detail?.word ?? "这个词条"}」？</DialogTitle>
            <DialogDescription>
              只在本机删除；同步给手机后也会消失，删除后不能恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting || !detail}
              onClick={() => {
                if (!detail) return;
                void remove(detail.word);
              }}
            >
              删除词条
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
