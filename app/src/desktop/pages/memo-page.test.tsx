import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, weekdayLabel } from "@/shared/lib/calendar";

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

function memo(createdAt: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `memo-${createdAt}`,
    title: "下班路上买牛奶",
    summary: null,
    memoType: "todo",
    status: "done",
    durationMs: 42_000,
    createdAt,
    synced: true,
    audioBytes: 1_344_000,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  mocks.state.items = [];
  mocks.state.loading = false;
  mocks.state.error = null;
  mocks.state.detail = null;
  mocks.state.detailLoading = false;
  mocks.load.mockReset();
  mocks.open.mockReset();
});

afterEach(() => cleanup());

describe("桌面备忘录一级页（D124）", () => {
  it("默认月视角，空日显示空态", () => {
    render(<MemoPage />);
    expect(screen.getAllByRole("heading", { name: "备忘录" }).length).toBeGreaterThan(0);
    expect(
      screen.getByText("这一天还没有记录。手机这天录的备忘录会同步到这里。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上个月" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "月", pressed: true })).toBeInTheDocument();
    expect(mocks.load).toHaveBeenCalled();
  });

  it("只显示选中日的条目，点日历里另一天会筛选", () => {
    const today = new Date();
    const yesterday = addDays(today, -1);
    mocks.state.items = [
      memo(today.getTime() - 60_000, { id: "today-1" }),
      memo(yesterday.getTime(), {
        id: "yesterday-1",
        title: "昨天的想法",
        createdAt: yesterday.getTime(),
      }),
    ];
    render(<MemoPage />);

    expect(
      screen.getByText(new RegExp(`${today.getMonth() + 1} 月 ${today.getDate()} 日`)),
    ).toBeInTheDocument();
    expect(screen.getByText("下班路上买牛奶")).toBeInTheDocument();
    expect(screen.queryByText("昨天的想法")).toBeNull();

    const label = `${yesterday.getMonth() + 1} 月 ${yesterday.getDate()} 日 ${weekdayLabel(
      yesterday,
    )}，1 条记录`;
    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(screen.getByText("昨天的想法")).toBeInTheDocument();
    expect(screen.queryByText("下班路上买牛奶")).toBeNull();
  });

  it("切到周视角后可以按周翻页", () => {
    render(<MemoPage />);
    fireEvent.click(screen.getByRole("button", { name: "周" }));
    expect(screen.getByRole("button", { name: "上一周" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "周", pressed: true })).toBeInTheDocument();
  });

  it("点条目打开详情", () => {
    mocks.state.items = [memo(Date.now() - 60_000)];
    render(<MemoPage />);
    fireEvent.click(screen.getByRole("button", { name: /下班路上买牛奶/ }));
    expect(mocks.open).toHaveBeenCalled();
  });
});
