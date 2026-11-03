#!/bin/zsh
# 一次性打包桌面端 + 安卓端，产物覆盖 release/ 下同名文件
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

"$SCRIPT_DIR/package-desktop.sh"
"$SCRIPT_DIR/package-android.sh"

echo
echo "release/ 已更新："
ls -lh "$ROOT_DIR/release"
