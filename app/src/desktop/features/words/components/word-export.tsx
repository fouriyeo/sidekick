import { Download } from "lucide-react";
import { useState } from "react";
import { wordExportMarkdown } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { wordErrorText } from "../words-store";

/**
 * 词库导出：页头「导出」按钮 → 弹层展示只读 Markdown + 复制。
 *
 * 导出只在本机生成文本，不写文件、不联网；复制失败时提示手动选择。
 */
export function WordExportButton({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");

  const openDialog = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setMarkdown("");
    setCopyState("idle");
    try {
      setMarkdown(await wordExportMarkdown());
    } catch (cause) {
      setError(wordErrorText(cause));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyState("copied");
    } catch {
      // 没有剪贴板权限 / 非安全上下文：让用户手动全选。
      setCopyState("manual");
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => void openDialog()}
      >
        <Download aria-hidden="true" className="size-3.5" />
        导出
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>导出词库</DialogTitle>
            <DialogDescription>Markdown 全文，只在本机生成，不写文件、不上传。</DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground">正在生成…</p>
          ) : error ? (
            <p role="alert" className="m-0 text-[13px] leading-[1.45] text-destructive">
              {error}
            </p>
          ) : (
            <>
              <textarea
                aria-label="Markdown 内容"
                readOnly
                rows={14}
                value={markdown}
                spellCheck={false}
                className="w-full resize-none rounded-xl border-[0.5px] border-border bg-background px-3 py-2 font-mono text-[12.5px] leading-[1.55] text-foreground outline-none"
              />
              {copyState === "copied" && (
                <p role="status" className="m-0 text-[13px] leading-[1.45] text-signal">
                  已复制
                </p>
              )}
              {copyState === "manual" && (
                <p role="status" className="m-0 text-[13px] leading-[1.45] text-destructive">
                  请手动选择复制
                </p>
              )}
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              关闭
            </Button>
            <Button type="button" disabled={loading || !markdown} onClick={() => void copy()}>
              复制
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
