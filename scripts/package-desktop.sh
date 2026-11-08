#!/bin/zsh
# 打包桌面端 release → release/Sidekick-macOS.dmg（固定文件名，覆盖旧文件）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
RELEASE_DIR="$ROOT_DIR/release"
OUT="$RELEASE_DIR/Sidekick-macOS.dmg"
EMBED_APK="$RELEASE_DIR/Sidekick-Android.apk"

# 桌面端 build.rs 会把下面这个 APK 编译期嵌进二进制：单独打桌面包前先确认它是最新的，
# 否则扫码下载到的是上一次的安卓包。
if [[ -f "$EMBED_APK" ]]; then
  echo "[desktop] 将嵌入 $EMBED_APK（$(ls -lh "$EMBED_APK" | awk '{print $5}')，$(date -r "$EMBED_APK" '+%Y-%m-%d %H:%M')）"
else
  echo "[desktop] 警告：release/Sidekick-Android.apk 不存在，桌面端不会嵌入安装包" >&2
fi

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

# 用本机自签名证书签名（scripts/setup-dev-signing.sh 建的身份）：
# TCC（辅助功能等）按代码身份记账，ad-hoc 产物每次重打包都换 cdhash，
# 系统设置里勾着也不生效（tccd 日志：Failed to match existing code requirement）。
SIGN_IDENTITY="${SIDEKICK_SIGN_IDENTITY:-Sidekick Dev}"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "\"$SIGN_IDENTITY\""; then
  export APPLE_SIGNING_IDENTITY="$SIGN_IDENTITY"
  echo "[desktop] 用签名身份「$SIGN_IDENTITY」签名（辅助功能授权可跨重装保留）"
else
  echo "[desktop] 警告：没找到签名身份「$SIGN_IDENTITY」，产物是 ad-hoc —— 辅助功能每次重装都要重新授权（跑 scripts/setup-dev-signing.sh 建身份）" >&2
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
