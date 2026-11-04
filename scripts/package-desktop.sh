#!/bin/zsh
# 打包桌面端 release → release/Sidekick-macOS.dmg（固定文件名，覆盖旧文件）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
RELEASE_DIR="$ROOT_DIR/release"
OUT="$RELEASE_DIR/Sidekick-macOS.dmg"

export PATH="$HOME/.cargo/bin:$PATH"

# 同 build-android.sh：PATH 里的 pnpm 版本可能与 packageManager 不一致而被拦，
# 用 corepack 提供的锁定版本兜底（固定路径，避免 gradle/vite 缓存记住临时目录）。
PNPM_SHIM_DIR="$APP_DIR/.pnpm-shim"
if command -v corepack >/dev/null 2>&1; then
  mkdir -p "$PNPM_SHIM_DIR"
  printf '#!/bin/sh\ncd "%s" && exec corepack pnpm "$@"\n' "$APP_DIR" >"$PNPM_SHIM_DIR/pnpm"
  chmod +x "$PNPM_SHIM_DIR/pnpm"
  export PATH="$PNPM_SHIM_DIR:$PATH"
fi

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
