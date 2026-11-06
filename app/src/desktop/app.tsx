import { useCallback, useEffect, useMemo, useState } from "react";
import { useHookStore } from "@/desktop/features/hook/hook-store";
import { MicStatusOverlay } from "@/desktop/features/mic-receiver/mic-status-overlay";
import { useCloudAsrStore } from "@/desktop/features/models/cloud-asr-store";
import {
  type DesktopNav,
  type DesktopView,
  initialRoute,
  type SettingsSection,
  type VoicePane,
  viewForShortcut,
} from "@/desktop/lib/desktop-nav";
import { ContentPage } from "@/desktop/pages/content-page";
import { OverviewPage } from "@/desktop/pages/overview-page";
import { SettingsPage } from "@/desktop/pages/settings-page";
import { UsagePage } from "@/desktop/pages/usage-page";
import { VoicePage } from "@/desktop/pages/voice-page";
import { Sidebar } from "@/desktop/shell/sidebar";
import { useMotionPause } from "@/shared/hooks/use-motion-pause";
import { Toaster } from "@/shared/ui/sonner";
import "@/desktop/styles/ios.css";
import "@/desktop/styles/usage.css";
import { useDesktopConnection } from "./use-desktop-connection";

/** 输入框 / 下拉里不劫持 ⌘1–⌘5（浏览器默认的标签切换也不抢）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * 电脑端「简约 iOS」外壳（2026-11-06）。
 *
 * 结构固定：左侧 224 玻璃侧栏（3 个一级入口 + 设置 + 三行状态摘要）→ 右侧内容页
 * （大标题 + iOS 分组列表）。⌘1–⌘4 切换一级页；默认概览。
 * 麦克风浮层、辅助功能提示与 toast 是全局层。
 */
export function DesktopApp() {
  const connection = useDesktopConnection();
  const [route, setRoute] = useState(initialRoute);
  useMotionPause();

  const go = useCallback((view: DesktopView) => {
    setRoute({ view, section: "root", pane: "root" });
  }, []);

  const goSettings = useCallback((section: SettingsSection) => {
    setRoute({ view: "settings", section, pane: "root" });
  }, []);

  const openVoicePane = useCallback((pane: VoicePane) => {
    setRoute((current) => ({ ...current, view: "voice", pane }));
  }, []);

  const nav = useMemo<DesktopNav>(() => ({ go, goSettings }), [go, goSettings]);

  // 设计作用域也挂到 <html>：Dialog / Sheet 通过 portal 渲染到 body，
  // 只有根 div 带 .desktop-ios 时，弹层会掉回全局（深海）令牌。
  useEffect(() => {
    document.documentElement.classList.add("desktop-ios");
    return () => document.documentElement.classList.remove("desktop-ios");
  }, []);

  // 联动状态是全局信息（侧栏 / 概览 / 设置 › AI 联动共用），在外壳初始化一次。
  useEffect(() => {
    useHookStore.getState().init();
    void useHookStore.getState().refresh();
  }, []);

  // 侧栏「语音」未配置圆点需要状态，所以在壳层先读一次本地 asr.json。
  useEffect(() => {
    void useCloudAsrStore.getState().load();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      const view = viewForShortcut(event.key);
      if (!view) return;
      event.preventDefault();
      setRoute({ view, section: "root", pane: "root" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="desktop-ios flex h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <Sidebar
        view={route.view}
        section={route.section}
        onSelect={go}
        onOpenSettings={goSettings}
        connection={connection}
      />

      <main className="dsl-main flex min-h-0 min-w-0 flex-1 flex-col">
        {route.view === "overview" && <OverviewPage connection={connection} nav={nav} />}
        {route.view === "content" && <ContentPage />}
        {route.view === "voice" && <VoicePage pane={route.pane} onPaneChange={openVoicePane} />}
        {route.view === "usage" && <UsagePage />}
        {route.view === "settings" && (
          <SettingsPage
            connection={connection}
            section={route.section}
            onSectionChange={goSettings}
            nav={nav}
          />
        )}
      </main>

      <MicStatusOverlay onCancel={connection.cancelMic} />
      <Toaster position="bottom-right" />
    </div>
  );
}
