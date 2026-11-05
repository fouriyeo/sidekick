#!/usr/bin/env node
/**
 * 从 OpenRouter 公开模型目录生成 `app/src-tauri/src/pricing_seed.json`。
 *
 * 用法：`node scripts/update-pricing.mjs [--out <file>]`
 *
 * - 只用 Node 24 原生 fetch，无第三方依赖；只 GET 公开目录，不发送本机任何数据。
 * - 价格单位统一换算成 USD / 1M tokens（OpenRouter 返回的是每 token 的美元字符串）。
 * - `_meta.source` 固定写 `openrouter/api/v1/models`，`_meta.updated_at` 是毫秒时间戳，
 *   `_meta.count` 与 models 条目数一致（Rust 侧会校验/依赖这个 schema）。
 * - 输出键排序，语气为「跳过非法/负价模型」：in/out 缺失、非数字、负数一律丢弃；
 *   cache 缺失按 0 处理，cache 出现非法值同样丢弃该模型。
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const USER_AGENT = "Sidekick/0.1";
const TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(SCRIPT_DIR, "../app/src-tauri/src/pricing_seed.json");

function parseArgs(argv) {
  let out = DEFAULT_OUT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      const value = argv[index + 1];
      if (!value) throw new Error("--out 需要一个文件路径");
      out = resolve(process.cwd(), value);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("用法: node scripts/update-pricing.mjs [--out <file>]");
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return { out };
}

/** 每 token 美元 → 每 100 万 token 美元；非法/负价返回 null。 */
function perMillionUsd(value) {
  let number;
  if (typeof value === "string") number = Number(value.trim());
  else if (typeof value === "number") number = value;
  else return null;
  if (!Number.isFinite(number) || number < 0) return null;
  const scaled = number * 1_000_000;
  if (!Number.isFinite(scaled) || scaled < 0) return null;
  // 抹掉浮点尾差，seed 稳定可 diff（OpenRouter 目录最多到 6 位小数）。
  return Math.round(scaled * 1_000_000) / 1_000_000;
}

/** 下载目录并做大小/跳转/最终 host 校验。 */
async function fetchCatalog() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let url = MODELS_URL;
    let redirects = 0;
    for (;;) {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        redirect: "manual",
        signal: controller.signal,
      });
      if (REDIRECT_STATUS.has(response.status)) {
        if (redirects >= MAX_REDIRECTS) throw new Error("too_many_redirects");
        const location = response.headers.get("location");
        if (!location) throw new Error("bad_redirect");
        const next = new URL(location, url);
        if (next.protocol !== "https:" || next.hostname !== "openrouter.ai") {
          throw new Error("unsafe_redirect");
        }
        url = next.toString();
        redirects += 1;
        continue;
      }
      if (!response.ok) throw new Error(`http_${response.status}`);
      const finalUrl = new URL(response.url);
      if (finalUrl.protocol !== "https:" || finalUrl.hostname !== "openrouter.ai") {
        throw new Error("unsafe_final_url");
      }
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
        throw new Error("body_too_large");
      }
      const text = await response.text();
      if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new Error("body_too_large");
      return JSON.parse(text);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** OpenRouter 响应 → seed schema 的 models 映射。 */
export function normalizeCatalog(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const models = new Map();
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || !id.includes("/")) continue;
    const pricing = entry.pricing;
    if (!pricing || typeof pricing !== "object") continue;
    const input = perMillionUsd(pricing.prompt);
    const output = perMillionUsd(pricing.completion);
    if (input === null || output === null) continue;
    const cacheRead =
      pricing.input_cache_read === undefined || pricing.input_cache_read === null
        ? 0
        : perMillionUsd(pricing.input_cache_read);
    const cacheWrite =
      pricing.input_cache_write === undefined || pricing.input_cache_write === null
        ? 0
        : perMillionUsd(pricing.input_cache_write);
    if (cacheRead === null || cacheWrite === null) continue;
    const model = { in: input, out: output, cache_read: cacheRead, cache_write: cacheWrite };
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (name) model.name = name;
    models.set(id, model);
  }
  // 排序保证 seed 稳定可 diff。
  return Object.fromEntries([...models.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

async function main() {
  const { out } = parseArgs(process.argv.slice(2));
  const payload = await fetchCatalog();
  const models = normalizeCatalog(payload);
  const count = Object.keys(models).length;
  if (count === 0) throw new Error("empty_catalog");
  const seed = {
    _meta: {
      source: "openrouter/api/v1/models",
      updated_at: Date.now(),
      count,
    },
    models,
  };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(seed, null, 1)}\n`, "utf8");
  // 只打数量与路径，不打印模型名。
  console.log(`[pricing] 已生成 ${out}：${count} 个模型`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[pricing] 更新失败：${error?.message ?? error}`);
    process.exit(1);
  });
}
