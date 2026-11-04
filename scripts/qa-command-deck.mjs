#!/usr/bin/env node
/**
 * 指挥舱 A · 浏览器最终 QA（dev mock）
 *
 * 前置：`cd app && pnpm dev --host 127.0.0.1`（默认 http://127.0.0.1:1420）
 * 用法：node scripts/qa-command-deck.mjs [--no-shots]
 * 输出：artifacts/command-deck-qa/{desktop,mobile}-*.png + qa.json
 *
 * 检查：console error / 横向溢出 / 视口尺寸 / 导航可点 / 深浅主题截图。
 * 只读、不改代码；截图用于真机前的人工目检。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/command-deck-qa");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9520 + (process.pid % 200);
const BASE = "http://127.0.0.1:1420";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noShots = process.argv.includes("--no-shots");

const DESKTOP_VIEWS = ["总览", "会话", "内容", "系统", "设置"];
const MOBILE_TABS = ["宠物", "动态", "更多"];
const MOBILE_EXTRA = ["设置", "消息"];

function launchChrome() {
  return spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=/tmp/sidekick-qa-chrome-${process.pid}`,
      "--window-size=1440,1000",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
}

async function waitForDevtools() {
  for (let i = 0; i < 60; i += 1) {
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
    this.events = [];
  }
  async open() {
    await new Promise((ok, fail) => {
      this.ws.addEventListener("open", ok, { once: true });
      this.ws.addEventListener("error", fail, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 15000);
    });
  }
  errors() {
    const out = [];
    // 浏览器 dev 专属噪音：Vite HMR 的 WS、桌面真实 WS（生产里由 Tauri 提供）、
    // 以及脚本自己切换页面产生的 bfcache 提示。真机/生产不会出现。
    const isDevNoise = (text) =>
      /WebSocket connection to .* failed/.test(text) ||
      /Page entered Back-Forward Cache/.test(text);
    for (const ev of this.events) {
      if (ev.method === "Runtime.exceptionThrown") {
        const details = ev.params.exceptionDetails;
        out.push(details?.exception?.description || details?.text);
      }
      if (ev.method === "Log.entryAdded" && ev.params.entry.level === "error") out.push(ev.params.entry.text);
      if (ev.method === "Runtime.consoleAPICalled" && ev.params.type === "error") {
        out.push(ev.params.args.map((a) => a.value ?? a.description).join(" "));
      }
    }
    this.events = [];
    return out.filter((item) => item && !isDevNoise(item));
  }
}

async function js(cdp, expression) {
  const res = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || "evaluate failed");
  return res.result.value;
}

async function shot(cdp, file) {
  if (noShots) return;
  const res = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(res.data, "base64"));
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
}

async function navigate(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await sleep(1400);
}

async function clickText(cdp, text) {
  return js(
    cdp,
    `(() => {
      const el = [...document.querySelectorAll('button, a, [role="tab"], [role="button"]')]
        .find((node) => (node.getAttribute('aria-label') || node.textContent || '').trim().startsWith(${JSON.stringify(text)}));
      if (!el) return false;
      el.click();
      return true;
    })()`,
  );
}

async function snapshot(cdp, name, meta) {
  const checks = await js(
    cdp,
    `(() => ({
      title: document.title,
      bodyText: document.body.innerText.slice(0, 4000),
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      buttons: [...document.querySelectorAll('button')].length,
    }))()`,
  );
  await shot(cdp, resolve(OUT, `${name}.png`));
  return { name, ...meta, ...checks, consoleErrors: cdp.errors() };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = launchChrome();
  const report = { base: BASE, desktop: [], mobile: [], theme: {} };
  try {
    const page = await waitForDevtools();
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");

    // ---- desktop 1180×760 ----
    await setViewport(cdp, 1180, 760);
    await navigate(cdp, `${BASE}/?role=desktop&ai=asking`);
    cdp.errors();
    report.desktop.push(await snapshot(cdp, "desktop-1180-home", { view: "总览" }));
    for (const label of DESKTOP_VIEWS.slice(1)) {
      const ok = await clickText(cdp, label);
      await sleep(500);
      report.desktop.push(await snapshot(cdp, `desktop-1180-${label}`, { view: label, clickOk: ok }));
    }

    // 960 最小宽：逐页确认单列不裁切
    await setViewport(cdp, 960, 640);
    await navigate(cdp, `${BASE}/?role=desktop`);
    report.desktop.push(await snapshot(cdp, "desktop-960-home", { view: "总览" }));
    for (const label of DESKTOP_VIEWS.slice(1)) {
      const ok = await clickText(cdp, label);
      await sleep(400);
      report.desktop.push(await snapshot(cdp, `desktop-960-${label}`, { view: label, clickOk: ok }));
    }

    // 浅色
    await setViewport(cdp, 1180, 760);
    await navigate(cdp, `${BASE}/?role=desktop`);
    await js(cdp, `localStorage.setItem('sidekick:theme','light')`);
    await navigate(cdp, `${BASE}/?role=desktop`);
    report.desktop.push(await snapshot(cdp, "desktop-1180-home-light", { view: "总览", theme: "light" }));
    await js(cdp, `localStorage.setItem('sidekick:theme','dark')`);

    // ---- mobile 390×844 ----
    await setViewport(cdp, 390, 844);
    await navigate(cdp, `${BASE}/?role=mobile&ai=working`);
    cdp.errors();
    report.mobile.push(await snapshot(cdp, "mobile-390-pet", { view: "宠物" }));
    for (const label of MOBILE_TABS.slice(1)) {
      const ok = await clickText(cdp, label);
      await sleep(500);
      report.mobile.push(await snapshot(cdp, `mobile-390-${label}`, { view: label, clickOk: ok }));
    }
    // 顶栏只在宠物页，先回宠物再点设置/消息图标
    await clickText(cdp, "宠物");
    await sleep(400);
    for (const label of MOBILE_EXTRA) {
      const ok = await js(
        cdp,
        `(() => {
          const el = [...document.querySelectorAll('button, a')]
            .find((node) => (node.getAttribute('aria-label') || '').includes(${JSON.stringify(label)}));
          if (!el) return false;
          el.click();
          return true;
        })()`,
      );
      await sleep(500);
      report.mobile.push(await snapshot(cdp, `mobile-390-extra-${label}`, { view: label, clickOk: ok }));
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" }).catch(() => undefined);
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" }).catch(() => undefined);
      await sleep(300);
    }

    // 360×800 + 300×800 + 浅色
    await setViewport(cdp, 300, 800);
    await navigate(cdp, `${BASE}/?role=mobile&ai=working`);
    report.mobile.push(await snapshot(cdp, "mobile-300-pet", { view: "宠物" }));
    await setViewport(cdp, 360, 800);
    await navigate(cdp, `${BASE}/?role=mobile`);
    report.mobile.push(await snapshot(cdp, "mobile-360-pet", { view: "宠物" }));
    await setViewport(cdp, 390, 844);
    await navigate(cdp, `${BASE}/?role=mobile&ai=asking`);
    report.mobile.push(await snapshot(cdp, "mobile-390-asking-state", { view: "宠物", ai: "asking" }));
    await js(cdp, `localStorage.setItem('sidekick:theme','light')`);
    await navigate(cdp, `${BASE}/?role=mobile`);
    report.mobile.push(await snapshot(cdp, "mobile-390-pet-light", { view: "宠物", theme: "light" }));
    await js(cdp, `localStorage.setItem('sidekick:theme','dark')`);
  } finally {
    chrome.kill("SIGKILL");
  }

  writeFileSync(resolve(OUT, "qa.json"), JSON.stringify(report, null, 2));
  const all = [...report.desktop, ...report.mobile];
  console.log(
    JSON.stringify(
      {
        screens: all.length,
        consoleErrors: all.flatMap((item) => item.consoleErrors ?? []),
        overflowX: all.filter((item) => item.overflowX).map((item) => item.name),
        clicks: all.filter((item) => item.clickOk === false).map((item) => item.name),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
