import { cn } from "cn";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { wordErrorText } from "@/mobile/features/words/words-store";
import { MobilePage, PageScroll } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { pushBackHandler } from "@/mobile/system-back";
import { wordExportMarkdown } from "@/shared/lib/tauri";

const CARD = "rounded-2xl border-[0.5px] border-border bg-card px-4 py-3";

/**
 * 导出 Markdown：全屏只读页。
 *
 * 直接渲染 Rust 回包的 Markdown 全文（可选区文本，长按可全选），底部一个复制按钮。
 * 不引剪贴板插件：优先 `navigator.clipboard.writeText`，不可用/失败时提示长按复制。
 */
export function WordExport({ onBack }: { onBack: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setText(null);
    void wordExportMarkdown()
      .then((value) => setText(value))
      .catch((err: unknown) => setError(wordErrorText(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      pushBackHandler(() => {
        onBack();
        return true;
      }),
    [onBack],
  );

  const copy = () => {
    const value = text ?? "";
    if (!value.trim()) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setHint("当前环境不能自动复制，长按选择复制。");
      return;
    }
    void navigator.clipboard
      .writeText(value)
      .then(() => {
        setHint(null);
        toast.success("已复制 Markdown");
      })
      .catch(() => setHint("复制失败，长按选择复制。"));
  };

  const hasText = (text ?? "").trim().length > 0;

  return (
    <MobilePage aria-label="导出 Markdown">
      <PageHeader
        title="导出 Markdown"
        sub="整本词库 · 只读"
        onBack={onBack}
        backLabel="返回英语角"
      />
      <PageScroll className="px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+24px)]">
        {loading && (
          <div className="mt-16 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            正在生成…
          </div>
        )}

        {!loading && error && (
          <div role="alert" className={cn(CARD, "border-destructive")}>
            <p className="m-0 text-[13px] leading-[19px] text-foreground">{error}</p>
            <button
              type="button"
              className="mt-1 flex min-h-11 items-center gap-1.5 text-[13px] leading-[19px] font-medium text-destructive"
              onClick={load}
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              重试
            </button>
          </div>
        )}

        {!loading && !error && text !== null && !hasText && (
          <p className="mt-12 text-center text-[13px] leading-[19px] text-muted-foreground">
            词库是空的，没有可导出的内容。
          </p>
        )}

        {!loading && !error && hasText && (
          <section
            aria-label="导出的 Markdown"
            className="rounded-2xl border-[0.5px] border-border bg-card px-4 py-3"
          >
            <pre className="m-0 whitespace-pre-wrap break-words text-[12px] leading-[19px] text-foreground select-text">
              {text}
            </pre>
          </section>
        )}
      </PageScroll>

      {!loading && !error && hasText && (
        <div className="flex-none border-t-[0.5px] border-border px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-[15px] leading-[21px] text-primary-foreground active:opacity-90"
            onClick={copy}
          >
            <Copy aria-hidden="true" className="size-4" strokeWidth={1.6} />
            复制 Markdown
          </button>
          <p className="m-0 mt-1.5 text-center text-[11.5px] leading-[17px] text-muted-foreground">
            {hint ?? "复制后可粘贴到任意 Markdown 编辑器。"}
          </p>
        </div>
      )}
    </MobilePage>
  );
}
