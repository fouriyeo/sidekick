import type { LucideIcon } from "lucide-react";
import {
  Clipboard,
  Gauge,
  LayoutGrid,
  ListChecks,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

/**
 * 电脑端「指挥舱」的导航模型。
 *
 * 一级 6 项（总览 / 会话 / 内容 / 用量 / 系统 / 设置），配置与排障全部收进「系统」；
 * 聊天（消息）不再占一级，只作为「系统」的第 4 段存在。用量页为 D82 新增。
 */

export type DesktopView = "overview" | "sessions" | "content" | "usage" | "system" | "settings";

export type SystemSection = "connection" | "voice" | "hook" | "chat";

export type DesktopRoute = {
  view: DesktopView;
  section: SystemSection;
};

/** 页面共享的导航入口；由 app 外壳注入，页面不直接改路由状态。 */
export type DesktopNav = {
  go: (view: DesktopView) => void;
  goSystem: (section: SystemSection) => void;
};

export type DesktopNavItem = {
  id: DesktopView;
  label: string;
  shortcut: string;
  icon: LucideIcon;
};

export const DESKTOP_NAV: readonly DesktopNavItem[] = [
  { id: "overview", label: "总览", shortcut: "⌘1", icon: LayoutGrid },
  { id: "sessions", label: "会话", shortcut: "⌘2", icon: ListChecks },
  { id: "content", label: "内容", shortcut: "⌘3", icon: Clipboard },
  { id: "usage", label: "用量", shortcut: "⌘4", icon: Gauge },
  { id: "system", label: "系统", shortcut: "⌘5", icon: SlidersHorizontal },
  { id: "settings", label: "设置", shortcut: "⌘6", icon: Settings },
];

/** 「系统」页内的 4 段；顺序固定为 连接 → 语音 → 联动 → 消息。 */
export const SYSTEM_SECTIONS: ReadonlyArray<{ id: SystemSection; label: string }> = [
  { id: "connection", label: "连接" },
  { id: "voice", label: "语音" },
  { id: "hook", label: "联动" },
  { id: "chat", label: "消息" },
];

export const SYSTEM_SECTION_TITLE: Record<SystemSection, string> = {
  connection: "连接",
  voice: "语音引擎",
  hook: "AI 联动",
  chat: "消息",
};

/** 一级导航的标题（页头用）。 */
export const VIEW_TITLE: Record<DesktopView, string> = {
  overview: "总览",
  sessions: "会话",
  content: "内容",
  usage: "用量",
  system: "系统",
  settings: "设置",
};

/** ⌘1–⌘6 → 一级视图；只认单个数字键。 */
export function viewForShortcut(key: string): DesktopView | null {
  const index = Number(key) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= DESKTOP_NAV.length) return null;
  return DESKTOP_NAV[index].id;
}

/** 旧版 ?view=chat|clipboard|hook|models 的兼容映射，方便浏览器开发时直接打开某页。 */
const VIEW_ALIASES: Record<string, DesktopRoute> = {
  overview: { view: "overview", section: "connection" },
  sessions: { view: "sessions", section: "connection" },
  content: { view: "content", section: "connection" },
  usage: { view: "usage", section: "connection" },
  clipboard: { view: "content", section: "connection" },
  system: { view: "system", section: "connection" },
  settings: { view: "settings", section: "connection" },
  connection: { view: "system", section: "connection" },
  offline: { view: "system", section: "connection" },
  voice: { view: "system", section: "voice" },
  models: { view: "system", section: "voice" },
  hook: { view: "system", section: "hook" },
  chat: { view: "system", section: "chat" },
};

function isSystemSection(value: string | null): value is SystemSection {
  return SYSTEM_SECTIONS.some((section) => section.id === value);
}

/** 浏览器开发时可用 ?view=sessions&section=hook 直接打开；生产构建恒为总览。 */
export function initialRoute(): DesktopRoute {
  const fallback: DesktopRoute = { view: "overview", section: "connection" };
  if (!import.meta.env.DEV || typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const requested = params.get("view");
  const alias = requested ? VIEW_ALIASES[requested] : undefined;
  const section = params.get("section");
  return {
    view: alias?.view ?? fallback.view,
    section: isSystemSection(section) ? section : (alias?.section ?? fallback.section),
  };
}
