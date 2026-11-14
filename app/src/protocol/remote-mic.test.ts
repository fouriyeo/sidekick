import { describe, expect, it } from "vitest";
import {
  isRemoteHudPayload,
  parseRemoteMicMessage,
  type RemoteHudPayload,
  type RemoteMicAck,
  type RemoteMicCommand,
  type RemoteMicStatus,
} from "./remote-mic";

const COMMAND: RemoteMicCommand = {
  v: 1,
  type: "mic.remote",
  requestId: "h0001",
  action: "start",
  ts: 1,
};

const ACK: RemoteMicAck = {
  v: 1,
  type: "mic.remote.ack",
  requestId: "h0001",
  action: "start",
  ok: false,
  code: "not_pet_page",
  ts: 2,
};

const STATUS: RemoteMicStatus = { v: 1, type: "mic.remote.status", enabled: true, ts: 3 };

describe("parseRemoteMicMessage", () => {
  it("解析桌面的开始命令", () => {
    expect(parseRemoteMicMessage(JSON.stringify(COMMAND))).toMatchObject({
      type: "mic.remote",
      action: "start",
      requestId: "h0001",
    });
  });

  it("解析手机回执（带错误码）", () => {
    expect(parseRemoteMicMessage(JSON.stringify(ACK))).toMatchObject({
      type: "mic.remote.ack",
      ok: false,
      code: "not_pet_page",
    });
  });

  it("解析开关上报", () => {
    expect(parseRemoteMicMessage(JSON.stringify(STATUS))).toMatchObject({
      type: "mic.remote.status",
      enabled: true,
    });
  });

  it("未知 action / 坏 JSON / 非本条协议都回 null", () => {
    expect(parseRemoteMicMessage(JSON.stringify({ ...COMMAND, action: "pause" }))).toBeNull();
    expect(parseRemoteMicMessage("{")).toBeNull();
    expect(
      parseRemoteMicMessage(JSON.stringify({ v: 1, type: "chat", from: "desktop" })),
    ).toBeNull();
  });

  it("ack 的 code 可以为空", () => {
    const ok: RemoteMicAck = { ...ACK, ok: true, code: null };
    expect(parseRemoteMicMessage(JSON.stringify(ok))).toMatchObject({ ok: true, code: null });
  });
});

describe("isRemoteHudPayload", () => {
  it("接受合法状态", () => {
    const payload: RemoteHudPayload = { v: 1, state: "listening", startedAt: 10, ts: 11 };
    expect(isRemoteHudPayload(payload)).toBe(true);
  });

  it("拒绝未知状态与坏字段", () => {
    expect(isRemoteHudPayload({ v: 1, state: "thinking", ts: 1 })).toBe(false);
    expect(isRemoteHudPayload({ v: 1, state: "failed", reason: 3, ts: 1 })).toBe(false);
    expect(isRemoteHudPayload(null)).toBe(false);
  });
});
