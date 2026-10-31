import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SERVER_ADDR_KEY } from "@/shared/lib/local-storage";

const tauri = vi.hoisted(() => ({
  connectServer: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  connectServer: tauri.connectServer,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

import { useConnectionStore } from "./connection-store";

const initialState = {
  addr: "",
  status: "disconnected" as const,
  error: null,
  hydrated: false,
};

beforeEach(() => {
  localStorage.clear();
  tauri.connectServer.mockReset();
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
