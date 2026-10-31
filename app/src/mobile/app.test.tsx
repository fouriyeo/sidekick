import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useUiStore } from "@/mobile/ui-store";
import type { ConnEvent } from "@/protocol/messages";
import { SERVER_ADDR_KEY } from "@/shared/lib/local-storage";

const tauri = vi.hoisted(() => ({
  chatHandler: null as ((raw: string) => void) | null,
  connHandler: null as ((event: { online: boolean }) => void) | null,
  connectServer: vi.fn(),
  discoverServers: vi.fn(),
  sendChat: vi.fn(),
  subscribeChat: vi.fn(),
  subscribeConn: vi.fn(),
  unsubscribeChat: vi.fn(),
  unsubscribeConn: vi.fn(),
}));

const MACBOOK = {
  name: "开发者的 MacBook",
  ip: "192.168.1.5",
  port: 47810,
  addr: "192.168.1.5:47810",
};

const STUDIO = {
  name: "书房台式机",
  ip: "192.168.1.8",
  port: 47810,
  addr: "192.168.1.8:47810",
};

vi.mock("@/mobile/features/pet/pet-stage", () => ({
  PetStage: ({
    onOpenChat,
    onOpenSettings,
  }: {
    onOpenChat: () => void;
    onOpenSettings: () => void;
  }) => (
    <div>
      <button type="button" onClick={onOpenChat}>
        打开聊天
      </button>
      <button type="button" onClick={onOpenSettings}>
        打开设置
      </button>
    </div>
  ),
}));

vi.mock("@/mobile/features/pet/pet-settings", () => ({
  PetSettings: () => null,
}));

vi.mock("@/shared/lib/tauri", () => ({
  connectServer: tauri.connectServer,
  discoverServers: tauri.discoverServers,
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
    devices: [],
    discovering: false,
    hasDiscovered: false,
    discoverError: null,
  });
  useUiStore.setState({ view: "pet", settingsOpen: false });
  tauri.chatHandler = null;
  tauri.connHandler = null;
  tauri.subscribeChat.mockClear();
  tauri.subscribeConn.mockClear();
  tauri.unsubscribeChat.mockClear();
  tauri.unsubscribeConn.mockClear();
  tauri.sendChat.mockReset();
  tauri.connectServer.mockReset();
  tauri.discoverServers.mockReset();
  tauri.discoverServers.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

function openChat() {
  fireEvent.click(screen.getByRole("button", { name: "打开聊天" }));
}

// 渲染后等启动自动发现落定，避免异步 store 更新落在 act 之外。
async function renderApp() {
  const view = render(<MobileApp />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

describe("MobileApp", () => {
  it("subscribes once and appends parsed chat messages", async () => {
    await renderApp();

    expect(tauri.subscribeChat).toHaveBeenCalledTimes(1);
    expect(tauri.subscribeConn).toHaveBeenCalledTimes(1);

    act(() => {
      tauri.chatHandler?.('{"type":"chat","from":"desktop","text":"你好","ts":1}');
      tauri.chatHandler?.('{"type":"chat","from":"phone","text":"回声","ts":2}');
    });
    openChat();

    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByText("回声")).toBeInTheDocument();
    expect(useChatStore.getState().messages.map((message) => message.kind)).toEqual(["them", "me"]);
  });

  it("updates the connection store from conn events", async () => {
    await renderApp();
    openChat();

    act(() => tauri.connHandler?.({ online: true }));
    expect(screen.getByText("已连接")).toBeInTheDocument();
    expect(useConnectionStore.getState().status).toBe("connected");

    act(() => tauri.connHandler?.({ online: false }));
    expect(screen.getByText("未连接")).toBeInTheDocument();
    expect(useConnectionStore.getState().status).toBe("disconnected");
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = await renderApp();

    unmount();

    expect(tauri.unsubscribeChat).toHaveBeenCalledTimes(1);
    expect(tauri.unsubscribeConn).toHaveBeenCalledTimes(1);
  });

  it("sends trimmed text and clears the draft without a local echo", async () => {
    tauri.sendChat.mockResolvedValue(undefined);
    await renderApp();
    openChat();

    fireEvent.change(screen.getByLabelText("消息内容"), { target: { value: "  你好  " } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(tauri.sendChat).toHaveBeenCalledWith("你好"));
    await waitFor(() => expect(screen.getByLabelText("消息内容")).toHaveValue(""));
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("keeps the draft and appends a readable system message when sending fails", async () => {
    tauri.sendChat.mockRejectedValue(new Error("还没连接电脑"));
    await renderApp();
    openChat();

    fireEvent.change(screen.getByLabelText("消息内容"), { target: { value: "在吗" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("还没连接电脑")).toBeInTheDocument();
    expect(screen.getByLabelText("消息内容")).toHaveValue("在吗");
  });

  it("appends connection errors as system messages and saves the address", async () => {
    tauri.connectServer.mockRejectedValue(new Error("连接失败: refused"));
    await renderApp();
    openChat();

    fireEvent.click(screen.getByRole("button", { name: "手动输入地址" }));
    fireEvent.change(screen.getByLabelText("电脑地址"), { target: { value: "10.0.0.2:8848" } });
    fireEvent.click(screen.getByRole("button", { name: "连接" }));

    expect(await screen.findByText("连接失败: refused")).toBeInTheDocument();
    expect(useConnectionStore.getState().status).toBe("error");
    expect(localStorage.getItem(SERVER_ADDR_KEY)).toBe("10.0.0.2:8848");
  });

  it("auto-connects to the only computer discovered on launch", async () => {
    tauri.discoverServers.mockResolvedValue([MACBOOK]);
    tauri.connectServer.mockResolvedValue(undefined);
    await renderApp();

    await waitFor(() => expect(tauri.connectServer).toHaveBeenCalledWith("192.168.1.5:47810"));

    openChat();
    expect(await screen.findByText("开发者的 MacBook")).toBeInTheDocument();
    expect(screen.getByText("192.168.1.5:47810")).toBeInTheDocument();
    expect(screen.getByText("正在连接…")).toBeInTheDocument();

    act(() => tauri.connHandler?.({ online: true }));
    expect(screen.getByText("已连接，可以开始聊天")).toBeInTheDocument();
    expect(useConnectionStore.getState().status).toBe("connected");
  });

  it("lists several computers and connects to the one tapped", async () => {
    tauri.discoverServers.mockResolvedValue([MACBOOK, STUDIO]);
    tauri.connectServer.mockResolvedValue(undefined);
    await renderApp();

    await waitFor(() => expect(useConnectionStore.getState().hasDiscovered).toBe(true));
    expect(tauri.connectServer).not.toHaveBeenCalled();

    openChat();
    expect(await screen.findByText("开发者的 MacBook")).toBeInTheDocument();
    expect(screen.getByText("书房台式机")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /书房台式机/ }));

    await waitFor(() => expect(tauri.connectServer).toHaveBeenCalledWith("192.168.1.8:47810"));
    expect(useConnectionStore.getState().addr).toBe("192.168.1.8:47810");
  });

  it("shows the empty state and keeps manual input available", async () => {
    tauri.discoverServers.mockResolvedValue([]);
    tauri.connectServer.mockResolvedValue(undefined);
    await renderApp();
    openChat();

    expect(await screen.findByText("没找到电脑")).toBeInTheDocument();
    expect(screen.getByText("手机和电脑连同一个 Wi-Fi")).toBeInTheDocument();
    expect(screen.getByText("电脑端 Sidekick 已打开")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "手动输入地址" }));
    fireEvent.change(screen.getByLabelText("电脑地址"), { target: { value: "10.0.0.9:47810" } });
    fireEvent.click(screen.getByRole("button", { name: "连接" }));

    await waitFor(() => expect(tauri.connectServer).toHaveBeenCalledWith("10.0.0.9:47810"));
    expect(useConnectionStore.getState().status).toBe("connecting");
  });

  it("searches when the chat opens before any search has finished", async () => {
    await renderApp();
    const callsBefore = tauri.discoverServers.mock.calls.length;

    // 模拟启动搜索尚未完成（例如页面刚挂载就被切到聊天页）。
    act(() => {
      useConnectionStore.setState({ hasDiscovered: false, discovering: false });
    });
    openChat();

    await waitFor(() => expect(tauri.discoverServers.mock.calls.length).toBe(callsBefore + 1));
  });
});
