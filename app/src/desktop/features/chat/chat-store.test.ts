import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "./chat-store";

describe("useChatStore", () => {
  beforeEach(() => {
    useChatStore.getState().clear();
  });

  it("appends messages in order with kind and auto-incrementing ids", () => {
    const { append } = useChatStore.getState();

    append("system", "已连接");
    append("them", "你好，电脑");
    append("me", "收到");

    const messages = useChatStore.getState().messages;

    expect(messages).toHaveLength(3);
    expect(messages.map((message) => message.kind)).toEqual(["system", "them", "me"]);
    expect(messages.map((message) => message.text)).toEqual(["已连接", "你好，电脑", "收到"]);
    expect(messages[0].id).toBeLessThan(messages[1].id);
    expect(messages[1].id).toBeLessThan(messages[2].id);
  });

  it("clears all messages but keeps ids increasing", () => {
    const { append } = useChatStore.getState();

    append("me", "第一条");
    const previousId = useChatStore.getState().messages[0].id;

    useChatStore.getState().clear();
    expect(useChatStore.getState().messages).toEqual([]);

    append("them", "清空之后");
    expect(useChatStore.getState().messages[0].id).toBeGreaterThan(previousId);
  });
});
