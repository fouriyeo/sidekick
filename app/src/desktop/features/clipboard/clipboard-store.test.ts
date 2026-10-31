import { describe, expect, it } from "vitest";
import type { ClipboardItem } from "@/shared/lib/tauri";
import { filterClipboardItems } from "./clipboard-store";

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
