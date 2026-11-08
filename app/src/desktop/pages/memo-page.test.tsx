import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const load = vi.fn();
  const open = vi.fn();
  const close = vi.fn();
  return {
    load,
    open,
    close,
    state: {
      items: [] as Array<Record<string, unknown>>,
      loading: false,
      error: null as string | null,
      detail: null,
      detailLoading: false,
      load,
      open,
      close,
    },
  };
});

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (path: string) => path }));
vi.mock("@/shared/lib/tauri", () => ({ subscribeMemoChanged: () => () => {} }));
vi.mock("@/desktop/features/memo/memo-store", () => ({
  useDesktopMemoStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
}));

import { MemoPage } from "./memo-page";

beforeEach(() => {
  mocks.state.items = [];
  mocks.state.loading = false;
  mocks.state.error = null;
  mocks.state.detail = null;
  mocks.state.detailLoading = false;
  mocks.load.mockReset();
  mocks.open.mockReset();
});

afterEach(() => cleanup());

describe("桌面备忘录一级页", () => {
  it("页头是备忘录，空态不再带剪贴板分段", () => {
    render(<MemoPage />);
    expect(screen.getAllByRole("heading", { name: "备忘录" }).length).toBeGreaterThan(0);
    expect(
      screen.getByText("手机还没同步过备忘录。在手机上录一条就会出现在这里。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("剪贴板")).toBeNull();
    expect(mocks.load).toHaveBeenCalled();
  });

  it("有数据时渲染列表并可打开详情", () => {
    mocks.state.items = [
      {
        id: "memo-1",
        title: "下班路上买牛奶",
        summary: null,
        memoType: "todo",
        status: "done",
        durationMs: 42_000,
        createdAt: Date.now() - 60_000,
        synced: true,
        audioBytes: 1_344_000,
      },
    ];
    render(<MemoPage />);
    expect(screen.getByText("下班路上买牛奶")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /下班路上买牛奶/ }));
    expect(mocks.open).toHaveBeenCalledWith("memo-1");
  });
});
