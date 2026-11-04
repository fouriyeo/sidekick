import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipboardSnapshot } from "@/shared/lib/tauri";
import { useClipboardStore } from "../clipboard-store";
import { ClipboardSection } from "./clipboard-section";

const api = vi.hoisted(() => ({
  listClipboard: vi.fn(),
  copyClipboardItem: vi.fn(),
  toggleClipboardPin: vi.fn(),
  deleteClipboardItem: vi.fn(),
  clearClipboard: vi.fn(),
  setClipboardEnabled: vi.fn(),
  subscribeClipboardChanged: vi.fn(() => () => undefined),
  normalizeError: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));

vi.mock("@/shared/lib/tauri", () => api);

const longText = [
  "第一行：把这段代码改成异步。",
  "第二行：保留原来的错误处理。",
  "第三行：最后补上测试和验收。",
].join("\n");

const snapshot: ClipboardSnapshot = {
  enabled: true,
  path: "/tmp/clipboard.json",
  maxItems: 100,
  items: [
    {
      id: "1",
      text: longText,
      kind: "text",
      createdAt: 1_800_000_000_000,
      lastUsedAt: 1_800_000_000_000,
      pinned: false,
    },
    {
      id: "2",
      text: "https://tauri.app/start/",
      kind: "url",
      createdAt: 1_800_000_000_000,
      lastUsedAt: 1_800_000_000_000,
      pinned: true,
    },
  ],
};

beforeEach(() => {
  useClipboardStore.setState({ snapshot: null, loading: false, error: null });
  api.listClipboard.mockResolvedValue(snapshot);
  api.copyClipboardItem.mockResolvedValue(snapshot);
  api.toggleClipboardPin.mockResolvedValue(snapshot);
  api.deleteClipboardItem.mockResolvedValue({
    ...snapshot,
    items: snapshot.items.filter((item) => item.id !== "1"),
  });
  api.clearClipboard.mockResolvedValue({ ...snapshot, items: [] });
  api.setClipboardEnabled.mockResolvedValue(snapshot);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClipboardSection 查看详情", () => {
  it("列表行单行截断，但每条都有查看详情按钮", async () => {
    render(<ClipboardSection />);

    const preview = await screen.findByText(/第一行：把这段代码改成异步/);
    expect(preview.className).toContain("truncate");
    expect(screen.getAllByRole("button", { name: "查看详情" })).toHaveLength(2);
  });

  it("弹层展示完整文本、字数和行数", async () => {
    render(<ClipboardSection />);

    fireEvent.click((await screen.findAllByRole("button", { name: "查看详情" }))[0]);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/最后补上测试和验收/)).toBeInTheDocument();
    expect(within(dialog).getByText(/共 \d+ 字 · 3 行/)).toBeInTheDocument();
    expect(within(dialog).getByText(/文本/)).toBeInTheDocument();
  });

  it("在详情里可复制、置顶和删除", async () => {
    render(<ClipboardSection />);

    fireEvent.click((await screen.findAllByRole("button", { name: "查看详情" }))[0]);
    const dialog = await screen.findByRole("dialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "复制" }));
    await waitFor(() => expect(api.copyClipboardItem).toHaveBeenCalledWith("1"));
    expect(await within(dialog).findByRole("button", { name: "已复制" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "置顶" }));
    await waitFor(() => expect(api.toggleClipboardPin).toHaveBeenCalledWith("1"));

    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.deleteClipboardItem).toHaveBeenCalledWith("1");
  });
});
