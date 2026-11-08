import type { LucideIcon } from "lucide-react";
import { AudioLines, Clipboard, Gauge, LayoutGrid, NotebookPen, Settings } from "lucide-react";

/**
 * 电脑端「简约 iOS」导航模型（2026-11-07，D85 结构 + D86 质感 + D104 语音一级页）。
 *
 * 一级 6 个：概览 ⌘1 / 剪贴板 ⌘2 / 备忘录 ⌘3 / 用量 ⌘4 / 语音 ⌘5 / 设置 ⌘6；
 * 设置固定在侧栏底部，侧栏上半有 5 个入口。语音是一级页里的**单页**
 * （百炼配置 / 关键词 / 语音用量三段纵向排列），内部不再 push。
 *
 * 剪贴板原叫「内容」，D119 改名：历史与设置都只在这一页，设置里不再有剪贴板。
 * 视图 id 仍是 `content`（`?view=content` / `?view=clipboard` 两个旧别名都落到它）。
 * 备忘录从剪贴板分段拆成独立一级页（D123）：桌面仍是手机镜像，只读。
 */

export type DesktopView = "overview" | "content" | "memo" | "usage" | "voice" | "settings";

/** 设置里的二级页；`root` 是设置首页那张列表（语音不在设置里）。 */
export type SettingsSection =
  | "root"
  | "connection"
  | "hook"
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
  { id: "content", label: "剪贴板", shortcut: "⌘2", icon: Clipboard },
  { id: "memo", label: "备忘录", shortcut: "⌘3", icon: NotebookPen },
  { id: "usage", label: "用量", shortcut: "⌘4", icon: Gauge },
  { id: "voice", label: "语音", shortcut: "⌘5", icon: AudioLines },
  { id: "settings", label: "设置", shortcut: "⌘6", icon: Settings },
];

/** 侧栏上半部分的一级项（设置单独固定在底部）。 */
export const DESKTOP_PRIMARY_NAV = DESKTOP_NAV.filter((item) => item.id !== "settings");

/** 设置二级页的大标题；`root` 用「设置」（剪贴板没有二级页，D119）。 */
export const SETTINGS_SECTION_TITLE: Record<Exclude<SettingsSection, "root">, string> = {
  connection: "手机连接",
  hook: "AI 联动",
  accessibility: "自动输入",
  about: "关于本机",
  messages: "消息通道",
};

/** 一级导航的标题（页头用）。 */
export const VIEW_TITLE: Record<DesktopView, string> = {
  overview: "概览",
  content: "剪贴板",
  memo: "备忘录",
  usage: "用量",
  voice: "语音",
  settings: "设置",
};

/** ⌘1–⌘6 → 一级视图；只认单个数字键。 */
export function viewForShortcut(key: string): DesktopView | null {
  const index = Number(key) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= DESKTOP_NAV.length) return null;
  return DESKTOP_NAV[index]?.id ?? null;
}

/** 浏览器开发时 ?view=… 的兼容映射（旧名字保留，方便直接打开某一页）。 */
const VIEW_ALIASES: Record<string, DesktopRoute> = {
  overview: { view: "overview", section: "root" },
  content: { view: "content", section: "root" },
  // 剪贴板是 ⌘2 一级页（D119），两个旧名字都保留。
  clipboard: { view: "content", section: "root" },
  memo: { view: "memo", section: "root" },
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
  // 旧 DEV 链接：备忘录曾是剪贴板页的 ?tab=memo 分段。
  const legacyTab = params.get("tab");
  const view =
    (requested === "content" || requested === "clipboard") && legacyTab === "memo"
      ? "memo"
      : (alias?.view ?? fallback.view);
  return {
    view,
    section: isSettingsSection(section) ? section : (alias?.section ?? fallback.section),
  };
}
