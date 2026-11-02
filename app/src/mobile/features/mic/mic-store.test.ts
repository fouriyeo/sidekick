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

  it("reports a missing model and ignores stale sessions", () => {
    const dispatch = vi.spyOn(usePetStore.getState(), "dispatch");
    useMicStore.getState().begin(SESSION);
    useMicStore
      .getState()
      .handleResult(result({ outcome: "failed", reason: "model_missing", text: null }));

    expect(useMicStore.getState().phase).toBe("error");
    expect(useMicStore.getState().error).toContain("语音模型");
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
      engine: "bailian",
      ts: 2,
    });
    expect(useMicStore.getState().partialText).toBe("帮我把这段");
    expect(useMicStore.getState().engine).toBe("bailian");

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

    useMicStore.getState().handleResult(result({ fallback: true, engine: "local" }));
    const state = useMicStore.getState();
    expect(state.phase).toBe("delivered");
    expect(state.partialText).toBe("");
    expect(state.fallback).toBe(true);
    expect(state.result?.message).toContain("云端不可用，已用本机转写");
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
    expect(useMicStore.getState().engine).toBe("local");

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
  it("records the engine and clears stale partial text for the session", () => {
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
      engine: "bailian",
      model: "qwen-audio-3.1-asr-flash-streaming",
      ts: 3,
    });
    expect(useMicStore.getState().engine).toBe("bailian");
    expect(useMicStore.getState().partialText).toBe("");
    expect(useMicStore.getState().partialRev).toBe(0);

    // 别的 session 的 ready 不影响当前会话。
    useMicStore.getState().handleReady({
      v: 1,
      type: "mic.ready",
      session: "another-session",
      engine: "local",
      ts: 4,
    });
    expect(useMicStore.getState().engine).toBe("bailian");
  });
});
