import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { useUiStore } from "@/mobile/ui-store";
import type { SessionSummary } from "@/protocol/messages";
import { AskingPage } from "./asking-page";

const tauri = vi.hoisted(() => ({
  sendFocusRequest: vi.fn(async () => undefined),
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  sendFocusRequest: tauri.sendFocusRequest,
}));

vi.mock("@/mobile/features/sessions/session-storage", () => ({
  loadCleared: async () => ({}),
  saveCleared: async () => undefined,
}));

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s-1",
    title: "重构登录模块",
    source: "dsh",
    state: "asking",
    askKind: "question",
    lastEventAt: Date.now() - 2 * 60 * 1000,
    completedAt: null,
    ...overrides,
  };
}

function seed(list: SessionSummary[]) {
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
  useUiStore.setState({ view: "asking", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({ status: "connected", addr: "192.168.1.5:47810" });
  useSessionStore.getState().clearAll();
  tauri.sendFocusRequest.mockReset();
  tauri.sendFocusRequest.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("AskingPage", () => {
  it("首个 asking 做 hero：状态、标题、说明与唯一主行动", () => {
    seed([session()]);
    render(<AskingPage />);

    expect(screen.getByRole("heading", { level: 1, name: "等你决定" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "重构登录模块" })).toBeInTheDocument();
    expect(screen.getByText(/手机不能批准或拒绝/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "在电脑上继续" })).toBeInTheDocument();
    // 手机不提供批准/拒绝。
    expect(screen.queryByRole("button", { name: /批准|拒绝|同意/ })).toBeNull();
  });

  it("「在电脑上继续」发 focus.request，并显示 pending 状态", () => {
    seed([session()]);
    render(<AskingPage />);

    fireEvent.click(screen.getByRole("button", { name: "在电脑上继续" }));
    expect(tauri.sendFocusRequest).toHaveBeenCalledWith("dsh", "s-1", expect.any(String));
    expect(useSessionStore.getState().pendingFocusId).toBe("s-1");

    act(() => {
      useSessionStore.getState().handleFocusResult({
        type: "focus.result",
        v: 1,
        requestId: useSessionStore.getState().pendingRequestId ?? "x",
        source: "dsh",
        ok: false,
        error: "launch_failed",
        ts: 1,
      });
    });
    expect(screen.getByRole("status").textContent).toContain("没有找到 DeepSeek Harness");
  });

  it("其它 asking 列表最多 5 条、可逐条「在电脑上继续」", () => {
    seed([
      session({ id: "s-1", title: "第一件" }),
      session({ id: "s-2", title: "第二件" }),
      session({ id: "s-3", title: "第三件" }),
    ]);
    render(<AskingPage />);

    expect(screen.getByText("其它等你决定")).toBeInTheDocument();
    expect(screen.getByText("最多 5 条 · 内部滚动")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 第二件" }));
    expect(tauri.sendFocusRequest).toHaveBeenCalledWith("dsh", "s-2", expect.any(String));
  });

  it("未连接时禁用主行动并给「去连接」", () => {
    useConnectionStore.setState({ status: "disconnected" });
    seed([session()]);
    render(<AskingPage />);

    expect(screen.getByRole("button", { name: "在电脑上继续" })).toBeDisabled();
    expect(screen.getByText(/还没连上电脑/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "去连接" }));
    expect(useUiStore.getState().view).toBe("offline");
  });

  it("没有 asking 时回退宠物页", () => {
    seed([session({ state: "working", askKind: null })]);
    render(<AskingPage />);

    expect(useUiStore.getState().view).toBe("pet");
  });

  it("返回按钮回宠物页（返回层级 asking → pet）", () => {
    seed([session()]);
    render(<AskingPage />);

    fireEvent.click(screen.getByRole("button", { name: "返回宠物" }));
    expect(useUiStore.getState().view).toBe("pet");
  });

  it("无剪贴板即可复制标题失败提示", () => {
    seed([session()]);
    render(<AskingPage />);

    fireEvent.click(screen.getByRole("button", { name: "复制标题" }));
    expect(screen.getByText(/失败会显示原因|复制失败|先连接电脑/)).toBeInTheDocument();
  });
});
