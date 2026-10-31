import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocketStatus } from "./connection-status";
import { openDesktopSocket } from "./ws-client";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly sent: string[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(data: unknown) {
    this.onmessage?.({ data });
  }

  close() {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error("FakeWebSocket is not open");
    this.sent.push(data);
  }
}

function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  if (!socket) throw new Error("expected a socket to be created");
  return socket;
}

describe("openDesktopSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("connects to the local server and reports status and messages", () => {
    const statuses: SocketStatus[] = [];
    const received: string[] = [];

    const socket = openDesktopSocket({
      port: 8848,
      onStatus: (status) => statuses.push(status),
      onMessage: (raw) => received.push(raw),
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    const fake = lastSocket();
    expect(fake.url).toBe("ws://127.0.0.1:8848/ws");
    expect(statuses).toEqual(["connecting"]);

    fake.open();
    expect(statuses).toEqual(["connecting", "connected"]);

    fake.receive("你好");
    expect(received).toEqual(["你好"]);

    socket.dispose();
  });

  it("sends only while the socket is open", () => {
    const socket = openDesktopSocket({ port: 8848 });
    const fake = lastSocket();
    const payload = JSON.stringify({ type: "chat", from: "desktop", text: "hi", ts: 1 });

    expect(socket.send(payload)).toBe(false);

    fake.open();
    expect(socket.send(payload)).toBe(true);
    expect(fake.sent).toEqual([payload]);

    fake.close();
    expect(socket.send(payload)).toBe(false);

    socket.dispose();
  });

  it("reconnects 1500ms after the socket closes", () => {
    const statuses: SocketStatus[] = [];

    openDesktopSocket({ port: 8848, onStatus: (status) => statuses.push(status) });
    const fake = lastSocket();
    fake.open();
    fake.close();

    expect(statuses).toEqual(["connecting", "connected", "disconnected"]);
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1499);
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(lastSocket().url).toBe("ws://127.0.0.1:8848/ws");
  });

  it("closes the socket and stops reconnecting after dispose", () => {
    const socket = openDesktopSocket({ port: 8848 });
    const fake = lastSocket();
    fake.open();

    socket.dispose();
    expect(fake.readyState).toBe(FakeWebSocket.CLOSED);

    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.send("{}")).toBe(false);
  });

  it("cancels a pending reconnect when disposed", () => {
    const socket = openDesktopSocket({ port: 8848 });
    lastSocket().close();

    socket.dispose();
    vi.advanceTimersByTime(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("keeps a single active socket across a StrictMode-style remount", () => {
    const first = openDesktopSocket({ port: 8848 });
    const firstSocket = lastSocket();
    firstSocket.open();

    first.dispose();

    const second = openDesktopSocket({ port: 8848 });
    const secondSocket = lastSocket();

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(firstSocket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(secondSocket.readyState).toBe(FakeWebSocket.CONNECTING);
    expect(
      FakeWebSocket.instances.filter((socket) => socket.readyState !== FakeWebSocket.CLOSED),
    ).toHaveLength(1);

    second.dispose();
  });
});
