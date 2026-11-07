import type { LucideIcon } from "lucide-react";
import { AudioLines, Clipboard, Gauge, LayoutGrid, Settings } from "lucide-react";

/**
 * 电脑端「简约 iOS」导航模型（2026-11-07，D85 结构 + D86 质感 + D104 语音一级页）。
 *
 * 一级 5 个：概览 ⌘1 / 内容 ⌘2 / 用量 ⌘3 / 语音 ⌘4 / 设置 ⌘5；设置固定在侧栏底部，
 * 侧栏上半只有 4 个入口。语音是一级页里的**单页**（百炼配置 / 关键词 / 语音用量
 * 三段纵向排列），内部不再 push（D101 收掉二级页，D104 把它从设置挪回一级）。
 */

export type DesktopView = "overview" | "content" | "usage" | "voice" | "settings";

/** 设置里的二级页；`root` 是设置首页那张列表（语音不在设置里）。 */
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

/** 一级导航（侧栏顺序）；⌘ 序号与数组顺序一致，设置固定底部。 */
export const DESKTOP_NAV: readonly DesktopNavItem[] = [
  { id: "overview", label: "概览", shortcut: "⌘1", icon: LayoutGrid },
  { id: "content", label: "内容", shortcut: "⌘2", icon: Clipboard },
  { id: "usage", label: "用量", shortcut: "⌘3", icon: Gauge },
  { id: "voice", label: "语音", shortcut: "⌘4", icon: AudioLines },
  { id: "settings", label: "设置", shortcut: "⌘5", icon: Settings },
];

/** 侧栏上半部分的一级项（设置单独固定在底部）。 */
export const DESKTOP_PRIMARY_NAV = DESKTOP_NAV.filter((item) => item.id !== "settings");

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
  content: "内容",
  usage: "用量",
  voice: "语音",
  settings: "设置",
};

/** ⌘1–⌘5 → 一级视图；只认单个数字键。 */
export function viewForShortcut(key: string): DesktopView | null {
  const index = Number(key) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= DESKTOP_NAV.length) return null;
  return DESKTOP_NAV[index]?.id ?? null;
}

/** 浏览器开发时 ?view=… 的兼容映射（旧名字保留，方便直接打开某一页）。 */
const VIEW_ALIASES: Record<string, DesktopRoute> = {
  overview: { view: "overview", section: "root" },
  content: { view: "content", section: "root" },
  clipboard: { view: "content", section: "root" },
  usage: { view: "usage", section: "root" },
  // 语音是第 4 个一级页（D104）；旧调试别名 models 也落到这里。
  voice: { view: "voice", section: "root" },
  models: { view: "voice", section: "root" },
  settings: { view: "settings", section: "root" },
  system: { view: "settings", section: "root" },
  connection: { view: "settings", section: "connection" },
  offline: { view: "settings", section: "connection" },
  hook: { view: "settings", section: "hook" },
  chat: { view: "settings", section: "messages" },
  messages: { view: "settings", section: "messages" },
  accessibility: { view: "settings", section: "accessibility" },
  about: { view: "settings", section: "about" },
  // 会话列表已下线，旧链接回到概览。
  sessions: { view: "overview", section: "root" },
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

/** 浏览器开发时可用 ?view=voice 或 ?view=settings&section=hook 直接打开；生产构建恒为概览。 */
export function initialRoute(): DesktopRoute {
  const fallback: DesktopRoute = { view: "overview", section: "root" };
  if (!import.meta.env.DEV || typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const requested = params.get("view");
  const alias = requested ? VIEW_ALIASES[requested] : undefined;
  const section = params.get("section");
  const view = alias?.view ?? fallback.view;
  return {
    view,
    section: isSettingsSection(section) ? section : (alias?.section ?? fallback.section),
  };
}
