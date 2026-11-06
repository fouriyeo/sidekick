import { cn } from "cn";
import { Check, Pin, Search, Trash2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SPRING_POP, SPRING_SLIDE } from "@/desktop/lib/motion";
import { ListEmpty, ListGroup, ListRow } from "@/desktop/shell/list";
import { PageHeader } from "@/desktop/shell/page-header";
import { PageBody, PageShell } from "@/desktop/shell/page-shell";
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
import { Switch } from "@/shared/ui/switch";
import {
  filterClipboardItems,
  formatClipboardCount,
  formatClipboardKind,
  useClipboardStore,
} from "../clipboard-store";

/**
 * 内容页（剪贴板唯一归属）：页头一行计数 + 清空，正文是搜索、暂停开关与记录列表。
 *
 * 每行只留「摘要 + 来源 · 时间」；置顶标记常显，置顶 / 删除只在 hover 或键盘聚焦时出现。
 * 点击整行复制并 toast 反馈，不再放详情弹层与页脚说明。
 */
export function ClipboardSection() {
  const snapshot = useClipboardStore((state) => state.snapshot);
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

  async function handleCopy(id: string) {
    await copy(id);
    // copy 会把结果写回 store：失败时 error 非空，这时不报「已复制」。
    if (useClipboardStore.getState().error) return;
    setCopiedId(id);
    toast.success("已复制到剪贴板");
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      copyTimerRef.current = null;
      setCopiedId(null);
    }, 1400);
  }

  return (
    <PageShell>
      <PageHeader
        title="内容"
        actions={
          <div className="dsl-action-group">
            <span className="px-2.5 text-[12.5px] leading-none text-muted-foreground tabular-nums">
              {formatClipboardCount(items.length, snapshot?.maxItems)}
            </span>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={items.length === 0}
              onClick={() => setConfirmOpen(true)}
            >
              清空
            </Button>
          </div>
        }
      />

      <PageBody>
        <div className="dsl-search">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索"
            aria-label="搜索剪贴板"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <ListGroup>
          <ListRow
            title="记录剪贴板"
            control={
              <Switch
                aria-label="记录剪贴板"
                checked={enabled}
                onCheckedChange={(value) => void setEnabled(value)}
              />
            }
          />
          <ListRow title="密码框与隐藏内容" meta="不记录" />
        </ListGroup>

        {error && (
          <p role="alert" className="px-1 text-[12px] leading-[1.4] text-destructive">
            {error}
          </p>
        )}

        <ListGroup>
          {filtered.length === 0 ? (
            <ListEmpty>{query.trim() ? "没有匹配的内容" : "还没有记录"}</ListEmpty>
          ) : (
            filtered.map((item) => (
              <ClipboardRow
                key={item.id}
                item={item}
                copied={copiedId === item.id}
                onCopy={() => void handleCopy(item.id)}
                onTogglePin={() => void togglePin(item.id)}
                onRemove={() => void remove(item.id)}
              />
            ))
          )}
        </ListGroup>
      </PageBody>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>清空剪贴板历史？</DialogTitle>
            <DialogDescription>所有记录（包括置顶）都会被删除，不能恢复。</DialogDescription>
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
    </PageShell>
  );
}

/**
 * 一行记录：整行点按复制；右侧常显置顶 / 已复制标记，动作在 hover 与聚焦时淡入上浮。
 *
 * 按压缩放交给 Motion（`whileTap`），✓ 用 spring 弹出；prefers-reduced-motion 下只保留结果。
 */
function ClipboardRow({
  item,
  copied,
  onCopy,
  onTogglePin,
  onRemove,
}: {
  item: ClipboardItem;
  copied: boolean;
  onCopy: () => void;
  onTogglePin: () => void;
  onRemove: () => void;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="dsl-row group gap-2.5 hover:bg-accent"
      style={{ transitionProperty: "background-color" }}
      whileTap={reduced ? undefined : { scale: 0.985 }}
      transition={reduced ? { duration: 0 } : SPRING_SLIDE}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-sm text-left outline-none"
        onClick={onCopy}
        title={item.text}
      >
        <span className="truncate text-[14px] leading-tight font-normal text-foreground">
          {item.text}
        </span>
        <span className="truncate text-[12px] leading-tight text-muted-foreground">
          {formatClipboardKind(item.kind)} · {formatRelativeTime(item.lastUsedAt)}
        </span>
      </button>

      {copied ? (
        <motion.span
          data-copied="true"
          className="flex shrink-0 items-center text-signal"
          initial={reduced ? false : { opacity: 0, scale: 0.55 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduced ? { duration: 0 } : SPRING_POP}
        >
          <Check aria-hidden="true" className="size-4" />
          <span className="sr-only">已复制</span>
        </motion.span>
      ) : item.pinned ? (
        // 悬停 / 聚焦时让位给「取消置顶」按钮，避免同一行出现两个图钉。
        <span className="flex shrink-0 items-center text-signal group-focus-within:hidden group-hover:hidden">
          <Pin aria-hidden="true" className="size-3.5 fill-current" />
          <span className="sr-only">已置顶</span>
        </span>
      ) : null}

      <span className="flex shrink-0 translate-y-0.5 items-center gap-0.5 opacity-0 transition-[opacity,transform] duration-150 ease-out group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={item.pinned ? "取消置顶" : "置顶"}
          onClick={onTogglePin}
        >
          <Pin aria-hidden="true" className={cn("size-3.5", item.pinned && "fill-current")} />
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="icon-xs"
          aria-label="删除这条"
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
        </Button>
      </span>
    </motion.div>
  );
}
