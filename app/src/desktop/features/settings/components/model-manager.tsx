import { cn } from "cn";
import {
  Check,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  Loader2,
  Square,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatBytes } from "@/shared/lib/format";
import { revealAsrDir, subscribeModelProgress } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import { useModelStore } from "../model-store";

export function ModelManager() {
  const status = useModelStore((state) => state.status);
  const loading = useModelStore((state) => state.loading);
  const error = useModelStore((state) => state.error);
  const refresh = useModelStore((state) => state.refresh);
  const applyProgress = useModelStore((state) => state.applyProgress);
  const download = useModelStore((state) => state.download);
  const cancel = useModelStore((state) => state.cancel);
  const remove = useModelStore((state) => state.remove);
  const select = useModelStore((state) => state.select);
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    void refresh();
    return subscribeModelProgress(applyProgress);
  }, [applyProgress, refresh]);

  async function copyPath() {
    if (!status?.dir) return;
    try {
      await navigator.clipboard.writeText(status.dir);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // 路径仍可见，允许手动选择。
    }
  }

  async function openDir() {
    setOpening(true);
    try {
      await revealAsrDir();
    } catch {
      // 保留当前页面，不弹额外错误。
    } finally {
      setOpening(false);
    }
  }

  const downloadingId = status?.downloading?.id ?? null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <HardDrive className="size-4 text-muted-foreground" />
            本机模型
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            模型只存在这台电脑，不会上传；云端识别不需要下载本机模型，但本机模型可作为云端失败时的回退。
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : "刷新"}
        </Button>
      </div>

      {status && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
            {status.dir}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={copied ? "已复制模型目录" : "复制模型目录"}
            onClick={() => void copyPath()}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="在 Finder 中打开模型目录"
            disabled={opening}
            onClick={() => void openDir()}
          >
            <FolderOpen className="size-3.5" />
          </Button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {status?.models.map((model) => {
          const isDownloading = downloadingId === model.id;
          const progress = status.downloading;
          const percent =
            isDownloading && progress && progress.total > 0
              ? Math.min(100, Math.round((progress.received / progress.total) * 100))
              : 0;

          return (
            <div
              key={model.id}
              className={cn(
                "rounded-xl border p-3",
                model.selected ? "border-primary/50 bg-primary/5" : "border-border bg-card",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{model.label}</span>
                    {model.selected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                        <Check className="size-3" />
                        使用中
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{model.note}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {model.downloaded
                      ? `已下载 · ${formatBytes(model.sizeBytes)}`
                      : `约 ${formatBytes(model.approxBytes)}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {isDownloading ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      onClick={() => void cancel()}
                    >
                      <Square className="size-3 fill-current" />
                      取消
                    </Button>
                  ) : model.downloaded ? (
                    <>
                      {!model.selected && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => void select(model.id)}
                        >
                          使用
                        </Button>
                      )}
                      {!model.selected && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`删除 ${model.label} 模型`}
                          onClick={() => void remove(model.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      disabled={downloadingId !== null}
                      onClick={() => void download(model.id)}
                    >
                      <Download className="size-3.5" />
                      下载
                    </Button>
                  )}
                </div>
              </div>

              {isDownloading && (
                <div className="mt-2.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {progress && progress.total > 0
                      ? `${formatBytes(progress.received)} / ${formatBytes(progress.total)} · ${percent}%`
                      : `已下载 ${formatBytes(progress?.received ?? 0)}`}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && !status && !error && (
        <p className="text-xs text-muted-foreground">暂时读不到模型状态，点刷新重试。</p>
      )}
    </section>
  );
}
