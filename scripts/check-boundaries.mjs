#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const srcDir = join(repoRoot, "app", "src");
const zones = ["mobile", "desktop", "shared", "protocol", "entries"];
const errors = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) checkFile(full);
  }
}

function zoneOf(file) {
  const parts = relative(srcDir, file).split(sep);
  return zones.includes(parts[0]) ? parts[0] : null;
}

function forbiddenReason(fromZone, toZone, fromFile) {
  if (fromZone === "mobile" && toZone === "desktop") return "mobile 不能 import desktop";
  if (fromZone === "desktop" && toZone === "mobile") return "desktop 不能 import mobile";
  if (fromZone === "shared" && (toZone === "mobile" || toZone === "desktop")) {
    return "shared 不能 import 平台目录";
  }
  if (
    fromZone === "protocol" &&
    (toZone === "mobile" || toZone === "desktop" || toZone === "shared" || toZone === "entries")
  ) {
    return "protocol 只能依赖纯类型，不能 import 应用层";
  }
  const fromPath = relative(srcDir, fromFile).split(sep).join("/");
  if (fromPath.startsWith("entries/desktop") && toZone === "mobile") {
    return "entries/desktop 不能 import mobile";
  }
  if (fromPath.startsWith("entries/mobile") && toZone === "desktop") {
    return "entries/mobile 不能 import desktop";
  }
  return null;
}

function resolveImport(file, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(srcDir, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(file), spec);
  else return null;

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return candidates.find(
    (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
  );
}

function checkFile(file) {
  const fromZone = zoneOf(file);
  if (!fromZone) return;

  const text = readFileSync(file, "utf8");
  const importPattern = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g;
  let match;

  while ((match = importPattern.exec(text)) !== null) {
    const target = resolveImport(file, match[1]);
    if (!target) continue;
    const toZone = zoneOf(target);
    if (!toZone) continue;
    const reason = forbiddenReason(fromZone, toZone, file);
    if (reason) {
      errors.push(
        `${relative(repoRoot, file)} -> ${relative(repoRoot, target)}：${reason}`,
      );
    }
  }
}

if (!existsSync(srcDir)) {
  console.log("app/src 不存在，跳过平台边界检查。");
  process.exit(0);
}

const platformDirExists = zones.some((zone) => existsSync(join(srcDir, zone)));
if (!platformDirExists) {
  console.log(
    "平台目录尚未创建（mobile/desktop/shared/protocol/entries），跳过边界检查；迁移后自动生效。",
  );
  process.exit(0);
}

walk(srcDir);

if (errors.length > 0) {
  console.error("平台边界检查失败：");
  for (const error of errors) console.error(`  x ${error}`);
  process.exit(1);
}

console.log("平台边界检查通过。");
