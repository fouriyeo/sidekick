import { useCallback, useEffect, useMemo, useState } from "react";
import { useHookStore } from "@/desktop/features/hook/hook-store";
import { useCloudAsrStore } from "@/desktop/features/models/cloud-asr-store";
import {
  type DesktopNav,
  type DesktopView,
  initialRoute,
  type SettingsSection,
  viewForShortcut,
} from "@/desktop/lib/desktop-nav";
import { ContentPage } from "@/desktop/pages/content-page";
import { MemoPage } from "@/desktop/pages/memo-page";
import { OverviewPage } from "@/desktop/pages/overview-page";
import { SettingsPage } from "@/desktop/pages/settings-page";
import { UsagePage } from "@/desktop/pages/usage-page";
import { VoicePage } from "@/desktop/pages/voice-page";
import { WordsPage } from "@/desktop/pages/words-page";
import { Sidebar } from "@/desktop/shell/sidebar";
import { useMotionPause } from "@/shared/hooks/use-motion-pause";
import { subscribeNavigate } from "@/shared/lib/tauri";
import { Toaster } from "@/shared/ui/sonner";
import "@/desktop/styles/ios.css";
import "@/desktop/styles/usage.css";
import { useDesktopConnection } from "./use-desktop-connection";

/** 输入框 / 下拉里不劫持 ⌘1–⌘7（浏览器默认的标签切换也不抢）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * 电脑端「简约 iOS」外壳（2026-11-07，D104 语音升为第 4 个一级入口）。
 *
 * 结构固定：左侧 224 玻璃侧栏（6 个一级入口 + 设置 + 三行状态摘要）→ 右侧内容页
 * （大标题 + iOS 分组列表）。⌘1–⌘7 切换一级页；默认概览。
 * 麦克风浮层、辅助功能提示与 toast 是全局层。
 */
export function DesktopApp() {
  const connection = useDesktopConnection();
  const [route, setRoute] = useState(initialRoute);
  useMotionPause();

  const go = useCallback((view: DesktopView) => {
    setRoute({ view, section: "root" });
  }, []);

  const goSettings = useCallback((section: SettingsSection) => {
    setRoute({ view: "settings", section });
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

  // 侧栏「语音」未配置时需要琥珀点，所以在壳层先读一次本地 asr.json。
  useEffect(() => {
    void useCloudAsrStore.getState().load();
  }, []);

  // 菜单栏用量小看板的「打开用量页」（D106）：Rust 先把主窗口叫回来，再发导航事件。
  // 主窗口隐藏时 WebView 仍在跑，所以这里能收到；非 usage 的视图忽略。
  useEffect(
    () =>
      subscribeNavigate((view) => {
        if (view === "usage") setRoute({ view: "usage", section: "root" });
      }),
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (isTypingTarget(event.target)) return;
      const view = viewForShortcut(event.key);
      if (!view) return;
      event.preventDefault();
      setRoute({ view, section: "root" });
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
        {route.view === "memo" && <MemoPage />}
        {route.view === "usage" && <UsagePage />}
        {route.view === "voice" && <VoicePage />}
        {route.view === "words" && <WordsPage nav={nav} />}
        {route.view === "settings" && (
          <SettingsPage
            connection={connection}
            section={route.section}
            onSectionChange={goSettings}
            nav={nav}
          />
        )}
      </main>

      {/* 录音状态统一走屏幕顶部的 NSPanel（全屏可见）；应用内不再重复提示。 */}
      <Toaster position="bottom-right" />
    </div>
  );
}
