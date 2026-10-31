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
