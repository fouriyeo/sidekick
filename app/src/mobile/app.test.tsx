import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "@/mobile/features/chat/chat-store";
import { useConnectionStore } from "@/mobile/features/connect/connection-store";
import { useFirstUseStore } from "@/mobile/features/first-use/store";
import { useMicStore } from "@/mobile/features/mic/mic-store";
import { createIdleAiStatus } from "@/mobile/features/pet/ai-status";
import { defaultPetState } from "@/mobile/features/pet/persistence";
import { usePetStore } from "@/mobile/features/pet/pet-store";
import { useSessionStore } from "@/mobile/features/sessions/session-store";
import { clearBackHandlers } from "@/mobile/system-back";
import { useUiStore } from "@/mobile/ui-store";
import type { SessionSummary } from "@/protocol/messages";

const tauri = vi.hoisted(() => ({
  chatHandler: null as ((raw: string) => void) | null,
  connHandler: null as ((event: { online: boolean }) => void) | null,
  backHandler: null as (() => void) | null,
  connectServer: vi.fn(),
  disableWebviewHaptics: vi.fn(),
  discoverServers: vi.fn(),
  exitApp: vi.fn(),
  haptic: vi.fn(),
  memoSyncNow: vi.fn(async () => undefined),
  sendChat: vi.fn(),
  sendFocusRequest: vi.fn(),
  sendKeyRequest: vi.fn(),
  sendMicFrame: vi.fn(),
  sendMicStart: vi.fn(),
  sendMicStop: vi.fn(),
  sendStatusRequest: vi.fn(),
  sendUsageRequest: vi.fn(),
  setKeepScreenOn: vi.fn(),
  subscribeBackButton: vi.fn(),
  subscribeChat: vi.fn(),
  subscribeConn: vi.fn(),
  unsubscribeBack: vi.fn(),
  unsubscribeChat: vi.fn(),
  unsubscribeConn: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  connectServer: tauri.connectServer,
  disableWebviewHaptics: tauri.disableWebviewHaptics,
  discoverServers: tauri.discoverServers,
  exitApp: tauri.exitApp,
  haptic: tauri.haptic,
  memoSyncNow: tauri.memoSyncNow,
  sendChat: tauri.sendChat,
  sendFocusRequest: tauri.sendFocusRequest,
  sendKeyRequest: tauri.sendKeyRequest,
  sendMicFrame: tauri.sendMicFrame,
  sendMicStart: tauri.sendMicStart,
  sendMicStop: tauri.sendMicStop,
  sendStatusRequest: tauri.sendStatusRequest,
  sendUsageRequest: tauri.sendUsageRequest,
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
  subscribeConn: (handler: (event: { online: boolean }) => void) => {
    tauri.connHandler = handler;
    tauri.subscribeConn(handler);
    return tauri.unsubscribeConn;
  },
  subscribeMemo: () => () => {},
}));

vi.mock("@/mobile/features/mic/mic-button", () => ({
  MicButton: () => <button type="button">按住说话，麦克风</button>,
}));

vi.mock("@/mobile/features/connect/components/scan-view", () => ({
  ScanView: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-label="扫码">
        <button type="button" onClick={onClose}>
          关闭扫码
        </button>
      </div>
    ) : null,
}));

vi.mock("@/mobile/features/pet/tauri-pet-storage", () => ({
  createTauriPetStorage: () => ({
    load: async () => ({ raw: null }),
    save: async () => undefined,
    clear: async () => undefined,
  }),
}));

vi.mock("@/mobile/features/sessions/session-storage", () => ({
  loadCleared: async () => ({}),
  saveCleared: async () => undefined,
}));

const MACBOOK = {
  name: "开发者的 MacBook",
  ip: "192.168.1.5",
  port: 47810,
  addr: "192.168.1.5:47810",
};

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "s-1",
    title: "重构登录模块",
    source: "dsh",
    state: "asking",
    askKind: "question",
    lastEventAt: Date.now() - 60_000,
    completedAt: null,
    ...overrides,
  };
}

function seedSessions(list: SessionSummary[]) {
  useSessionStore.setState({
    raw: list,
    cleared: {},
    hydrated: true,
    notice: null,
    noticeId: 0,
    pendingFocusId: null,
    pendingRequestId: null,
  });
}

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
  // 测试里默认暂停自动重连，避免真实定时器干扰。
  useConnectionStore.getState().pauseRetry();
  useUiStore.setState({ view: "pet", scanOpen: false, offlineReturnView: "pet" });
  useFirstUseStore.setState({ micReady: false, dismissed: false, hydrated: false, desktop: null });
  useSessionStore.getState().clearAll();
  usePetStore.setState({
    pet: defaultPetState(Date.now()),
    hydrated: true,
    saveStatus: "idle",
    bubble: null,
    ai: createIdleAiStatus(),
    aiCaption: null,
    micListening: false,
  });
  useMicStore.setState({ phase: "idle", session: null, result: null, error: null });
  tauri.chatHandler = null;
  tauri.connHandler = null;
  tauri.backHandler = null;
  for (const fn of [
    tauri.subscribeBackButton,
    tauri.subscribeChat,
    tauri.subscribeConn,
    tauri.unsubscribeBack,
    tauri.unsubscribeChat,
    tauri.unsubscribeConn,
    tauri.sendChat,
    tauri.disableWebviewHaptics,
    tauri.connectServer,
    tauri.discoverServers,
    tauri.exitApp,
    tauri.setKeepScreenOn,
    tauri.haptic,
    tauri.sendStatusRequest,
    tauri.sendFocusRequest,
    tauri.sendMicStart,
    tauri.sendMicStop,
    tauri.sendMicFrame,
    tauri.sendKeyRequest,
    tauri.sendUsageRequest,
  ]) {
    fn.mockReset();
  }
  tauri.disableWebviewHaptics.mockResolvedValue(undefined);
  tauri.connectServer.mockResolvedValue(undefined);
  tauri.discoverServers.mockResolvedValue([]);
  tauri.exitApp.mockResolvedValue(undefined);
  tauri.setKeepScreenOn.mockResolvedValue(undefined);
  tauri.haptic.mockResolvedValue(undefined);
  tauri.sendStatusRequest.mockResolvedValue(undefined);
  tauri.sendFocusRequest.mockResolvedValue(undefined);
  tauri.sendChat.mockResolvedValue(undefined);
  tauri.sendUsageRequest.mockResolvedValue(undefined);
  clearBackHandlers();
});

afterEach(() => {
  useConnectionStore.getState().pauseRetry();
  clearBackHandlers();
  cleanup();
});

import { MobileApp } from "./app";

async function renderApp() {
  const view = render(<MobileApp />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return view;
}

function pressBack() {
  act(() => tauri.backHandler?.());
}

describe("MobileApp 壳", () => {
  it("默认落在宠物页：没有底部三档，顶栏设置/消息可用", async () => {
    await renderApp();

    expect(screen.getByRole("button", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "消息" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("首用清单")).not.toBeInTheDocument();
  });

  it("设置从左上 gear 进入，返回回到宠物", async () => {
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByRole("heading", { level: 1, name: "更多" })).toBeInTheDocument();

    pressBack();
    expect(useUiStore.getState().view).toBe("pet");
  });

  it("消息从右上 chat 进入，返回回到宠物", async () => {
    await renderApp();

    fireEvent.click(screen.getByRole("button", { name: "消息" }));
    expect(useUiStore.getState().view).toBe("chat");

    pressBack();
    expect(useUiStore.getState().view).toBe("pet");
  });

  it("录音中禁止切页：gear / chat 都被拦截", async () => {
    await renderApp();

    act(() => useMicStore.setState({ phase: "listening" }));

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    fireEvent.click(screen.getByRole("button", { name: "消息" }));
    expect(useUiStore.getState().view).toBe("pet");
  });
});

describe("MobileApp 返回层级", () => {
  it("settings → pet", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "设置" }));

    pressBack();

    expect(useUiStore.getState().view).toBe("pet");
    expect(tauri.exitApp).not.toHaveBeenCalled();
  });

  it("chat → pet", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "消息" }));

    pressBack();

    expect(useUiStore.getState().view).toBe("pet");
  });

  it("asking → pet", async () => {
    seedSessions([session()]);
    usePetStore.setState((state) => ({
      ai: { ...state.ai, state: "asking", resume: "asking", enteredAt: Date.now() },
    }));
    await renderApp();
    act(() => useUiStore.setState({ view: "asking" }));

    pressBack();

    expect(useUiStore.getState().view).toBe("pet");
  });

  it("usage → pet（用量从宠物页顶栏进入）", async () => {
    await renderApp();
    act(() => useUiStore.setState({ view: "usage" }));

    pressBack();

    expect(useUiStore.getState().view).toBe("pet");
  });

  it("offline → 上一页（记住来源）", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: /连接状态：还没连上电脑/ }));

    expect(useUiStore.getState().view).toBe("offline");
    pressBack();
    expect(useUiStore.getState().view).toBe("pet");
  });

  it("scan → 回到打开扫码的页面（连接页）", async () => {
    await renderApp();
    act(() => useUiStore.getState().openOffline());
    act(() => useUiStore.getState().setScanOpen(true));
    expect(screen.getByRole("dialog", { name: "扫码" })).toBeInTheDocument();

    pressBack();

    expect(useUiStore.getState().scanOpen).toBe(false);
    expect(useUiStore.getState().view).toBe("offline");
    expect(tauri.exitApp).not.toHaveBeenCalled();
  });

  it("根页面「再按一次退出」，2 秒内第二次才退出", async () => {
    await renderApp();

    pressBack();
    expect(screen.getByText("再按一次退出")).toBeInTheDocument();
    expect(tauri.exitApp).not.toHaveBeenCalled();

    pressBack();
    expect(tauri.exitApp).toHaveBeenCalledTimes(1);
  });

  it("2 秒后忘记第一次返回", async () => {
    await renderApp();
    vi.useFakeTimers();
    try {
      pressBack();
      expect(screen.getByText("再按一次退出")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(2100));
      expect(screen.queryByText("再按一次退出")).not.toBeInTheDocument();

      pressBack();
      expect(screen.getByText("再按一次退出")).toBeInTheDocument();
      expect(tauri.exitApp).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("MobileApp 屏幕常亮", () => {
  it("只在宠物页请求常亮，进设置/消息后释放", async () => {
    await renderApp();

    expect(tauri.setKeepScreenOn).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(false);

    pressBack();
    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "消息" }));
    expect(tauri.setKeepScreenOn).toHaveBeenLastCalledWith(false);
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
});

describe("MobileApp 协议消息", () => {
  it("订阅一次，解析聊天消息并追加；卸载退订", async () => {
    const { unmount } = await renderApp();

    expect(tauri.subscribeChat).toHaveBeenCalledTimes(1);
    expect(tauri.subscribeConn).toHaveBeenCalledTimes(1);

    act(() => {
      tauri.chatHandler?.('{"type":"chat","from":"desktop","text":"你好","ts":1}');
      tauri.chatHandler?.('{"type":"chat","from":"phone","text":"回声","ts":2}');
    });
    expect(useChatStore.getState().messages.map((message) => message.kind)).toEqual(["them", "me"]);

    unmount();
    expect(tauri.unsubscribeChat).toHaveBeenCalledTimes(1);
    expect(tauri.unsubscribeConn).toHaveBeenCalledTimes(1);
  });

  it("status 消息先于聊天解析：驱动 AI 状态但不进聊天记录", async () => {
    await renderApp();

    act(() => {
      tauri.chatHandler?.(
        '{"type":"status","v":1,"source":"dsh","state":"working","sessions":1,"ts":1730000000000}',
      );
    });
    expect(usePetStore.getState().ai.state).toBe("working");
    expect(useChatStore.getState().messages).toHaveLength(0);

    act(() => {
      tauri.chatHandler?.(
        '{"type":"status","v":1,"source":"dsh","state":"asking","sessions":1,"ts":1730000000500}',
      );
    });
    expect(usePetStore.getState().ai.state).toBe("asking");
  });

  it("过期的 completed 快照被忽略", async () => {
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
  });

  it("conn 事件更新连接状态；断连保留最后快照", async () => {
    seedSessions([session()]);
    await renderApp();

    act(() => tauri.connHandler?.({ online: true }));
    expect(useConnectionStore.getState().status).toBe("connected");
    expect(tauri.sendStatusRequest).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState().raw).toHaveLength(1);

    act(() => tauri.connHandler?.({ online: false }));
    expect(useConnectionStore.getState().status).toBe("disconnected");
    expect(useSessionStore.getState().raw).toHaveLength(1);
  });

  it("mic.ready 标记首用清单的麦克风步骤并持久化", async () => {
    await renderApp();

    act(() => {
      tauri.chatHandler?.('{"v":1,"type":"mic.ready","session":"m-1","ts":1}');
    });

    expect(useFirstUseStore.getState().micReady).toBe(true);
    expect(localStorage.getItem("sidekick:first-use")).toContain('"micReady":true');
  });

  it("desktop.status 更新首用清单的电脑侧状态，且不进聊天记录", async () => {
    await renderApp();

    act(() => {
      tauri.chatHandler?.(
        '{"type":"desktop.status","v":1,"asrConfigured":true,"asrHasKey":true,"accessibilityTrusted":false,"ts":1730000000000}',
      );
    });

    expect(useFirstUseStore.getState().desktop).toEqual({
      asrConfigured: true,
      asrHasKey: true,
      accessibilityTrusted: false,
      at: 1730000000000,
    });
    // 只更新首用清单，不写本地存档、不进聊天记录。
    expect(localStorage.getItem("sidekick:first-use")).toBeNull();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("旧桌面不发 desktop.status：电脑侧状态保持未上报", async () => {
    await renderApp();

    act(() => {
      tauri.chatHandler?.(
        '{"type":"status","v":1,"source":"dsh","state":"idle","sessions":0,"ts":1730000000000}',
      );
    });

    expect(useFirstUseStore.getState().desktop).toBeNull();
  });

  it("录音中不触发 AI 触感", async () => {
    await renderApp();
    act(() => useMicStore.setState({ phase: "listening" }));
    act(() => {
      tauri.chatHandler?.(
        `{"type":"status","v":1,"source":"dsh","state":"asking","sessions":1,"ts":${Date.now()}}`,
      );
    });

    expect(usePetStore.getState().ai.state).toBe("asking");
    expect(tauri.haptic).not.toHaveBeenCalled();
  });

  it("接收 mic.cancel 后强制停掉手机录音", async () => {
    await renderApp();
    act(() => useMicStore.setState({ phase: "listening", session: "local" }));

    act(() => {
      tauri.chatHandler?.(
        '{"v":1,"type":"mic.cancel","session":"desktop","reason":"desktop","ts":1}',
      );
    });

    expect(useMicStore.getState().phase).toBe("idle");
    expect(useMicStore.getState().cancelNotice).toBe("电脑端已取消录音。");
  });
});

describe("MobileApp 启动行为", () => {
  it("启动时搜索一次电脑并关闭 WebView 长按触感", async () => {
    tauri.discoverServers.mockResolvedValue([MACBOOK]);
    await renderApp();

    expect(tauri.discoverServers).toHaveBeenCalledTimes(1);
    expect(tauri.disableWebviewHaptics).toHaveBeenCalledTimes(1);
  });

  it("连接成功与回到前台时请求 AI 状态快照", async () => {
    await renderApp();

    act(() => tauri.connHandler?.({ online: true }));
    expect(tauri.sendStatusRequest).toHaveBeenCalledTimes(1);

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(tauri.sendStatusRequest).toHaveBeenCalledTimes(2);
  });

  it("首启不弹任何对话框，也不请求权限", async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi.fn(async () => []),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    try {
      await renderApp();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(getUserMedia).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });
});
