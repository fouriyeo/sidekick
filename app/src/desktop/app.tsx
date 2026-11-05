import { useCallback, useEffect, useMemo, useState } from "react";
import { useHookStore } from "@/desktop/features/hook/hook-store";
import { MicStatusOverlay } from "@/desktop/features/mic-receiver/mic-status-overlay";
import { AccessibilityHint } from "@/desktop/features/settings/components/accessibility-hint";
import {
  type DesktopNav,
  type DesktopView,
  initialRoute,
  type SystemSection,
  viewForShortcut,
} from "@/desktop/lib/desktop-nav";
import { ContentPage } from "@/desktop/pages/content-page";
import { OverviewPage } from "@/desktop/pages/overview-page";
import { SessionsPage } from "@/desktop/pages/sessions-page";
import { SettingsPage } from "@/desktop/pages/settings-page";
import { SystemPage } from "@/desktop/pages/system-page";
import { UsagePage } from "@/desktop/pages/usage-page";
import { GlobalStatusBar } from "@/desktop/shell/global-status-bar";
import { IconRail } from "@/desktop/shell/icon-rail";
import { useMotionPause } from "@/shared/hooks/use-motion-pause";
import { Toaster } from "@/shared/ui/sonner";
import { useDesktopConnection } from "./use-desktop-connection";

/** 输入框 / 下拉里不劫持 ⌘1–⌘6（浏览器默认的标签切换也不抢）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * 电脑端「指挥舱」外壳。
 *
 * 结构固定：左侧 72 图标导航（6 项）→ 顶部 48 全局状态条（服务/手机/AI，三段可点）
 * → 外壳级辅助功能提示条 → 页面（56 页头 + 内容区）。麦克风浮层与 toast 是全局层。
 * ⌘1–⌘6 切换一级页；默认总览。
 */
export function DesktopApp() {
  const connection = useDesktopConnection();
  const [route, setRoute] = useState(initialRoute);
  useMotionPause();

  const go = useCallback((view: DesktopView) => {
    setRoute((current) => ({ ...current, view }));
  }, []);

  const goSystem = useCallback((section: SystemSection) => {
    setRoute({ view: "system", section });
  }, []);

  const nav = useMemo<DesktopNav>(() => ({ go, goSystem }), [go, goSystem]);

  // 联动状态是全局信息（总览摘要 / 会话页页脚 / 系统 › 联动共用），在外壳初始化一次。
  useEffect(() => {
    useHookStore.getState().init();
    void useHookStore.getState().refresh();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      const view = viewForShortcut(event.key);
      if (!view) return;
      event.preventDefault();
      setRoute((current) => ({ ...current, view }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <IconRail view={route.view} onSelect={go} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <GlobalStatusBar
          connection={connection}
          onOpenConnection={() => goSystem("connection")}
          onOpenSessions={() => go("sessions")}
        />
        <AccessibilityHint onOpenSettings={() => go("settings")} />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {route.view === "overview" && <OverviewPage connection={connection} nav={nav} />}
          {route.view === "sessions" && <SessionsPage connection={connection} nav={nav} />}
          {route.view === "content" && <ContentPage />}
          {route.view === "usage" && <UsagePage />}
          {route.view === "system" && (
            <SystemPage
              connection={connection}
              section={route.section}
              onSectionChange={goSystem}
              nav={nav}
            />
          )}
          {route.view === "settings" && <SettingsPage />}
        </main>
      </div>

      <MicStatusOverlay onCancel={connection.cancelMic} />
      <Toaster position="bottom-right" />
    </div>
  );
}
