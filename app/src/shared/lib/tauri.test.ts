import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauri.invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: (event: { payload: unknown }) => void, options?: unknown) => {
    tauri.listen(name, handler, options);
    tauri.handlers.set(name, handler);
    return Promise.resolve(tauri.unlisten);
  },
}));

async function loadTauri() {
  return import("./tauri");
}

beforeEach(() => {
  vi.resetModules();
  tauri.invoke.mockReset();
  tauri.listen.mockReset();
  tauri.unlisten.mockReset();
  tauri.handlers.clear();
});

describe("tauri command wrappers", () => {
  it("validates the app role", async () => {
    const { getAppRole } = await loadTauri();
    tauri.invoke.mockResolvedValue("mobile");
    await expect(getAppRole()).resolves.toBe("mobile");

    tauri.invoke.mockResolvedValue("browser");
    await expect(getAppRole()).rejects.toThrow("未知的运行平台");
  });

  it("forwards connection and chat commands with typed arguments", async () => {
    const { connectServer, sendChat } = await loadTauri();
    tauri.invoke.mockResolvedValue(undefined);

    await connectServer("192.168.1.5:8848");
    expect(tauri.invoke).toHaveBeenCalledWith("connect_server", { addr: "192.168.1.5:8848" });

    await sendChat("你好");
    expect(tauri.invoke).toHaveBeenCalledWith("send_chat", { text: "你好" });
  });
});

describe("event subscription bridge", () => {
  it("filters invalid conn payloads and unsubscribes", async () => {
    const { subscribeConn } = await loadTauri();
    const handler = vi.fn();
    const unsubscribe = subscribeConn(handler);

    await Promise.resolve();
    await Promise.resolve();

    expect(tauri.listen).toHaveBeenCalledWith("conn", expect.any(Function), undefined);
    const dispatch = tauri.handlers.get("conn");
    dispatch?.({ payload: { online: true } });
    dispatch?.({ payload: { online: "yes" } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ online: true });

    unsubscribe();
    expect(tauri.unlisten).toHaveBeenCalledTimes(1);
  });

  it("unlistens when cleanup happens before listen resolves", async () => {
    const { subscribeConn } = await loadTauri();
    const pending: { resolve?: (stop: () => void) => void } = {};
    tauri.listen.mockReturnValueOnce(
      new Promise<() => void>((resolve) => {
        pending.resolve = resolve;
      }),
    );

    const unsubscribe = subscribeConn(vi.fn());
    unsubscribe();
    pending.resolve?.(tauri.unlisten);

    await Promise.resolve();
    await Promise.resolve();

    expect(tauri.unlisten).toHaveBeenCalledTimes(1);
  });
});
