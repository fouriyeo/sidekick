import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { ChatView } from "@/mobile/features/chat/components/chat-view";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { PetSettings } from "@/mobile/features/pet/pet-settings";
import { PetStage } from "@/mobile/features/pet/pet-stage";
import { handleBack } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import { parseMessage, parseMicMessage } from "@/protocol/messages";
import { exitApp, subscribeBackButton, subscribeChat, subscribeConn } from "@/shared/lib/tauri";

/** 根页面「再按一次退出」的确认窗口。 */
const EXIT_HINT_MS = 2000;

export function MobileApp() {
  const append = useChatStore((state) => state.append);
  const bootstrap = useConnectionStore((state) => state.bootstrap);
  const setOnline = useConnectionStore((state) => state.setOnline);
  const view = useUiStore((state) => state.view);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const setView = useUiStore((state) => state.setView);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);

  // 根页面返回键：第一次提示「再按一次退出」，2 秒内第二次才真正退出。
  const [exitHintVisible, setExitHintVisible] = useState(false);
  const exitArmedRef = useRef(false);
  const exitHintTimerRef = useRef<number | null>(null);

  const clearExitHint = useCallback(() => {
    exitArmedRef.current = false;
    setExitHintVisible(false);
    if (exitHintTimerRef.current !== null) {
      window.clearTimeout(exitHintTimerRef.current);
      exitHintTimerRef.current = null;
    }
  }, []);

  const armExitHint = useCallback(() => {
    exitArmedRef.current = true;
    setExitHintVisible(true);
    if (exitHintTimerRef.current !== null) window.clearTimeout(exitHintTimerRef.current);
    exitHintTimerRef.current = window.setTimeout(() => {
      exitHintTimerRef.current = null;
      exitArmedRef.current = false;
      setExitHintVisible(false);
    }, EXIT_HINT_MS);
  }, []);

  // App 启动时注册唯一的返回键监听；设置页/聊天页通过返回栈优先消费。
  const onSystemBack = useCallback(() => {
    if (handleBack()) {
      clearExitHint();
      return;
    }

    if (exitArmedRef.current) {
      void exitApp().catch((error: unknown) => {
        console.warn("[back] 退出失败，保持在前台：", error);
      });
      return;
    }

    armExitHint();
  }, [armExitHint, clearExitHint]);

  useEffect(() => subscribeBackButton(() => onSystemBack()), [onSystemBack]);

  // 进入聊天/设置后立刻收起退出提示，避免提示和当前界面错位。
  useEffect(() => {
    if (view !== "pet" || settingsOpen) clearExitHint();
  }, [clearExitHint, settingsOpen, view]);

  // 卸载时只清计时器，不再 setState。
  useEffect(
    () => () => {
      if (exitHintTimerRef.current !== null) {
        window.clearTimeout(exitHintTimerRef.current);
        exitHintTimerRef.current = null;
      }
      exitArmedRef.current = false;
    },
    [],
  );

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

  const openChat = useCallback(() => setView("chat"), [setView]);
  const closeChat = useCallback(() => setView("pet"), [setView]);
  const openSettings = useCallback(() => setSettingsOpen(true), [setSettingsOpen]);
  const closeSettings = useCallback(() => setSettingsOpen(false), [setSettingsOpen]);

  return (
    <>
      <PetStage
        active={view === "pet" && !settingsOpen}
        onOpenChat={openChat}
        onOpenSettings={openSettings}
      />
      {view === "chat" && <ChatView onBack={closeChat} onError={appendSystem} />}
      <PetSettings open={settingsOpen} onClose={closeSettings} />
      {exitHintVisible && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+112px)] left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg"
        >
          再按一次退出
        </div>
      )}
    </>
  );
}
