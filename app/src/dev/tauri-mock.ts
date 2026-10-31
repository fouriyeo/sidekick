type MockRole = "desktop" | "mobile";

type MockEvent = "chat" | "conn";

type MockInternals = {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  transformCallback: (callback: (payload: unknown) => void) => number;
  unregisterCallback: (id: number) => void;
  convertFileSrc: (path: string) => string;
};

export function installTauriMock(): void {
  if ("__TAURI_INTERNALS__" in window) return;

  const params = new URLSearchParams(window.location.search);
  const role: MockRole = params.get("role") === "mobile" ? "mobile" : "desktop";
  const callbacks = new Map<number, (payload: unknown) => void>();
  const eventHandlers = new Map<MockEvent, number>();
  const stores = new Map<number, Map<string, unknown>>();
  let nextId = 1;
  let nextStoreId = 1000;

  function emit(event: MockEvent, payload: unknown) {
    const handlerId = eventHandlers.get(event);
    if (handlerId === undefined) return;
    callbacks.get(handlerId)?.({ event, id: handlerId, payload });
  }

  const internals: MockInternals = {
    async invoke(command, args) {
      if (command === "app_role") return role;
      if (command === "server_info") {
        return {
          ip: "127.0.0.1",
          port: 47810,
          url: "http://127.0.0.1:47810",
          discoveryPort: 47820,
        };
      }
      if (command === "discover_servers") {
        // ?discover=none 模拟找不到电脑，?discover=two 模拟局域网里有两台。
        const mode = params.get("discover");
        if (mode === "none") return [];
        // 模拟 UDP 广播等待，方便在浏览器里看到「正在找电脑…」。
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const devices = [
          { name: "Mock 电脑", ip: "127.0.0.1", port: 47810, addr: "127.0.0.1:47810" },
        ];
        if (mode === "two") {
          devices.push({
            name: "客厅 MacBook",
            ip: "192.168.1.8",
            port: 47810,
            addr: "192.168.1.8:47810",
          });
        }
        return devices;
      }
      if (command === "connect_server") {
        const addr = typeof args?.addr === "string" ? args.addr : "";
        window.setTimeout(() => emit("conn", { online: true, url: addr }), 100);
        return null;
      }
      if (command === "send_chat") {
        const text = typeof args?.text === "string" ? args.text : "";
        window.setTimeout(() => {
          emit("chat", JSON.stringify({ type: "chat", from: "phone", text, ts: Date.now() }));
        }, 50);
        return null;
      }
      if (command === "plugin:event|listen") {
        const event = args?.event;
        const handler = args?.handler;
        if ((event === "chat" || event === "conn") && typeof handler === "number") {
          eventHandlers.set(event, handler);
        }
        return nextId++;
      }
      if (command === "plugin:event|unlisten") {
        const event = args?.event;
        if (event === "chat" || event === "conn") eventHandlers.delete(event);
        return null;
      }
      if (command === "plugin:store|load") {
        const rid = nextStoreId++;
        stores.set(rid, new Map());
        return rid;
      }
      if (command === "plugin:store|get") {
        const store = stores.get(Number(args?.rid));
        const key = String(args?.key ?? "");
        return [store?.get(key), store?.has(key) ?? false];
      }
      if (command === "plugin:store|set") {
        stores.get(Number(args?.rid))?.set(String(args?.key ?? ""), args?.value);
        return null;
      }
      if (command === "plugin:store|delete") {
        const store = stores.get(Number(args?.rid));
        const deleted = store?.delete(String(args?.key ?? "")) ?? false;
        return deleted;
      }
      if (command === "plugin:store|clear") {
        stores.get(Number(args?.rid))?.clear();
        return null;
      }
      if (command === "plugin:store|save" || command === "plugin:resources|close") {
        return null;
      }
      return null;
    },
    transformCallback(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
    convertFileSrc(path) {
      return path;
    },
  };

  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: internals,
  });
}
