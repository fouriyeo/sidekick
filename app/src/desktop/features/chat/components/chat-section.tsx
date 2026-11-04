import { cn } from "cn";
import { MessageCircle, Radio, Terminal } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/desktop/components/empty-state";
import type { DesktopConnectionStatus } from "@/desktop/lib/connection-status";
import {
  deviceCountFromClients,
  useDesktopClientsStore,
} from "@/desktop/lib/desktop-clients-store";
import { Card, CardHint, MetaRow } from "@/desktop/shell/card";
import { StateTag } from "@/desktop/shell/page-chips";
import type { ServerInfo } from "@/protocol/messages";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { type ChatKind, useChatStore } from "../chat-store";

const BUBBLE_CLASS: Record<ChatKind, string> = {
  // 我方 = 薄荷水膜 + 1px 信号边；对方 = 水面；系统 = 居中小字。
  me: "self-end rounded-[14px] rounded-br-[4px] border border-signal bg-wash text-foreground",
  them: "self-start rounded-[14px] rounded-bl-[4px] border border-border bg-popover text-foreground",
  system: "self-center px-0.5 py-0.5 text-xs text-muted-foreground",
};

type ChatSectionProps = {
  onSend: (text: string) => boolean;
  info: ServerInfo | null;
  status: DesktopConnectionStatus;
  onOpenOverview: () => void;
  onOpenConnection: () => void;
};

/**
 * 系统 › 消息：电脑与手机之间的往来消息与系统事件。
 *
 * 定位是「通道调试」，不是主工作区；桌面日常看总览，手机日常在宠物/动态。
 * 发送后由服务端广播回显，不在本地追加。
 */
export function ChatSection({
  onSend,
  info,
  status,
  onOpenOverview,
  onOpenConnection,
}: ChatSectionProps) {
  const messages = useChatStore((state) => state.messages);
  const clients = useDesktopClientsStore((state) => state.clients);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLUListElement | null>(null);
  const connected = status === "connected";
  const devices = deviceCountFromClients(clients);

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
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pr-0.5 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,1fr)]">
      <section className="flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-card lg:min-h-0">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3.5 py-2.5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-[13px] leading-tight font-semibold">
              <MessageCircle aria-hidden="true" className="size-3.5 text-muted-foreground" />
              今天 · 局域网直连
            </h2>
            <p className="mt-0.5 font-mono text-[9px] tracking-[0.13em] text-muted-foreground uppercase">
              {messages.length} 条 · 通道调试
            </p>
          </div>
          <StateTag
            label={connected ? "通道正常" : "服务未连接"}
            tone={connected ? "signal" : "muted"}
          />
        </header>

        <ul
          ref={listRef}
          aria-live="polite"
          aria-label="聊天消息"
          className="flex min-h-0 list-none flex-col gap-3 overflow-y-auto p-3.5 lg:flex-1"
        >
          {messages.length === 0 ? (
            <li className="flex flex-1 items-center justify-center">
              <EmptyState
                icon={<MessageCircle className="size-4" />}
                title="还没有往来消息"
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
          className="flex shrink-0 gap-2 border-t border-border px-3.5 py-2.5"
          onSubmit={handleSubmit}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={connected ? "给手机发条消息…" : "服务没连上，先恢复连接"}
            aria-label="消息内容"
            autoComplete="off"
            disabled={!connected}
            className="h-9 flex-1 rounded-[10px] bg-popover text-sm"
          />
          <Button type="submit" size="sm" className="h-9 shrink-0 px-4" disabled={!connected}>
            发送
          </Button>
        </form>
      </section>

      <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
        <Card
          title={
            <>
              <Radio aria-hidden="true" />
              通道状态
            </>
          }
          subtitle={`CHANNEL · WS ${info?.port ?? "…"}`}
          pill={
            <StateTag
              label={connected ? "通道正常" : "服务未连接"}
              tone={connected ? "signal" : "muted"}
            />
          }
        >
          <MetaRow label="WebSocket" value="/ws" mono />
          <MetaRow label="本机端口" value={info ? `${info.port}` : "…"} mono />
          <MetaRow
            label="客户端"
            value={clients !== null ? `${clients} 个（含本机窗口）` : "—"}
            mono
          />
          <MetaRow label="手机设备" value={`${devices} 台（近似值）`} mono />
          <MetaRow label="通道状态" value={connected ? "已连接" : "未连接"} />
        </Card>

        <Card
          title={
            <>
              <Terminal aria-hidden="true" />
              这是调试通道
            </>
          }
          subtitle="NOT THE MAIN SURFACE"
          className="shrink-0"
          footer={
            <>
              <CardHint>发送后由服务端广播回显，两端都能收到。</CardHint>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={onOpenOverview}>
                  打开总览
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onOpenConnection}>
                  连接设置
                </Button>
              </div>
            </>
          }
        >
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            消息页只负责通道调试与系统事件。电脑端日常看「总览」，手机端日常在「宠物 / 动态」。
          </p>
          <CardHint>语音转写、AI 状态与连接变化都会在「消息」里留下系统记录。</CardHint>
        </Card>
      </div>
    </div>
  );
}
