import { describe, expect, it } from "vitest";
import { isConnEvent, parseMessage, parseMicMessage } from "./messages";

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

describe("parseMicMessage", () => {
  const session = "0f8fad5b-d9cb-469f-a165-70867728950e";

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
      parseMicMessage(JSON.stringify({ v: 1, type: "mic.error", code: "model_missing" })),
    ).toMatchObject({ type: "mic.error", code: "model_missing" });

    expect(
      parseMicMessage(JSON.stringify({ v: 1, type: "mic.ready", session, ts: 1 })),
    ).toMatchObject({ type: "mic.ready", session });
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
