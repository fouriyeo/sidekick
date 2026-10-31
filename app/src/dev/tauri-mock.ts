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
  let nextId = 1;

  function emit(event: MockEvent, payload: unknown) {
    const handlerId = eventHandlers.get(event);
    if (handlerId === undefined) return;
    callbacks.get(handlerId)?.({ event, id: handlerId, payload });
  }

  const internals: MockInternals = {
    async invoke(command, args) {
      if (command === "app_role") return role;
      if (command === "server_info") {
        return { ip: "127.0.0.1", port: 8848, url: "http://127.0.0.1:8848" };
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
