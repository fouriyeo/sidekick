#!/bin/zsh
# 构建安卓 debug APK。环境按本机实际探测，都可用同名环境变量覆盖。
set -euo pipefail

# JAVA_HOME：优先显式环境变量，其次系统 java_home，最后 Homebrew JDK。
# 注意：macOS 的 /usr/libexec/java_home 不认 Homebrew 安装的 openjdk@21，
# 直接用它会在 gradle 阶段报 “Unable to locate a Java Runtime”。
if [[ -z "${JAVA_HOME:-}" ]]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
fi
if [[ -z "${JAVA_HOME:-}" ]]; then
  for candidate in \
    /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
    /usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home; do
    if [[ -x "$candidate/bin/java" ]]; then
      JAVA_HOME="$candidate"
      break
    fi
  done
fi
if [[ -z "${JAVA_HOME:-}" ]]; then
  echo "[android] 找不到 JDK 21，请安装 openjdk@21 或设置 JAVA_HOME" >&2
  exit 1
fi
export JAVA_HOME
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export NDK_HOME="${NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/* 2>/dev/null | sort -V | tail -1)}"
export ANDROID_NDK_HOME="$NDK_HOME"
export PATH="$HOME/.cargo/bin:$ANDROID_HOME/platform-tools:$PATH"

if [[ -z "$NDK_HOME" ]]; then
  echo "[android] 找不到 NDK，请在 SDK 里安装或设置 NDK_HOME" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../app" && pwd)"

# gradle 的 rust 任务会经 `beforeBuildCommand` 调 `pnpm`，但它的工作目录是
# `gen/android`（没有 package.json），corepack 在那里读不到 `packageManager`，
# 会退回全局版本并被版本自检拦下。shim 里先切到 app 目录再转给 corepack，
# 保证用的是 package.json 锁定的 pnpm。
# 用固定路径而不是 mktemp：gradle 的 configuration cache 会把 PATH 里的目录记下来，
# 随机目录在脚本退出后会被删除，下次复用缓存就会找不到 pnpm。
PNPM_SHIM_DIR="$APP_DIR/.pnpm-shim"
if command -v corepack >/dev/null 2>&1; then
  mkdir -p "$PNPM_SHIM_DIR"
  printf '#!/bin/sh\ncd "%s" && exec corepack pnpm "$@"\n' "$APP_DIR" >"$PNPM_SHIM_DIR/pnpm"
  chmod +x "$PNPM_SHIM_DIR/pnpm"
  export PATH="$PNPM_SHIM_DIR:$PATH"
fi

node "$SCRIPT_DIR/patch-android-manifest.mjs"

cd "$APP_DIR"
./node_modules/.bin/tauri android build --debug --target aarch64 --apk
