import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { clearBackHandlers, handleBack } from "@/mobile/system-back";
import type { SessionSummary } from "@/protocol/messages";
import { SessionPanel } from "./session-panel";
import { useSessionStore, visibleSessions } from "./session-store";

const tauri = vi.hoisted(() => ({
  sendFocusRequest: vi.fn(async () => undefined),
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  sendFocusRequest: tauri.sendFocusRequest,
}));

vi.mock("./session-storage", () => ({
  loadCleared: async () => ({}),
  saveCleared: async () => undefined,
}));

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s-1",
    title: "修复登录",
    source: "dsh",
    state: "working",
    askKind: null,
    lastEventAt: 1000,
    completedAt: null,
    ...overrides,
  };
}

function seed(list: SessionSummary[], expanded = false) {
  useSessionStore.setState({
    raw: list,
    cleared: {},
    hydrated: true,
    expanded,
    notice: null,
    noticeId: 0,
    pendingFocusId: null,
    pendingRequestId: null,
    pendingClearId: null,
    lastAskingIds: list.filter((item) => item.state === "asking").map((item) => item.id),
    seenSnapshot: true,
  });
}

beforeEach(() => {
  useSessionStore.getState().clearAll();
  seed([session()]);
  tauri.sendFocusRequest.mockReset();
  tauri.sendFocusRequest.mockResolvedValue(undefined);
  useConnectionStore.setState({ status: "connected" });
});

afterEach(() => {
  cleanup();
  clearBackHandlers();
});

describe("SessionPanel", () => {
  it("renders nothing when there are no visible sessions", () => {
    seed([]);
    const { container } = render(<SessionPanel active />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on the chat page", () => {
    const { container } = render(<SessionPanel active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("collapsed shows only the highest-priority session", () => {
    seed([
      session({ id: "s-1", title: "工作中", state: "working" }),
      session({ id: "s-2", title: "等你决定", state: "asking", askKind: "question" }),
    ]);
    render(<SessionPanel active />);

    expect(screen.getByText("等你决定")).toBeInTheDocument();
    expect(screen.queryByText("工作中")).toBeNull();
    expect(screen.queryByText("会话")).toBeNull();
  });

  it("clicking a non-asking collapsed row expands the list", () => {
    render(<SessionPanel active />);
    fireEvent.click(screen.getByRole("button", { name: "会话 修复登录" }));
    expect(useSessionStore.getState().expanded).toBe(true);
    expect(screen.getByText("会话")).toBeInTheDocument();
  });

  it("clicking an asking row asks the computer to open DSH", () => {
    seed([session({ state: "asking", askKind: "question" })]);
    render(<SessionPanel active />);

    fireEvent.click(screen.getByRole("button", { name: "在电脑上打开 修复登录" }));
    expect(tauri.sendFocusRequest).toHaveBeenCalledWith("dsh", "s-1", expect.any(String));
  });

  it("clears a finished session immediately", () => {
    seed([session({ state: "idle", completedAt: 900 })]);
    render(<SessionPanel active />);

    fireEvent.click(screen.getByRole("button", { name: "清除会话 修复登录" }));
    expect(
      visibleSessions(useSessionStore.getState().raw, useSessionStore.getState().cleared),
    ).toEqual([]);
    expect(screen.getByRole("status").textContent).toContain("已清除");
  });

  it("requires a second tap before clearing an asking session", () => {
    seed([session({ state: "asking" })]);
    render(<SessionPanel active />);

    fireEvent.click(screen.getByRole("button", { name: "清除会话 修复登录" }));
    expect(useSessionStore.getState().cleared).toEqual({});
    expect(screen.getByText("再点一次")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认清除会话 修复登录" }));
    expect(useSessionStore.getState().cleared["s-1"]?.through).toBe(1000);
  });

  it("expanded list shows all sessions and the summary", () => {
    seed(
      [
        session({ id: "s-1", title: "工作中", state: "working" }),
        session({ id: "s-2", title: "等你决定", state: "asking", askKind: "approval" }),
      ],
      true,
    );
    render(<SessionPanel active />);

    expect(screen.getByText("工作中")).toBeInTheDocument();
    expect(screen.getByText("等你决定")).toBeInTheDocument();
    expect(screen.getByText(/2 个 · 1 个等你决定/)).toBeInTheDocument();
    expect(screen.getByText(/等你审批/)).toBeInTheDocument();
  });

  it("collapses on the system back key while expanded", () => {
    seed([session()], true);
    render(<SessionPanel active />);

    expect(handleBack()).toBe(true);
    expect(useSessionStore.getState().expanded).toBe(false);
  });

  it("shows a focus result notice", () => {
    seed([session({ state: "asking" })]);
    render(<SessionPanel active />);
    act(() => {
      useSessionStore.getState().handleFocusResult({
        type: "focus.result",
        v: 1,
        requestId: "none",
        source: "dsh",
        ok: true,
        error: null,
        ts: 1,
      });
    });
    // requestId 不匹配：不提示。
    expect(screen.queryByRole("status")).toBeNull();

    useSessionStore.setState({ pendingRequestId: "f-1" });
    act(() => {
      useSessionStore.getState().handleFocusResult({
        type: "focus.result",
        v: 1,
        requestId: "f-1",
        source: "dsh",
        ok: true,
        error: null,
        ts: 1,
      });
    });
    expect(screen.getByRole("status").textContent).toContain("已在电脑上打开");
  });
});
