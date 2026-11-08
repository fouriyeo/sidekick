import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipboardSnapshot } from "@/shared/lib/tauri";
import { useClipboardStore } from "../clipboard-store";
import { ClipboardSection } from "./clipboard-section";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));

const api = vi.hoisted(() => ({
  listClipboard: vi.fn(),
  copyClipboardItem: vi.fn(),
  toggleClipboardPin: vi.fn(),
  deleteClipboardItem: vi.fn(),
  clearClipboard: vi.fn(),
  setClipboardEnabled: vi.fn(),
  setClipboardMaxItems: vi.fn(),
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
  toast.success.mockClear();
  toast.error.mockClear();
  api.listClipboard.mockResolvedValue(snapshot);
  api.copyClipboardItem.mockResolvedValue(snapshot);
  api.toggleClipboardPin.mockResolvedValue(snapshot);
  api.deleteClipboardItem.mockResolvedValue({
    ...snapshot,
    items: snapshot.items.filter((item) => item.id !== "1"),
  });
  api.clearClipboard.mockResolvedValue({ ...snapshot, items: [] });
  api.setClipboardEnabled.mockResolvedValue(snapshot);
  api.setClipboardMaxItems.mockResolvedValue({ ...snapshot, maxItems: 20 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClipboardSection 列表", () => {
  it("页头显示计数，行只留摘要与来源 · 时间", async () => {
    render(<ClipboardSection />);

    const preview = await screen.findByText(/第一行：把这段代码改成异步/);
    expect(preview.className).toContain("truncate");
    // 计数与「清空」并进同一个玻璃动作组（iOS 工具栏胶囊）。
    const count = screen.getByText("2 / 100 条");
    expect(count.closest(".dsl-action-group")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "清空" }).closest(".dsl-action-group"),
    ).not.toBeNull();
    expect(screen.getByText("文本 · 刚刚")).toBeInTheDocument();
    expect(screen.getByText("链接 · 刚刚")).toBeInTheDocument();
  });

  it("页头叫「剪贴板」，设置组就在本页（D119）", async () => {
    render(<ClipboardSection />);

    expect(await screen.findByRole("heading", { name: "剪贴板" })).toBeInTheDocument();
    expect(screen.getByText("设置")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "记录剪贴板" })).toBeInTheDocument();
    expect(screen.getByText("密码框与隐藏内容")).toBeInTheDocument();
    expect(screen.getByText("不记录")).toBeInTheDocument();
    expect(screen.getByText("最多保留")).toBeInTheDocument();
  });

  it("改「最多保留」立即生效，页头计数跟着换（D121）", async () => {
    render(<ClipboardSection />);
    await screen.findByText(/第一行：把这段代码改成异步/);

    fireEvent.click(screen.getByRole("button", { name: "20" }));

    await waitFor(() => expect(api.setClipboardMaxItems).toHaveBeenCalledWith(20));
    await waitFor(() => expect(useClipboardStore.getState().snapshot?.maxItems).toBe(20));
    expect(screen.getByText("2 / 20 条")).toBeInTheDocument();
  });

  it("点击整行复制，并 toast 反馈", async () => {
    render(<ClipboardSection />);

    fireEvent.click(await screen.findByRole("button", { name: /第一行：把这段代码改成异步/ }));

    await waitFor(() => expect(api.copyClipboardItem).toHaveBeenCalledWith("1"));
    expect(toast.success).toHaveBeenCalledWith("已复制到剪贴板");
    expect(await screen.findByText("已复制")).toBeInTheDocument();
    // 行尾的 ✓ 是 Motion 的 spring 元素，出现在被复制的这一行。
    expect(document.querySelector('[data-copied="true"]')).not.toBeNull();
  });

  it("置顶与删除都是带名字的可聚焦按钮", async () => {
    render(<ClipboardSection />);

    // 第二条已置顶：常显标记 + 「取消置顶」按钮。
    await screen.findByText("https://tauri.app/start/");
    expect(screen.getByText("已置顶")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "置顶" })[0]);
    await waitFor(() => expect(api.toggleClipboardPin).toHaveBeenCalledWith("1"));

    fireEvent.click(screen.getAllByRole("button", { name: "删除这条" })[0]);
    await waitFor(() => expect(api.deleteClipboardItem).toHaveBeenCalledWith("1"));
  });
});

describe("ClipboardSection 搜索与空态", () => {
  it("搜索是胶囊输入，按文本过滤，无匹配时只留一行结论", async () => {
    render(<ClipboardSection />);
    await screen.findByText(/第一行：把这段代码改成异步/);

    const input = screen.getByLabelText("搜索剪贴板");
    expect(input).toHaveAttribute("placeholder", "搜索");
    expect(input.closest(".dsl-search")).not.toBeNull();
    fireEvent.change(input, { target: { value: "tauri" } });

    expect(screen.queryByText(/第一行：把这段代码改成异步/)).toBeNull();
    expect(screen.getByText("https://tauri.app/start/")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "不存在的内容" } });
    expect(screen.getByText("没有匹配的内容")).toBeInTheDocument();
  });

  it("没有记录时显示一行空态", async () => {
    api.listClipboard.mockResolvedValue({ ...snapshot, items: [] });
    render(<ClipboardSection />);

    expect(await screen.findByText("还没有记录")).toBeInTheDocument();
  });
});

describe("ClipboardSection 开关与清空", () => {
  it("暂停记录走同一个开关", async () => {
    render(<ClipboardSection />);

    fireEvent.click(screen.getByLabelText("记录剪贴板"));

    await waitFor(() => expect(api.setClipboardEnabled).toHaveBeenCalledWith(false));
  });

  it("清空需要二次确认", async () => {
    api.clearClipboard.mockResolvedValue({ ...snapshot, items: [] });
    render(<ClipboardSection />);
    await screen.findByText(/第一行：把这段代码改成异步/);

    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("清空剪贴板历史？")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "清空" }));

    await waitFor(() => expect(api.clearClipboard).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
