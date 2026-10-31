import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { type ConnEvent, isConnEvent, type ServerInfo } from "@/protocol/messages";

export type AppRole = "desktop" | "mobile";
export type Unsubscribe = () => void;

const COMMANDS = {
  appRole: "app_role",
  serverInfo: "server_info",
  connectServer: "connect_server",
  sendChat: "send_chat",
} as const;

const EVENTS = {
  chat: "chat",
  conn: "conn",
} as const;

type Listener<T> = (payload: T) => void;

function createEventChannel(name: string) {
  const listeners = new Set<Listener<unknown>>();
  let unlisten: UnlistenFn | null = null;
  let pending: Promise<UnlistenFn> | null = null;
  let closed = false;

  function start() {
    if (unlisten || pending) return;

    const current = listen<unknown>(name, (event) => {
      for (const listener of [...listeners]) listener(event.payload);
    });
    pending = current;

    void current
      .then((stop) => {
        if (pending !== current) {
          stop();
          return;
        }
        pending = null;
        if (closed || listeners.size === 0) {
          closed = false;
          stop();
        } else {
          unlisten = stop;
        }
      })
      .catch(() => {
        if (pending === current) pending = null;
      });
  }

  return (listener: Listener<unknown>): Unsubscribe => {
    listeners.add(listener);
    closed = false;
    start();

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);

      if (listeners.size === 0) {
        closed = true;
        if (unlisten) {
          unlisten();
          unlisten = null;
        }
      }
    };
  };
}

const chatChannel = createEventChannel(EVENTS.chat);
const connChannel = createEventChannel(EVENTS.conn);

export async function getAppRole(): Promise<AppRole> {
  const role = await invoke<string>(COMMANDS.appRole);
  if (role !== "desktop" && role !== "mobile") {
    throw new Error(`未知的运行平台：${role}`);
  }
  return role;
}

export function getServerInfo(): Promise<ServerInfo> {
  return invoke<ServerInfo>(COMMANDS.serverInfo);
}

export function connectServer(addr: string): Promise<void> {
  return invoke<void>(COMMANDS.connectServer, { addr });
}

export function sendChat(text: string): Promise<void> {
  return invoke<void>(COMMANDS.sendChat, { text });
}

export function subscribeChat(handler: (raw: string) => void): Unsubscribe {
  return chatChannel((payload) => {
    if (typeof payload === "string") handler(payload);
  });
}

export function subscribeConn(handler: (payload: ConnEvent) => void): Unsubscribe {
  return connChannel((payload) => {
    if (isConnEvent(payload)) handler(payload);
  });
}

export function normalizeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}
