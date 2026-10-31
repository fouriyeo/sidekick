import { useCallback, useEffect } from "react";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { ChatPanel } from "@/mobile/features/chat/components/chat-panel";
import { ConnectionBar } from "@/mobile/features/connect/components/connection-bar";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { parseMessage } from "@/protocol/messages";
import { subscribeChat, subscribeConn } from "@/shared/lib/tauri";

export function MobileApp() {
  const append = useChatStore((state) => state.append);
  const hydrateAddr = useConnectionStore((state) => state.hydrateAddr);
  const setOnline = useConnectionStore((state) => state.setOnline);

  useEffect(() => {
    hydrateAddr();
  }, [hydrateAddr]);

  useEffect(() => {
    const unsubscribeChat = subscribeChat((raw) => {
      const parsed = parseMessage(raw, "phone");
      if (parsed) append(parsed.kind, parsed.text);
    });
    const unsubscribeConn = subscribeConn((event) => {
      setOnline(event.online);
    });

    return () => {
      unsubscribeChat();
      unsubscribeConn();
    };
  }, [append, setOnline]);

  const appendSystem = useCallback(
    (message: string) => {
      append("system", message);
    },
    [append],
  );

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+16px)] text-foreground">
      <ConnectionBar onError={appendSystem} />
      <ChatPanel />
    </main>
  );
}
