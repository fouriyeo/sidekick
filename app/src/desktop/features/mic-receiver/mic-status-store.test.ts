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

describe("desktop mic streaming fields", () => {
  it("applies partial by session and revision, keeps it through processing, clears on cancel", () => {
    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.ready",
      session: SESSION,
      engine: "bailian",
      model: "qwen-audio-3.1-asr-flash-streaming",
      ts: 1,
    });
    expect(useDesktopMicStore.getState().engine).toBe("bailian");
    expect(useDesktopMicStore.getState().partialText).toBe("");

    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 1,
      text: "帮我把这段",
      sentence: 1,
      engine: "bailian",
      ts: 2,
    });
    expect(useDesktopMicStore.getState().partialText).toBe("帮我把这段");
    expect(useDesktopMicStore.getState().partialRev).toBe(1);

    // 同一 rev 的重复消息不能覆盖已显示文本。
    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 1,
      text: "旧文本",
      sentence: 1,
      ts: 3,
    });
    expect(useDesktopMicStore.getState().partialText).toBe("帮我把这段");

    // 乱序/别的 session 也忽略。
    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.partial",
      session: "another-session",
      rev: 9,
      text: "别的会话",
      sentence: 1,
      ts: 4,
    });
    expect(useDesktopMicStore.getState().partialText).toBe("帮我把这段");

    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 2,
      text: "帮我把这段异步的注释改成中文",
      sentence: 1,
      ts: 5,
    });
    expect(useDesktopMicStore.getState().partialText).toBe("帮我把这段异步的注释改成中文");

    // 进入 processing 时保留实时文本，避免界面突然空掉。
    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.state",
      session: SESSION,
      state: "processing",
      ts: 6,
    });
    expect(useDesktopMicStore.getState().phase).toBe("processing");
    expect(useDesktopMicStore.getState().partialText).toBe("帮我把这段异步的注释改成中文");

    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.state",
      session: SESSION,
      state: "cancelled",
      ts: 7,
    });
    expect(useDesktopMicStore.getState().partialText).toBe("");
    expect(useDesktopMicStore.getState().engine).toBe("local");
  });

  it("clears partial on a new ready and appends the fallback note on result", () => {
    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.ready",
      session: SESSION,
      engine: "bailian",
      ts: 1,
    });
    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.partial",
      session: SESSION,
      rev: 1,
      text: "旧的实时文本",
      sentence: 1,
      ts: 2,
    });

    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.ready",
      session: "new-session",
      engine: "bailian",
      ts: 3,
    });
    expect(useDesktopMicStore.getState().partialText).toBe("");
    expect(useDesktopMicStore.getState().partialRev).toBe(0);

    useDesktopMicStore.getState().handleMessage({
      v: 1,
      type: "mic.result",
      session: "new-session",
      outcome: "copied",
      reason: "accessibility_off",
      text: "云端失败后的本机结果",
      truncated: false,
      engine: "local",
      fallback: true,
      ts: 4,
    });
    const state = useDesktopMicStore.getState();
    expect(state.phase).toBe("delivered");
    expect(state.fallback).toBe(true);
    expect(state.engine).toBe("local");
    expect(state.message).toContain("云端不可用，已用本机转写");
    expect(state.partialText).toBe("");

    vi.advanceTimersByTime(2000);
    expect(useDesktopMicStore.getState().visible).toBe(false);
    expect(useDesktopMicStore.getState().fallback).toBe(false);
  });
});
