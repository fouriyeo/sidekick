import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { normalizeError, sendChat } from "@/shared/lib/tauri";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { useChatStore } from "../chat-store";

export function ChatPanel() {
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
    if (!text || sending) return;

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
      <ul
        ref={listRef}
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1"
      >
        {messages.map((message) => (
          <li
            key={message.id}
            className={cn(
              "max-w-[82%] rounded-2xl px-3 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap",
              message.kind === "me" && "self-end rounded-br-sm bg-primary text-primary-foreground",
              message.kind === "them" &&
                "self-start rounded-bl-sm bg-secondary text-secondary-foreground",
              message.kind === "system" &&
                "self-center rounded-none bg-transparent px-1 text-center text-xs text-muted-foreground",
            )}
          >
            {message.text}
          </li>
        ))}
      </ul>

      <p className="shrink-0 py-2 text-center text-xs leading-relaxed text-muted-foreground">
        电脑连上后，在这里发消息；同一 Wi-Fi 下手机打开 App 会自动发现电脑。
      </p>

      <form
        className="flex shrink-0 gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          aria-label="消息内容"
          placeholder="给电脑发条消息…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          autoComplete="off"
          enterKeyHint="send"
          className="h-11 flex-1 text-[15px]"
        />
        <Button type="submit" size="lg" className="h-11 px-4" disabled={!draft.trim() || sending}>
          发送
        </Button>
      </form>
    </section>
  );
}
