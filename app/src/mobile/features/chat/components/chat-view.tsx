import { ArrowLeft } from "lucide-react";
import { ConnectionBar } from "@/mobile/features/connect/components/connection-bar";
import { Button } from "@/shared/ui/button";
import { ChatPanel } from "./chat-panel";

type ChatViewProps = {
  onBack: () => void;
  onError?: (message: string) => void;
};

export function ChatView({ onBack, onError }: ChatViewProps) {
  return (
    <section className="fixed inset-0 z-40 flex h-dvh flex-col overflow-hidden bg-background px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+16px)] text-foreground">
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="返回宠物"
          className="size-11 rounded-full"
          onClick={onBack}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <span className="text-sm text-muted-foreground">与电脑聊天</span>
      </div>
      <ConnectionBar onError={onError} />
      <ChatPanel />
    </section>
  );
}
