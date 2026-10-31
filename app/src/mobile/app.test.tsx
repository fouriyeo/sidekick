import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import type { ConnEvent } from "@/protocol/messages";
import { SERVER_ADDR_KEY } from "@/shared/lib/local-storage";

const tauri = vi.hoisted(() => ({
  chatHandler: null as ((raw: string) => void) | null,
  connHandler: null as ((event: { online: boolean }) => void) | null,
  connectServer: vi.fn(),
  sendChat: vi.fn(),
  subscribeChat: vi.fn(),
  subscribeConn: vi.fn(),
  unsubscribeChat: vi.fn(),
  unsubscribeConn: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  connectServer: tauri.connectServer,
  sendChat: tauri.sendChat,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  subscribeChat: (handler: (raw: string) => void) => {
    tauri.chatHandler = handler;
    tauri.subscribeChat(handler);
    return tauri.unsubscribeChat;
  },
  subscribeConn: (handler: (event: ConnEvent) => void) => {
    tauri.connHandler = handler;
    tauri.subscribeConn(handler);
    return tauri.unsubscribeConn;
  },
}));

import { MobileApp } from "./app";

beforeEach(() => {
  localStorage.clear();
  useChatStore.setState({ messages: [], nextId: 1 });
  useConnectionStore.setState({
    addr: "",
    status: "disconnected",
    error: null,
    hydrated: false,
  });
  tauri.chatHandler = null;
  tauri.connHandler = null;
  tauri.subscribeChat.mockClear();
  tauri.subscribeConn.mockClear();
  tauri.unsubscribeChat.mockClear();
  tauri.unsubscribeConn.mockClear();
  tauri.sendChat.mockReset();
  tauri.connectServer.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("MobileApp", () => {
  it("subscribes once and appends parsed chat messages", () => {
    render(<MobileApp />);

    expect(tauri.subscribeChat).toHaveBeenCalledTimes(1);
    expect(tauri.subscribeConn).toHaveBeenCalledTimes(1);

    act(() => {
      tauri.chatHandler?.('{"type":"chat","from":"desktop","text":"你好","ts":1}');
      tauri.chatHandler?.('{"type":"chat","from":"phone","text":"回声","ts":2}');
    });

    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByText("回声")).toBeInTheDocument();
    expect(useChatStore.getState().messages.map((message) => message.kind)).toEqual(["them", "me"]);
  });

  it("updates the connection store from conn events", () => {
    render(<MobileApp />);

    act(() => tauri.connHandler?.({ online: true }));
    expect(screen.getByText("已连接")).toBeInTheDocument();
    expect(useConnectionStore.getState().status).toBe("connected");

    act(() => tauri.connHandler?.({ online: false }));
    expect(screen.getByText("未连接")).toBeInTheDocument();
    expect(useConnectionStore.getState().status).toBe("disconnected");
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = render(<MobileApp />);

    unmount();

    expect(tauri.unsubscribeChat).toHaveBeenCalledTimes(1);
    expect(tauri.unsubscribeConn).toHaveBeenCalledTimes(1);
  });

  it("sends trimmed text and clears the draft without a local echo", async () => {
    tauri.sendChat.mockResolvedValue(undefined);
    render(<MobileApp />);

    fireEvent.change(screen.getByLabelText("消息内容"), { target: { value: "  你好  " } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(tauri.sendChat).toHaveBeenCalledWith("你好"));
    await waitFor(() => expect(screen.getByLabelText("消息内容")).toHaveValue(""));
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("keeps the draft and appends a readable system message when sending fails", async () => {
    tauri.sendChat.mockRejectedValue(new Error("还没连接电脑"));
    render(<MobileApp />);

    fireEvent.change(screen.getByLabelText("消息内容"), { target: { value: "在吗" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("还没连接电脑")).toBeInTheDocument();
    expect(screen.getByLabelText("消息内容")).toHaveValue("在吗");
  });

  it("appends connection errors as system messages and saves the address", async () => {
    tauri.connectServer.mockRejectedValue(new Error("连接失败: refused"));
    render(<MobileApp />);

    fireEvent.change(screen.getByLabelText("电脑地址"), { target: { value: "10.0.0.2:8848" } });
    fireEvent.click(screen.getByRole("button", { name: "连接" }));

    expect(await screen.findByText("连接失败: refused")).toBeInTheDocument();
    expect(useConnectionStore.getState().status).toBe("error");
    expect(localStorage.getItem(SERVER_ADDR_KEY)).toBe("10.0.0.2:8848");
  });
});
