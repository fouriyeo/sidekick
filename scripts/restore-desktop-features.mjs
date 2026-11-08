#!/usr/bin/env node
// `tauri android build` 会把 `macos-private-api` 从 Cargo.toml 里剥掉（移动端不兼容），
// 但它是 macOS 透明窗口（D87）与菜单栏看板透明窗的硬前提；不补回来，
// 下一次 `cargo test` / 桌面构建会直接卡在 tauri-build 的 feature allowlist 检查。
//
// 由 `scripts/build-android.sh` 在退出时（成功或失败）调用，幂等。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(repoRoot, "app/src-tauri/Cargo.toml");

let text = readFileSync(manifestPath, "utf8");
let changed = false;

text = text.replace(
  /(tauri = \{ version = "2", features = \[)([^\]]*)(\])/g,
  (whole, prefix, inner, suffix) => {
    if (inner.includes('"macos-private-api"')) return whole;
    changed = true;
    const features = inner.trim();
    const next = features ? `${features}, "macos-private-api"` : '"macos-private-api"';
    return `${prefix}${next}${suffix}`;
  },
);

if (changed) {
  writeFileSync(manifestPath, text);
  console.log("[android] 已恢复 Cargo.toml 的 macos-private-api（桌面透明窗口前提）。");
}
