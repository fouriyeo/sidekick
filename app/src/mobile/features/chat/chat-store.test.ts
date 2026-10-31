import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "./chat-store";

beforeEach(() => {
  useChatStore.setState({ messages: [], nextId: 1 });
});

describe("append", () => {
  it("appends entries in order with incrementing ids and keeps their kind", () => {
    const initialMessages = useChatStore.getState().messages;

    useChatStore.getState().append("me", "第一条");
    useChatStore.getState().append("them", "第二条");
    useChatStore.getState().append("system", "提示");

    expect(useChatStore.getState().messages).toEqual([
      { id: 1, kind: "me", text: "第一条" },
      { id: 2, kind: "them", text: "第二条" },
      { id: 3, kind: "system", text: "提示" },
    ]);
    expect(initialMessages).toHaveLength(0);
    expect(useChatStore.getState().nextId).toBe(4);
  });
});
