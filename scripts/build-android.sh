#!/bin/zsh
# 构建安卓 debug APK。环境按本机实际探测，都可用同名环境变量覆盖。
set -euo pipefail

export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 21)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export NDK_HOME="${NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -1)}"
export ANDROID_NDK_HOME="$NDK_HOME"
export PATH="$HOME/.cargo/bin:$ANDROID_HOME/platform-tools:$PATH"

if [[ -z "$NDK_HOME" ]]; then
  echo "[android] 找不到 NDK，请在 SDK 里安装或设置 NDK_HOME" >&2
  exit 1
fi

# `beforeBuildCommand` 会调 pnpm；PATH 里的 pnpm 版本与 packageManager 不一致时
# 会被 corepack 的版本自检拦下，这里用 corepack 提供的同版本 shim 兜底。
if command -v corepack >/dev/null 2>&1; then
  PNPM_SHIM_DIR="$(mktemp -d)"
  printf '#!/bin/sh\nexec corepack pnpm "$@"\n' >"$PNPM_SHIM_DIR/pnpm"
  chmod +x "$PNPM_SHIM_DIR/pnpm"
  export PATH="$PNPM_SHIM_DIR:$PATH"
  trap 'rm -rf "$PNPM_SHIM_DIR"' EXIT
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
node "$SCRIPT_DIR/patch-android-manifest.mjs"

cd "$SCRIPT_DIR/../app"
./node_modules/.bin/tauri android build --debug --target aarch64 --apk
