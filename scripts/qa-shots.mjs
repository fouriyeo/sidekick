#!/usr/bin/env node
/**
 * 生成 README 截图（dev mock，无需真机/Tauri）
 *
 * 前置：cd app && pnpm dev --host 127.0.0.1
 * 用法：node scripts/qa-shots.mjs
 * 输出：screenshots/{desktop-overview,desktop-usage,mobile-pet,mobile-memo}.png
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "screenshots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9900 + (process.pid % 80);
const BASE = process.env.SIDEKICK_QA_BASE ?? "http://127.0.0.1:1420";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHOTS = [
  { name: "desktop-overview", width: 1180, height: 760, url: "/?ai=asking", theme: "light" },
  { name: "desktop-usage", width: 1180, height: 760, url: "/?view=usage", theme: "light" },
  { name: "mobile-pet", width: 390, height: 844, url: "/?role=mobile&sessions=2&ai=working", theme: "light" },
  { name: "mobile-memo", width: 390, height: 844, url: "/?role=mobile&view=memo", theme: "light" },
];

function launchChrome() {
  return spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=/tmp/sidekick-shots-${process.pid}`,
      "--window-size=1440,1000",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
}

async function waitForDevtools() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error("DevTools 未就绪");
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
  }
  async open() {
    await new Promise((ok, fail) => {
      this.ws.addEventListener("open", ok, { once: true });
      this.ws.addEventListener("error", fail, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !this.pending.has(msg.id)) return;
      const { resolve: done, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : done(msg.result);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((done, reject) => {
      this.pending.set(id, { resolve: done, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 20000);
    });
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = launchChrome();
  try {
    const page = await waitForDevtools();
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    for (const shot of SHOTS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: shot.width,
        height: shot.height,
        deviceScaleFactor: 2,
        mobile: shot.width < 600,
      });
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `localStorage.setItem("sidekick:theme", ${JSON.stringify(shot.theme)});`,
      });
      await cdp.send("Page.navigate", { url: `${BASE}${shot.url}` });
      await sleep(2600);
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
      const file = resolve(OUT, `${shot.name}.png`);
      writeFileSync(file, Buffer.from(data, "base64"));
      console.log(`✅ ${file}`);
    }
    cdp.ws.close();
  } finally {
    chrome.kill("SIGKILL");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
