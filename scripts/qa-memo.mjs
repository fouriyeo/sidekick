#!/usr/bin/env node
/**
 * 备忘录交互（D124）浏览器 QA：手机周/月 + 桌面两栏。
 *
 * 前置：cd app && pnpm dev --host 127.0.0.1（默认 http://127.0.0.1:1420）
 * 用法：node scripts/qa-memo.mjs [--no-shots]
 * 输出：artifacts/memo-qa/*.png + qa.json
 *
 * 检查：横向溢出、console error、日历存在、手机底栏可见、周/月/320/960 覆盖。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "artifacts/memo-qa");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9760 + (process.pid % 160);
const BASE = process.env.SIDEKICK_QA_BASE ?? "http://127.0.0.1:1420";
const noShots = process.argv.includes("--no-shots");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const CASES = [
  { name: "mobile-390-week", role: "mobile", width: 390, height: 844, view: "week" },
  { name: "mobile-390-month", role: "mobile", width: 390, height: 844, view: "month" },
  { name: "mobile-320-week", role: "mobile", width: 320, height: 720, view: "week" },
  { name: "mobile-320-month", role: "mobile", width: 320, height: 720, view: "month" },
  { name: "desktop-1180-month", role: "desktop", width: 1180, height: 760, view: "month" },
  { name: "desktop-1180-week", role: "desktop", width: 1180, height: 760, view: "week" },
  { name: "desktop-960-month", role: "desktop", width: 960, height: 640, view: "month" },
];

function launchChrome() {
  return spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=/tmp/sidekick-memo-qa-${process.pid}`,
      "--window-size=1440,1000",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
}

async function waitForDevtools() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((target) => target.type === "page");
      if (page) return page;
    } catch {
      // retry
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
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: done, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? reject(new Error(JSON.stringify(message.error))) : done(message.result);
      } else if (message.method) {
        this.events.push(message);
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
    const isNoise = (text) =>
      /WebSocket connection to .* failed/.test(text) || /Back-Forward Cache/.test(text);
    const out = [];
    for (const event of this.events) {
      if (event.method === "Runtime.exceptionThrown") {
        const details = event.params.exceptionDetails;
        out.push(details?.exception?.description || details?.text);
      }
      if (event.method === "Log.entryAdded" && event.params.entry.level === "error") {
        out.push(event.params.entry.text);
      }
      if (event.method === "Runtime.consoleAPICalled" && event.params.type === "error") {
        out.push(event.params.args.map((arg) => arg.value ?? arg.description).join(" "));
      }
    }
    this.events = [];
    return out.filter((item) => item && !isNoise(item));
  }
}

async function js(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "evaluate failed");
  return result.result.value;
}

async function shot(cdp, file) {
  if (noShots) return;
  const result = await cdp.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(file, Buffer.from(result.data, "base64"));
}


/** 手机端 C 双模走一遍：首录告知 → 同意 → 锁定 → 再点保存。 */
async function interaction(cdp) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send("Page.navigate", { url: `${BASE}/?role=mobile&view=memo` });
  await sleep(1200);
  await js(cdp, "localStorage.removeItem('sidekick:memo:privacy'); location.reload(); true");
  await sleep(1600);

  const clickCenter = async (selector) => {
    const rect = await js(
      cdp,
      `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    if (!rect) throw new Error(`找不到 ${selector}`);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await cdp.send("Input.dispatchMouseEvent", {
        type,
        x: rect.x,
        y: rect.y,
        button: "left",
        clickCount: 1,
      });
    }
  };

  await clickCenter('button[aria-label^="开始录音"]');
  await sleep(700);
  const sheetText = await js(cdp, "document.body.innerText");
  const privacyShown = sheetText.includes("录音会做什么？");
  await shot(cdp, resolve(OUT, "mobile-privacy-sheet.png"));

  const consent = await js(
    cdp,
    `(() => { const node = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '同意并开始'); if (!node) return false; node.click(); return true; })()`,
  );
  await sleep(1500);
  const lockedHint = await js(cdp, "document.body.innerText.includes('已锁定')");
  await shot(cdp, resolve(OUT, "mobile-recording-locked.png"));

  await clickCenter('button[aria-label*="已锁定"]');
  await sleep(1500);
  const backToIdle = await js(cdp, "[...document.querySelectorAll('button')].some((b) => b.getAttribute('aria-label')?.startsWith('开始录音'))");

  reportInteractions.push({ privacyShown, consent, lockedHint, backToIdle });
}

const reportInteractions = [];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const chrome = launchChrome();
  const report = { base: BASE, cases: [], interactions: reportInteractions };
  try {
    const page = await waitForDevtools();
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");

    for (const theme of ["light", "dark"]) {
      await cdp.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: theme }],
      });
      for (const item of CASES) {
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width: item.width,
          height: item.height,
          deviceScaleFactor: 1,
          mobile: item.role === "mobile",
        });
        await cdp.send("Page.navigate", {
          url: `${BASE}/?role=${item.role}&view=memo&memoView=${item.view}`,
        });
        await sleep(1600);

        const checks = await js(
          cdp,
          `(() => {
            const calendar = document.querySelector('[aria-label="日历"]');
            const mic = [...document.querySelectorAll('button')].find((node) =>
              (node.getAttribute('aria-label') || '').startsWith('开始录音'),
            );
            const dayButtons = [...document.querySelectorAll('[aria-label="日历"] button')];
            const firstDay = document.querySelector('[aria-label="日历"] button[aria-pressed][aria-label*="记录"]')?.getBoundingClientRect();
            const micRect = mic?.getBoundingClientRect();
            return {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
              overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
              bodyOverflowX: document.body.scrollWidth > window.innerWidth + 1,
              hasCalendar: Boolean(calendar),
              dayButtons: dayButtons.length,
              hasRecordingBar: Boolean(mic),
              micBottom: micRect ? Math.round(micRect.bottom) : null,
              micBottomOk: micRect ? micRect.bottom <= window.innerHeight - 23 : null,
              dayCellWidth: firstDay ? Math.round(firstDay.width * 10) / 10 : null,
              theme: document.documentElement.dataset.theme,
              heading: document.querySelector('h1,h2')?.textContent?.trim() || '',
            };
          })()`,
        );
        const consoleErrors = cdp.errors();
        await shot(cdp, resolve(OUT, `${item.name}-${theme}.png`));
        report.cases.push({ name: item.name, theme, ...checks, consoleErrors });
        const flag =
          checks.overflowX ||
          checks.bodyOverflowX ||
          !checks.hasCalendar ||
          consoleErrors.length ||
          (item.role === "mobile" && checks.dayCellWidth !== null && checks.dayCellWidth < 43.5) ||
          (item.role === "mobile" && checks.micBottomOk === false)
            ? "FAIL"
            : "ok";
        console.log(
          `${flag} ${item.name} ${theme} ${item.width}x${item.height} 溢出=${checks.overflowX} 日历=${checks.hasCalendar} 麦克风=${checks.micBottom} 错误=${consoleErrors.length}`,
        );
      }
    }
    await interaction(cdp);
  } finally {
    chrome.kill("SIGTERM");
  }

  writeFileSync(resolve(OUT, "qa.json"), JSON.stringify(report, null, 2));
  const interactionFailed = reportInteractions.some(
    (item) => !item.privacyShown || !item.consent || !item.lockedHint || !item.backToIdle,
  );
  const failures = report.cases.filter(
    (item) =>
      item.overflowX ||
      item.bodyOverflowX ||
      !item.hasCalendar ||
      item.consoleErrors.length ||
      (item.name.startsWith("mobile") && item.dayCellWidth !== null && item.dayCellWidth < 43.5) ||
      (item.name.startsWith("mobile") && item.micBottomOk === false),
  );
  if (interactionFailed) failures.push({ name: "interaction" });
  if (failures.length) {
    console.error(`\n${failures.length} 个用例失败`);
    process.exitCode = 1;
  } else {
    console.log(`\n全部 ${report.cases.length} 个用例通过`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
