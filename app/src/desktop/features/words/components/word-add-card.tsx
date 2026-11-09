import { ClipboardPaste, Loader2, Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { ListGroup } from "@/desktop/shell/list";
import { wordClipboardCandidates } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useWordsStore, validateWordInput, wordErrorText } from "../words-store";

const FIELD_LABEL = "w-[64px] shrink-0 text-[15px] leading-none font-normal text-foreground";

/**
 * 添加卡：单词 + 可选语境句 → 查词（先入库再调模型解释）。
 *
 * 空 / 超长 / 非英文在本地拦下，不进 Tauri；隐私上只发单词原文与这句语境。
 * 「从剪贴板取词」只读最近剪贴板历史里的英文候选，点 chip 只填输入框、不自动查。
 * 未同意或没有 Key 时按钮禁用，提示先完成前置条件。
 */
export function WordAddCard({ canRequest }: { canRequest: boolean }) {
  const adding = useWordsStore((state) => state.adding);
  const addError = useWordsStore((state) => state.addError);
  const add = useWordsStore((state) => state.add);
  const clearAddError = useWordsStore((state) => state.clearAddError);

  const [word, setWord] = useState("");
  const [context, setContext] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const busy = adding;

  const pickFromClipboard = async () => {
    setCandidatesLoading(true);
    setCandidateError(null);
    setCandidates([]);
    try {
      const words = (await wordClipboardCandidates()).slice(0, 8);
      if (words.length === 0) setCandidateError("剪贴板里没有英文单词");
      else setCandidates(words);
    } catch (cause) {
      setCandidateError(wordErrorText(cause));
    } finally {
      setCandidatesLoading(false);
    }
  };

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (busy || !canRequest) return;
    const validation = validateWordInput(word);
    if (validation.error) {
      clearAddError();
      setFieldError(validation.error);
      return;
    }
    setFieldError(null);
    clearAddError();
    const added = await add(word, context);
    if (added) {
      setWord("");
      setContext("");
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <ListGroup title="添加单词">
        <div className="dsl-row">
          <Label htmlFor="word-input" className={FIELD_LABEL}>
            单词
          </Label>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Input
              id="word-input"
              value={word}
              placeholder="例如 resilient"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              aria-invalid={Boolean(fieldError)}
              onChange={(event) => {
                setWord(event.target.value);
                setFieldError(null);
                clearAddError();
              }}
            />
            {fieldError && (
              <p role="alert" className="text-[13px] leading-[1.4] text-destructive">
                {fieldError}
              </p>
            )}
          </div>
        </div>

        <div className="dsl-row">
          <Label htmlFor="word-context" className={FIELD_LABEL}>
            语境句
          </Label>
          <Input
            id="word-context"
            value={context}
            placeholder="可选：遇到它的原句"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="min-w-0 flex-1"
            onChange={(event) => setContext(event.target.value)}
          />
        </div>

        <div className="dsl-row">
          <span className="mr-auto min-w-0 text-[13px] leading-[1.45] text-muted-foreground">
            {canRequest
              ? "只发送这个单词和这句语境，不发整个词库。"
              : "先完成同意 / 配置百炼 Key，才能查词。"}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || candidatesLoading}
              onClick={() => void pickFromClipboard()}
            >
              {candidatesLoading ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <ClipboardPaste aria-hidden="true" className="size-3.5" />
              )}
              从剪贴板取词
            </Button>
            <Button type="submit" size="sm" disabled={busy || !canRequest}>
              {busy ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              ) : (
                <Search aria-hidden="true" className="size-3.5" />
              )}
              查词
            </Button>
          </div>
        </div>

        {candidates.length > 0 && (
          <div className="dsl-row flex-wrap gap-2">
            {candidates.map((candidate) => (
              <button
                key={candidate}
                type="button"
                className="rounded-full bg-muted px-2.5 py-1 text-[13px] leading-none text-foreground transition-colors hover:bg-accent"
                onClick={() => {
                  setWord(candidate);
                  setFieldError(null);
                  clearAddError();
                }}
              >
                {candidate}
              </button>
            ))}
          </div>
        )}

        {candidateError && (
          <div className="dsl-row">
            <p role="alert" className="m-0 text-[13px] leading-[1.45] text-destructive">
              {candidateError}
            </p>
          </div>
        )}
      </ListGroup>

      {addError && (
        <p role="alert" className="mt-1 px-1.5 text-[13px] leading-[1.45] text-destructive">
          {addError}
        </p>
      )}
    </form>
  );
}
