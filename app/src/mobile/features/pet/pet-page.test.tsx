import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import type { SessionSummary } from "@/protocol/messages";
import { createIdleAiStatus } from "./ai-status";
import { PetPage } from "./pet-page";
import { usePetStore } from "./pet-store";

vi.mock("@/mobile/features/mic/mic-button", () => ({
  MicButton: ({
    shape,
    bottomOffsetClassName,
  }: {
    shape?: string;
    bottomOffsetClassName?: string;
  }) => (
    <div data-testid="mic" data-shape={shape} data-offset={bottomOffsetClassName}>
      <button type="button">按住说话，麦克风</button>
    </div>
  ),
}));

// jsdom 没有 PointerEvent，用 MouseEvent 顶替（照 session-feed.test.tsx 的写法）。
beforeAll(() => {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: window.MouseEvent,
  });
});

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s-1",
    title: "重构登录模块",
    source: "dsh",
    state: "working",
    askKind: null,
    lastEventAt: Date.now() - 2 * 60 * 1000,
    completedAt: null,
    ...overrides,
  };
}

function seedSessions(list: SessionSummary[]) {
  useSessionStore.setState({
    raw: list,
    cleared: {},
    hydrated: true,
    hasBaseline: true,
    pendingExpand: false,
    freshIds: [],
    notice: null,
    noticeId: 0,
    pendingFocusId: null,
    pendingRequestId: null,
  });
}

beforeEach(() => {
  localStorage.clear();
  clearBackHandlers();
  useUiStore.setState({ view: "pet", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({ status: "connected", addr: "192.168.1.5:47810" });
  useSessionStore.getState().clearAll();
  useMicStore.setState({ phase: "idle", session: null, result: null, error: null });
  usePetStore.setState({
    hydrated: true,
    ai: createIdleAiStatus(),
    aiCaption: null,
    bubble: null,
    micListening: false,
    pet: {
      ...usePetStore.getState().pet,
      phase: "idle",
      mood: "content",
      onboarded: true,
      settings: { ...usePetStore.getState().pet.settings, keepAwake: true },
    },
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  useSessionStore.getState().clearAll();
  clearBackHandlers();
});

describe("PetPage v16 顶栏", () => {
  it("左设置、中连接状态、右消息；状态点按打开连接页", () => {
    render(<PetPage />);

    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "消息" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /连接状态：已连接/ }));
    expect(useUiStore.getState().view).toBe("offline");
    expect(useUiStore.getState().offlineReturnView).toBe("pet");
  });

  it("设置与消息按钮跳到对应页面", () => {
    render(<PetPage />);

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(useUiStore.getState().view).toBe("settings");

    act(() => useUiStore.setState({ view: "pet" }));
    fireEvent.click(screen.getByRole("button", { name: "消息" }));
    expect(useUiStore.getState().view).toBe("chat");
  });
});

describe("PetPage v16 结构", () => {
  it("没有底部导航、首用清单和「陪你工作中」状态行", () => {
    render(<PetPage />);

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("首用清单")).not.toBeInTheDocument();
    expect(screen.queryByText(/陪你工作中/)).not.toBeInTheDocument();
    expect(screen.queryByText("小跟班 · Sidekick")).not.toBeInTheDocument();
  });

  it("麦克风是居中圆形（shape=circle），距底 56；卡片位置由 MicButton 内部管理", () => {
    render(<PetPage />);

    const mic = screen.getByTestId("mic");
    expect(mic).toHaveAttribute("data-shape", "circle");
    expect(mic.getAttribute("data-offset")).toContain("+56px");
  });
});

describe("PetPage v16 消息卡", () => {
  it("有会话时显示标题，折叠一条 + 还有 N 条，可展开/收起", () => {
    seedSessions([
      session({ id: "s-1", title: "重构登录模块" }),
      session({ id: "s-2", title: "修一下设置页", state: "idle", completedAt: Date.now() - 1000 }),
    ]);
    render(<PetPage />);

    expect(screen.getByText("重构登录模块")).toBeInTheDocument();
    expect(screen.getByText("还有 1 条")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));
    expect(screen.getByText("修一下设置页")).toBeInTheDocument();
    expect(screen.getByText("收起")).toBeInTheDocument();
  });

  it("点 asking 行进入等你决定页", () => {
    seedSessions([session({ id: "s-1", title: "审批发布", state: "asking", askKind: "approval" })]);
    render(<PetPage />);

    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 审批发布" }));
    expect(useUiStore.getState().view).toBe("asking");
  });

  it("点清除按钮清除行；没有会话时整卡隐藏", () => {
    seedSessions([session({ id: "s-1", title: "待清除会话" })]);
    const { rerender } = render(<PetPage />);

    fireEvent.click(screen.getByRole("button", { name: "清除会话 待清除会话" }));
    expect(useSessionStore.getState().cleared["s-1"]).toBeTruthy();

    seedSessions([]);
    rerender(<PetPage />);
    expect(screen.queryByText("会话")).not.toBeInTheDocument();
  });

  it("已完成会话超过 2 小时自动隐藏，未超过仍显示", () => {
    const now = Date.now();
    seedSessions([
      session({
        id: "s-stale",
        title: "三小时前完成",
        state: "idle",
        completedAt: now - 3 * 60 * 60 * 1000,
        lastEventAt: now - 3 * 60 * 60 * 1000,
      }),
      session({
        id: "s-fresh",
        title: "一小时前完成",
        state: "idle",
        completedAt: now - 60 * 60 * 1000,
        lastEventAt: now - 60 * 60 * 1000,
      }),
    ]);
    render(<PetPage />);

    expect(screen.queryByText("三小时前完成")).toBeNull();
    expect(screen.getByText("一小时前完成")).toBeInTheDocument();
  });

  it("宠物页停留时，已完成会话到 2 小时自动消失", () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      seedSessions([
        session({
          id: "s-1",
          title: "快到两小时",
          state: "idle",
          completedAt: now - 119 * 60 * 1000,
          lastEventAt: now - 119 * 60 * 1000,
        }),
      ]);
      render(<PetPage />);
      expect(screen.getByText("快到两小时")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2 * 60 * 1000);
      });
      expect(screen.queryByText("快到两小时")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("PetPage v18 会话卡浮层（D107）", () => {
  /** 鲸鱼居中容器的顶部预留（px）；展开/收起都不应变。 */
  function reserveTopOf(container: HTMLElement): string {
    const stage = container.querySelector("[data-phase]");
    const inner = stage?.firstElementChild;
    if (!(inner instanceof HTMLElement)) throw new Error("宠物舞台未渲染");
    return inner.style.top;
  }

  function twoSessions() {
    const now = Date.now();
    return [
      session({ id: "s-1", title: "重构登录模块", lastEventAt: now }),
      session({
        id: "s-2",
        title: "修一下设置页",
        state: "idle",
        completedAt: now - 5 * 60 * 1000,
        lastEventAt: now - 5 * 60 * 1000,
      }),
    ];
  }

  it("展开/收起会话卡时宠物预留高度不变（鲸鱼不位移）", () => {
    seedSessions(twoSessions());
    const { container } = render(<PetPage />);

    const before = reserveTopOf(container);
    expect(before).toBe("130px");

    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));
    expect(reserveTopOf(container)).toBe(before);
    expect(screen.getByText("收起")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "收起会话列表" }));
    expect(reserveTopOf(container)).toBe(before);
  });

  it("点卡片外空白收起列表", () => {
    seedSessions(twoSessions());
    const { container } = render(<PetPage />);
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));

    const catcher = container.querySelector("[data-feed-catcher]");
    if (!(catcher instanceof HTMLElement)) throw new Error("点空白层未渲染");
    fireEvent.pointerDown(catcher);

    expect(screen.getByText("还有 1 条")).toBeInTheDocument();
    expect(container.querySelector("[data-feed-catcher]")).toBeNull();
  });

  it("返回键先收起列表，收起后不再消费返回", () => {
    seedSessions(twoSessions());
    render(<PetPage />);
    fireEvent.click(screen.getByRole("button", { name: "展开会话列表" }));
    expect(screen.getByText("收起")).toBeInTheDocument();

    act(() => {
      expect(handleBack()).toBe(true);
    });
    expect(screen.getByText("还有 1 条")).toBeInTheDocument();
    expect(handleBack()).toBe(false);
  });

  it("新完成时自动展开，并给刚完成的行铺薄荷脉冲", () => {
    const now = Date.now();
    seedSessions([
      session({ id: "s-1", title: "正在做的事", state: "working", lastEventAt: now }),
      session({
        id: "s-2",
        title: "旧会话",
        state: "idle",
        completedAt: now - 60 * 60 * 1000,
        lastEventAt: now - 60 * 60 * 1000,
      }),
    ]);
    render(<PetPage />);
    expect(screen.queryByText("收起")).toBeNull();

    act(() => {
      useSessionStore.getState().apply([
        session({
          id: "s-1",
          title: "正在做的事",
          state: "idle",
          completedAt: Date.now(),
          lastEventAt: Date.now(),
        }),
        session({
          id: "s-2",
          title: "旧会话",
          state: "idle",
          completedAt: now - 60 * 60 * 1000,
          lastEventAt: now - 60 * 60 * 1000,
        }),
      ]);
    });

    expect(screen.getByText("收起")).toBeInTheDocument();
    expect(document.querySelector(".ms-row-fresh")).not.toBeNull();
  });

  it("点已完成行请求把电脑上的 DSH 切到前台（focus.request）", () => {
    const requestFocus = vi.fn();
    useSessionStore.setState({ requestFocus });
    seedSessions([
      session({
        id: "s-done",
        title: "写完了",
        state: "idle",
        completedAt: Date.now() - 60_000,
        lastEventAt: Date.now() - 60_000,
      }),
    ]);

    render(<PetPage />);
    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 写完了" }));
    expect(requestFocus).toHaveBeenCalledWith("s-done");
  });

  it("focus 结果提示显示在麦克风上方", () => {
    seedSessions([]);
    useSessionStore.setState({ noticeId: 1, notice: "已在电脑上打开 DeepSeek Harness。" });
    render(<PetPage />);
    expect(screen.getByText("已在电脑上打开 DeepSeek Harness。")).toBeInTheDocument();
  });
});
