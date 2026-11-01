import { cn } from "cn";
import {
  Check,
  Clipboard,
  Copy,
  Link2,
  Mic,
  Pause,
  Pin,
  Play,
  Search,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatRelativeTime } from "@/shared/lib/format";
import { subscribeClipboardChanged } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import {
  DEFAULT_CLIPBOARD_MAX_ITEMS,
  filterClipboardItems,
  formatClipboardCount,
  useClipboardStore,
} from "../clipboard-store";

export function ClipboardPanel() {
  const snapshot = useClipboardStore((state) => state.snapshot);
  const loading = useClipboardStore((state) => state.loading);
  const error = useClipboardStore((state) => state.error);
  const refresh = useClipboardStore((state) => state.refresh);
  const applySnapshot = useClipboardStore((state) => state.applySnapshot);
  const copy = useClipboardStore((state) => state.copy);
  const togglePin = useClipboardStore((state) => state.togglePin);
  const remove = useClipboardStore((state) => state.remove);
  const clear = useClipboardStore((state) => state.clear);
  const setEnabled = useClipboardStore((state) => state.setEnabled);

  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void refresh();
    return subscribeClipboardChanged(applySnapshot);
  }, [applySnapshot, refresh]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const items = snapshot?.items ?? [];
  const filtered = filterClipboardItems(items, query);
  const enabled = snapshot?.enabled ?? true;
  const maxItems = snapshot?.maxItems ?? DEFAULT_CLIPBOARD_MAX_ITEMS;

  async function handleCopy(id: string) {
    await copy(id);
    setCopiedId(id);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      copyTimerRef.current = null;
      setCopiedId(null);
    }, 1400);
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Clipboard className="size-4 text-muted-foreground" />
            剪贴板
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatClipboardCount(items.length, maxItems)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void setEnabled(!enabled)}
          >
            {enabled ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {enabled ? "暂停记录" : "继续记录"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={items.length === 0}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-3.5" />
            清空
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索复制过的文字…"
          aria-label="搜索剪贴板"
          autoComplete="off"
          className="h-9 rounded-lg pl-8 text-sm"
        />
      </div>

      {!enabled && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          记录已暂停，新的复制不会进入列表。
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {filtered.length === 0 ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center">
            <Clipboard className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {query
                ? "没有匹配的剪贴板"
                : enabled
                  ? "复制一段文字，会出现在这里"
                  : "剪贴板记录已暂停"}
            </p>
            {loading && <p className="text-xs text-muted-foreground">正在读取…</p>}
          </div>
        ) : (
          <ul className="flex list-none flex-col gap-1.5 p-0">
            {filtered.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "group flex items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                  item.pinned
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-background hover:bg-muted/40",
                )}
              >
                <span className="mt-0.5 text-muted-foreground">
                  {item.kind === "voice" ? (
                    <Mic className="size-3.5" />
                  ) : item.kind === "url" ? (
                    <Link2 className="size-3.5" />
                  ) : (
                    <Type className="size-3.5" />
                  )}
                </span>

                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => void handleCopy(item.id)}
                  title="复制到剪贴板"
                >
                  <p className="line-clamp-2 text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground">
                    {item.text}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    {formatRelativeTime(item.lastUsedAt)}
                    {item.pinned ? " · 已置顶" : ""}
                    {item.kind === "voice" && (
                      <span className="rounded bg-muted px-1 py-px text-[10px] leading-relaxed text-muted-foreground">
                        语音
                      </span>
                    )}
                  </p>
                </button>

                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copiedId === item.id ? "已复制" : "复制这条"}
                    onClick={() => void handleCopy(item.id)}
                  >
                    {copiedId === item.id ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={item.pinned ? "取消置顶" : "置顶"}
                    className={item.pinned ? "text-primary" : undefined}
                    onClick={() => void togglePin(item.id)}
                  >
                    <Pin className={item.pinned ? "size-3.5 fill-current" : "size-3.5"} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="删除这条"
                    onClick={() => void remove(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        最多保留最近 {maxItems}{" "}
        条；新内容淘汰最旧的未置顶项。只记录文本；密码管理器标记为隐藏的内容不会记录。数据仅保存在本机，不联网、不写日志。
      </p>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空剪贴板历史？</DialogTitle>
            <DialogDescription>所有记录（包括置顶）都会被删除，且不能恢复。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void clear().then(() => setConfirmOpen(false));
              }}
            >
              清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
