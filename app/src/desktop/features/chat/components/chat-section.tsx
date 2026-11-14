import { cn } from "cn";
import { motion, useReducedMotion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { DesktopConnectionStatus } from "@/desktop/lib/connection-status";
import type { ServerInfo } from "@/protocol/messages";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { type ChatKind, useChatStore } from "../chat-store";

/** 我方 = 薄荷实心；对方 = 白卡；系统事件 = 居中小字（iOS Messages 观感）。 */
const BUBBLE_CLASS: Record<ChatKind, string> = {
  me: "self-end rounded-[20px] rounded-br-[6px] bg-primary text-primary-foreground",
  them: "self-start rounded-[20px] rounded-bl-[6px] bg-card text-foreground shadow-[var(--card-shadow)]",
  system: "self-center py-0.5 text-center text-[13px] text-muted-foreground",
};

const BUBBLE_TEXT =
  "max-w-[76%] px-4 py-2.5 text-[15px] leading-[1.45] break-words whitespace-pre-wrap";

/** 气泡入场：淡入 + 8px 上浮 + scale .98，160ms。 */
const BUBBLE_ENTER = { duration: 0.16, ease: [0.2, 0.9, 0.25, 1] } as const;

type ChatSectionProps = {
  onSend: (text: string) => boolean;
  info: ServerInfo | null;
  status: DesktopConnectionStatus;
  onOpenConnection: () => void;
};

/**
 * 设置 › 消息通道：一张聊天卡，上面是往来消息，底部是玻璃胶囊输入栏。
 *
 * 发送后由服务端广播回显，不在本地追加；系统事件退成居中小字；
 * 新气泡用 Motion 入场（reduce-motion 时直接出现），列表保持跟手滚动。
 */
export function ChatSection({ onSend, info, status, onOpenConnection }: ChatSectionProps) {
  // info 仅为保持 settings-page 的 props 签名；新界面不再需要。
  void info;

  const messages = useChatStore((state) => state.messages);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLUListElement | null>(null);
  const connected = status === "connected";
  const reduced = useReducedMotion();

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
    <div className="relative flex h-[calc(100vh-210px)] min-h-[320px] flex-col">
      <ul
        ref={listRef}
        aria-live="polite"
        aria-label="聊天消息"
        className="flex min-h-0 flex-1 list-none flex-col gap-2 overflow-y-auto px-1 pt-1 pb-28"
      >
        {messages.length === 0 ? (
          <li className="flex flex-1 flex-col items-center justify-center gap-1 text-[13px] text-muted-foreground">
            <span>还没有消息</span>
            {!connected && (
              <Button type="button" variant="ghost" size="sm" onClick={onOpenConnection}>
                打开连接设置
              </Button>
            )}
          </li>
        ) : (
          messages.map((message) => (
            <motion.li
              key={message.id}
              // 左右位置与底色之外，再用 aria-label 说明消息来自哪一侧。
              aria-label={
                message.kind === "me"
                  ? "我发出的消息"
                  : message.kind === "them"
                    ? "对方消息"
                    : undefined
              }
              initial={reduced ? false : { opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={reduced ? { duration: 0 } : BUBBLE_ENTER}
              className={cn(
                message.kind === "system" ? BUBBLE_CLASS.system : BUBBLE_TEXT,
                message.kind === "system" ? undefined : BUBBLE_CLASS[message.kind],
              )}
            >
              {message.text}
            </motion.li>
          ))
        )}
      </ul>

      {/* 玻璃输入栏浮在消息之上：气泡从下面滚过时才有材质感（玻璃只做控件层）。 */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3">
        <form
          className="dsl-glass pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4"
          onSubmit={handleSubmit}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={connected ? "输入消息" : "服务未连接"}
            aria-label="消息内容"
            autoComplete="off"
            disabled={!connected}
            className="min-w-0 flex-1"
          />
          <Button type="submit" size="sm" className="shrink-0" disabled={!connected}>
            发送
          </Button>
        </form>
      </div>
    </div>
  );
}
