import { describe, expect, it } from "vitest";
import type { ClipboardItem } from "@/shared/lib/tauri";
import {
  DEFAULT_CLIPBOARD_MAX_ITEMS,
  filterClipboardItems,
  formatClipboardCount,
  formatClipboardKind,
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
    expect(formatClipboardCount(3, 100)).toBe("3 / 100 条");
  });

  it("falls back to the default limit before the snapshot loads", () => {
    expect(formatClipboardCount(0)).toBe(`0 / ${DEFAULT_CLIPBOARD_MAX_ITEMS} 条`);
    expect(formatClipboardCount(0, 0)).toBe(`0 / ${DEFAULT_CLIPBOARD_MAX_ITEMS} 条`);
  });
});

describe("formatClipboardKind", () => {
  it("labels text, url and voice items", () => {
    expect(formatClipboardKind("text")).toBe("文本");
    expect(formatClipboardKind("url")).toBe("链接");
    expect(formatClipboardKind("voice")).toBe("语音转写");
  });
});
