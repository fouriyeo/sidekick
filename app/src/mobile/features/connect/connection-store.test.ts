import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredServer } from "@/protocol/discovery";
import { SERVER_ADDR_KEY } from "@/shared/lib/local-storage";

const tauri = vi.hoisted(() => ({
  connectServer: vi.fn(),
  discoverServers: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  connectServer: tauri.connectServer,
  discoverServers: tauri.discoverServers,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

import { RETRY_DELAYS_MS, useConnectionStore } from "./connection-store";

const initialState = {
  addr: "",
  status: "disconnected" as const,
  error: null,
  hydrated: false,
  devices: [],
  discovering: false,
  hasDiscovered: false,
  discoverError: null,
  retryAttempt: 0,
  retryAt: null,
  retrying: false,
  // 默认暂停自动重连，避免旧用例被真实定时器干扰；自动重连用例里再显式打开。
  retryPaused: true,
};

const MACBOOK: DiscoveredServer = {
  name: "开发者的 MacBook",
  ip: "192.168.1.5",
  port: 47810,
  addr: "192.168.1.5:47810",
};

const STUDIO: DiscoveredServer = {
  name: "书房台式机",
  ip: "192.168.1.8",
  port: 47810,
  addr: "192.168.1.8:47810",
};

beforeEach(() => {
  localStorage.clear();
  tauri.connectServer.mockReset();
  tauri.discoverServers.mockReset();
  useConnectionStore.setState(initialState);
  useConnectionStore.getState().pauseRetry();
});

afterEach(() => {
  useConnectionStore.getState().pauseRetry();
  vi.restoreAllMocks();
});

describe("hydrateAddr", () => {
  it("loads the saved address only once", () => {
    localStorage.setItem(SERVER_ADDR_KEY, "192.168.1.5:8848");

    useConnectionStore.getState().hydrateAddr();
    expect(useConnectionStore.getState()).toMatchObject({
      addr: "192.168.1.5:8848",
      hydrated: true,
    });

    localStorage.setItem(SERVER_ADDR_KEY, "10.0.0.2:8848");
    useConnectionStore.getState().hydrateAddr();
    expect(useConnectionStore.getState().addr).toBe("192.168.1.5:8848");
  });

  it("keeps an empty address when nothing is stored", () => {
    useConnectionStore.getState().hydrateAddr();

    expect(useConnectionStore.getState()).toMatchObject({ addr: "", hydrated: true });
  });
});

describe("connect", () => {
  it("persists the trimmed address and stays connecting until a conn event", async () => {
    tauri.connectServer.mockResolvedValue(undefined);

    const result = useConnectionStore.getState().connect("  192.168.1.5:8848  ");

    expect(useConnectionStore.getState()).toMatchObject({
      addr: "192.168.1.5:8848",
      status: "connecting",
      error: null,
    });
    expect(localStorage.getItem(SERVER_ADDR_KEY)).toBe("192.168.1.5:8848");

    await expect(result).resolves.toBeNull();
    expect(tauri.connectServer).toHaveBeenCalledWith("192.168.1.5:8848");
    expect(useConnectionStore.getState().status).toBe("connecting");
  });

  it("does nothing for a blank address", async () => {
    await expect(useConnectionStore.getState().connect("   ")).resolves.toBeNull();

    expect(tauri.connectServer).not.toHaveBeenCalled();
    expect(useConnectionStore.getState().status).toBe("disconnected");
    expect(localStorage.getItem(SERVER_ADDR_KEY)).toBeNull();
  });

  it("exposes the error and returns it when connecting fails", async () => {
    tauri.connectServer.mockRejectedValue(new Error("连接失败: refused"));

    const message = await useConnectionStore.getState().connect("10.0.0.2:8848");

    expect(message).toBe("连接失败: refused");
    expect(useConnectionStore.getState()).toMatchObject({
      addr: "10.0.0.2:8848",
      status: "error",
      error: "连接失败: refused",
    });
  });

  it("still connects when the address cannot be saved", async () => {
    tauri.connectServer.mockResolvedValue(undefined);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    await expect(useConnectionStore.getState().connect("192.168.1.5:8848")).resolves.toBeNull();

    expect(tauri.connectServer).toHaveBeenCalledWith("192.168.1.5:8848");
    expect(useConnectionStore.getState().status).toBe("connecting");
  });
});

describe("discover", () => {
  it("auto-connects when exactly one computer is found", async () => {
    tauri.discoverServers.mockResolvedValue([MACBOOK]);
    tauri.connectServer.mockResolvedValue(undefined);

    await expect(useConnectionStore.getState().discover()).resolves.toBeNull();

    expect(useConnectionStore.getState()).toMatchObject({
      devices: [MACBOOK],
      discovering: false,
      hasDiscovered: true,
      discoverError: null,
      status: "connecting",
      addr: "192.168.1.5:47810",
    });
    expect(tauri.connectServer).toHaveBeenCalledWith("192.168.1.5:47810");
    expect(localStorage.getItem(SERVER_ADDR_KEY)).toBe("192.168.1.5:47810");
  });

  it("does not auto-connect when several computers are found", async () => {
    tauri.discoverServers.mockResolvedValue([MACBOOK, STUDIO]);

    await useConnectionStore.getState().discover();

    expect(tauri.connectServer).not.toHaveBeenCalled();
    expect(useConnectionStore.getState()).toMatchObject({
      devices: [MACBOOK, STUDIO],
      discovering: false,
      hasDiscovered: true,
      status: "disconnected",
    });
  });

  it("does not auto-connect when autoConnect is disabled", async () => {
    tauri.discoverServers.mockResolvedValue([MACBOOK]);

    await useConnectionStore.getState().discover({ autoConnect: false });

    expect(tauri.connectServer).not.toHaveBeenCalled();
    expect(useConnectionStore.getState().devices).toEqual([MACBOOK]);
  });

  it("does not auto-connect when already connected", async () => {
    tauri.discoverServers.mockResolvedValue([MACBOOK]);
    useConnectionStore.setState({ status: "connected" });

    await useConnectionStore.getState().discover();

    expect(tauri.connectServer).not.toHaveBeenCalled();
    expect(useConnectionStore.getState().devices).toEqual([MACBOOK]);
  });

  it("keeps the manual path open when nothing is found", async () => {
    tauri.discoverServers.mockResolvedValue([]);

    await expect(useConnectionStore.getState().discover()).resolves.toBeNull();

    expect(tauri.connectServer).not.toHaveBeenCalled();
    expect(useConnectionStore.getState()).toMatchObject({
      devices: [],
      discovering: false,
      hasDiscovered: true,
      discoverError: null,
    });
  });

  it("turns failures into a Chinese message and can be retried", async () => {
    tauri.discoverServers.mockRejectedValueOnce(new Error("没有局域网权限"));

    await expect(useConnectionStore.getState().discover()).resolves.toBe(
      "搜索电脑失败：没有局域网权限",
    );
    expect(useConnectionStore.getState()).toMatchObject({
      discovering: false,
      hasDiscovered: true,
      discoverError: "搜索电脑失败：没有局域网权限",
      devices: [],
    });

    tauri.discoverServers.mockResolvedValueOnce([MACBOOK]);
    tauri.connectServer.mockResolvedValue(undefined);
    await useConnectionStore.getState().discover();

    expect(useConnectionStore.getState()).toMatchObject({
      devices: [MACBOOK],
      discoverError: null,
      hasDiscovered: true,
    });
    expect(tauri.connectServer).toHaveBeenCalledWith("192.168.1.5:47810");
  });

  it("does not fire duplicate requests while a search is running", async () => {
    let resolveDiscover: ((devices: DiscoveredServer[]) => void) | undefined;
    tauri.discoverServers.mockReturnValue(
      new Promise<DiscoveredServer[]>((resolve) => {
        resolveDiscover = resolve;
      }),
    );

    const first = useConnectionStore.getState().discover();
    const second = useConnectionStore.getState().discover();

    expect(tauri.discoverServers).toHaveBeenCalledTimes(1);
    expect(useConnectionStore.getState().discovering).toBe(true);

    resolveDiscover?.([]);
    await expect(Promise.all([first, second])).resolves.toEqual([null, null]);

    expect(useConnectionStore.getState()).toMatchObject({
      discovering: false,
      hasDiscovered: true,
      devices: [],
    });
  });
});

describe("setOnline", () => {
  it("marks connected and clears the error on online events", () => {
    useConnectionStore.setState({ status: "connecting", error: "boom" });

    useConnectionStore.getState().setOnline(true);

    expect(useConnectionStore.getState()).toMatchObject({ status: "connected", error: null });
  });

  it("marks disconnected on offline events", () => {
    useConnectionStore.setState({ status: "connected" });

    useConnectionStore.getState().setOnline(false);

    expect(useConnectionStore.getState()).toMatchObject({ status: "disconnected", error: null });
  });
});

describe("自动重连", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useConnectionStore.setState({ retryPaused: false });
  });

  afterEach(() => {
    useConnectionStore.getState().pauseRetry();
    vi.useRealTimers();
  });

  it("断连后 1 秒重新发现并自动连上", async () => {
    tauri.discoverServers.mockResolvedValue([MACBOOK]);
    tauri.connectServer.mockResolvedValue(undefined);
    useConnectionStore.setState({ status: "connected", addr: MACBOOK.addr });

    useConnectionStore.getState().setOnline(false);

    expect(useConnectionStore.getState()).toMatchObject({
      status: "disconnected",
      retryAttempt: 1,
    });
    expect(useConnectionStore.getState().retryAt).not.toBeNull();
    expect(tauri.discoverServers).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);

    expect(tauri.discoverServers).toHaveBeenCalledTimes(1);
    expect(tauri.connectServer).toHaveBeenCalledWith(MACBOOK.addr);
    expect(useConnectionStore.getState()).toMatchObject({
      status: "connecting",
      retryAttempt: 0,
      retryAt: null,
      retrying: false,
    });
  });

  it("找不到电脑时按 1s → 2s → 4s 退避", async () => {
    tauri.discoverServers.mockResolvedValue([]);

    useConnectionStore.getState().setOnline(false);

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(tauri.discoverServers).toHaveBeenCalledTimes(1);
    expect(useConnectionStore.getState().retryAttempt).toBe(2);

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1] - 1);
    expect(tauri.discoverServers).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tauri.discoverServers).toHaveBeenCalledTimes(2);
    expect(useConnectionStore.getState().retryAttempt).toBe(3);

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[2]);
    expect(tauri.discoverServers).toHaveBeenCalledTimes(3);
  });

  it("退避上限固定为 30 秒", async () => {
    tauri.discoverServers.mockResolvedValue([]);

    useConnectionStore.getState().setOnline(false);

    // 依次走完 1s / 2s / 4s / 8s / 16s，之后固定 30s。
    for (const delay of RETRY_DELAYS_MS.slice(0, 5)) {
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(useConnectionStore.getState().retryAttempt).toBe(6);

    const maxDelay = RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    await vi.advanceTimersByTimeAsync(maxDelay);
    expect(useConnectionStore.getState().retryAttempt).toBe(7);
    const calls = tauri.discoverServers.mock.calls.length;

    await vi.advanceTimersByTimeAsync(30_000);
    expect(tauri.discoverServers.mock.calls.length).toBe(calls + 1);
  });

  it("发现不到电脑时退回上次地址", async () => {
    tauri.discoverServers.mockResolvedValue([]);
    tauri.connectServer.mockResolvedValue(undefined);
    useConnectionStore.setState({ addr: "10.0.0.9:47810" });

    useConnectionStore.getState().setOnline(false);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);

    expect(tauri.connectServer).toHaveBeenCalledWith("10.0.0.9:47810");
  });

  it("多台电脑时回到上次连过的那台", async () => {
    tauri.discoverServers.mockResolvedValue([MACBOOK, STUDIO]);
    tauri.connectServer.mockResolvedValue(undefined);
    useConnectionStore.setState({ addr: STUDIO.addr });

    useConnectionStore.getState().setOnline(false);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);

    expect(tauri.connectServer).toHaveBeenCalledWith(STUDIO.addr);
  });

  it("多台电脑且没有上次地址时不替用户选，停止自动重连", async () => {
    tauri.discoverServers.mockResolvedValue([MACBOOK, STUDIO]);

    useConnectionStore.getState().setOnline(false);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);

    expect(tauri.connectServer).not.toHaveBeenCalled();
    expect(useConnectionStore.getState()).toMatchObject({
      retryAttempt: 0,
      retryAt: null,
      retrying: false,
    });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(tauri.discoverServers).toHaveBeenCalledTimes(1);
  });

  it("连上后清空倒计时并停止重试", async () => {
    useConnectionStore.getState().setOnline(false);
    expect(useConnectionStore.getState().retryAttempt).toBe(1);

    useConnectionStore.getState().setOnline(true);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(tauri.discoverServers).not.toHaveBeenCalled();
    expect(useConnectionStore.getState()).toMatchObject({
      retryAttempt: 0,
      retryAt: null,
    });
  });

  it("立即重连会取消剩余等待并立刻尝试", async () => {
    tauri.discoverServers.mockResolvedValue([]);

    useConnectionStore.getState().setOnline(false);
    await vi.advanceTimersByTimeAsync(300);

    useConnectionStore.getState().retryNow();
    await vi.advanceTimersByTimeAsync(0);

    expect(tauri.discoverServers).toHaveBeenCalledTimes(1);

    // 旧的 1s 定时器已被取消，不会在 700ms 后再补一次。
    await vi.advanceTimersByTimeAsync(699);
    expect(tauri.discoverServers).toHaveBeenCalledTimes(1);
  });

  it("切后台暂停排期，回前台立即重试", async () => {
    tauri.discoverServers.mockResolvedValue([]);

    useConnectionStore.getState().setOnline(false);
    useConnectionStore.getState().pauseRetry();

    expect(useConnectionStore.getState()).toMatchObject({
      retryPaused: true,
      retryAttempt: 0,
      retryAt: null,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(tauri.discoverServers).not.toHaveBeenCalled();

    useConnectionStore.getState().resumeRetry();
    await vi.advanceTimersByTimeAsync(0);

    expect(useConnectionStore.getState().retryPaused).toBe(false);
    expect(tauri.discoverServers).toHaveBeenCalledTimes(1);
  });

  it("手动连接会取消已排队的自动重连", async () => {
    tauri.connectServer.mockResolvedValue(undefined);

    useConnectionStore.getState().setOnline(false);
    await useConnectionStore.getState().connect("10.0.0.9:47810");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(tauri.discoverServers).not.toHaveBeenCalled();
  });

  it("启动时找不到电脑会自动继续重试", async () => {
    tauri.discoverServers.mockResolvedValue([]);

    await useConnectionStore.getState().bootstrap();
    expect(tauri.discoverServers).toHaveBeenCalledTimes(1);
    expect(useConnectionStore.getState().retryAttempt).toBe(1);

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(tauri.discoverServers).toHaveBeenCalledTimes(2);
  });
});
