import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { clearBackHandlers } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import type { ConnEvent } from "@/protocol/messages";
import { SERVER_ADDR_KEY } from "@/shared/lib/local-storage";

const tauri = vi.hoisted(() => ({
  chatHandler: null as ((raw: string) => void) | null,
  connHandler: null as ((event: { online: boolean }) => void) | null,
  backHandler: null as (() => void) | null,
  connectServer: vi.fn(),
  disableWebviewHaptics: vi.fn(),
  discoverServers: vi.fn(),
  exitApp: vi.fn(),
  haptic: vi.fn(),
  sendChat: vi.fn(),
  sendStatusRequest: vi.fn(),
  setKeepScreenOn: vi.fn(),
  subscribeBackButton: vi.fn(),
  subscribeChat: vi.fn(),
  subscribeConn: vi.fn(),
  unsubscribeBack: vi.fn(),
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

vi.mock("@/mobile/features/connect/components/scan-view", () => ({
  ScanView: () => null,
}));

vi.mock("@/shared/lib/tauri", () => ({
  connectServer: tauri.connectServer,
  disableWebviewHaptics: tauri.disableWebviewHaptics,
  discoverServers: tauri.discoverServers,
  exitApp: tauri.exitApp,
  haptic: tauri.haptic,
  sendChat: tauri.sendChat,
  sendStatusRequest: tauri.sendStatusRequest,
  setKeepScreenOn: tauri.setKeepScreenOn,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  subscribeBackButton: (handler: () => void) => {
    tauri.backHandler = handler;
    tauri.subscribeBackButton(handler);
    return tauri.unsubscribeBack;
  },
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

import { useMicStore } from "@/mobile/features/mic/mic-store";
import { createIdleAiStatus } from "@/mobile/features/pet/ai-status";
import { usePetStore } from "@/mobile/features/pet/pet-store";
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
    retryAttempt: 0,
    retryAt: null,
    retrying: false,
    retryPaused: true,
  });
  // 测试里默认暂停自动重连，避免真实定时器干扰；自动重连 UI 用例再单独打开。
  useConnectionStore.getState().pauseRetry();
  useUiStore.setState({ view: "pet", settingsOpen: false });
  usePetStore.setState((state) => ({
    pet: { ...state.pet, settings: { ...state.pet.settings, keepAwake: true } },
  }));
  tauri.chatHandler = null;
  tauri.connHandler = null;
  tauri.backHandler = null;
  tauri.subscribeBackButton.mockClear();
  tauri.subscribeChat.mockClear();
  tauri.subscribeConn.mockClear();
  tauri.unsubscribeBack.mockClear();
  tauri.unsubscribeChat.mockClear();
  tauri.unsubscribeConn.mockClear();
  tauri.sendChat.mockReset();
  tauri.disableWebviewHaptics.mockReset();
  tauri.disableWebviewHaptics.mockResolvedValue(undefined);
  tauri.connectServer.mockReset();
  tauri.discoverServers.mockReset();
  tauri.discoverServers.mockResolvedValue([]);
  tauri.exitApp.mockReset();
  tauri.exitApp.mockResolvedValue(undefined);
  tauri.setKeepScreenOn.mockReset();
  tauri.setKeepScreenOn.mockResolvedValue(undefined);
  tauri.haptic.mockReset();
  tauri.haptic.mockResolvedValue(undefined);
  tauri.sendStatusRequest.mockReset();
  tauri.sendStatusRequest.mockResolvedValue(undefined);
  usePetStore.setState({
    ai: createIdleAiStatus(),
    aiCaption: null,
    micListening: false,
  });
  useMicStore.setState({ phase: "idle", session: null, result: null, error: null });
  clearBackHandlers();
});

afterEach(() => {
  useConnectionStore.getState().pauseRetry();
  clearBackHandlers();
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
    // 顶栏状态与重连行都会显示「未连接」。
    expect(screen.getAllByText("未连接").length).toBeGreaterThan(0);
    expect(useConnectionStore.getState().status).toBe("disconnected");
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = await renderApp();

    unmount();

    expect(tauri.unsubscribeChat).toHaveBeenCalledTimes(1);
    expect(tauri.unsubscribeConn).toHaveBeenCalledTimes(1);
  });

  it("returns from chat to the pet stage on the Android back button", async () => {
    await renderApp();

    expect(tauri.subscribeBackButton).toHaveBeenCalledTimes(1);

    openChat();
    act(() => tauri.backHandler?.());

    expect(useUiStore.getState().view).toBe("pet");
    expect(tauri.exitApp).not.toHaveBeenCalled();
  });

  it("closes the scan page on back without also leaving chat", async () => {
    await renderApp();
    openChat();
    act(() => useUiStore.getState().setScanOpen(true));

    act(() => tauri.backHandler?.());

    expect(useUiStore.getState().scanOpen).toBe(false);
    expect(useUiStore.getState().view).toBe("chat");
    expect(tauri.exitApp).not.toHaveBeenCalled();
  });

  it("asks for a second back press on the pet stage before exiting", async () => {
    await renderApp();

    act(() => tauri.backHandler?.());
    expect(screen.getByText("再按一次退出")).toBeInTheDocument();
    expect(tauri.exitApp).not.toHaveBeenCalled();

    act(() => tauri.backHandler?.());
    expect(tauri.exitApp).toHaveBeenCalledTimes(1);
  });

  it("forgets the first back press after 2 seconds", async () => {
    await renderApp();
    vi.useFakeTimers();
    try {
      act(() => tauri.backHandler?.());
      expect(screen.getByText("再按一次退出")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(2100));
      expect(screen.queryByText("再按一次退出")).not.toBeInTheDocument();

      act(() => tauri.backHandler?.());
      expect(screen.getByText("再按一次退出")).toBeInTheDocument();
      expect(tauri.exitApp).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the exit hint once the user opens chat", async () => {
    await renderApp();

    act(() => tauri.backHandler?.());
    expect(screen.getByText("再按一次退出")).toBeInTheDocument();

    openChat();

    expect(screen.queryByText("再按一次退出")).not.toBeInTheDocument();
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

  it("空状态里点「手动输入电脑地址」直接展开地址输入框", async () => {
    tauri.discoverServers.mockResolvedValue([]);
    await renderApp();
    openChat();

    expect(await screen.findByText("没找到电脑")).toBeInTheDocument();
    expect(screen.queryByLabelText("电脑地址")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "手动输入电脑地址" }));

    expect(screen.getByLabelText("电脑地址")).toBeInTheDocument();
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

  it("断连后仍显示上次的电脑和重新搜索入口", async () => {
    await renderApp();
    act(() => {
      useConnectionStore.setState({
        status: "disconnected",
        devices: [MACBOOK],
        hasDiscovered: true,
        addr: MACBOOK.addr,
        retryAttempt: 0,
        retryAt: null,
      });
    });
    openChat();

    expect(await screen.findByText("开发者的 MacBook")).toBeInTheDocument();
    expect(screen.getAllByText("未连接").length).toBeGreaterThan(0);

    const callsBefore = tauri.discoverServers.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "重新搜索" }));
    await waitFor(() => expect(tauri.discoverServers.mock.calls.length).toBe(callsBefore + 1));
  });

  it("显示自动重连倒计时，点立即重连会立刻重试", async () => {
    await renderApp();
    openChat();
    act(() => {
      useConnectionStore.setState({
        status: "disconnected",
        retryPaused: true,
        retryAttempt: 2,
        retryAt: Date.now() + 5_000,
      });
    });

    expect(await screen.findByText(/秒后自动重连（第 2 次）/)).toBeInTheDocument();

    const callsBefore = tauri.discoverServers.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "立即重连" }));
    await waitFor(() => expect(tauri.discoverServers.mock.calls.length).toBe(callsBefore + 1));
  });

  it("自动重连进行中显示状态", async () => {
    await renderApp();
    openChat();
    act(() => {
      useConnectionStore.setState({
        status: "disconnected",
        retrying: true,
        retryAttempt: 3,
        retryAt: null,
      });
    });

    expect(screen.getByText(/正在自动重连（第 3 次）/)).toBeInTheDocument();
  });

  it("启动时关闭 WebView 自带的长按触感，震动改由 App 控制", async () => {
    await renderApp();

    expect(tauri.disableWebviewHaptics).toHaveBeenCalledTimes(1);
  });

  it("宠物页请求屏幕常亮，切到聊天页释放，返回后恢复", async () => {
    await renderApp();

    expect(tauri.setKeepScreenOn).toHaveBeenCalledWith(true);

    openChat();
    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(false);

    act(() => tauri.backHandler?.());
    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(true);
  });

  it("关闭屏幕常亮设置后不再请求常亮", async () => {
    act(() => {
      usePetStore.setState((state) => ({
        pet: { ...state.pet, settings: { ...state.pet.settings, keepAwake: false } },
      }));
    });

    await renderApp();

    expect(tauri.setKeepScreenOn).not.toHaveBeenCalledWith(true);
  });

  it("status 消息先于聊天解析：驱动 AI 状态但不进聊天记录", async () => {
    await renderApp();

    act(() => {
      tauri.chatHandler?.(
        '{"type":"status","v":1,"source":"dsh","state":"working","sessions":2,"ts":1730000000000}',
      );
    });

    expect(usePetStore.getState().ai.state).toBe("working");
    expect(usePetStore.getState().ai.sessions).toBe(2);
    expect(usePetStore.getState().aiCaption?.copyId).toBe("ai_working");
    expect(useChatStore.getState().messages).toHaveLength(0);

    act(() => {
      tauri.chatHandler?.(
        '{"type":"status","v":1,"source":"dsh","state":"asking","sessions":2,"ts":1730000000500}',
      );
    });

    expect(usePetStore.getState().ai.state).toBe("asking");
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("过期的 completed 快照被忽略，不重播庆祝", async () => {
    await renderApp();

    act(() => {
      tauri.chatHandler?.(
        '{"type":"status","v":1,"source":"dsh","state":"asking","sessions":1,"ts":1730000000000}',
      );
    });

    const staleTs = Date.now() - 10_000;
    act(() => {
      tauri.chatHandler?.(
        `{"type":"status","v":1,"source":"dsh","state":"completed","sessions":1,"resume":"idle","remainingMs":3000,"ts":${staleTs}}`,
      );
    });

    expect(usePetStore.getState().ai.state).toBe("asking");
    expect(usePetStore.getState().aiCaption?.copyId).toBe("ai_asking");
  });

  it("录音中不触发 AI 触感", async () => {
    await renderApp();
    act(() => {
      useMicStore.setState({ phase: "listening" });
    });

    act(() => {
      tauri.chatHandler?.(
        `{"type":"status","v":1,"source":"dsh","state":"asking","sessions":1,"ts":${Date.now()}}`,
      );
    });

    expect(usePetStore.getState().ai.state).toBe("asking");
    expect(tauri.haptic).not.toHaveBeenCalled();
  });

  it("接收 mic.cancel 后强制停掉手机录音（不校验本地 session）", async () => {
    await renderApp();
    act(() => {
      useMicStore.setState({ phase: "listening", session: "local-session" });
    });

    act(() => {
      tauri.chatHandler?.(
        '{"v":1,"type":"mic.cancel","session":"desktop-session","reason":"desktop","ts":1}',
      );
    });

    expect(useMicStore.getState().phase).toBe("idle");
    expect(useMicStore.getState().session).toBeNull();
    expect(useMicStore.getState().cancelNotice).toBe("电脑端已取消录音。");
  });

  it("连接成功和回到前台时请求 AI 状态快照", async () => {
    await renderApp();

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(tauri.sendStatusRequest).not.toHaveBeenCalled();

    act(() => tauri.connHandler?.({ online: true }));
    expect(tauri.sendStatusRequest).toHaveBeenCalledTimes(1);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(tauri.sendStatusRequest).toHaveBeenCalledTimes(2);
  });
});
