import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import { addDays, weekdayLabel } from "@/shared/lib/calendar";

const rec = vi.hoisted(() => ({
  phase: "idle" as "idle" | "starting" | "recording" | "saving",
  elapsedMs: 0,
  level: 0,
  peak: 0,
  start: vi.fn(),
  stop: vi.fn(async () => undefined),
  cancel: vi.fn(async () => undefined),
}));

const store = vi.hoisted(() => {
  const state = {
    items: [] as Array<Record<string, unknown>>,
    loading: false,
    error: null as string | null,
    key: null,
    setRecorderPhase: vi.fn(),
    load: vi.fn(async () => undefined),
    loadKey: vi.fn(async () => undefined),
  };
  return { state };
});

const ui = vi.hoisted(() => ({ setView: vi.fn() }));

vi.mock("@/mobile/features/memo/memo-recorder", () => ({
  useMemoRecorder: (options: { onSaved?: (memo: unknown) => void }) => ({
    ...rec,
    // 暴露 onSaved 便于断言“保存后跳到条目日”
    onSaved: options.onSaved,
  }),
}));

vi.mock("@/mobile/features/memo/memo-store", () => ({
  useMemoStore: (selector: (state: typeof store.state) => unknown) => selector(store.state),
  memoBusyNow: () => false,
}));

vi.mock("@/mobile/ui-store", () => ({
  useUiStore: (selector: (state: typeof ui) => unknown) => selector(ui),
}));

vi.mock("@/shared/lib/tauri", () => ({
  memoSyncNow: vi.fn(async () => undefined),
  haptic: vi.fn(async () => undefined),
}));

vi.mock("@/mobile/features/memo/memo-detail-page", () => ({
  MemoDetailPage: () => <div data-testid="detail" />,
}));

import { MemoPage } from "./memo-page";

function memo(createdAt: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `memo-${createdAt}`,
    title: "今天的想法",
    summary: null,
    memoType: "idea",
    status: "done",
    durationMs: 30_000,
    createdAt,
    synced: true,
    audioBytes: 960_000,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  clearBackHandlers();
  rec.phase = "idle";
  rec.stop.mockClear();
  rec.start.mockClear();
  rec.cancel.mockClear();
  store.state.items = [];
  store.state.loading = false;
  store.state.error = null;
  store.state.key = null;
  store.state.setRecorderPhase.mockClear();
  ui.setView.mockClear();
});

afterEach(() => cleanup());

describe("手机备忘录页（D124）", () => {
  it("默认周视角，空日显示空态与底部录音条", () => {
    render(<MemoPage />);
    expect(screen.getByRole("button", { name: "下一周" })).toBeInTheDocument();
    expect(screen.getByText("还没有备忘录")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /开始录音/ })).toBeInTheDocument();
    expect(screen.getByText("按住说松手存 · 轻点开始，再点结束")).toBeInTheDocument();
  });

  it("只显示选中日的条目，切到月视角点昨天会筛选", () => {
    const now = new Date();
    const yesterday = addDays(now, -1);
    store.state.items = [
      memo(now.getTime()),
      memo(yesterday.getTime(), { id: "yesterday-1", title: "昨天的想法" }),
    ];
    render(<MemoPage />);

    expect(screen.getByText("今天的想法")).toBeInTheDocument();
    expect(screen.queryByText("昨天的想法")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "月" }));
    const label = `${yesterday.getMonth() + 1} 月 ${yesterday.getDate()} 日 ${weekdayLabel(
      yesterday,
    )}，1 条记录`;
    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(screen.getByText("昨天的想法")).toBeInTheDocument();
    expect(screen.queryByText("今天的想法")).toBeNull();
  });

  it("录音中禁用日历与条目，返回先停存并留在本页", () => {
    rec.phase = "recording";
    store.state.items = [memo(Date.now())];
    render(<MemoPage />);

    expect(screen.getByRole("button", { name: "月" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "回到今天" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /今天的想法/ })).toBeDisabled();

    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(rec.stop).toHaveBeenCalled();
    expect(ui.setView).not.toHaveBeenCalled();
  });

  it("月视角返回先回周视角，再返回才离开", () => {
    render(<MemoPage />);
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(screen.getByRole("button", { name: "上个月" })).toBeInTheDocument();

    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(ui.setView).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "上一周" })).toBeInTheDocument();

    expect(handleBack()).toBe(false);
  });

  it("选中日不是今天时，页头今天是可点的", () => {
    render(<MemoPage />);
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    fireEvent.click(screen.getByRole("button", { name: "上个月" }));
    // 上个月里点 1 号
    const first = new Date();
    const lastMonth = new Date(first.getFullYear(), first.getMonth() - 1, 1);
    fireEvent.click(
      screen.getByRole("button", {
        name: `${lastMonth.getMonth() + 1} 月 1 日 ${weekdayLabel(lastMonth)}，没有记录`,
      }),
    );
    expect(screen.getByRole("button", { name: "回到今天" })).toBeEnabled();
  });
  it("月视角翻到别的月份后，点今天回到本月", () => {
    render(<MemoPage />);
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    fireEvent.click(screen.getByRole("button", { name: "上个月" }));
    const now = new Date();
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentLabel = `${now.getMonth() + 1} 月`;
    const previousLabel =
      previous.getFullYear() === now.getFullYear()
        ? `${previous.getMonth() + 1} 月`
        : `${previous.getFullYear()} 年 ${previous.getMonth() + 1} 月`;
    expect(screen.getByText(previousLabel)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "回到今天" }));
    expect(screen.getByText(currentLabel)).toBeInTheDocument();
  });
});
