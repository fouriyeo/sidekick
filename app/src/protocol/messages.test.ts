import { describe, expect, it } from "vitest";
import {
  isConnEvent,
  isFocusResultMessage,
  isKeyResultMessage,
  isStatusMessage,
  normalizeSessionList,
  normalizeSessionTitle,
  parseFocusResult,
  parseKeyResult,
  parseMessage,
  parseMicMessage,
  parseStatusMessage,
} from "./messages";

describe("parseMessage", () => {
  it("maps chat messages from self to me", () => {
    expect(parseMessage('{"type":"chat","from":"desktop","text":"hi","ts":1}', "desktop")).toEqual({
      kind: "me",
      text: "hi",
      ts: 1,
    });
  });

  it("maps chat messages from the other side to them", () => {
    expect(parseMessage('{"type":"chat","from":"phone","text":"hello","ts":2}', "desktop")).toEqual(
      {
        kind: "them",
        text: "hello",
        ts: 2,
      },
    );
  });

  it("maps system messages", () => {
    expect(parseMessage('{"type":"system","text":"客户端已连接"}', "phone")).toEqual({
      kind: "system",
      text: "客户端已连接",
    });
  });

  it("drops unknown message types", () => {
    expect(parseMessage('{"type":"status","state":"working"}', "desktop")).toBeNull();
  });

  it("shows malformed JSON as a system message", () => {
    expect(parseMessage("not-json", "desktop")).toEqual({
      kind: "system",
      text: "not-json",
    });
  });

  it("drops known types with invalid fields", () => {
    expect(parseMessage('{"type":"chat","from":"desktop","text":"hi"}', "desktop")).toBeNull();
    expect(parseMessage('{"type":"system","text":1}', "desktop")).toBeNull();
  });
});

describe("isConnEvent", () => {
  it("accepts valid payloads", () => {
    expect(isConnEvent({ online: true })).toBe(true);
    expect(isConnEvent({ online: false, url: "ws://127.0.0.1" })).toBe(true);
  });

  it("rejects invalid payloads", () => {
    expect(isConnEvent(null)).toBe(false);
    expect(isConnEvent({ online: "yes" })).toBe(false);
    expect(isConnEvent({ online: true, url: 1 })).toBe(false);
  });
});

describe("status messages", () => {
  const base = {
    type: "status",
    v: 1,
    source: "dsh",
    state: "working",
    sessions: 1,
    ts: 1730000000000,
  };

  it("accepts working, asking, idle and completed statuses", () => {
    expect(isStatusMessage(base)).toBe(true);
    expect(isStatusMessage({ ...base, state: "asking", sessions: 2 })).toBe(true);
    expect(isStatusMessage({ ...base, state: "idle", sessions: 0 })).toBe(true);
    expect(
      isStatusMessage({
        ...base,
        state: "completed",
        resume: "idle",
        remainingMs: 2100,
      }),
    ).toBe(true);
  });

  it("rejects invalid statuses", () => {
    expect(isStatusMessage({ ...base, v: 2 })).toBe(false);
    expect(isStatusMessage({ ...base, state: "busy" })).toBe(false);
    expect(isStatusMessage({ ...base, sessions: -1 })).toBe(false);
    expect(isStatusMessage({ ...base, sessions: 1.5 })).toBe(false);
    expect(isStatusMessage({ ...base, ts: "now" })).toBe(false);
    expect(isStatusMessage({ ...base, resume: "busy" })).toBe(false);
    expect(isStatusMessage({ ...base, remainingMs: -1 })).toBe(false);
  });

  it("parses a valid status and ignores invalid/malformed payloads", () => {
    expect(parseStatusMessage(JSON.stringify(base))).toMatchObject({
      state: "working",
      sessions: 1,
    });
    expect(parseStatusMessage(JSON.stringify({ ...base, state: "busy" }))).toBeNull();
    expect(parseStatusMessage("not-json")).toBeNull();
  });

  it("keeps status out of the chat/system parsing path", () => {
    expect(parseMessage(JSON.stringify(base), "phone")).toBeNull();
  });

  it("parses a session list and drops invalid entries", () => {
    const parsed = parseStatusMessage(
      JSON.stringify({
        ...base,
        sessionList: [
          {
            id: "s-1",
            title: "  修复\n登录  ",
            source: "dsh",
            state: "asking",
            askKind: "question",
            lastEventAt: 1730000000000,
            completedAt: null,
          },
          { id: "", title: "x", source: "dsh", state: "idle", lastEventAt: 1 },
          { id: "s-2", source: "claude", state: "idle", lastEventAt: 1 },
          { id: "s-3", source: "dsh", state: "busy", lastEventAt: 1 },
          { id: "s-4", source: "dsh", state: "idle", lastEventAt: -1 },
          {
            id: "s-1",
            title: "duplicate",
            source: "dsh",
            state: "working",
            lastEventAt: 2,
          },
        ],
      }),
    );

    expect(parsed?.sessionList).toEqual([
      {
        id: "s-1",
        title: "修复 登录",
        source: "dsh",
        state: "asking",
        askKind: "question",
        lastEventAt: 1730000000000,
        completedAt: null,
      },
    ]);
  });

  it("treats a missing session list as empty and rejects non-array lists", () => {
    const parsed = parseStatusMessage(JSON.stringify(base));
    expect(parsed?.sessionList).toEqual([]);
    expect(isStatusMessage({ ...base, sessionList: "nope" })).toBe(false);
  });

  it("normalizes titles to a single line within the byte budget", () => {
    expect(normalizeSessionTitle("  a\u0000 b \n c  ")).toBe("a b c");
    expect(normalizeSessionTitle("   ")).toBeNull();
    expect(normalizeSessionTitle(123)).toBeNull();
    expect(normalizeSessionTitle("字".repeat(200))?.length).toBe(80);
  });

  it("caps and deduplicates session lists", () => {
    const raw = Array.from({ length: 60 }, (_, index) => ({
      id: `s-${index}`,
      title: `会话 ${index}`,
      source: "dsh",
      state: "working",
      lastEventAt: index,
    }));
    expect(normalizeSessionList(raw)).toHaveLength(50);
    expect(normalizeSessionList([raw[0], raw[0]])).toHaveLength(1);
    expect(normalizeSessionList("nope")).toEqual([]);
  });
});

describe("focus result", () => {
  it("parses a desktop focus result", () => {
    const raw = {
      type: "focus.result",
      v: 1,
      requestId: "f-1",
      source: "dsh",
      ok: false,
      error: "launch_failed",
      ts: 1,
    };
    expect(isFocusResultMessage(raw)).toBe(true);
    expect(parseFocusResult(JSON.stringify(raw))).toEqual(raw);
  });

  it("rejects malformed focus results", () => {
    expect(parseFocusResult("not-json")).toBeNull();
    expect(isFocusResultMessage({ type: "focus.result", v: 1 })).toBe(false);
    expect(
      isFocusResultMessage({
        type: "focus.result",
        v: 1,
        requestId: "f-1",
        source: "other",
        ok: true,
        ts: 1,
      }),
    ).toBe(false);
  });
});

describe("parseMicMessage", () => {
  const session = "0f8fad5b-d9cb-469f-a165-70867728950e";

  it("parses streamed partial results", () => {
    const message = parseMicMessage(
      JSON.stringify({
        v: 1,
        type: "mic.partial",
        session,
        rev: 3,
        text: "帮我把这段异步",
        sentence: 1,
        ts: 2,
      }),
    );
    expect(message).toMatchObject({ type: "mic.partial", rev: 3 });
  });

  it("rejects partial results without a positive integer rev", () => {
    const base = { v: 1, type: "mic.partial", session, text: "hi", sentence: 1, ts: 2 };
    expect(parseMicMessage(JSON.stringify({ ...base, rev: 0 }))).toBeNull();
    expect(parseMicMessage(JSON.stringify({ ...base, rev: 1.5 }))).toBeNull();
    expect(parseMicMessage(JSON.stringify({ ...base, rev: 1, text: 1 }))).toBeNull();
  });

  it("keeps legacy ready/result messages valid", () => {
    expect(
      parseMicMessage(JSON.stringify({ v: 1, type: "mic.ready", session, ts: 1 })),
    ).toMatchObject({ type: "mic.ready" });
    expect(
      parseMicMessage(
        JSON.stringify({ v: 1, type: "mic.result", session, outcome: "inserted", ts: 1 }),
      ),
    ).toMatchObject({ type: "mic.result" });
  });

  it("parses result, state, error and ready messages", () => {
    expect(
      parseMicMessage(
        JSON.stringify({
          v: 1,
          type: "mic.result",
          session,
          outcome: "copied",
          reason: "accessibility_off",
          text: "你好",
          truncated: false,
          ts: 1,
        }),
      ),
    ).toMatchObject({ type: "mic.result", outcome: "copied" });

    expect(
      parseMicMessage(JSON.stringify({ v: 1, type: "mic.state", session, state: "processing" })),
    ).toMatchObject({ type: "mic.state", state: "processing" });

    expect(
      parseMicMessage(JSON.stringify({ v: 1, type: "mic.error", code: "cloud_network" })),
    ).toMatchObject({ type: "mic.error", code: "cloud_network" });

    expect(
      parseMicMessage(JSON.stringify({ v: 1, type: "mic.ready", session, ts: 1 })),
    ).toMatchObject({ type: "mic.ready", session });
  });

  it("parses host cancellation with desktop/timeout reasons", () => {
    expect(
      parseMicMessage(
        JSON.stringify({ v: 1, type: "mic.cancel", session, reason: "desktop", ts: 1 }),
      ),
    ).toMatchObject({ type: "mic.cancel", session, reason: "desktop" });

    expect(
      parseMicMessage(
        JSON.stringify({ v: 1, type: "mic.cancel", session, reason: "timeout", ts: 2 }),
      ),
    ).toMatchObject({ type: "mic.cancel", reason: "timeout" });

    // reason 可省略（请求/旧版本兼容），但未知 reason 必须丢弃。
    expect(
      parseMicMessage(JSON.stringify({ v: 1, type: "mic.cancel", session, ts: 3 })),
    ).toMatchObject({ type: "mic.cancel" });
    expect(
      parseMicMessage(JSON.stringify({ v: 1, type: "mic.cancel", session, reason: "user", ts: 4 })),
    ).toBeNull();
  });

  it("rejects invalid or unrelated messages", () => {
    expect(parseMicMessage("not-json")).toBeNull();
    expect(parseMicMessage('{"type":"chat","from":"phone","text":"hi","ts":1}')).toBeNull();
    expect(
      parseMicMessage(JSON.stringify({ v: 1, type: "mic.result", session, outcome: "weird" })),
    ).toBeNull();
    expect(
      parseMicMessage(JSON.stringify({ v: 1, type: "mic.state", session, state: "unknown" })),
    ).toBeNull();
  });
});

describe("key.result", () => {
  const base = { v: 1, type: "key.result", requestId: "k-1", action: "enter", ok: true, ts: 1 };

  it("parses successful and failed key results", () => {
    expect(parseKeyResult(JSON.stringify(base))).toMatchObject({
      type: "key.result",
      action: "enter",
      ok: true,
    });
    expect(
      parseKeyResult(
        JSON.stringify({ ...base, action: "clear", ok: false, error: "target_mismatch" }),
      ),
    ).toMatchObject({ action: "clear", ok: false, error: "target_mismatch" });
    expect(isKeyResultMessage(base)).toBe(true);
    expect(isKeyResultMessage({ ...base, error: null })).toBe(true);
  });

  it("rejects unknown actions, missing ids and malformed payloads", () => {
    expect(parseKeyResult("not-json")).toBeNull();
    expect(parseKeyResult(JSON.stringify({ ...base, action: "submit" }))).toBeNull();
    expect(parseKeyResult(JSON.stringify({ ...base, requestId: "" }))).toBeNull();
    expect(parseKeyResult(JSON.stringify({ ...base, ok: "yes" }))).toBeNull();
    expect(parseKeyResult(JSON.stringify({ ...base, v: 2 }))).toBeNull();
  });
});
