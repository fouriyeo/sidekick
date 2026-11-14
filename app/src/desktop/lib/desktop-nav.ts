import type { LucideIcon } from "lucide-react";
import { AudioLines, Clipboard, Gauge, Languages, NotebookPen, Settings } from "lucide-react";

/**
 * 电脑端「简约 iOS」导航模型（2026-11-14，D143）。
 *
 * 一级 6 个：剪贴板 ⌘1 / 备忘录 ⌘2 / 用量 ⌘3 / 语音 ⌘4 / 英语角 ⌘5 / 设置 ⌘6。
 * 设置固定在侧栏底部，侧栏上半有 5 个入口。语音是**单页**（百炼配置 / 关键词 /
 * 语音用量三段纵向排列），内部不再 push；英语角也是单页 + 页内 push 详情。
 *
 * D143 删掉「概览」：那页的五块（服务端口 / 手机台数 / AI 状态 / 当前会话 /
 * 最近一次语音）全是「应用自检」，读完不改变用户接下来的动作——服务坏了当场
 * 就能感觉到、AI 状态在 DSH 里、语音结果已经落在光标处。真正需要出手的信号
 * （服务未启动 / AI 等你决定）收进侧栏一行。
 * 默认页 / 兜底页 = 用量（同日定：打开窗口第一眼要是一块看板，能回答「这两天花了多少」）。
 * 旧视图 id 仍是 `content`（`?view=content` / `?view=clipboard` 两个别名都落到它）。
 */
export type DesktopView = "content" | "memo" | "usage" | "voice" | "settings" | "words";

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

/** 一级导航（侧栏顺序）；`shortcut` 是 ⌘ 数字的唯一来源，设置固定底部。 */
export const DESKTOP_NAV: readonly DesktopNavItem[] = [
  { id: "content", label: "剪贴板", shortcut: "⌘1", icon: Clipboard },
  { id: "memo", label: "备忘录", shortcut: "⌘2", icon: NotebookPen },
  { id: "usage", label: "用量", shortcut: "⌘3", icon: Gauge },
  { id: "voice", label: "语音", shortcut: "⌘4", icon: AudioLines },
  { id: "words", label: "英语角", shortcut: "⌘5", icon: Languages },
  { id: "settings", label: "设置", shortcut: "⌘6", icon: Settings },
];

/** 侧栏上半部分的一级项（设置单独固定在底部）。 */
export const DESKTOP_PRIMARY_NAV = DESKTOP_NAV.filter((item) => item.id !== "settings");

/** 设置二级页的大标题；`root` 用「设置」。 */
export const SETTINGS_SECTION_TITLE: Record<Exclude<SettingsSection, "root">, string> = {
  connection: "手机连接",
  hook: "AI 联动",
  accessibility: "自动输入",
  about: "关于本机",
  messages: "消息通道",
};

/** 一级导航的标题（页头用）。 */
export const VIEW_TITLE: Record<DesktopView, string> = {
  content: "剪贴板",
  memo: "备忘录",
  usage: "用量",
  voice: "语音",
  settings: "设置",
  words: "英语角",
};

/**
 * ⌘1–⌘6 → 一级视图：从 `item.shortcut` 反查，增删入口不用再同步数组下标。
 * 只认单个数字键，多字符（如 "12"）与其它键返回 null。
 */
export function viewForShortcut(key: string): DesktopView | null {
  if (!/^\d$/.test(key)) return null;
  const shortcut = `⌘${key}`;
  return DESKTOP_NAV.find((item) => item.shortcut === shortcut)?.id ?? null;
}

/** 浏览器开发时 ?view=… 的兼容映射（旧名字保留，方便直接打开某一页）。 */
const VIEW_ALIASES: Record<string, DesktopRoute> = {
  content: { view: "content", section: "root" },
  // 剪贴板是一级页，两个名字都保留。
  clipboard: { view: "content", section: "root" },
  memo: { view: "memo", section: "root" },
  usage: { view: "usage", section: "root" },
  // 语音是第 4 个一级页（D104）；旧调试别名 models 也落到这里。
  voice: { view: "voice", section: "root" },
  models: { view: "voice", section: "root" },
  // 英语角是第 5 个一级页（词库 + 造句 + 页内用量）。
  words: { view: "words", section: "root" },
  settings: { view: "settings", section: "root" },
  system: { view: "settings", section: "root" },
  connection: { view: "settings", section: "connection" },
  offline: { view: "settings", section: "connection" },
  hook: { view: "settings", section: "hook" },
  chat: { view: "settings", section: "messages" },
  messages: { view: "settings", section: "messages" },
  accessibility: { view: "settings", section: "accessibility" },
  about: { view: "settings", section: "about" },
  // 「概览」与会话列表已下线（D143），旧链接回默认页用量。
  overview: { view: "usage", section: "root" },
  sessions: { view: "usage", section: "root" },
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

/** 浏览器开发时可用 ?view=voice 或 ?view=settings&section=hook 直接打开；生产构建恒为用量。 */
export function initialRoute(): DesktopRoute {
  const fallback: DesktopRoute = { view: "usage", section: "root" };
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
