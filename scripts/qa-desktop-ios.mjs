#!/usr/bin/env node
/**
 * 电脑端「简约 iOS」浏览器 QA（dev mock）
 *
 * 前置：cd app && pnpm dev --host 127.0.0.1（默认 http://127.0.0.1:1420）
 * 用法：node scripts/qa-desktop-ios.mjs [--no-shots]
 * 输出：artifacts/desktop-ios-qa/*.png + qa.json
 *
 * 检查：控制台错误、横向溢出、视口、浅/深两套主题、1180 与 960 两个宽度、
 * 4 个一级页 + 设置二级页。只读，不改代码。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/desktop-ios-qa");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9520 + (process.pid % 200);
const BASE = "http://127.0.0.1:1420";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const noShots = process.argv.includes("--no-shots");

/** 一级页与设置二级页：url 参数即 dev mock 的初始路由。 */
const PAGES = [
  { name: "overview", view: "", label: "概览", query: "&ai=asking" },
  { name: "content", view: "content", label: "内容" },
  { name: "usage", view: "usage", label: "用量" },
  { name: "settings", view: "settings", label: "设置" },
  { name: "settings-connection", view: "connection", label: "手机连接" },
  { name: "settings-voice", view: "models", label: "语音输入" },
  { name: "settings-hook", view: "hook", label: "AI 联动" },
  { name: "settings-accessibility", view: "accessibility", label: "自动输入" },
  { name: "settings-clipboard", view: "clipboard", label: "剪贴板" },
  { name: "settings-about", view: "about", label: "关于本机" },
  { name: "settings-messages", view: "messages", label: "消息通道" },
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
      `--user-data-dir=/tmp/sidekick-desktop-ios-qa-${process.pid}`,
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
        const { resolve: done, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : done(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
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
      }, 15000);
    });
  }

  errors() {
    const out = [];
    const isDevNoise = (text) =>
      /WebSocket connection to .* failed/.test(text) || /Back-Forward Cache/.test(text);
    for (const ev of this.events) {
      if (ev.method === "Runtime.exceptionThrown") {
        const details = ev.params.exceptionDetails;
        out.push(details?.exception?.description || details?.text);
      }
      if (ev.method === "Log.entryAdded" && ev.params.entry.level === "error") {
        out.push(ev.params.entry.text);
      }
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
    mobile: false,
  });
}

async function navigate(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await sleep(1200);
}

function urlFor(page) {
  const view = page.view ? `&view=${page.view}` : "";
  return `${BASE}/?role=desktop${view}${page.query ?? ""}`;
}

async function snapshot(cdp, name, meta, theme) {
  const checks = await js(
    cdp,
    `(() => ({
      bodyText: document.body.innerText.slice(0, 3000),
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      theme: document.documentElement.dataset.theme,
      dark: document.documentElement.classList.contains("dark"),
      buttons: [...document.querySelectorAll('button')].length,
    }))()`,
  );
  await shot(cdp, resolve(OUT, `${name}-${theme}.png`));
  return { name, theme, ...meta, ...checks, consoleErrors: cdp.errors() };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = launchChrome();
  const report = { base: BASE, desktop: [] };
  try {
    const page = await waitForDevtools();
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");

    for (const theme of ["dark", "light"]) {
      await setViewport(cdp, 1180, 760);
      await navigate(cdp, `${BASE}/?role=desktop`);
      await js(cdp, `localStorage.setItem('sidekick:theme', ${JSON.stringify(theme)})`);
      for (const entry of PAGES) {
        await navigate(cdp, urlFor(entry));
        report.desktop.push(await snapshot(cdp, `1180-${entry.name}`, { view: entry.label }, theme));
      }
    }

    // 960×640 最小窗口：只过一级页，确认不裁切
    for (const theme of ["dark", "light"]) {
      await setViewport(cdp, 960, 640);
      await js(cdp, `localStorage.setItem('sidekick:theme', ${JSON.stringify(theme)})`);
      for (const entry of PAGES.slice(0, 4)) {
        await navigate(cdp, urlFor(entry));
        report.desktop.push(await snapshot(cdp, `960-${entry.name}`, { view: entry.label }, theme));
      }
    }

    // 弹层：portal 在 body 下，验证 .desktop-ios 令牌有没有跟进去（二维码 / 隐私 / 清空）
    await setViewport(cdp, 1180, 760);
    const dialogs = [
      { view: "", click: "二维码", name: "dialog-qr" },
      { view: "content", click: "清空", name: "dialog-clear" },
      { view: "about", click: "隐私说明", name: "dialog-privacy" },
    ];
    for (const theme of ["dark", "light"]) {
      await js(cdp, `localStorage.setItem('sidekick:theme', ${JSON.stringify(theme)})`);
      for (const dialog of dialogs) {
        await navigate(cdp, urlFor({ view: dialog.view }));
        const opened = await js(
          cdp,
          `(() => {
            const el = [...document.querySelectorAll('button')]
              .find((node) => (node.getAttribute('aria-label') || node.textContent || '').trim().startsWith(${JSON.stringify(dialog.click)}));
            if (!el) return false;
            el.click();
            return true;
          })()`,
        );
        await sleep(400);
        const tokens = await js(
          cdp,
          `(() => {
            const popup = document.querySelector('[data-slot="dialog-content"]');
            if (!popup) return null;
            const style = getComputedStyle(popup);
            return { background: style.backgroundColor, color: style.color, radius: style.borderRadius };
          })()`,
        );
        report.desktop.push(
          await snapshot(cdp, `1180-${dialog.name}`, { view: dialog.name, clickOk: opened, tokens }, theme),
        );
      }
    }

    // 滚动后：验证 sticky 玻璃工具栏 + 紧凑标题（内容从玻璃下经过）
    for (const theme of ["dark", "light"]) {
      await js(cdp, `localStorage.setItem('sidekick:theme', ${JSON.stringify(theme)})`);
      for (const view of ["", "content", "usage", "settings"]) {
        await navigate(cdp, urlFor({ view }));
        await js(
          cdp,
          `(() => { const el = document.querySelector('[data-page-scroll]'); if (el) el.scrollTop = 220; return true; })()`,
        );
        await sleep(450);
        report.desktop.push(
          await snapshot(cdp, `1180-scrolled-${view || "overview"}`, { view: `scrolled:${view}` }, theme),
        );
      }
    }

    // 窗口级材质（macOS vibrancy，tauri.macos.conf.json）：浏览器里没有原生材质，
    // 这里只校验「检测逻辑 + .dsl-vibrancy 下的 CSS 契约」：
    //  - 模拟真实 Tauri 的 __TAURI_INTERNALS__.metadata → 检测表达式应为 true；
    //  - 浏览器 mock（无 metadata）→ 检测表达式应为 false；
    //  - 手动加 class 后：html/body/根透明、侧栏半透明、内容区不透明且可读。
    await setViewport(cdp, 1180, 760);
    const detectExpr = `(() => {
      const internals = window.__TAURI_INTERNALS__;
      const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);
      const disabled = window.localStorage.getItem("sidekick:vibrancy") === "off";
      return { hasInternals: !!internals, hasMetadata: !!internals && "metadata" in internals, isMac, disabled };
    })()`;
    const beforeInject = await js(cdp, detectExpr);
    const injectedMetadata = await js(
      cdp,
      `(() => {
        const internals = window.__TAURI_INTERNALS__;
        if (!internals) return false;
        internals.metadata = {};
        const r = /Macintosh|Mac OS X/.test(navigator.userAgent) && "metadata" in internals &&
          window.localStorage.getItem("sidekick:vibrancy") !== "off";
        delete internals.metadata;
        return r;
      })()`,
    );

    for (const theme of ["dark", "light"]) {
      await js(cdp, `localStorage.setItem('sidekick:theme', ${JSON.stringify(theme)})`);
      await navigate(cdp, `${BASE}/?role=desktop`);
      const styles = await js(
        cdp,
        `(() => {
          const html = document.documentElement;
          html.classList.add("dsl-vibrancy");
          const body = document.body;
          const sidebar = document.querySelector(".dsl-sidebar");
          const main = document.querySelector(".dsl-main");
          const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null);
          const img = (el) => (el ? getComputedStyle(el).backgroundImage.slice(0, 60) : null);
          const out = {
            vibrancy: html.classList.contains("dsl-vibrancy"),
            htmlBg: bg(html),
            bodyBg: bg(body),
            sidebarBg: bg(sidebar),
            sidebarImage: img(sidebar),
            sidebarBlur: sidebar ? getComputedStyle(sidebar).backdropFilter : null,
            mainBg: bg(main),
            mainImage: img(main),
          };
          html.classList.remove("dsl-vibrancy");
          return out;
        })()`,
      );
      report.desktop.push(
        await snapshot(cdp, "1180-vibrancy-overview", { view: "vibrancy", styles }, theme),
      );
    }

    report.vibrancy = {
      browserMock: beforeInject,
      realTauriDetect: injectedMetadata,
    };

    const problems = report.desktop.filter(
      (row) => row.overflowX || (row.consoleErrors && row.consoleErrors.length > 0),
    );
    report.problems = problems;
    writeFileSync(resolve(OUT, "qa.json"), JSON.stringify(report, null, 2));
    console.log(
      `截图 ${report.desktop.length} 张 → ${OUT}` +
        (problems.length ? `\n⚠️ ${problems.length} 页有问题，见 qa.json` : "\n✅ 无横向溢出/控制台错误"),
    );
  } finally {
    chrome.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
