import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
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
    notice: null,
    noticeId: 0,
    pendingFocusId: null,
    pendingRequestId: null,
  });
}

beforeEach(() => {
  localStorage.clear();
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

  it("麦克风是居中圆形（shape=circle），距底 56（原来 24 太贴屏幕下沿）", () => {
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
