import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import type { SessionSummary } from "@/protocol/messages";
import { useSessionStore, visibleSessions } from "./session-store";

const storage = vi.hoisted(() => ({
  load: vi.fn(async () => ({}) as Record<string, { at: number; through: number }>),
  save: vi.fn(async () => undefined),
}));

const tauri = vi.hoisted(() => ({
  sendFocusRequest: vi.fn(async () => undefined),
}));

vi.mock("./session-storage", () => ({
  loadCleared: storage.load,
  saveCleared: storage.save,
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  sendFocusRequest: tauri.sendFocusRequest,
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

function resetStore() {
  useSessionStore.setState({
    raw: [],
    cleared: {},
    hydrated: true,
    expanded: false,
    notice: null,
    noticeId: 0,
    pendingFocusId: null,
    pendingRequestId: null,
    pendingClearId: null,
    lastAskingIds: [],
    seenSnapshot: false,
  });
  storage.load.mockReset();
  storage.load.mockResolvedValue({});
  storage.save.mockReset();
  storage.save.mockResolvedValue(undefined);
  tauri.sendFocusRequest.mockReset();
  tauri.sendFocusRequest.mockResolvedValue(undefined);
  useConnectionStore.setState({ status: "connected" });
}

beforeEach(resetStore);

describe("session-store", () => {
  it("sorts asking > working > completed > idle and derives completed", () => {
    const rows = visibleSessions(
      [
        session({ id: "idle", state: "idle", lastEventAt: 9 }),
        session({ id: "done", state: "idle", completedAt: 5, lastEventAt: 5 }),
        session({ id: "work", lastEventAt: 8 }),
        session({ id: "ask", state: "asking", askKind: "question", lastEventAt: 2 }),
      ],
      {},
    );

    expect(rows.map((row) => row.id)).toEqual(["ask", "work", "done", "idle"]);
    expect(rows.map((row) => row.display)).toEqual(["asking", "working", "completed", "idle"]);
  });

  it("does not auto-expand on the first snapshot, but expands on a new asking", () => {
    const store = useSessionStore.getState();
    store.apply([session({ id: "s-1", state: "working" })]);
    expect(useSessionStore.getState().expanded).toBe(false);

    store.apply([
      session({ id: "s-1", state: "working" }),
      session({ id: "s-2", state: "asking" }),
    ]);
    expect(useSessionStore.getState().expanded).toBe(true);
  });

  it("clears a finished session locally and brings it back on a newer event", () => {
    const store = useSessionStore.getState();
    store.apply([session({ id: "s-1", state: "idle", completedAt: 5, lastEventAt: 5 })]);

    store.clear("s-1");
    expect(
      visibleSessions(useSessionStore.getState().raw, useSessionStore.getState().cleared),
    ).toEqual([]);
    expect(useSessionStore.getState().notice).toContain("已清除");
    expect(storage.save).toHaveBeenCalled();

    store.apply([session({ id: "s-1", state: "working", lastEventAt: 9 })]);
    expect(
      visibleSessions(useSessionStore.getState().raw, useSessionStore.getState().cleared),
    ).toHaveLength(1);
  });

  it("asks for a second tap before clearing an asking session", () => {
    const store = useSessionStore.getState();
    store.apply([session({ id: "s-1", state: "asking" })]);

    store.clear("s-1");
    expect(useSessionStore.getState().cleared).toEqual({});
    expect(useSessionStore.getState().pendingClearId).toBe("s-1");

    store.clear("s-1");
    expect(useSessionStore.getState().cleared["s-1"]?.through).toBe(1000);
    expect(useSessionStore.getState().pendingClearId).toBeNull();
  });

  it("hydrates cleared markers and filters matching sessions", async () => {
    storage.load.mockResolvedValue({ "s-1": { at: Date.now(), through: 1000 } });
    const store = useSessionStore.getState();
    await store.hydrate();
    store.apply([session({ id: "s-1", lastEventAt: 1000 })]);
    expect(useSessionStore.getState().hydrated).toBe(true);
    expect(
      visibleSessions(useSessionStore.getState().raw, useSessionStore.getState().cleared),
    ).toEqual([]);
  });

  it("sends a focus request and reports the result for the matching request id", async () => {
    const store = useSessionStore.getState();
    store.apply([session({ id: "s-1", state: "asking" })]);
    store.requestFocus("s-1");

    expect(tauri.sendFocusRequest).toHaveBeenCalledTimes(1);
    const [source, sessionId, requestId] = tauri.sendFocusRequest.mock.calls[0] as unknown as [
      string,
      string,
      string,
    ];
    expect(source).toBe("dsh");
    expect(sessionId).toBe("s-1");
    expect(useSessionStore.getState().pendingFocusId).toBe("s-1");

    useSessionStore.getState().handleFocusResult({
      type: "focus.result",
      v: 1,
      requestId,
      source: "dsh",
      ok: true,
      error: null,
      ts: 1,
    });

    expect(useSessionStore.getState().pendingFocusId).toBeNull();
    expect(useSessionStore.getState().notice).toContain("已在电脑上打开");
  });

  it("refuses to focus when offline and maps launch errors", () => {
    useConnectionStore.setState({ status: "disconnected" });
    useSessionStore.getState().apply([session({ state: "asking" })]);
    useSessionStore.getState().requestFocus("s-1");
    expect(tauri.sendFocusRequest).not.toHaveBeenCalled();
    expect(useSessionStore.getState().notice).toContain("先连上电脑");

    useConnectionStore.setState({ status: "connected" });
    useSessionStore.setState({ pendingRequestId: "f-1" });
    useSessionStore.getState().handleFocusResult({
      type: "focus.result",
      v: 1,
      requestId: "f-1",
      source: "dsh",
      ok: false,
      error: "launch_failed",
      ts: 1,
    });
    expect(useSessionStore.getState().notice).toContain("没有找到 DeepSeek Harness");
  });

  it("clears all transient state on disconnect", () => {
    const store = useSessionStore.getState();
    store.apply([session({ state: "asking" })]);
    store.clearAll();
    expect(useSessionStore.getState().raw).toEqual([]);
    expect(useSessionStore.getState().expanded).toBe(false);
    expect(useSessionStore.getState().seenSnapshot).toBe(false);
  });
});
