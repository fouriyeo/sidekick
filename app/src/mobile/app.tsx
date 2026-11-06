import { useCallback, useEffect, useRef, useState } from "react";
import { AskingPage } from "@/mobile/features/asking/asking-page";
import { ChatPage } from "@/mobile/features/chat/chat-page";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { ScanView } from "@/mobile/features/connect/components/scan-view";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { OfflinePage } from "@/mobile/features/connect/offline-page";
import { useFirstUseStore } from "@/mobile/features/first-use/store";
import { micBusyNow, useMicStore } from "@/mobile/features/mic/mic-store";
import { PetPage } from "@/mobile/features/pet/pet-page";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import { useKeepAwake } from "@/mobile/features/pet/use-keep-awake";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { MorePage } from "@/mobile/features/settings/more-page";
import { UsagePage } from "@/mobile/features/usage/usage-page";
import { useMobileUsageStore } from "@/mobile/features/usage/usage-store";
import { handleBack } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import {
  parseDesktopStatus,
  parseFocusResult,
  parseKeyResult,
  parseMessage,
  parseMicMessage,
  parseStatusMessage,
  parseUsageMessage,
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

/** 手机根：宠物页 + 设置/聊天/等你决定/连接二级页；没有底部 tab。 */
export function MobileApp() {
  const append = useChatStore((state) => state.append);
  const bootstrap = useConnectionStore((state) => state.bootstrap);
  const setOnline = useConnectionStore((state) => state.setOnline);
  const view = useUiStore((state) => state.view);
  const scanOpen = useUiStore((state) => state.scanOpen);
  const keepAwake = usePetStore((state) => state.pet.settings.keepAwake);
  const keepAwakeHours = usePetStore((state) => state.pet.settings.keepAwakeHours);
  const keepAwakeMs = keepAwakeHours > 0 ? keepAwakeHours * 60 * 60 * 1000 : null;

  useMotionPause();

  // 屏幕常亮只在宠物页（含变暗层）生效；聊天/设置与后台释放。
  // 常亮默认最多 2 小时，到点释放，避免放桌边整夜耗电（设置页可调，0 = 不限）。
  useKeepAwake(keepAwake && view === "pet", keepAwakeMs);

  // 触感统一由 App 管：先关掉 WebView 自带的长按震动（文本选择/上下文菜单），
  // 再按需用原生 `haptic` 命令触发；失败静默降级，不影响界面。
  useEffect(() => {
    void disableWebviewHaptics().catch(() => undefined);
  }, []);

  // 宠物页之外的页面把 overlayOpen 置 true：AI 音效/触感只在宠物页前台响。
  useEffect(() => {
    usePetStore.getState().dispatch({ type: "OVERLAY", now: Date.now(), open: view !== "pet" });
  }, [view]);

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

  // App 启动时注册唯一的返回键监听；页面内弹层/确认态先由返回栈消费。
  // 返回层级：scan → 上一页；settings/chat/usage/asking → pet；offline → 上一页；
  // 根页面 pet 走「再按一次退出」。
  const onSystemBack = useCallback(() => {
    if (micBusyNow()) return;

    const ui = useUiStore.getState();
    if (ui.scanOpen) {
      ui.setScanOpen(false);
      clearExitHint();
      return;
    }

    if (handleBack()) {
      clearExitHint();
      return;
    }

    if (ui.view !== "pet") {
      switch (ui.view) {
        case "settings":
        case "chat":
        case "asking":
        case "usage":
          ui.setView("pet");
          break;
        case "offline":
          ui.closeOffline();
          break;
      }
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

  // 离开根页面后立刻收起退出提示，避免提示和当前界面错位。
  useEffect(() => {
    if (view !== "pet") clearExitHint();
  }, [clearExitHint, view]);

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
  // 用户可在连接页扫码或手动输入地址。
  useEffect(() => {
    void bootstrap().catch((error: unknown) => {
      console.warn("[app] 启动自动连接失败：", error);
    });
  }, [bootstrap]);

  // 会话清除标记与首用清单只存在本机；水合完成前列表不渲染，避免闪一下旧状态。
  useEffect(() => {
    void useSessionStore
      .getState()
      .hydrate()
      .catch((error: unknown) => {
        console.warn("[app] 读取本地清除标记失败：", error);
      });
    useFirstUseStore.getState().hydrate();
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
      // 顶栏的「今天」数字也补一次：熄屏期间账本可能已经变了。
      if (useConnectionStore.getState().status === "connected") {
        useMobileUsageStore.getState().requestToday();
      }
      if (useUiStore.getState().view === "usage") {
        useMobileUsageStore.getState().request();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  useEffect(() => {
    const unsubscribeChat = subscribeChat((raw) => {
      // 电脑侧真实配置状态：只驱动首用清单 ③④，不进入聊天记录。
      const desktopStatus = parseDesktopStatus(raw);
      if (desktopStatus) {
        useFirstUseStore.getState().applyDesktopStatus(desktopStatus);
        return;
      }

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

      // 用量快照只驱动「设置 › 用量」，不进入聊天记录。
      const usage = parseUsageMessage(raw);
      if (usage) {
        useMobileUsageStore.getState().apply(usage.data);
        return;
      }

      // AI 状态要先于聊天解析：它不进入聊天记录，只驱动宠物四态与会话列表。
      const status = parseStatusMessage(raw);
      if (status) {
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
        if (micMessage.type === "mic.result") {
          store.handleResult(micMessage);
        } else if (micMessage.type === "mic.ready") {
          store.handleReady(micMessage);
          // 第一次成功录到音频：首用清单的麦克风步骤由本机状态确认。
          useFirstUseStore.getState().markMicReady();
        } else if (micMessage.type === "mic.partial") store.handlePartial(micMessage);
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
        // 顶栏「今天」数字：连上后静默拉一次，断连期间不请求。
        useMobileUsageStore.getState().requestToday();
        // 用量页打开时补拉一次；其它页面不主动请求，避免无谓广播。
        if (useUiStore.getState().view === "usage") {
          useMobileUsageStore.getState().request();
        }
      }
      // 断连时保留最后一次会话快照（会话卡继续显示最后状态），不清空列表。
    });

    return () => {
      unsubscribeChat();
      unsubscribeConn();
    };
  }, [append, setOnline]);

  return (
    <>
      {view === "pet" && <PetPage />}
      {view === "settings" && <MorePage />}
      {view === "usage" && <UsagePage />}
      {view === "chat" && <ChatPage />}
      {view === "asking" && <AskingPage />}
      {view === "offline" && <OfflinePage />}
      <ScanView open={scanOpen} onClose={() => useUiStore.getState().setScanOpen(false)} />
      {exitHintVisible && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+150px)] left-0 right-0 z-50 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          再按一次退出
        </div>
      )}
    </>
  );
}
