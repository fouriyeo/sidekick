import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import QRCode from "qrcode";

type ServerInfo = { ip: string; port: number; url: string };

type ChatMessage = { type: "chat"; from: "desktop" | "phone"; text: string; ts: number };
type SystemMessage = { type: "system"; text: string };

function appendTo(list: HTMLElement, kind: "me" | "them" | "system", text: string) {
  const li = document.createElement("li");
  li.className = kind;
  li.textContent = text;
  list.appendChild(li);
  list.scrollTop = list.scrollHeight;
}

function parseMessage(
  raw: string,
  self: "desktop" | "phone",
): { kind: "me" | "them" | "system"; text: string } | null {
  try {
    const msg = JSON.parse(raw) as ChatMessage | SystemMessage;
    if (msg.type === "system") return { kind: "system", text: msg.text };
    if (msg.type === "chat") return { kind: msg.from === self ? "me" : "them", text: msg.text };
    return null;
  } catch {
    return { kind: "system", text: raw };
  }
}

function initDesktop() {
  const dot = document.querySelector<HTMLSpanElement>("#dot")!;
  const statusText = document.querySelector<HTMLSpanElement>("#status-text")!;
  const urlEl = document.querySelector<HTMLElement>("#server-url")!;
  const copyBtn = document.querySelector<HTMLButtonElement>("#copy-btn")!;
  const qrCanvas = document.querySelector<HTMLCanvasElement>("#qr")!;
  const list = document.querySelector<HTMLUListElement>("#messages")!;
  const form = document.querySelector<HTMLFormElement>("#send-form")!;
  const input = document.querySelector<HTMLInputElement>("#message-input")!;

  const setStatus = (online: boolean, text: string) => {
    statusText.textContent = text;
    dot.classList.toggle("online", online);
  };

  const connect = (port: number) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    ws.onopen = () => setStatus(true, "已连接");
    ws.onclose = () => {
      setStatus(false, "已断开，重连中…");
      setTimeout(() => connect(port), 1500);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (event) => {
      const parsed = parseMessage(event.data, "desktop");
      if (parsed) appendTo(list, parsed.kind, parsed.text);
    };

    form.onsubmit = (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      if (ws.readyState !== WebSocket.OPEN) {
        appendTo(list, "system", "服务还没连上，稍等一下");
        return;
      }
      ws.send(JSON.stringify({ type: "chat", from: "desktop", text, ts: Date.now() }));
      input.value = "";
    };
  };

  void (async () => {
    const info = await invoke<ServerInfo>("server_info");
    urlEl.textContent = info.url;
    await QRCode.toCanvas(qrCanvas, info.url, { width: 220, margin: 1 });
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(info.url);
      copyBtn.textContent = "已复制";
      setTimeout(() => (copyBtn.textContent = "复制"), 1200);
    };
    connect(info.port);
  })();
}

function initMobile() {
  const dot = document.querySelector<HTMLSpanElement>("#m-dot")!;
  const statusText = document.querySelector<HTMLSpanElement>("#m-status")!;
  const list = document.querySelector<HTMLUListElement>("#m-messages")!;
  const connectForm = document.querySelector<HTMLFormElement>("#connect-form")!;
  const addrInput = document.querySelector<HTMLInputElement>("#server-addr")!;
  const sendForm = document.querySelector<HTMLFormElement>("#m-send-form")!;
  const msgInput = document.querySelector<HTMLInputElement>("#m-input")!;

  const setStatus = (online: boolean, text: string) => {
    statusText.textContent = text;
    dot.classList.toggle("online", online);
  };

  addrInput.value = localStorage.getItem("sidekick:server") ?? "";

  void listen<string>("chat", (event) => {
    const parsed = parseMessage(event.payload, "phone");
    if (parsed) {
      appendTo(list, parsed.kind, parsed.text);
    }
  });
  void listen<{ online: boolean }>("conn", (event) => {
    setStatus(event.payload.online, event.payload.online ? "已连接" : "未连接");
  });

  connectForm.onsubmit = async (event) => {
    event.preventDefault();
    const addr = addrInput.value.trim();
    if (!addr) return;
    localStorage.setItem("sidekick:server", addr);
    setStatus(false, "连接中…");
    try {
      await invoke("connect_server", { addr });
    } catch (err) {
      setStatus(false, "未连接");
      appendTo(list, "system", String(err));
    }
  };

  sendForm.onsubmit = async (event) => {
    event.preventDefault();
    const text = msgInput.value.trim();
    if (!text) return;
    try {
      await invoke("send_chat", { text });
      msgInput.value = "";
    } catch (err) {
      appendTo(list, "system", String(err));
    }
  };
}

void (async () => {
  const role = await invoke<string>("app_role");
  if (role === "mobile") {
    document.body.classList.add("mobile");
    initMobile();
  } else {
    initDesktop();
  }
})();
