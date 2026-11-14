import { afterEach, describe, expect, it } from "vitest";
import { DESKTOP_NAV, DESKTOP_PRIMARY_NAV, initialRoute, viewForShortcut } from "./desktop-nav";

describe("桌面一级导航", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("侧栏顺序与快捷键为 6 项，设置固定底部", () => {
    expect(DESKTOP_NAV.map((item) => [item.id, item.label, item.shortcut])).toEqual([
      ["content", "剪贴板", "⌘1"],
      ["memo", "备忘录", "⌘2"],
      ["usage", "用量", "⌘3"],
      ["voice", "语音", "⌘4"],
      ["words", "英语角", "⌘5"],
      ["settings", "设置", "⌘6"],
    ]);
    expect(DESKTOP_PRIMARY_NAV.map((item) => item.id)).toEqual([
      "content",
      "memo",
      "usage",
      "voice",
      "words",
    ]);
  });

  it("⌘1–⌘6 映射一级视图，⌘7/⌘0/多字符无动作", () => {
    expect(viewForShortcut("1")).toBe("content");
    expect(viewForShortcut("2")).toBe("memo");
    expect(viewForShortcut("3")).toBe("usage");
    expect(viewForShortcut("4")).toBe("voice");
    expect(viewForShortcut("5")).toBe("words");
    expect(viewForShortcut("6")).toBe("settings");
    expect(viewForShortcut("7")).toBeNull();
    expect(viewForShortcut("0")).toBeNull();
    expect(viewForShortcut("12")).toBeNull();
    expect(viewForShortcut("a")).toBeNull();
  });

  it("快捷键按 `shortcut` 字段反查，而不是数组下标", () => {
    // 设置固定底部但仍占 ⌘6；英语角是 ⌘5。
    const byShortcut = new Map(DESKTOP_NAV.map((item) => [item.shortcut, item.id]));
    expect(byShortcut.get("⌘5")).toBe("words");
    expect(byShortcut.get("⌘6")).toBe("settings");
    expect(viewForShortcut("5")).toBe(byShortcut.get("⌘5"));
  });

  it("默认页与兜底页都是用量看板（D143 删概览）", () => {
    expect(initialRoute()).toEqual({ view: "usage", section: "root" });
  });

  it("旧 ?view=overview / ?view=sessions 回落到用量", () => {
    window.history.pushState({}, "", "/?view=overview");
    expect(initialRoute().view).toBe("usage");

    window.history.pushState({}, "", "/?view=sessions");
    expect(initialRoute().view).toBe("usage");
  });

  it("?view=words 落到英语角一级页", () => {
    window.history.pushState({}, "", "/?view=words");
    expect(initialRoute().view).toBe("words");
  });

  it("?view=memo 与旧 ?tab=memo 都落到备忘录", () => {
    window.history.pushState({}, "", "/?view=memo");
    expect(initialRoute().view).toBe("memo");

    window.history.pushState({}, "", "/?view=content&tab=memo");
    expect(initialRoute().view).toBe("memo");

    window.history.pushState({}, "", "/?view=clipboard&tab=memo");
    expect(initialRoute().view).toBe("memo");
  });
});
