import { cn } from "cn";
import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { normalizeError, sendChat } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useChatStore } from "../chat-store";

/**
 * 聊天流 + 输入区（方向 B · 海玻璃）。
 *
 * 我方气泡 = 薄荷水膜（--wash）+ 1px 信号边；对方 = 水面（--popover）；
 * 系统提示 = 居中 mono 读数。输入与发送保持 44px 触控高度。
 */
type ChatPanelProps = {
  /** 未连接：输入框禁用并给「去连接」，避免在断线时静默吞消息。 */
  disabled?: boolean;
  onOpenConnection?: () => void;
};

export function ChatPanel({ disabled = false, onOpenConnection }: ChatPanelProps) {
  const messages = useChatStore((state) => state.messages);
  const append = useChatStore((state) => state.append);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || messages.length === 0) return;
    list.scrollTop = list.scrollHeight;
  }, [messages]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending || disabled) return;

    setSending(true);
    try {
      await sendChat(text);
      setDraft("");
    } catch (error) {
      append("system", normalizeError(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mt-3 flex min-h-0 flex-1 flex-col">
      {messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full border border-border bg-card text-signal"
          >
            <MessageCircle className="size-6" />
          </span>
          <span className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            NO SIGNAL
          </span>
          <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-foreground">还没有消息</p>
          <p className="mt-1 max-w-[280px] text-xs leading-relaxed text-muted-foreground">
            这个页面是和电脑互发的调试通道；日常请用宠物页按住说话。
          </p>
        </div>
      ) : (
        <ul
          ref={listRef}
          aria-live="polite"
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1"
        >
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "max-w-[82%] rounded-[14px] border px-3.5 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap",
                message.kind === "me" &&
                  "self-end rounded-br-[4px] border-signal bg-wash text-foreground",
                message.kind === "them" &&
                  "self-start rounded-bl-[4px] border-border bg-popover text-foreground",
                message.kind === "system" &&
                  "max-w-none self-center border-transparent bg-transparent px-1 font-mono text-[10.5px] tracking-[0.06em] text-muted-foreground",
              )}
            >
              {message.text}
            </li>
          ))}
        </ul>
      )}

      {disabled && (
        <div className="mt-2 flex shrink-0 items-center gap-2 rounded-[10px] border border-border bg-card px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            还没连上电脑，先连接
          </span>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-[10px] px-2 text-xs font-medium text-signal"
            onClick={onOpenConnection}
          >
            去连接
          </button>
        </div>
      )}

      <form
        className="mt-2 flex shrink-0 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          aria-label="消息内容"
          placeholder={disabled ? "先连接电脑…" : "给电脑发条消息…"}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          autoComplete="off"
          enterKeyHint="send"
          disabled={disabled}
          className="h-11 flex-1 rounded-[12px] border-input bg-popover text-[15px]"
        />
        <Button
          type="submit"
          size="lg"
          className="h-11 rounded-[12px] px-4"
          disabled={disabled || !draft.trim() || sending}
        >
          发送
        </Button>
      </form>
    </section>
  );
}
