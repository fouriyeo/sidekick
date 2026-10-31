#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const docsDir = join(repoRoot, "docs");
const requiredBranches = new Set(["product", "standards", "prd", "engineering"]);
const requiredFields = ["doc", "status", "updated", "load"];

const errors = [];
const warnings = [];

function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return null;
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const block = normalized.slice(4, end);
  const data = {};
  for (const line of block.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) data[match[1]] = match[2].trim();
  }
  return data;
}

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!existsSync(join(full, "INDEX.md"))) {
        errors.push(`缺少索引：${full}/INDEX.md`);
      }
      walk(full);
    } else if (entry.name.endsWith(".md")) {
      checkFile(full);
    }
  }
}

function checkFile(file) {
  const text = readFileSync(file, "utf8");
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").length;
  const rel = file.slice(repoRoot.length + 1);
  const isIndex = file.endsWith("INDEX.md");
  const isPrd = file.endsWith("PRD.md");

  const branch = rel.split("/")[1];
  const needsFrontmatter = rel === "docs/INDEX.md" || requiredBranches.has(branch);
  const frontmatter = parseFrontmatter(normalized);

  if (needsFrontmatter) {
    if (!frontmatter) {
      errors.push(`缺少 frontmatter：${rel}`);
    } else {
      for (const field of requiredFields) {
        if (!frontmatter[field]) errors.push(`frontmatter 缺少 ${field}：${rel}`);
      }
    }
  }

  const isRootIndex = rel === "docs/INDEX.md";
  const newDoc = Boolean(frontmatter);
  const isSpec = file.endsWith("SPEC.md");
  const isAcceptance = file.endsWith("ACCEPTANCE.md");

  let limit = 300;
  let label = "叶子";
  if (isRootIndex) {
    limit = 140;
    label = "根索引";
  } else if (isIndex) {
    limit = 120;
    label = "分支索引";
  } else if (isPrd) {
    limit = 360;
    label = "PRD";
  } else if (isSpec) {
    limit = 300;
    label = "SPEC";
  } else if (isAcceptance) {
    limit = 200;
    label = "ACCEPTANCE";
  }

  if (newDoc && lines > limit) {
    warnings.push(`${label}超过 ${limit} 行（${lines}）：${rel}`);
  }

  checkLinks(normalized, file, rel);
}

function checkLinks(text, file, rel) {
  const withoutCode = text.replace(/```[\s\S]*?```/g, "");
  const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match;
  while ((match = linkPattern.exec(withoutCode)) !== null) {
    let target = match[1].trim();
    if (!target) continue;
    if (/^(https?:|mailto:|tel:|data:|#)/i.test(target)) continue;
    target = target.split("#")[0].split("?")[0];
    if (!target) continue;
    try {
      target = decodeURIComponent(target);
    } catch {
      // keep raw target
    }
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      errors.push(`链接不存在：${rel} -> ${match[1]}`);
    }
  }
}

function printTree(dir, prefix = "") {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? "└─ " : "├─ ";
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      console.log(prefix + connector + entry.name + "/");
      printTree(full, prefix + (isLast ? "   " : "│  "));
    } else if (entry.name.endsWith(".md")) {
      const text = readFileSync(full, "utf8");
      const fm = parseFrontmatter(text);
      const lineCount = text.replace(/\r\n/g, "\n").split("\n").length;
      const suffix = fm?.status ? `, ${fm.status}` : "";
      console.log(`${prefix}${connector}${entry.name} (${lineCount}${suffix})`);
    }
  });
}

console.log("Sidekick docs tree:\n");
console.log("docs/");
printTree(docsDir, "");
walk(docsDir);

if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const warning of warnings) console.log(`  ! ${warning}`);
}

if (errors.length > 0) {
  console.error("\nErrors:");
  for (const error of errors) console.error(`  x ${error}`);
  process.exit(1);
}

console.log(`\nDocs check passed (${warnings.length} warning(s)).`);
