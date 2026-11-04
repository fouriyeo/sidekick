import { ChevronDown, ChevronUp, RefreshCw, RotateCw } from "lucide-react";
import { useState } from "react";
import { ChatPanel } from "@/mobile/features/chat/components/chat-panel";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useConnectionView, useRetryCountdown } from "@/mobile/features/connect/connection-view";
import { MobilePage } from "@/mobile/shell/page";
import { PageHeader } from "@/mobile/shell/page-header";
import { useUiStore } from "@/mobile/ui-store";
import { Input } from "@/shared/ui/input";
import { SignalBars } from "@/shared/ui/signal-bars";

/**
 * 消息页：和电脑互发的调试通道。
 *
 * 连接排障只留一个顶部 chip + 断连折叠块（倒计时 / 立即重连 / 重新搜索 /
 * 手动地址 / 扫码 / 打开连接页）；未连接时输入框禁用并给「去连接」。
 */
export function ChatPage() {
  const status = useConnectionStore((state) => state.status);
  const addr = useConnectionStore((state) => state.addr);
  const discovering = useConnectionStore((state) => state.discovering);
  const retrying = useConnectionStore((state) => state.retrying);
  const retryAttempt = useConnectionStore((state) => state.retryAttempt);
  const retryAt = useConnectionStore((state) => state.retryAt);
  const error = useConnectionStore((state) => state.error);
  const setAddr = useConnectionStore((state) => state.setAddr);
  const connect = useConnectionStore((state) => state.connect);
  const discover = useConnectionStore((state) => state.discover);
  const retryNow = useConnectionStore((state) => state.retryNow);
  const setView = useUiStore((state) => state.setView);
  const openOffline = useUiStore((state) => state.openOffline);
  const setScanOpen = useUiStore((state) => state.setScanOpen);
  const connection = useConnectionView();
  const retrySeconds = useRetryCountdown(retryAt);

  const connected = status === "connected";
  const connecting = status === "connecting";
  const [manualOpen, setManualOpen] = useState(false);

  function handleConnect() {
    if (!addr.trim() || connecting) return;
    void connect(addr);
  }

  return (
    <MobilePage aria-label="消息">
      <PageHeader
        title="消息"
        sub="局域网直连"
        onBack={() => setView("pet")}
        backLabel="返回宠物"
        right={<SignalBars level={connection.level} tone={connection.tone} />}
      />

      <div className="px-3 pb-1">
        <button
          type="button"
          aria-label={`连接状态：${connection.label}，点按打开连接页`}
          className="flex min-h-11 w-full items-center gap-2 rounded-[12px] border border-border bg-card px-3 text-left"
          onClick={openOffline}
        >
          <SignalBars level={connection.level} tone={connection.tone} />
          <span className="shrink-0 text-xs font-medium text-foreground">{connection.label}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
            {connection.detail ?? (addr || "局域网直连")}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">连接设置</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        {!connected && (
          <details className="group mb-2 rounded-[14px] border border-border bg-card open:pb-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3">
              <SignalBars level={connection.level} tone={connection.tone} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {retrying ? "连接断了，正在重连" : "连接断了，先连接再发消息"}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">连接设置</span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground group-open:hidden"
              />
              <ChevronUp
                aria-hidden="true"
                className="hidden size-4 shrink-0 text-muted-foreground group-open:block"
              />
            </summary>

            <div className="border-t border-border px-3 py-2.5">
              <p
                role="status"
                aria-live="polite"
                className="font-mono text-[10.5px] text-muted-foreground"
              >
                {retrying
                  ? `正在自动重连（第 ${retryAttempt} 次）…`
                  : retrySeconds !== null
                    ? `${retrySeconds} 秒后自动重连（第 ${retryAttempt} 次）`
                    : "自动重连已开启，切后台会暂停。"}
              </p>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {!retrying && (
                  <button
                    type="button"
                    className="flex min-h-11 items-center gap-1 rounded-[10px] border border-border px-2.5 text-xs font-medium text-signal"
                    onClick={retryNow}
                  >
                    <RotateCw aria-hidden="true" className="size-3.5" />
                    立即重连
                  </button>
                )}
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-1 rounded-[10px] border border-border px-2.5 text-xs font-medium text-foreground disabled:opacity-40"
                  disabled={discovering || retrying}
                  onClick={() => void discover()}
                >
                  <RefreshCw aria-hidden="true" className="size-3.5" />
                  重新搜索
                </button>
              </div>

              <button
                type="button"
                aria-expanded={manualOpen}
                className="mt-1 flex min-h-11 items-center font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase"
                onClick={() => setManualOpen((open) => !open)}
              >
                手动输入地址
              </button>
              {manualOpen && (
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleConnect();
                  }}
                >
                  <Input
                    aria-label="电脑地址"
                    placeholder="如 192.168.1.5:47810"
                    value={addr}
                    onChange={(event) => setAddr(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-11 flex-1 rounded-[12px] font-mono text-[15px]"
                  />
                  <button
                    type="submit"
                    className="flex min-h-11 shrink-0 items-center rounded-[12px] bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    disabled={!addr.trim() || connecting}
                  >
                    连接
                  </button>
                </form>
              )}

              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  className="flex min-h-11 items-center font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase"
                  onClick={() => setScanOpen(true)}
                >
                  扫电脑上的二维码
                </button>
                <button
                  type="button"
                  className="flex min-h-11 items-center font-mono text-[10px] tracking-[0.06em] text-muted-foreground uppercase"
                  onClick={openOffline}
                >
                  打开连接页
                </button>
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-1 text-xs leading-relaxed break-words text-destructive"
                >
                  {error}
                </p>
              )}
            </div>
          </details>
        )}

        <ChatPanel disabled={!connected} onOpenConnection={openOffline} />
      </div>
    </MobilePage>
  );
}
