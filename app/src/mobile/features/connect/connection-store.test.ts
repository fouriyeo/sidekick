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

import { useConnectionStore } from "./connection-store";

const initialState = {
  addr: "",
  status: "disconnected" as const,
  error: null,
  hydrated: false,
  devices: [],
  discovering: false,
  hasDiscovered: false,
  discoverError: null,
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
});

afterEach(() => {
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
