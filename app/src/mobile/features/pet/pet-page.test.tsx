import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useFirstUseStore } from "@/mobile/features/first-use/store";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { useUiStore } from "@/mobile/ui-store";
import type { SessionSummary } from "@/protocol/messages";
import { createIdleAiStatus } from "./ai-status";
import { PetPage } from "./pet-page";
import { usePetStore } from "./pet-store";

vi.mock("@/mobile/features/mic/mic-button", () => ({
  MicButton: ({ bottomOffsetClassName }: { bottomOffsetClassName?: string }) => (
    <div data-testid="mic-capsule" data-offset={bottomOffsetClassName}>
      <button type="button">按住说话，麦克风</button>
    </div>
  ),
}));

const tauri = vi.hoisted(() => ({
  setKeepScreenOn: vi.fn(async () => undefined),
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  setKeepScreenOn: tauri.setKeepScreenOn,
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
    pendingClearId: null,
  });
}

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState({ view: "pet", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({ status: "connected", addr: "192.168.1.5:47810" });
  useFirstUseStore.setState({ micReady: false, dismissed: false, hydrated: false });
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

describe("PetPage 顶部状态条", () => {
  it("左侧设置、中间连接状态、右侧消息；连接状态点按打开连接页", () => {
    render(<PetPage />);

    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "消息" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /连接状态：已连接/ }));
    expect(useUiStore.getState().view).toBe("offline");
    expect(useUiStore.getState().offlineReturnView).toBe("pet");
  });

  it("未连接时显示「还没连上电脑」，点按去连接", () => {
    useConnectionStore.setState({ status: "disconnected" });
    render(<PetPage />);

    expect(screen.getAllByText("还没连上电脑").length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: /连接状态：还没连上电脑/ }));
    expect(useUiStore.getState().view).toBe("offline");
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

describe("PetPage 首用清单", () => {
  it("显示本地可验证的进度，后两步标注在电脑上完成", () => {
    render(<PetPage />);

    expect(screen.getByText("首用清单")).toBeInTheDocument();
    expect(screen.getByText(/1\/4/)).toBeInTheDocument();
    expect(screen.getByText(/还差 3 步 · 当前：允许麦克风权限/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /首用清单，已完成 1\/4/ }));

    expect(screen.getByText("连接电脑")).toBeInTheDocument();
    expect(screen.getByText("允许麦克风权限")).toBeInTheDocument();
    expect(screen.getByText("在电脑上配置百炼语音")).toBeInTheDocument();
    expect(screen.getByText("在电脑上开启辅助功能")).toBeInTheDocument();
    expect(screen.getAllByText("在电脑上完成").length).toBe(2);
    expect(screen.getByText(/本地只验证「连接」与「麦克风」/)).toBeInTheDocument();
  });

  it("麦克风已就绪时本地两步都算完成，进度变 2/4", () => {
    useFirstUseStore.setState({ micReady: true, hydrated: true });
    render(<PetPage />);

    expect(screen.getByText(/2\/4/)).toBeInTheDocument();
    expect(screen.getByText(/当前：在电脑上完成剩余两步/)).toBeInTheDocument();
  });

  it("可以整卡收起，并记住收起状态", () => {
    render(<PetPage />);

    fireEvent.click(screen.getByRole("button", { name: "收起首用清单" }));

    expect(screen.queryByText("首用清单")).not.toBeInTheDocument();
    expect(useFirstUseStore.getState().dismissed).toBe(true);
    expect(localStorage.getItem("sidekick:first-use")).toContain('"dismissed":true');
  });

  it("未连接时展开清单给「去连接」，不伪造后续步骤完成", () => {
    useConnectionStore.setState({ status: "disconnected" });
    render(<PetPage />);

    fireEvent.click(screen.getByRole("button", { name: /首用清单，已完成 0\/4/ }));
    const connect = screen.getByRole("button", { name: "去连接" });
    fireEvent.click(connect);

    expect(useUiStore.getState().view).toBe("offline");
    expect(useFirstUseStore.getState().micReady).toBe(false);
  });
});

describe("PetPage 现在一行", () => {
  it("空闲时显示「空闲 · 小跟班在陪你」，点按进动态页", () => {
    render(<PetPage />);

    const now = screen.getByRole("button", { name: /AI 状态：空闲/ });
    expect(now).toHaveTextContent("小跟班在陪你");
    fireEvent.click(now);
    expect(useUiStore.getState().view).toBe("stream");
  });

  it("工作中按 D78 显示 spinner +「正在<动作>」与机会话标题，不写「工作中」", () => {
    usePetStore.setState((state) => ({
      ai: { ...state.ai, state: "working", resume: "working", enteredAt: Date.now() },
    }));
    seedSessions([session({ state: "working", tool: "bash" })]);
    const { container } = render(<PetPage />);

    expect(screen.getByText("正在运行命令")).toBeInTheDocument();
    expect(screen.getAllByText("重构登录模块").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("工作中")).toBeNull();
    expect(container.querySelector("[data-now-spinner]")).not.toBeNull();
  });

  it("工作中无工具类别时「正在思考」", () => {
    usePetStore.setState((state) => ({
      ai: { ...state.ai, state: "working", resume: "working", enteredAt: Date.now() },
    }));
    seedSessions([session({ state: "working", tool: null })]);
    render(<PetPage />);

    expect(screen.getByText("正在思考")).toBeInTheDocument();
  });

  it("等你决定时显示数量并直达等你决定页", () => {
    usePetStore.setState((state) => ({
      ai: { ...state.ai, state: "asking", resume: "asking", enteredAt: Date.now() },
    }));
    seedSessions([
      session({ id: "s-1", state: "asking", askKind: "question" }),
      session({ id: "s-2", title: "第二件事", state: "asking", askKind: "approval" }),
    ]);
    render(<PetPage />);

    expect(screen.getByText("等你决定")).toBeInTheDocument();
    expect(screen.getByText("2 个决定在电脑上等你")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /AI 状态：等你决定/ }));
    expect(useUiStore.getState().view).toBe("asking");
  });

  it("未连接时「现在」行变成去连接入口", () => {
    useConnectionStore.setState({ status: "disconnected" });
    render(<PetPage />);

    const now = screen.getByRole("button", { name: /AI 状态：还没连上电脑/ });
    expect(now).toHaveTextContent("点这里去连接");
    fireEvent.click(now);
    expect(useUiStore.getState().view).toBe("offline");
  });
});

describe("PetPage 最近 1 条会话", () => {
  it("复用 D78 行：工作中显示 spinner +「正在<动作>」", () => {
    seedSessions([session({ state: "working", tool: "edit", title: "修改登录页" })]);
    const { container } = render(<PetPage />);

    const list = screen.getByRole("list", { name: "最近会话" });
    expect(list.querySelectorAll("li")).toHaveLength(1);
    expect(screen.getByText("修改登录页")).toBeInTheDocument();
    expect(screen.getByText("正在修改文件 ·")).toBeInTheDocument();
    expect(container.querySelector("[data-session-spinner]")).not.toBeNull();
    expect(screen.queryByText("工作中")).toBeNull();
  });

  it("最近会话按优先级只显示 1 条：asking 直达等你决定页", () => {
    seedSessions([
      session({ state: "asking", askKind: "question", title: "等你决定的事" }),
      session({ id: "s-2", state: "working", tool: "edit", title: "修改登录页" }),
    ]);
    render(<PetPage />);

    expect(screen.getByText("等你决定的事")).toBeInTheDocument();
    expect(screen.queryByText("修改登录页")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "最近会话 等你决定的事" }));
    expect(useUiStore.getState().view).toBe("asking");
  });

  it("没有会话时不显示最近会话区", () => {
    render(<PetPage />);

    expect(screen.queryByRole("list", { name: "最近会话" })).toBeNull();
  });
});

describe("PetPage 布局与导航", () => {
  it("底部三档 + 麦克风胶囊都渲染，胶囊在底部导航之上", () => {
    render(<PetPage />);

    expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
    for (const name of ["宠物", "动态", "更多"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    const mic = screen.getByTestId("mic-capsule");
    expect(mic).toHaveAttribute("data-offset", "bottom-[calc(env(safe-area-inset-bottom)+74px)]");
    expect(screen.getByRole("button", { name: "按住说话，麦克风" })).toBeInTheDocument();
  });

  it("点底部「动态」「更多」切换视图", () => {
    render(<PetPage />);

    fireEvent.click(screen.getByRole("button", { name: "动态" }));
    expect(useUiStore.getState().view).toBe("stream");

    act(() => useUiStore.setState({ view: "pet" }));
    fireEvent.click(screen.getByRole("button", { name: "更多" }));
    expect(useUiStore.getState().view).toBe("settings");
  });

  it("宠物页不再有会话浮层（完整列表在动态页）", () => {
    seedSessions([session()]);
    const { container } = render(<PetPage />);

    expect(container.querySelector('[aria-label="AI 会话列表"]')).toBeNull();
    expect(screen.queryByText("展开会话列表")).toBeNull();
  });
});
