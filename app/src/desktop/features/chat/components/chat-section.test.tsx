import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../chat-store";
import { ChatSection } from "./chat-section";

const INFO = {
  ip: "192.168.1.23",
  port: 47810,
  url: "http://192.168.1.23:47810",
  discoveryPort: 47820,
};

function renderSection(overrides: Partial<Parameters<typeof ChatSection>[0]> = {}) {
  return render(
    <ChatSection
      onSend={vi.fn(() => true)}
      info={INFO}
      status="connected"
      onOpenOverview={vi.fn()}
      onOpenConnection={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  useChatStore.setState({ messages: [] });
});

afterEach(cleanup);

describe("ChatSection 消息通道", () => {
  it("空状态只留一行「还没有消息」", () => {
    renderSection();

    expect(screen.getByText("还没有消息")).toBeInTheDocument();
    expect(screen.queryByText(/按住说话|通道调试|广播回显/)).not.toBeInTheDocument();
    expect(screen.queryByText(/还没有往来消息/)).not.toBeInTheDocument();
  });

  it("气泡左右区分：我方薄荷实心、对方白卡", () => {
    useChatStore.setState({
      messages: [
        { id: 1, kind: "them", text: "已复制到剪贴板" },
        { id: 2, kind: "me", text: "把这句记到剪贴板" },
      ],
    });
    renderSection();

    const mine = screen.getByText("把这句记到剪贴板");
    expect(mine.className).toContain("bg-primary");
    expect(mine.className).toContain("self-end");
    expect(mine.className).toContain("rounded-br-[6px]");
    expect(mine.closest("li")).toHaveAttribute("aria-label", "我发出的消息");

    const theirs = screen.getByText("已复制到剪贴板");
    expect(theirs.className).toContain("bg-card");
    expect(theirs.className).toContain("self-start");
    expect(theirs.className).toContain("rounded-bl-[6px]");
    expect(theirs.closest("li")).toHaveAttribute("aria-label", "对方消息");
  });

  it("系统事件退成居中小字，不画气泡", () => {
    useChatStore.setState({ messages: [{ id: 1, kind: "system", text: "AI 正在等待你确认" }] });
    renderSection();

    const system = screen.getByText("AI 正在等待你确认");
    expect(system.className).toContain("self-center");
    expect(system.className).toContain("text-muted-foreground");
    expect(system.className).not.toContain("bg-");
  });

  it("发送成功后清空输入框，失败保留草稿", () => {
    const onSend = vi.fn(() => true);
    renderSection({ onSend });

    const input = screen.getByLabelText("消息内容");
    fireEvent.change(input, { target: { value: "发一条消息" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(onSend).toHaveBeenCalledWith("发一条消息");
    expect(input).toHaveValue("");
  });

  it("发送失败时保留草稿", () => {
    const onSend = vi.fn(() => false);
    renderSection({ onSend });

    const input = screen.getByLabelText("消息内容");
    fireEvent.change(input, { target: { value: "这条没发出去" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(onSend).toHaveBeenCalledWith("这条没发出去");
    expect(input).toHaveValue("这条没发出去");
  });

  it("断连时输入与发送禁用，空态给一个连接入口", () => {
    const onOpenConnection = vi.fn();
    renderSection({ status: "disconnected", onOpenConnection });

    expect(screen.getByLabelText("消息内容")).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "打开连接设置" }));
    expect(onOpenConnection).toHaveBeenCalledTimes(1);
  });
});
