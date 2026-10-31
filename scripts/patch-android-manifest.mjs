#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(
  repoRoot,
  "app/src-tauri/gen/android/app/src/main/AndroidManifest.xml",
);

if (!existsSync(manifestPath)) {
  console.log("AndroidManifest 不存在，跳过；先运行 pnpm tauri android init。");
  process.exit(0);
}

const permissions = [
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
];

let text = readFileSync(manifestPath, "utf8");
let changed = false;

for (const permission of permissions) {
  const line = `<uses-permission android:name="${permission}" />`;
  if (text.includes(line)) continue;

  text = text.replace(/(<manifest[^>]*>\s*\n)/, `$1    ${line}\n`);
  changed = true;
}

if (changed) {
  writeFileSync(manifestPath, text);
  console.log("已写入 Android 麦克风权限。");
} else {
  console.log("Android 麦克风权限已存在。");
}
