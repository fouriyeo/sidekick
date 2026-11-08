import { describe, expect, it } from "vitest";
import {
  isMemoEvent,
  isMemoStatus,
  isMemoSummary,
  isMemoType,
  memoStatusLabel,
  memoTypeLabel,
  parseMemoPairResult,
} from "./memo";

const summary = {
  id: "memo-1",
  createdAt: 1,
  updatedAt: 2,
  memoType: "todo",
  title: "买牛奶",
  summary: null,
  todos: [],
  tags: [],
  durationMs: 1000,
  status: "done",
  aiStatus: "ok",
  hasAudio: true,
  audioBytes: 32000,
  synced: false,
  failedSegment: null,
  lastError: null,
};

describe("备忘录协议", () => {
  it("校验列表行", () => {
    expect(isMemoSummary(summary)).toBe(true);
    expect(isMemoSummary({ ...summary, id: 1 })).toBe(false);
    expect(isMemoSummary({ ...summary, memoType: "meeting" })).toBe(false);
    expect(isMemoSummary(null)).toBe(false);
  });

  it("校验枚举", () => {
    expect(isMemoType("idea")).toBe(true);
    expect(isMemoType("meeting")).toBe(false);
    expect(isMemoStatus("offline")).toBe(true);
    expect(isMemoStatus("waiting")).toBe(false);
  });

  it("校验管道事件", () => {
    expect(isMemoEvent({ kind: "changed", id: "memo-1" })).toBe(true);
    expect(isMemoEvent({ kind: "progress", status: "transcribing" })).toBe(true);
    expect(isMemoEvent({ kind: "nope" })).toBe(false);
    expect(isMemoEvent({ kind: "changed", status: "bad" })).toBe(false);
  });

  it("解析配对回包", () => {
    expect(
      parseMemoPairResult(
        JSON.stringify({ type: "memo.pair.result", ok: true, token: "t", key: "sk-1" }),
      ),
    ).toEqual({ ok: true, token: "t", key: "sk-1", error: undefined });
    expect(parseMemoPairResult(JSON.stringify({ type: "chat" }))).toBeNull();
    expect(parseMemoPairResult("not json")).toBeNull();
  });

  it("状态/类型文案", () => {
    expect(memoStatusLabel("offline")).toBe("等待网络");
    expect(memoStatusLabel("failed")).toBe("需要重试");
    expect(memoTypeLabel("todo")).toBe("待办");
  });
});
