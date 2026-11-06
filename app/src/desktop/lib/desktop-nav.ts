import type { LucideIcon } from "lucide-react";
import { AudioLines, Clipboard, Gauge, LayoutGrid, Settings } from "lucide-react";

/**
 * 电脑端「简约 iOS」导航模型（2026-11-06，D85 结构 + D94 语音一级页）。
 *
 * 一级 5 个：概览 ⌘1 / 语音 ⌘2 / 内容 ⌘3 / 用量 ⌘4 / 设置 ⌘5。
 * 「语音」的配置、关键词、用量是同一视图内的三个 push 二级页（iOS 式），
 * 点侧栏「语音」总是回到它的根页。会话列表仍不单独占页。
 */

export type DesktopView = "overview" | "voice" | "content" | "usage" | "settings";

/** 语音视图内的二级页；`root` 是首屏三组摘要。 */
export type VoicePane = "root" | "config" | "keywords" | "usage";

/** 设置里的二级页；`root` 是设置首页那张列表（语音已提升为一级页）。 */
export type SettingsSection =
  | "root"
  | "connection"
  | "hook"
  | "clipboard"
  | "accessibility"
  | "about"
  | "messages";

export type DesktopRoute = {
  view: DesktopView;
  section: SettingsSection;
  pane: VoicePane;
};

export type DesktopNav = {
  go: (view: DesktopView) => void;
  goSettings: (section: SettingsSection) => void;
};

export type DesktopNavItem = {
  id: DesktopView;
  label: string;
  shortcut: string;
  icon: LucideIcon;
};

/** 一级导航（侧栏顺序）；⌘ 序号与数组顺序一致。 */
export const DESKTOP_NAV: readonly DesktopNavItem[] = [
  { id: "overview", label: "概览", shortcut: "⌘1", icon: LayoutGrid },
  { id: "voice", label: "语音", shortcut: "⌘2", icon: AudioLines },
  { id: "content", label: "内容", shortcut: "⌘3", icon: Clipboard },
  { id: "usage", label: "用量", shortcut: "⌘4", icon: Gauge },
  { id: "settings", label: "设置", shortcut: "⌘5", icon: Settings },
];

/** 侧栏上半部分的一级项（设置单独固定在底部）。 */
export const DESKTOP_PRIMARY_NAV = DESKTOP_NAV.slice(0, 4);

/** 设置二级页的大标题；`root` 用「设置」。 */
export const SETTINGS_SECTION_TITLE: Record<Exclude<SettingsSection, "root">, string> = {
  connection: "手机连接",
  hook: "AI 联动",
  clipboard: "剪贴板",
  accessibility: "自动输入",
  about: "关于本机",
  messages: "消息通道",
};

/** 一级导航的标题（页头用）。 */
export const VIEW_TITLE: Record<DesktopView, string> = {
  overview: "概览",
  voice: "语音",
  content: "内容",
  usage: "用量",
  settings: "设置",
};

/** 语音二级页的标题。 */
export const VOICE_PANE_TITLE: Record<VoicePane, string> = {
  root: "语音",
  config: "连接与识别",
  keywords: "关键词",
  usage: "语音用量",
};

/** ⌘1–⌘5 → 一级视图；只认单个数字键。 */
export function viewForShortcut(key: string): DesktopView | null {
  const index = Number(key) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= DESKTOP_NAV.length) return null;
  return DESKTOP_NAV[index]?.id ?? null;
}

/** 浏览器开发时 ?view=… 的兼容映射（旧名字保留，方便直接打开某一页）。 */
const VIEW_ALIASES: Record<string, DesktopRoute> = {
  overview: { view: "overview", section: "root", pane: "root" },
  voice: { view: "voice", section: "root", pane: "root" },
  models: { view: "voice", section: "root", pane: "root" },
  content: { view: "content", section: "root", pane: "root" },
  clipboard: { view: "content", section: "root", pane: "root" },
  usage: { view: "usage", section: "root", pane: "root" },
  settings: { view: "settings", section: "root", pane: "root" },
  system: { view: "settings", section: "root", pane: "root" },
  connection: { view: "settings", section: "connection", pane: "root" },
  offline: { view: "settings", section: "connection", pane: "root" },
  hook: { view: "settings", section: "hook", pane: "root" },
  chat: { view: "settings", section: "messages", pane: "root" },
  messages: { view: "settings", section: "messages", pane: "root" },
  accessibility: { view: "settings", section: "accessibility", pane: "root" },
  about: { view: "settings", section: "about", pane: "root" },
  // 会话列表已下线，旧链接回到概览。
  sessions: { view: "overview", section: "root", pane: "root" },
};

function isSettingsSection(value: string | null): value is SettingsSection {
  return (
    value === "root" ||
    value === "connection" ||
    value === "hook" ||
    value === "clipboard" ||
    value === "accessibility" ||
    value === "about" ||
    value === "messages"
  );
}

function isVoicePane(value: string | null): value is VoicePane {
  return value === "root" || value === "config" || value === "keywords" || value === "usage";
}

/** 浏览器开发时可用 ?view=voice&pane=keywords 直接打开；生产构建恒为概览。 */
export function initialRoute(): DesktopRoute {
  const fallback: DesktopRoute = { view: "overview", section: "root", pane: "root" };
  if (!import.meta.env.DEV || typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const requested = params.get("view");
  const alias = requested ? VIEW_ALIASES[requested] : undefined;
  const section = params.get("section");
  const pane = params.get("pane");
  const view = alias?.view ?? fallback.view;
  return {
    view,
    section: isSettingsSection(section) ? section : (alias?.section ?? fallback.section),
    pane: view === "voice" && isVoicePane(pane) ? pane : (alias?.pane ?? fallback.pane),
  };
}
