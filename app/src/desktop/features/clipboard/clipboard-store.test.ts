import { describe, expect, it } from "vitest";
import type { ClipboardItem } from "@/shared/lib/tauri";
import {
  DEFAULT_CLIPBOARD_MAX_ITEMS,
  filterClipboardItems,
  formatClipboardCount,
} from "./clipboard-store";

const items: ClipboardItem[] = [
  {
    id: "1",
    text: "把这段代码改成异步",
    kind: "text",
    createdAt: 1,
    lastUsedAt: 2,
    pinned: true,
  },
  {
    id: "2",
    text: "https://tauri.app/start/",
    kind: "url",
    createdAt: 1,
    lastUsedAt: 1,
    pinned: false,
  },
];

describe("filterClipboardItems", () => {
  it("returns everything for an empty query", () => {
    expect(filterClipboardItems(items, "")).toBe(items);
    expect(filterClipboardItems(items, "   ")).toBe(items);
  });

  it("matches text case-insensitively", () => {
    expect(filterClipboardItems(items, "TAURI").map((item) => item.id)).toEqual(["2"]);
    expect(filterClipboardItems(items, "异步").map((item) => item.id)).toEqual(["1"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterClipboardItems(items, "不存在")).toEqual([]);
  });
});

describe("formatClipboardCount", () => {
  it("shows current count and the snapshot max items limit", () => {
    expect(formatClipboardCount(3, 100)).toBe("3 / 100 条 · 仅保存在这台电脑");
  });

  it("falls back to the default limit before the snapshot loads", () => {
    const fallback = `0 / ${DEFAULT_CLIPBOARD_MAX_ITEMS} 条 · 仅保存在这台电脑`;
    expect(DEFAULT_CLIPBOARD_MAX_ITEMS).toBe(100);
    expect(formatClipboardCount(0)).toBe(fallback);
    expect(formatClipboardCount(0, 0)).toBe(fallback);
  });
});
