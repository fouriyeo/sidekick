import { cn } from "cn";
import {
  Check,
  Clipboard,
  Copy,
  Eye,
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
import { EmptyState } from "@/desktop/components/empty-state";
import { formatRelativeTime } from "@/shared/lib/format";
import { type ClipboardItem, subscribeClipboardChanged } from "@/shared/lib/tauri";
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
import { SignalDot } from "@/shared/ui/signal-dot";
import {
  DEFAULT_CLIPBOARD_MAX_ITEMS,
  filterClipboardItems,
  formatClipboardCharCount,
  formatClipboardCount,
  formatClipboardKind,
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
  const [detailId, setDetailId] = useState<string | null>(null);
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
  // 从最新快照里找，删除/清空后详情弹层会自动关闭。
  const detailItem = detailId ? (items.find((item) => item.id === detailId) ?? null) : null;

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
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border bg-card p-6">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Clipboard className="size-4 text-muted-foreground" />
            剪贴板
          </h2>
          <p className="mt-1 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
            Clipboard · 只存本机
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
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

      <div className="relative mt-4 shrink-0">
        <Search className="pointer-events-none absolute top-[13px] left-3 size-3.5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索复制过的文字…"
          aria-label="搜索剪贴板"
          autoComplete="off"
          className="h-10 rounded-[10px] bg-popover pl-9 text-sm"
        />
      </div>

      {!enabled && (
        <p className="mt-3 flex shrink-0 items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-muted-foreground">
          <SignalDot status="waiting" pulse={false} className="shrink-0" />
          记录已暂停，新的复制不会进入列表。
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 shrink-0 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-0.5">
        {filtered.length === 0 ? (
          <div className="flex h-full min-h-[220px] items-center justify-center">
            <EmptyState
              icon={<Clipboard className="size-4" />}
              title={query ? "没有匹配的记录" : "还没有记录"}
              description={
                query
                  ? "换个关键词再搜一次。"
                  : enabled
                    ? "复制一段文字，就会出现在这里；命令和链接也会保留。"
                    : "剪贴板记录已暂停，继续记录后新复制的内容才会出现。"
              }
            />
          </div>
        ) : (
          <ul className="flex list-none flex-col gap-1.5 p-0">
            {filtered.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "group flex h-12 items-center gap-2 rounded-[10px] border border-border bg-popover px-3 transition-colors hover:bg-wash focus-within:border-signal",
                  item.pinned && "border-signal/60",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center",
                    item.pinned ? "text-signal" : "text-muted-foreground/50",
                  )}
                >
                  {item.pinned ? (
                    <Pin className="size-3 fill-current" />
                  ) : (
                    <span className="block size-1.5 rounded-[1px] bg-current" />
                  )}
                </span>

                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-popover"
                  onClick={() => void handleCopy(item.id)}
                  title="复制到剪贴板"
                >
                  <span className="block truncate font-mono text-[12px] leading-relaxed text-foreground">
                    {item.text}
                  </span>
                </button>

                <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                  <span>{formatRelativeTime(item.lastUsedAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatClipboardKind(item.kind)}</span>
                  {item.kind === "voice" && (
                    <span className="inline-flex items-center gap-0.5 rounded-[4px] border border-signal/50 px-1 py-px text-[9px] text-signal normal-case">
                      <Mic className="size-2.5" />
                      语音
                    </span>
                  )}
                </span>

                <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="查看详情"
                    title="查看详情（全文）"
                    onClick={() => setDetailId(item.id)}
                  >
                    <Eye className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={copiedId === item.id ? "已复制" : "复制这条"}
                    onClick={() => void handleCopy(item.id)}
                  >
                    {copiedId === item.id ? (
                      <Check className="size-3.5 text-signal" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={item.pinned ? "取消置顶" : "置顶"}
                    className={item.pinned ? "text-signal" : undefined}
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

      <div className="mt-3 flex shrink-0 flex-col gap-1.5 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
            {loading ? "正在读取…" : formatClipboardCount(items.length, maxItems)}
          </span>
          <span className="font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
            Local only · 不联网
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          点条目复制；点眼睛看全文。新内容淘汰最旧的未置顶项。只记录文本；密码管理器标记为隐藏的内容不会记录，数据仅保存在本机、不写日志。
        </p>
      </div>

      <Dialog
        open={detailItem !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent className="flex max-h-[min(80vh,560px)] flex-col gap-3 sm:max-w-xl">
          {detailItem && (
            <>
              <DialogHeader className="shrink-0 pr-7">
                <p className="font-mono text-[9px] tracking-[0.16em] text-signal uppercase">
                  Clipboard · 详情
                </p>
                <DialogTitle className="mt-1 flex items-center gap-2">
                  <span className="text-muted-foreground">
                    <ClipboardKindIcon kind={detailItem.kind} />
                  </span>
                  剪贴板详情
                  {detailItem.pinned && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-signal/50 px-1.5 py-px text-[10px] font-normal text-signal">
                      <Pin className="size-2.5 fill-current" />
                      已置顶
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {formatClipboardKind(detailItem.kind)} ·{" "}
                  {formatClipboardCharCount(detailItem.text)} · 最近使用{" "}
                  {formatRelativeTime(detailItem.lastUsedAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-popover px-3 py-2.5">
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap select-text text-foreground">
                  {detailItem.text}
                </p>
              </div>

              <DialogFooter className="shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    void remove(detailItem.id);
                    setDetailId(null);
                  }}
                >
                  <Trash2 className="size-3.5" />
                  删除
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={detailItem.pinned ? "text-signal" : undefined}
                  onClick={() => void togglePin(detailItem.id)}
                >
                  <Pin className={detailItem.pinned ? "size-3.5 fill-current" : "size-3.5"} />
                  {detailItem.pinned ? "取消置顶" : "置顶"}
                </Button>
                <Button type="button" size="sm" onClick={() => void handleCopy(detailItem.id)}>
                  {copiedId === detailItem.id ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copiedId === detailItem.id ? "已复制" : "复制"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <p className="font-mono text-[9px] tracking-[0.16em] text-destructive uppercase">
            确认 · 破坏性操作
          </p>
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

function ClipboardKindIcon({ kind }: { kind: ClipboardItem["kind"] }) {
  if (kind === "voice") return <Mic className="size-3.5" />;
  if (kind === "url") return <Link2 className="size-3.5" />;
  return <Type className="size-3.5" />;
}
