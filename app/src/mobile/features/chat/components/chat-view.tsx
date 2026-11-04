import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { ConnectionBar } from "@/mobile/features/connect/components/connection-bar";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { pushBackHandler } from "@/mobile/system-back";
import { Button } from "@/shared/ui/button";
import { SignalDot } from "@/shared/ui/signal-dot";
import { ChatPanel } from "./chat-panel";

type ChatViewProps = {
  onBack: () => void;
  onError?: (message: string) => void;
};

/**
 * 聊天页（方向 B · 海玻璃）。
 * 页面跟随全局主题：浅色时是海玻璃浅页面，深色时是深海。
 */
export function ChatView({ onBack, onError }: ChatViewProps) {
  const status = useConnectionStore((state) => state.status);
  const connected = status === "connected";

  // 聊天页有上一层（宠物舞台），消费返回键回到宠物，而不是让根页面走退出确认。
  useEffect(
    () =>
      pushBackHandler(() => {
        onBack();
        return true;
      }),
    [onBack],
  );

  return (
    <section className="fixed inset-0 z-40 flex h-dvh flex-col overflow-hidden bg-background px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+16px)] text-foreground">
      <header className="flex min-h-11 shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="返回宠物"
          className="size-11 shrink-0 rounded-full border border-border text-muted-foreground hover:bg-wash hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="truncate text-sm font-medium tracking-[-0.01em]">与电脑聊天</span>
          <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
            CHAT · 局域网直连
          </span>
        </div>
        <span className="flex size-11 shrink-0 items-center justify-center">
          <SignalDot status={connected ? "connected" : "idle"} />
        </span>
      </header>
      <ConnectionBar onError={onError} />
      <ChatPanel />
    </section>
  );
}
