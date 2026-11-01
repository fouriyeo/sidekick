type MockRole = "desktop" | "mobile";

const MOCK_EVENTS = ["chat", "conn", "model-progress", "clipboard-changed"] as const;
type MockEvent = (typeof MOCK_EVENTS)[number];

type MockInternals = {
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  transformCallback: (callback: (payload: unknown) => void) => number;
  unregisterCallback: (id: number) => void;
  convertFileSrc: (path: string) => string;
};

type MockModel = {
  id: "tiny" | "base" | "small" | "medium";
  label: string;
  fileName: string;
  approxBytes: number;
  sizeBytes: number;
  downloaded: boolean;
  note: string;
};

type MockClipboardItem = {
  id: string;
  text: string;
  kind: "text" | "url";
  createdAt: number;
  lastUsedAt: number;
  pinned: boolean;
};

function isMockEvent(value: unknown): value is MockEvent {
  return typeof value === "string" && (MOCK_EVENTS as readonly string[]).includes(value);
}

export function installTauriMock(): void {
  if ("__TAURI_INTERNALS__" in window) return;

  const params = new URLSearchParams(window.location.search);
  const role: MockRole = params.get("role") === "mobile" ? "mobile" : "desktop";
  const callbacks = new Map<number, (payload: unknown) => void>();
  const eventHandlers = new Map<MockEvent, number>();
  // Android 返回键监听：key 是 Channel id，value 是下一条通道消息的序号。
  const backListeners = new Map<number, number>();
  const stores = new Map<number, Map<string, unknown>>();
  let nextId = 1;
  let nextStoreId = 1000;

  const models: MockModel[] = [
    {
      id: "tiny",
      label: "Tiny",
      fileName: "ggml-tiny.bin",
      approxBytes: 77_691_713,
      sizeBytes: 0,
      downloaded: false,
      note: "最快，准确率低",
    },
    {
      id: "base",
      label: "Base",
      fileName: "ggml-base.bin",
      approxBytes: 147_951_465,
      sizeBytes: 147_951_465,
      downloaded: true,
      note: "平衡，推荐起步",
    },
    {
      id: "small",
      label: "Small",
      fileName: "ggml-small.bin",
      approxBytes: 487_601_967,
      sizeBytes: 0,
      downloaded: false,
      note: "更准，体积更大",
    },
    {
      id: "medium",
      label: "Medium",
      fileName: "ggml-medium.bin",
      approxBytes: 1_533_774_201,
      sizeBytes: 0,
      downloaded: false,
      note: "最准，占用较大",
    },
  ];
  let selectedModel: MockModel["id"] | null = "base";
  let downloading: { id: MockModel["id"]; received: number; total: number } | null = null;
  let downloadTimer: number | null = null;
  let downloadCancelled = false;

  const clipboard = {
    enabled: true,
    path: "/Mock/Application Support/Sidekick/clipboard.json",
    maxItems: 100,
    items: [
      {
        id: "1",
        text: "把这段代码改成异步，然后补上注释。",
        kind: "text",
        createdAt: Date.now() - 60_000,
        lastUsedAt: Date.now() - 60_000,
        pinned: true,
      },
      {
        id: "2",
        text: "https://tauri.app/start/",
        kind: "url",
        createdAt: Date.now() - 180_000,
        lastUsedAt: Date.now() - 180_000,
        pinned: false,
      },
    ] as MockClipboardItem[],
  };

  function emit(event: MockEvent, payload: unknown) {
    const handlerId = eventHandlers.get(event);
    if (handlerId === undefined) return;
    callbacks.get(handlerId)?.({ event, id: handlerId, payload });
  }

  // 模拟 AppPlugin.trigger("back-button")：按通道消息格式回填 payload。
  function emitBackButton() {
    for (const [channelId, nextIndex] of backListeners) {
      const callback = callbacks.get(channelId);
      if (!callback) continue;
      callback({ index: nextIndex, message: { canGoBack: false } });
      backListeners.set(channelId, nextIndex + 1);
    }
  }

  function modelSnapshot() {
    return {
      dir: "/Mock/Application Support/Sidekick/models",
      selected: selectedModel,
      models: models.map((model) => ({
        ...model,
        selected: model.downloaded && selectedModel === model.id,
      })),
      downloading,
    };
  }

  function clipboardSnapshot() {
    return {
      enabled: clipboard.enabled,
      items: [...clipboard.items].sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        return right.lastUsedAt - left.lastUsedAt;
      }),
      path: clipboard.path,
      maxItems: clipboard.maxItems,
    };
  }

  function emitClipboard() {
    emit("clipboard-changed", clipboardSnapshot());
  }

  function stopDownload() {
    if (downloadTimer !== null) {
      window.clearInterval(downloadTimer);
      downloadTimer = null;
    }
    downloading = null;
    downloadCancelled = false;
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
        const mode = params.get("discover");
        if (mode === "none") return [];
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
      if (command === "mic_start" || command === "mic_stop") return null;
      if (command === "mic_frame") return null;

      if (command === "accessibility_info") {
        return {
          trusted: params.get("access") === "1",
          appName: "desktop",
          executablePath: "/Mock/Sidekick/target/debug/desktop",
          isDev: true,
        };
      }
      if (
        command === "accessibility_open_settings" ||
        command === "accessibility_reveal_app" ||
        command === "asr_reveal_dir"
      ) {
        return null;
      }
      if (command === "accessibility_request") {
        return {
          trusted: params.get("access") === "1",
          appName: "desktop",
          executablePath: "/Mock/Sidekick/target/debug/desktop",
          isDev: true,
        };
      }

      if (command === "asr_status") return modelSnapshot();
      if (command === "asr_select_model") {
        const id = args?.id as MockModel["id"];
        const model = models.find((item) => item.id === id);
        if (model?.downloaded) selectedModel = id;
        return modelSnapshot();
      }
      if (command === "asr_delete_model") {
        const id = args?.id as MockModel["id"];
        const model = models.find((item) => item.id === id);
        if (model) {
          model.downloaded = false;
          model.sizeBytes = 0;
        }
        if (selectedModel === id) selectedModel = null;
        return modelSnapshot();
      }
      if (command === "asr_download_model") {
        const id = args?.id as MockModel["id"];
        const model = models.find((item) => item.id === id);
        if (!model || model.downloaded || downloading) return null;

        downloadCancelled = false;
        downloading = { id, received: 0, total: model.approxBytes };
        emit("model-progress", {
          modelId: id,
          received: 0,
          total: model.approxBytes,
          state: "downloading",
        });

        downloadTimer = window.setInterval(() => {
          if (!downloading) return;
          if (downloadCancelled) {
            emit("model-progress", {
              modelId: id,
              received: downloading.received,
              total: downloading.total,
              state: "cancelled",
            });
            stopDownload();
            return;
          }

          downloading.received = Math.min(
            downloading.total,
            downloading.received + Math.ceil(downloading.total / 8),
          );
          if (downloading.received >= downloading.total) {
            model.downloaded = true;
            model.sizeBytes = downloading.total;
            if (selectedModel === null) selectedModel = id;
            emit("model-progress", {
              modelId: id,
              received: downloading.total,
              total: downloading.total,
              state: "done",
            });
            stopDownload();
            return;
          }

          emit("model-progress", {
            modelId: id,
            received: downloading.received,
            total: downloading.total,
            state: "downloading",
          });
        }, 350);
        return null;
      }
      if (command === "asr_cancel_download") {
        downloadCancelled = true;
        return null;
      }

      if (command === "clipboard_list" || command === "clipboard_status") {
        return clipboardSnapshot();
      }
      if (command === "clipboard_copy") {
        const id = String(args?.id ?? "");
        const item = clipboard.items.find((entry) => entry.id === id);
        if (item) item.lastUsedAt = Date.now();
        emitClipboard();
        return clipboardSnapshot();
      }
      if (command === "clipboard_toggle_pin") {
        const item = clipboard.items.find((entry) => entry.id === String(args?.id ?? ""));
        if (item) item.pinned = !item.pinned;
        emitClipboard();
        return clipboardSnapshot();
      }
      if (command === "clipboard_delete") {
        clipboard.items = clipboard.items.filter((entry) => entry.id !== String(args?.id ?? ""));
        emitClipboard();
        return clipboardSnapshot();
      }
      if (command === "clipboard_clear") {
        clipboard.items = [];
        emitClipboard();
        return clipboardSnapshot();
      }
      if (command === "clipboard_set_enabled") {
        clipboard.enabled = Boolean(args?.enabled);
        emitClipboard();
        return clipboardSnapshot();
      }

      if (command === "plugin:app|register_listener") {
        const handler = args?.handler as { id?: unknown } | undefined;
        if (args?.event === "back-button" && typeof handler?.id === "number") {
          backListeners.set(handler.id, 0);
        }
        return null;
      }
      if (command === "plugin:app|remove_listener") {
        backListeners.delete(Number(args?.channelId));
        return null;
      }
      if (command === "plugin:app|exit") {
        // 浏览器里没法真的退出：打一条日志，方便确认「再按一次」链路走到了退出。
        console.info("[tauri-mock] exit", args?.code ?? 0);
        return null;
      }
      if (command === "plugin:event|listen") {
        const event = args?.event;
        const handler = args?.handler;
        if (isMockEvent(event) && typeof handler === "number") {
          eventHandlers.set(event, handler);
        }
        return nextId++;
      }
      if (command === "plugin:event|unlisten") {
        const event = args?.event;
        if (isMockEvent(event)) eventHandlers.delete(event);
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

  // 浏览器里没有硬件返回键：开发时按 Esc 模拟 Android 返回键。
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    emitBackButton();
  });
}
