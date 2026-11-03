#!/bin/zsh
# 打包桌面端 release → release/Sidekick-macOS.dmg（固定文件名，覆盖旧文件）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
RELEASE_DIR="$ROOT_DIR/release"
OUT="$RELEASE_DIR/Sidekick-macOS.dmg"

export PATH="$HOME/.cargo/bin:$PATH"

echo "[desktop] pnpm tauri build"
cd "$APP_DIR"
pnpm tauri build

DMG="$(find "$APP_DIR/src-tauri/target/release/bundle/dmg" -maxdepth 1 -name '*.dmg' -print -quit 2>/dev/null || true)"
if [[ -z "$DMG" ]]; then
  echo "[desktop] 构建完成但找不到 dmg（app/src-tauri/target/release/bundle/dmg/）" >&2
  exit 1
fi

mkdir -p "$RELEASE_DIR"
cp -f "$DMG" "$OUT"
echo "✅ $OUT（$(ls -lh "$OUT" | awk '{print $5}')，来自 $(basename "$DMG")）"
