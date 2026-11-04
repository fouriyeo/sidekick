import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "../chat-store";
import { ChatPanel } from "./chat-panel";

beforeEach(() => {
  useChatStore.setState({ messages: [], nextId: 1 });
});

afterEach(() => {
  cleanup();
});

describe("ChatPanel 方向 B", () => {
  it("空态显示「还没有消息」与 mono 读数，不出现消息列表", () => {
    render(<ChatPanel />);

    expect(screen.getByText("还没有消息")).toBeInTheDocument();
    expect(screen.getByText("NO SIGNAL")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("我方气泡 = 薄荷水膜 + 信号边，对方 = 水面", () => {
    useChatStore.setState({
      messages: [
        { id: 1, kind: "me", text: "把这句记到剪贴板：周五下午三点评审" },
        { id: 2, kind: "them", text: "已复制到剪贴板" },
        { id: 3, kind: "system", text: "AI 正在等待你确认" },
      ],
      nextId: 4,
    });
    const { container } = render(<ChatPanel />);

    const items = [...container.querySelectorAll("li")];
    expect(items[0]?.className).toContain("bg-wash");
    expect(items[0]?.className).toContain("border-signal");
    expect(items[1]?.className).toContain("bg-popover");
    expect(items[2]?.className).toContain("font-mono");
    expect(screen.queryByText("还没有消息")).toBeNull();
  });
});
