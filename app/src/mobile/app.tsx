import { useCallback, useEffect } from "react";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { ChatView } from "@/mobile/features/chat/components/chat-view";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { PetSettings } from "@/mobile/features/pet/pet-settings";
import { PetStage } from "@/mobile/features/pet/pet-stage";
import { useUiStore } from "@/mobile/ui-store";
import { parseMessage } from "@/protocol/messages";
import { subscribeChat, subscribeConn } from "@/shared/lib/tauri";

export function MobileApp() {
  const append = useChatStore((state) => state.append);
  const hydrateAddr = useConnectionStore((state) => state.hydrateAddr);
  const setOnline = useConnectionStore((state) => state.setOnline);
  const view = useUiStore((state) => state.view);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const setView = useUiStore((state) => state.setView);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);

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
    <>
      <PetStage
        active={view === "pet" && !settingsOpen}
        onOpenChat={() => setView("chat")}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {view === "chat" && <ChatView onBack={() => setView("pet")} onError={appendSystem} />}
      <PetSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
