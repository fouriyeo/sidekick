import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import { useMicStore } from "./mic-store";

const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";

function result(overrides: Record<string, unknown> = {}) {
  return {
    v: 1 as const,
    type: "mic.result" as const,
    session: SESSION,
    outcome: "copied" as const,
    reason: "accessibility_off",
    text: "你好",
    truncated: false,
    ts: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useMicStore.getState().reset();
});

afterEach(() => {
  useMicStore.getState().reset();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("mic store", () => {
  it("moves from arming to listening and begins pet feedback", () => {
    const dispatch = vi.spyOn(usePetStore.getState(), "dispatch");
    useMicStore.getState().begin(SESSION);
    expect(useMicStore.getState().phase).toBe("arming");
    expect(dispatch).toHaveBeenCalledWith({ type: "MIC_START", now: expect.any(Number) });

    useMicStore.getState().markListening();
    expect(useMicStore.getState().phase).toBe("listening");
  });

  it("handles a copied result and clears after ten seconds", () => {
    const dispatch = vi.spyOn(usePetStore.getState(), "dispatch");
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().markProcessing();
    useMicStore.getState().handleResult(result());

    const state = useMicStore.getState();
    expect(state.phase).toBe("delivered");
    expect(state.result?.message).toContain("辅助功能");
    expect(dispatch).toHaveBeenCalledWith({ type: "MIC_SUCCESS", now: expect.any(Number) });

    vi.advanceTimersByTime(10_000);
    expect(useMicStore.getState().phase).toBe("idle");
    expect(useMicStore.getState().result).toBeNull();
  });

  it("reports a cloud failure and ignores stale sessions", () => {
    const dispatch = vi.spyOn(usePetStore.getState(), "dispatch");
    useMicStore.getState().begin(SESSION);
    useMicStore
      .getState()
      .handleResult(result({ outcome: "failed", reason: "cloud_network", text: null }));

    expect(useMicStore.getState().phase).toBe("error");
    expect(useMicStore.getState().error).toContain("百炼");
    expect(dispatch).toHaveBeenCalledWith({ type: "MIC_ERROR", now: expect.any(Number) });

    const stale = useMicStore.getState().phase;
    useMicStore
      .getState()
      .handleResult(result({ session: "another-session", outcome: "inserted", reason: null }));
    expect(useMicStore.getState().phase).toBe(stale);
  });

  it("fails after the ten second processing timeout", () => {
    const dispatch = vi.spyOn(usePetStore.getState(), "dispatch");
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().markProcessing();
    vi.advanceTimersByTime(10_000);

    expect(useMicStore.getState().phase).toBe("error");
    expect(useMicStore.getState().error).toContain("电脑端没回应");
    expect(dispatch).toHaveBeenCalledWith({ type: "MIC_ERROR", now: expect.any(Number) });
  });

  it("cancels and notifies the pet", () => {
    const dispatch = vi.spyOn(usePetStore.getState(), "dispatch");
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().cancel();

    expect(useMicStore.getState().phase).toBe("idle");
    expect(useMicStore.getState().session).toBeNull();
    expect(dispatch).toHaveBeenCalledWith({ type: "MIC_CANCEL", now: expect.any(Number) });
  });
});

describe("mic store streaming fields", () => {
  it("applies partials by revision, ignores stale sessions, clears on result", () => {
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().handlePartial({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 1,
      text: "帮我把这段",
      sentence: 1,
      ts: 2,
    });
    expect(useMicStore.getState().partialText).toBe("帮我把这段");

    // 重复/更小 rev 忽略。
    useMicStore.getState().handlePartial({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 1,
      text: "旧文本",
      sentence: 1,
      ts: 3,
    });
    expect(useMicStore.getState().partialText).toBe("帮我把这段");

    // 别的 session 忽略。
    useMicStore.getState().handlePartial({
      v: 1,
      type: "mic.partial",
      session: "another-session",
      rev: 9,
      text: "别的会话",
      sentence: 1,
      ts: 4,
    });
    expect(useMicStore.getState().partialText).toBe("帮我把这段");

    useMicStore.getState().handlePartial({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 2,
      text: "帮我把这段异步的注释改成中文",
      sentence: 1,
      ts: 5,
    });
    expect(useMicStore.getState().partialText).toBe("帮我把这段异步的注释改成中文");

    useMicStore.getState().handleResult(result());
    const state = useMicStore.getState();
    expect(state.phase).toBe("delivered");
    expect(state.partialText).toBe("");
    expect(state.result?.message).not.toContain("已用本机转写");
  });

  it("clears partial on begin, cancel and reset", () => {
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().handlePartial({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 1,
      text: "临时文本",
      sentence: 1,
      ts: 2,
    });
    useMicStore.getState().cancel();
    expect(useMicStore.getState().partialText).toBe("");

    useMicStore.getState().begin(SESSION);
    useMicStore.getState().handlePartial({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 1,
      text: "临时文本",
      sentence: 1,
      ts: 3,
    });
    useMicStore.getState().begin("new-session");
    expect(useMicStore.getState().partialText).toBe("");
    expect(useMicStore.getState().partialRev).toBe(0);
  });
});

describe("mic store ready message", () => {
  it("clears stale partial text for the session", () => {
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().handlePartial({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 1,
      text: "旧会话文本",
      sentence: 1,
      ts: 2,
    });
    expect(useMicStore.getState().partialText).toBe("旧会话文本");

    useMicStore.getState().handleReady({
      v: 1,
      type: "mic.ready",
      session: SESSION,
      ts: 3,
    });
    expect(useMicStore.getState().partialText).toBe("");
    expect(useMicStore.getState().partialRev).toBe(0);

    // 别的 session 的 ready 不影响当前会话的实时文本。
    useMicStore.getState().handlePartial({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 1,
      text: "当前会话文本",
      sentence: 1,
      ts: 4,
    });
    useMicStore.getState().handleReady({
      v: 1,
      type: "mic.ready",
      session: "another-session",
      ts: 5,
    });
    expect(useMicStore.getState().partialText).toBe("当前会话文本");
  });
});
