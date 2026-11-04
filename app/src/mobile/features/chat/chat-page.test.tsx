import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useUiStore } from "@/mobile/ui-store";
import { ChatPage } from "./chat-page";

const tauri = vi.hoisted(() => ({
  connectServer: vi.fn(async () => undefined),
  discoverServers: vi.fn(async () => [] as unknown[]),
  sendChat: vi.fn(async () => undefined),
}));

vi.mock("@/shared/lib/tauri", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/lib/tauri")>()),
  connectServer: tauri.connectServer,
  discoverServers: tauri.discoverServers,
  sendChat: tauri.sendChat,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState({ view: "chat", scanOpen: false, offlineReturnView: "pet" });
  useConnectionStore.setState({
    addr: "192.168.1.5:47810",
    status: "connected",
    error: null,
    devices: [],
    discovering: false,
    hasDiscovered: true,
    retryAttempt: 0,
    retryAt: null,
    retrying: false,
    retryPaused: true,
  });
  useConnectionStore.getState().pauseRetry();
  useChatStore.setState({ messages: [], nextId: 1 });
  tauri.sendChat.mockReset();
  tauri.sendChat.mockResolvedValue(undefined);
  tauri.connectServer.mockReset();
  tauri.connectServer.mockResolvedValue(undefined);
  tauri.discoverServers.mockReset();
  tauri.discoverServers.mockResolvedValue([]);
});

afterEach(() => {
  useConnectionStore.getState().pauseRetry();
  cleanup();
});

describe("ChatPage 顶部连接 chip", () => {
  it("显示连接状态，点按打开连接页", () => {
    render(<ChatPage />);

    expect(screen.getByRole("heading", { level: 1, name: "消息" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /连接状态：已连接/ }));
    expect(useUiStore.getState().view).toBe("offline");
  });

  it("已连接时不显示断连折叠卡，输入可用", () => {
    render(<ChatPage />);

    expect(screen.queryByText(/连接断了/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("消息内容")).not.toBeDisabled();
  });

  it("返回按钮回宠物页", () => {
    render(<ChatPage />);

    fireEvent.click(screen.getByRole("button", { name: "返回宠物" }));
    expect(useUiStore.getState().view).toBe("pet");
  });
});

describe("ChatPage 断连折叠卡", () => {
  it("未连接时给倒计时、立即重连、重新搜索、手动地址与扫码入口", async () => {
    useConnectionStore.setState({
      status: "disconnected",
      retryPaused: false,
      retryAttempt: 2,
      retryAt: Date.now() + 5000,
    });
    render(<ChatPage />);

    expect(screen.getByText("连接断了，先连接再发消息")).toBeInTheDocument();
    expect(screen.getByText(/秒后自动重连（第 2 次）/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立即重连" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新搜索" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /手动输入地址/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "扫电脑上的二维码" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "扫电脑上的二维码" }));
    expect(useUiStore.getState().scanOpen).toBe(true);
  });

  it("折叠卡里可手动输入地址并连接", async () => {
    useConnectionStore.setState({ status: "disconnected", addr: "" });
    render(<ChatPage />);

    fireEvent.click(screen.getByRole("button", { name: /手动输入地址/ }));
    fireEvent.change(screen.getByLabelText("电脑地址"), { target: { value: "10.0.0.2:8848" } });
    fireEvent.click(screen.getByRole("button", { name: "连接" }));

    await waitFor(() => expect(tauri.connectServer).toHaveBeenCalledWith("10.0.0.2:8848"));
  });

  it("未连接时输入框禁用并给「去连接」", () => {
    useConnectionStore.setState({ status: "disconnected" });
    render(<ChatPage />);

    expect(screen.getByLabelText("消息内容")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "去连接" }));
    expect(useUiStore.getState().view).toBe("offline");
  });
});

describe("ChatPage 发送", () => {
  it("连接时发送并清空草稿，不做本地回显", async () => {
    render(<ChatPage />);

    fireEvent.change(screen.getByLabelText("消息内容"), { target: { value: "  你好  " } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(tauri.sendChat).toHaveBeenCalledWith("你好"));
    await waitFor(() => expect(screen.getByLabelText("消息内容")).toHaveValue(""));
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("发送失败追加一条系统提示并保留草稿", async () => {
    tauri.sendChat.mockRejectedValue(new Error("还没连接电脑"));
    render(<ChatPage />);

    fireEvent.change(screen.getByLabelText("消息内容"), { target: { value: "在吗" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("还没连接电脑")).toBeInTheDocument();
    expect(screen.getByLabelText("消息内容")).toHaveValue("在吗");
  });

  it("空态给出通道说明", () => {
    render(<ChatPage />);

    expect(screen.getByText("还没有消息")).toBeInTheDocument();
    expect(screen.getByText(/调试通道/)).toBeInTheDocument();
  });
});
