import { cn } from "cn";
import { MessageCircle } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/desktop/components/empty-state";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { type ChatKind, useChatStore } from "../chat-store";

const BUBBLE_CLASS: Record<ChatKind, string> = {
  // 我方 = 薄荷水膜 + 1px 信号边；对方 = 水面；系统 = 居中小字。
  me: "self-end rounded-[14px] rounded-br-[4px] border border-signal bg-wash text-foreground",
  them: "self-start rounded-[14px] rounded-bl-[4px] border border-border bg-popover text-foreground",
  system: "self-center px-0.5 py-0.5 text-xs text-muted-foreground",
};

type ChatPanelProps = {
  onSend: (text: string) => boolean;
};

export function ChatPanel({ onSend }: ChatPanelProps) {
  const messages = useChatStore((state) => state.messages);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || messages.length === 0) return;
    if (typeof list.scrollTo === "function") {
      list.scrollTo({ top: list.scrollHeight });
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    if (onSend(text)) setDraft("");
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border bg-card">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="size-4 text-muted-foreground" />
          聊天
        </h2>
        <span className="shrink-0 font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
          Chat · 局域网直连
        </span>
      </header>

      <ul
        ref={listRef}
        aria-live="polite"
        aria-label="聊天消息"
        className="flex min-h-0 flex-1 list-none flex-col gap-3 overflow-y-auto p-6"
      >
        {messages.length === 0 ? (
          <li className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<MessageCircle className="size-4" />}
              title="还没有消息"
              description="在手机上按住说话，或在这里输入一句话，两边都会收到。"
            />
          </li>
        ) : (
          <>
            <li
              aria-hidden="true"
              className="self-center font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase"
            >
              今天 · 局域网直连
            </li>
            {messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  "max-w-[78%] px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap",
                  BUBBLE_CLASS[message.kind],
                )}
              >
                {message.text}
              </li>
            ))}
          </>
        )}
      </ul>

      <form
        className="flex shrink-0 gap-2 border-t border-border px-6 py-4"
        onSubmit={handleSubmit}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="给手机发条消息…"
          aria-label="消息内容"
          autoComplete="off"
          className="h-11 flex-1 rounded-[10px] bg-popover text-sm"
        />
        <Button type="submit" className="h-11 shrink-0 px-5">
          发送
        </Button>
      </form>
    </section>
  );
}
