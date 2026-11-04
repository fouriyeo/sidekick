import { useCallback, useEffect, useRef, useState } from "react";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { ChatView } from "@/mobile/features/chat/components/chat-view";
import { ScanView } from "@/mobile/features/connect/components/scan-view";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { PetSettings } from "@/mobile/features/pet/pet-settings";
import { PetStage } from "@/mobile/features/pet/pet-stage";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import { useKeepAwake } from "@/mobile/features/pet/use-keep-awake";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { handleBack } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import {
  parseFocusResult,
  parseKeyResult,
  parseMessage,
  parseMicMessage,
  parseStatusMessage,
} from "@/protocol/messages";
import { useMotionPause } from "@/shared/hooks/use-motion-pause";
import {
  disableWebviewHaptics,
  exitApp,
  sendStatusRequest,
  subscribeBackButton,
  subscribeChat,
  subscribeConn,
} from "@/shared/lib/tauri";

/** 根页面「再按一次退出」的确认窗口。 */
const EXIT_HINT_MS = 2000;

/** 录音链路是否占用麦克风（录音中 AI 提示音/触感静音）。 */
function micListeningNow(): boolean {
  const phase = useMicStore.getState().phase;
  return phase === "arming" || phase === "listening" || phase === "processing";
}

/** 连接中/重连成功、回前台时向电脑要一次当前 AI 状态快照。 */
function requestStatusIfConnected(): void {
  if (useConnectionStore.getState().status === "connected") {
    void sendStatusRequest().catch(() => undefined);
  }
}

export function MobileApp() {
  const append = useChatStore((state) => state.append);
  const bootstrap = useConnectionStore((state) => state.bootstrap);
  const setOnline = useConnectionStore((state) => state.setOnline);
  const view = useUiStore((state) => state.view);
  const settingsOpen = useUiStore((state) => state.settingsOpen);
  const scanOpen = useUiStore((state) => state.scanOpen);
  const setView = useUiStore((state) => state.setView);
  const setSettingsOpen = useUiStore((state) => state.setSettingsOpen);
  const setScanOpen = useUiStore((state) => state.setScanOpen);
  const keepAwake = usePetStore((state) => state.pet.settings.keepAwake);
  const keepAwakeHours = usePetStore((state) => state.pet.settings.keepAwakeHours);
  const keepAwakeMs = keepAwakeHours > 0 ? keepAwakeHours * 60 * 60 * 1000 : null;

  useMotionPause();

  // 宠物页在前台（含设置弹层）时屏幕常亮；聊天页与后台交给系统默认熄屏。
  // 常亮默认最多 2 小时，到点释放，避免放桌边整夜耗电（设置页可调，0 = 不限）。
  useKeepAwake(keepAwake && view === "pet", keepAwakeMs);

  // 触感统一由 App 管：先关掉 WebView 自带的长按震动（文本选择/上下文菜单），
  // 再按需用原生 `haptic` 命令触发；失败静默降级，不影响界面。
  useEffect(() => {
    void disableWebviewHaptics().catch(() => undefined);
  }, []);

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

  // 启动即自动搜索电脑；搜索不到进入自动重连。企业网等广播被丢弃的网络下发现会恒为 0 台，
  // 用户可在聊天页手动输入地址或扫电脑上的二维码。
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // 会话清除标记只存在本机；水合完成前面板不渲染，避免已清除的会话闪一下。
  useEffect(() => {
    void useSessionStore.getState().hydrate();
  }, []);

  // App 切后台时暂停自动重连排期，回前台立即重试一次（熄屏期间计时器会被系统冻结）。
  useEffect(() => {
    const onVisibilityChange = () => {
      const connection = useConnectionStore.getState();
      if (document.hidden) {
        connection.pauseRetry();
        return;
      }

      connection.resumeRetry();
      // 回前台补一次状态快照；过期的 completed 会被 ai-status 的时钟检查忽略。
      requestStatusIfConnected();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const unsubscribeChat = subscribeChat((raw) => {
      const focusResult = parseFocusResult(raw);
      if (focusResult) {
        useSessionStore.getState().handleFocusResult(focusResult);
        return;
      }

      // 结果卡片「回车/清空」的回包：只驱动卡片提示，不进聊天记录。
      const keyResult = parseKeyResult(raw);
      if (keyResult) {
        useMicStore.getState().handleKeyResult(keyResult);
        return;
      }

      // AI 状态要先于聊天解析：它不进入聊天记录，只驱动宠物四态。
      const status = parseStatusMessage(raw);
      if (status) {
        // 列表与宠物四态分开推进：completed 快照可能过期，但会话列表仍要更新。
        useSessionStore.getState().apply(status.sessionList ?? []);
        usePetStore.getState().applyAiStatus(status, {
          now: Date.now(),
          micListening: micListeningNow(),
        });
        return;
      }

      const micMessage = parseMicMessage(raw);
      if (micMessage) {
        const store = useMicStore.getState();
        if (micMessage.type === "mic.result") store.handleResult(micMessage);
        else if (micMessage.type === "mic.ready") store.handleReady(micMessage);
        else if (micMessage.type === "mic.partial") store.handlePartial(micMessage);
        else if (micMessage.type === "mic.state") store.handleState(micMessage);
        else if (micMessage.type === "mic.cancel") store.handleCancel(micMessage);
        else if (micMessage.type === "mic.error") store.handleError(micMessage);
        return;
      }

      const parsed = parseMessage(raw, "phone");
      if (parsed) append(parsed.kind, parsed.text);
    });
    const unsubscribeConn = subscribeConn((event) => {
      setOnline(event.online);
      if (event.online) {
        requestStatusIfConnected();
      } else {
        // 断线时立刻收起会话列表，避免展示已经过期的「工作中/等你决定」。
        useSessionStore.getState().clearAll();
      }
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
  const closeScan = useCallback(() => setScanOpen(false), [setScanOpen]);

  return (
    <>
      <PetStage
        active={view === "pet" && !settingsOpen}
        onOpenChat={openChat}
        onOpenSettings={openSettings}
      />
      {view === "chat" && <ChatView onBack={closeChat} onError={appendSystem} />}
      <PetSettings open={settingsOpen} onClose={closeSettings} />
      <ScanView open={scanOpen} onClose={closeScan} />
      {exitHintVisible && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+112px)] left-0 right-0 z-50 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg"
        >
          再按一次退出
        </div>
      )}
    </>
  );
}
