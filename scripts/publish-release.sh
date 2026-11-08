#!/bin/zsh
# 把 release/ 下两个固定命名的安装包上传到 GitHub Releases（D125：release/ 不再入库）。
#
# 用法：
#   scripts/publish-release.sh                  # tag = vYYYY.MM.DD
#   scripts/publish-release.sh --tag v0.1.0     # 指定 tag
#   scripts/publish-release.sh --dry-run        # 只打印将执行的命令
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
DMG="$RELEASE_DIR/Sidekick-macOS.dmg"
APK="$RELEASE_DIR/Sidekick-Android.apk"

TAG="v$(date +%Y.%m.%d)"
DRY_RUN=0
while (( $# > 0 )); do
  case "$1" in
    --tag) TAG="${2:?--tag 需要一个值}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 1 ;;
  esac
done

fail() { echo "[publish] $1" >&2; exit 1; }

command -v gh >/dev/null 2>&1 || fail "找不到 gh（brew install gh 并 gh auth login）"
gh auth status >/dev/null 2>&1 || fail "gh 未登录：先 gh auth login"

[[ -f "$DMG" ]] || fail "缺少 $DMG（先跑 scripts/package-release.sh）"
[[ -f "$APK" ]] || fail "缺少 $APK（先跑 scripts/package-release.sh）"

# 体积提示：GitHub Releases 单文件上限 2GB，超过 100MB 只是提醒（debug 包本就不该进来）。
for f in "$DMG" "$APK"; do
  size_mb=$(( $(stat -f%z "$f") / 1024 / 1024 ))
  echo "[publish] $(basename "$f") ${size_mb}MB"
  if (( size_mb > 100 )); then
    echo "[publish] 警告：$(basename "$f") 超过 100MB，确认是 release 包而不是 debug 包" >&2
  fi
done

# APK 签名自检（可选：找不到 build-tools / JDK 就跳过，不阻塞发布）。
if [[ -z "${JAVA_HOME:-}" ]]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
fi
if [[ -z "${JAVA_HOME:-}" && -x /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java ]]; then
  JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
fi
[[ -n "${JAVA_HOME:-}" ]] && export JAVA_HOME

ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
BUILD_TOOLS_DIR="${BUILD_TOOLS_DIR:-$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)}"
if [[ -n "${BUILD_TOOLS_DIR:-}" && -x "$BUILD_TOOLS_DIR/apksigner" && -n "${JAVA_HOME:-}" ]]; then
  "$BUILD_TOOLS_DIR/apksigner" verify --print-certs "$APK" | head -3
else
  echo "[publish] 跳过 apksigner 校验（找不到 build-tools 或 JDK）" >&2
fi

NOTES="$(mktemp -t sidekick-release-notes)"
trap 'rm -f "$NOTES"' EXIT
{
  echo "## Sidekick $TAG"
  echo
  echo "- macOS：\`Sidekick-macOS.dmg\`（未签名；首次打开右键 → 打开）"
  echo "- Android：\`Sidekick-Android.apk\`（arm64，release 签名；从 debug 包换过来需先卸载）"
  echo
  echo "本次包含："
  echo
  git -C "$ROOT_DIR" log --oneline -10 | sed 's/^/- /'
} > "$NOTES"

if (( DRY_RUN )); then
  echo "[publish] dry-run：将创建/更新 release $TAG 并上传两个安装包"
  echo "[publish] 说明文件："
  cat "$NOTES"
  exit 0
fi

if gh release view "$TAG" >/dev/null 2>&1; then
  echo "[publish] release $TAG 已存在，覆盖上传"
  gh release upload "$TAG" "$DMG" "$APK" --clobber
else
  gh release create "$TAG" \
    --title "Sidekick $TAG" \
    --notes-file "$NOTES" \
    "$DMG" "$APK"
fi

URL="$(gh release view "$TAG" --json url --jq .url)"
echo "✅ 已发布：$URL"
echo "[publish] 私有仓库的 release 下载需要登录 GitHub 账号。"
echo "[publish] 最新版入口：https://github.com/fouriyeo/sidekick/releases/latest"
