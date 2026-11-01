import { useCallback, useEffect } from "react";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { ChatView } from "@/mobile/features/chat/components/chat-view";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { PetSettings } from "@/mobile/features/pet/pet-settings";
import { PetStage } from "@/mobile/features/pet/pet-stage";
import { useUiStore } from "@/mobile/ui-store";
import { parseMessage, parseMicMessage } from "@/protocol/messages";
import { subscribeChat, subscribeConn } from "@/shared/lib/tauri";

export function MobileApp() {
  const append = useChatStore((state) => state.append);
  const bootstrap = useConnectionStore((state) => state.bootstrap);
  const setOnline = useConnectionStore((state) => state.setOnline);
  const view = useUiStore((state) => state.view);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const setView = useUiStore((state) => state.setView);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);

  // 启动即自动搜索电脑：不需要用户输入 IP 或扫码；搜索不到就进入自动重连。
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // App 切后台时暂停自动重连排期，回前台立即重试一次（熄屏期间计时器会被系统冻结）。
  useEffect(() => {
    const onVisibilityChange = () => {
      const connection = useConnectionStore.getState();
      if (document.hidden) connection.pauseRetry();
      else connection.resumeRetry();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const unsubscribeChat = subscribeChat((raw) => {
      const micMessage = parseMicMessage(raw);
      if (micMessage) {
        const store = useMicStore.getState();
        if (micMessage.type === "mic.result") store.handleResult(micMessage);
        else if (micMessage.type === "mic.state") store.handleState(micMessage);
        else if (micMessage.type === "mic.error") store.handleError(micMessage);
        return;
      }

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
