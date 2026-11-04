import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../chat-store";
import { ChatPanel } from "./chat-panel";

beforeEach(() => {
  useChatStore.setState({ messages: [] });
});

afterEach(cleanup);

describe("ChatPanel 方向 B", () => {
  it("空状态显示「还没有消息」", () => {
    render(<ChatPanel onSend={vi.fn(() => true)} />);

    expect(screen.getByText("还没有消息")).toBeInTheDocument();
    expect(screen.getByText(/在手机上按住说话/)).toBeInTheDocument();
  });

  it("我方气泡是 wash + signal 边，对方是 surface-2 + 普通边", () => {
    useChatStore.setState({
      messages: [
        { id: 1, kind: "them", text: "已复制到剪贴板" },
        { id: 2, kind: "me", text: "把这句记到剪贴板" },
      ],
    });
    render(<ChatPanel onSend={vi.fn(() => true)} />);

    const mine = screen.getByText("把这句记到剪贴板");
    expect(mine.className).toContain("bg-wash");
    expect(mine.className).toContain("border-signal");
    expect(mine.className).toContain("rounded-br-[4px]");

    const theirs = screen.getByText("已复制到剪贴板");
    expect(theirs.className).toContain("bg-popover");
    expect(theirs.className).toContain("border-border");
    expect(theirs.className).toContain("rounded-bl-[4px]");
  });

  it("系统提示退成居中小字，不画气泡", () => {
    useChatStore.setState({ messages: [{ id: 1, kind: "system", text: "AI 正在等待你确认" }] });
    render(<ChatPanel onSend={vi.fn(() => true)} />);

    const system = screen.getByText("AI 正在等待你确认");
    expect(system.className).toContain("self-center");
    expect(system.className).toContain("text-muted-foreground");
  });

  it("发送成功后清空输入框，失败保留草稿", () => {
    const onSend = vi.fn(() => true);
    render(<ChatPanel onSend={onSend} />);

    const input = screen.getByLabelText("消息内容");
    fireEvent.change(input, { target: { value: "发一条消息" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(onSend).toHaveBeenCalledWith("发一条消息");
    expect(input).toHaveValue("");
  });
});
