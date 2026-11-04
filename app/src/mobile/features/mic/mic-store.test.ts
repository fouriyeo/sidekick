import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { sendKeyRequest } from "@/shared/lib/tauri";
import { useMicStore } from "./mic-store";

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  sendKeyRequest: vi.fn(async () => undefined),
}));

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
  it("moves from arming to listening", () => {
    useMicStore.getState().begin(SESSION);
    expect(useMicStore.getState().phase).toBe("arming");

    useMicStore.getState().markListening();
    expect(useMicStore.getState().phase).toBe("listening");
  });

  it("handles a copied result and clears after ten seconds", () => {
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().markProcessing();
    useMicStore.getState().handleResult(result());

    const state = useMicStore.getState();
    expect(state.phase).toBe("delivered");
    expect(state.result?.message).toContain("辅助功能");

    vi.advanceTimersByTime(10_000);
    expect(useMicStore.getState().phase).toBe("idle");
    expect(useMicStore.getState().result).toBeNull();
  });

  it("reports a cloud failure and ignores stale sessions", () => {
    useMicStore.getState().begin(SESSION);
    useMicStore
      .getState()
      .handleResult(result({ outcome: "failed", reason: "cloud_network", text: null }));

    expect(useMicStore.getState().phase).toBe("error");
    expect(useMicStore.getState().error).toContain("百炼");

    const stale = useMicStore.getState().phase;
    useMicStore
      .getState()
      .handleResult(result({ session: "another-session", outcome: "inserted", reason: null }));
    expect(useMicStore.getState().phase).toBe(stale);
  });

  it("fails after the ten second processing timeout", () => {
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().markProcessing();
    vi.advanceTimersByTime(10_000);

    expect(useMicStore.getState().phase).toBe("error");
    expect(useMicStore.getState().error).toContain("电脑端没回应");
  });

  it("cancels and resets local state", () => {
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().cancel();

    expect(useMicStore.getState().phase).toBe("idle");
    expect(useMicStore.getState().session).toBeNull();
  });

  it("host cancel forces idle even when the local session differs", () => {
    useMicStore.getState().begin(SESSION);
    const nonce = useMicStore.getState().cancelNonce;

    // 桌面 active 会话与手机本地记录不一致（旧版本竞态）：取消仍必须生效。
    useMicStore.getState().handleCancel({
      v: 1,
      type: "mic.cancel",
      session: "another-session",
      reason: "desktop",
      ts: 1,
    });

    const state = useMicStore.getState();
    expect(state.phase).toBe("idle");
    expect(state.session).toBeNull();
    expect(state.cancelNonce).toBe(nonce + 1);
    expect(state.cancelNotice).toBe("电脑端已取消录音。");
  });

  it("explains watchdog cancellation", () => {
    useMicStore.getState().reset();
    const nonce = useMicStore.getState().cancelNonce;

    useMicStore.getState().handleCancel({
      v: 1,
      type: "mic.cancel",
      session: SESSION,
      reason: "timeout",
      ts: 1,
    });

    expect(useMicStore.getState().cancelNotice).toBe("录音超时，已自动停止。");
    expect(useMicStore.getState().cancelNonce).toBe(nonce + 1);
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

describe("mic store 结果卡片按键", () => {
  const sendKey = vi.mocked(sendKeyRequest);

  function insertedDelivered() {
    useConnectionStore.setState({ status: "connected" });
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().markProcessing();
    useMicStore.getState().handleResult(result({ outcome: "inserted", reason: null }));
  }

  function lastRequestId(): string {
    const call = sendKey.mock.calls[sendKey.mock.calls.length - 1];
    expect(call).toBeDefined();
    return call?.[2] ?? "";
  }

  beforeEach(() => {
    sendKey.mockClear();
    useConnectionStore.setState({ status: "connected" });
  });

  it("回车：一次点击发一次协议，成功提示后收起卡片", () => {
    insertedDelivered();

    useMicStore.getState().requestKey("enter");
    expect(sendKey).toHaveBeenCalledTimes(1);
    const [action, session] = sendKey.mock.calls[0];
    expect(action).toBe("enter");
    expect(session).toBe(SESSION);
    const requestId = lastRequestId();
    expect(requestId).toMatch(/^k-/);
    expect(useMicStore.getState().keyPending).toBe("enter");

    // 等待回包期间重复点击不会再发。
    useMicStore.getState().requestKey("enter");
    expect(sendKey).toHaveBeenCalledTimes(1);

    useMicStore.getState().handleKeyResult({
      v: 1,
      type: "key.result",
      requestId,
      action: "enter",
      ok: true,
      error: null,
      ts: 2,
    });
    expect(useMicStore.getState().keyPending).toBeNull();
    expect(useMicStore.getState().keyNotice).toBe("已按回车");

    vi.advanceTimersByTime(1400);
    expect(useMicStore.getState().phase).toBe("idle");
    expect(useMicStore.getState().keyNotice).toBeNull();
  });

  it("清空：第一次只做二次确认，第二次才发协议", () => {
    insertedDelivered();

    useMicStore.getState().requestKey("clear");
    expect(sendKey).not.toHaveBeenCalled();
    expect(useMicStore.getState().keyArmedClear).toBe(true);

    useMicStore.getState().requestKey("clear");
    expect(sendKey).toHaveBeenCalledTimes(1);
    expect(sendKey.mock.calls[0][0]).toBe("clear");
    expect(useMicStore.getState().keyArmedClear).toBe(false);

    const requestId = lastRequestId();
    useMicStore.getState().handleKeyResult({
      v: 1,
      type: "key.result",
      requestId,
      action: "clear",
      ok: true,
      error: null,
      ts: 2,
    });
    expect(useMicStore.getState().keyNotice).toBe("已清空输入框");
  });

  it("清空的二次确认 3 秒后自动失效", () => {
    insertedDelivered();
    useMicStore.getState().requestKey("clear");
    expect(useMicStore.getState().keyArmedClear).toBe(true);

    vi.advanceTimersByTime(3000);
    expect(useMicStore.getState().keyArmedClear).toBe(false);
    expect(sendKey).not.toHaveBeenCalled();
  });

  it("失败时给中文提示，卡片继续留着", () => {
    insertedDelivered();
    useMicStore.getState().requestKey("enter");
    const requestId = lastRequestId();

    useMicStore.getState().handleKeyResult({
      v: 1,
      type: "key.result",
      requestId,
      action: "enter",
      ok: false,
      error: "target_mismatch",
      ts: 2,
    });
    expect(useMicStore.getState().keyPending).toBeNull();
    expect(useMicStore.getState().keyError).toBe("电脑焦点不在刚才的窗口，没按。");
    expect(useMicStore.getState().phase).toBe("delivered");
    expect(useMicStore.getState().result).not.toBeNull();

    vi.advanceTimersByTime(10_000);
    expect(useMicStore.getState().phase).toBe("idle");
  });

  it("4 秒没回包时提示没回应，卡片不消失", () => {
    insertedDelivered();
    useMicStore.getState().requestKey("enter");

    vi.advanceTimersByTime(4000);
    expect(useMicStore.getState().keyPending).toBeNull();
    expect(useMicStore.getState().keyError).toBe("电脑端没回应，再试一次。");
    expect(useMicStore.getState().phase).toBe("delivered");
  });

  it("忽略别的 requestId，断连/非插入结果不发请求", () => {
    insertedDelivered();
    useMicStore.getState().requestKey("enter");
    useMicStore.getState().handleKeyResult({
      v: 1,
      type: "key.result",
      requestId: "k-unknown",
      action: "enter",
      ok: true,
      error: null,
      ts: 2,
    });
    expect(useMicStore.getState().keyPending).toBe("enter");
    expect(useMicStore.getState().keyNotice).toBeNull();

    // 断连时不发，直接提示。
    useMicStore.getState().reset();
    insertedDelivered();
    useConnectionStore.setState({ status: "error" });
    useMicStore.getState().requestKey("enter");
    expect(sendKey).toHaveBeenCalledTimes(1);
    expect(useMicStore.getState().keyError).toContain("连接断了");

    // 仅复制的卡片没有可操作目标。
    useMicStore.getState().reset();
    useConnectionStore.setState({ status: "connected" });
    useMicStore.getState().begin(SESSION);
    useMicStore.getState().handleResult(result());
    useMicStore.getState().requestKey("enter");
    expect(sendKey).toHaveBeenCalledTimes(1);
    expect(useMicStore.getState().keyPending).toBeNull();
  });
});
