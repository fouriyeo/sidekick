import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useWordsStore, wordErrorText } from "@/mobile/features/words/words-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { pushBackHandler } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";

const INPUT =
  "w-full rounded-xl border-[0.5px] border-border bg-card px-3 text-[15px] leading-[21px] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";

/**
 * 新增单词：单词 + 可选语境句。
 *
 * 粘贴走系统长按菜单（WebView 原生能力），不加剪贴板插件，也就不需要额外权限。
 * 保存只负责入库，解释由列表页转到详情后自动触发；失败留在详情页重试。
 */
export function WordAddPage({
  onBack,
  onSaved,
}: {
  onBack: () => void;
  onSaved: (word: string) => void;
}) {
  const status = useWordsStore((state) => state.status);
  const add = useWordsStore((state) => state.add);
  const setView = useUiStore((state) => state.setView);

  const [word, setWord] = useState("");
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      pushBackHandler(() => {
        onBack();
        return true;
      }),
    [onBack],
  );

  const trimmed = word.trim();
  const canSave = trimmed.length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const detail = await add({
        word: trimmed,
        context: context.trim() || undefined,
      });
      setSaving(false);
      onSaved(detail.word);
    } catch (err) {
      setSaving(false);
      setError(wordErrorText(err));
    }
  };

  return (
    <MobilePage aria-label="新增单词">
      <PageHeader title="新增单词" onBack={onBack} backLabel="返回英语角" />
      <PageScroll className="px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {status && !status.hasKey && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl border-[0.5px] border-decide bg-card px-4 py-3">
            <span className="min-w-0 flex-1 text-[13px] leading-[19px] text-foreground">
              还没有百炼 Key，保存后的解释会失败；可以先去设置里配对。
            </span>
            <button
              type="button"
              className="flex min-h-11 shrink-0 items-center text-[13px] text-decide"
              onClick={() => setView("settings")}
            >
              去设置
            </button>
          </div>
        )}

        <span className="mt-2 block px-1 text-[12px] leading-[17px] text-muted-foreground">
          单词
        </span>
        <input
          aria-label="单词"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${INPUT} mt-1 min-h-12`}
          placeholder="输入英文单词，比如 resilience"
          value={word}
          onChange={(event) => setWord(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
        />
        <p className="mt-1 px-1 text-[11.5px] leading-[17px] text-muted-foreground">
          输入框里长按可粘贴（系统剪贴板）。
        </p>

        <span className="mt-4 block px-1 text-[12px] leading-[17px] text-muted-foreground">
          语境句（可选）
        </span>
        <textarea
          aria-label="语境句"
          rows={2}
          className={`${INPUT} mt-1 resize-none py-2`}
          placeholder="在哪儿看到的？比如：The team stayed resilient after the outage."
          value={context}
          onChange={(event) => setContext(event.target.value)}
        />
        <p className="mt-1 px-1 text-[11.5px] leading-[17px] text-muted-foreground">
          语境句会一起发给模型，解释更贴切；不填也可以。
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-2xl border-[0.5px] border-destructive bg-card px-4 py-3 text-[13px] leading-[19px] text-destructive"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] leading-[21px] text-primary-foreground active:opacity-90 disabled:opacity-50"
          disabled={!canSave}
          onClick={() => void save()}
        >
          {saving && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          {saving ? "正在保存…" : "保存并解释"}
        </button>
        <p className="mt-2 text-center text-[11.5px] leading-[17px] text-muted-foreground">
          保存后自动让 AI 解释；失败会留在详情页，可以重试。
        </p>
      </PageScroll>
    </MobilePage>
  );
}
