import { afterEach, describe, expect, it } from "vitest";
import { DESKTOP_NAV, DESKTOP_PRIMARY_NAV, initialRoute, viewForShortcut } from "./desktop-nav";

describe("桌面一级导航", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("侧栏顺序与快捷键为 6 项，设置固定底部", () => {
    expect(DESKTOP_NAV.map((item) => [item.id, item.label, item.shortcut])).toEqual([
      ["overview", "概览", "⌘1"],
      ["content", "剪贴板", "⌘2"],
      ["memo", "备忘录", "⌘3"],
      ["usage", "用量", "⌘4"],
      ["voice", "语音", "⌘5"],
      ["settings", "设置", "⌘6"],
    ]);
    expect(DESKTOP_PRIMARY_NAV.map((item) => item.id)).toEqual([
      "overview",
      "content",
      "memo",
      "usage",
      "voice",
    ]);
  });

  it("⌘1–⌘6 映射一级视图，⌘7 无动作", () => {
    expect(viewForShortcut("1")).toBe("overview");
    expect(viewForShortcut("2")).toBe("content");
    expect(viewForShortcut("3")).toBe("memo");
    expect(viewForShortcut("4")).toBe("usage");
    expect(viewForShortcut("5")).toBe("voice");
    expect(viewForShortcut("6")).toBe("settings");
    expect(viewForShortcut("7")).toBeNull();
    expect(viewForShortcut("0")).toBeNull();
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
