#!/usr/bin/env bash
# 真机截图固定落点：artifacts/device-qa/YYYYMMDD-HHmmss[-名字].png
# artifacts/ 已 gitignore，随时可 `rm -rf artifacts/*`；见 docs/engineering/quality.md §5.1。
# 用法：scripts/device-shot.sh [名字]     例：scripts/device-shot.sh memo-c-gesture
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools:$HOME/Library/Android/sdk/platform-tools:$PATH"

name="${1:-}"
name="${name// /-}"
name="${name//\//-}"
stamp="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$ROOT/artifacts/device-qa"
file="$OUT_DIR/$stamp${name:+-$name}.png"

command -v adb >/dev/null 2>&1 || { echo "找不到 adb：安装 Android platform-tools 或把它加进 PATH" >&2; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "没有已连接的设备（adb devices 为空），先在手机开无线调试/插线" >&2; exit 1; }

mkdir -p "$OUT_DIR"
adb exec-out screencap -p > "$file"
if [ ! -s "$file" ]; then
  rm -f "$file"
  echo "截图失败：$file 为空" >&2
  exit 1
fi

echo "$file"
