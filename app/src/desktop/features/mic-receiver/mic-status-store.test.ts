import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDesktopMicStore } from "./mic-status-store";

const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  vi.useFakeTimers();
  useDesktopMicStore.getState().reset();
});

afterEach(() => {
  useDesktopMicStore.getState().reset();
  vi.useRealTimers();
});

describe("desktop mic status store", () => {
  it("shows listening after ready and processing on state", () => {
    useDesktopMicStore
      .getState()
      .handleMessage({ v: 1, type: "mic.ready", session: SESSION, ts: 1 });
    expect(useDesktopMicStore.getState().phase).toBe("listening");
    expect(useDesktopMicStore.getState().visible).toBe(true);

    useDesktopMicStore
      .getState()
      .handleMessage({ v: 1, type: "mic.state", session: SESSION, state: "processing", ts: 2 });
    expect(useDesktopMicStore.getState().phase).toBe("processing");
  });

  it("shows the result then hides after two seconds", () => {
    useDesktopMicStore
      .getState()
      .handleMessage({ v: 1, type: "mic.ready", session: SESSION, ts: 1 });
    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.result",
      session: SESSION,
      outcome: "inserted",
      reason: null,
      text: "你好",
      truncated: false,
      ts: 2,
    });

    expect(useDesktopMicStore.getState().phase).toBe("delivered");
    expect(useDesktopMicStore.getState().message).toBe("已输入");

    vi.advanceTimersByTime(2000);
    expect(useDesktopMicStore.getState().visible).toBe(false);
  });

  it("ignores errors from another session", () => {
    useDesktopMicStore
      .getState()
      .handleMessage({ v: 1, type: "mic.ready", session: SESSION, ts: 1 });
    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.error",
      session: "another",
      code: "model_missing",
      ts: 2,
    });

    expect(useDesktopMicStore.getState().phase).toBe("listening");
  });
});
