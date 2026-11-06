#!/bin/zsh
# 一次性打包桌面端 + 安卓端，产物覆盖 release/ 下同名文件
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 顺序不能反：桌面端 build.rs 会把 release/Sidekick-Android.apk 编译期嵌进二进制，
# 先打安卓再打桌面，DMG 里带的才是本次的新安装包（2026-11-06 踩过：反着打导致扫码下载到旧 APK）。
"$SCRIPT_DIR/package-android.sh"
"$SCRIPT_DIR/package-desktop.sh"

echo
echo "release/ 已更新："
ls -lh "$ROOT_DIR/release"
