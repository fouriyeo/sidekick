import { cn } from "cn";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { type ChatKind, useChatStore } from "../chat-store";

const BUBBLE_CLASS: Record<ChatKind, string> = {
  me: "self-end rounded-[14px] rounded-br-[4px] bg-primary text-primary-foreground",
  them: "self-start rounded-[14px] rounded-bl-[4px] bg-secondary text-secondary-foreground",
  system: "self-center bg-transparent px-0.5 py-0.5 text-xs text-muted-foreground",
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
    <section className="flex min-h-0 min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <ul
        ref={listRef}
        aria-live="polite"
        aria-label="聊天消息"
        className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto p-0"
      >
        {messages.map((message) => (
          <li
            key={message.id}
            className={cn(
              "max-w-[70%] px-3 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap",
              BUBBLE_CLASS[message.kind],
            )}
          >
            {message.text}
          </li>
        ))}
      </ul>

      <form className="flex gap-2" onSubmit={handleSubmit}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="给手机发条消息…"
          aria-label="消息内容"
          autoComplete="off"
          className="h-11 flex-1 rounded-[10px] text-sm"
        />
        <Button type="submit" className="h-11 shrink-0 px-4">
          发送
        </Button>
      </form>
    </section>
  );
}
