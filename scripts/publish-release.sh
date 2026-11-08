#!/bin/zsh
# 把 release/ 下两个固定命名的安装包上传到 GitHub Releases（D125：release/ 不再入库）。
#
# 用法：
#   scripts/publish-release.sh                  # tag = vYYYY.MM.DD
#   scripts/publish-release.sh --tag v0.1.0     # 指定 tag
#   scripts/publish-release.sh --notes-file x.md # 手写说明（覆盖自动生成）
#   scripts/publish-release.sh --dry-run        # 只打印将生成的说明，不创建 release
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
DMG="$RELEASE_DIR/Sidekick-macOS.dmg"
APK="$RELEASE_DIR/Sidekick-Android.apk"

TAG="v$(date +%Y.%m.%d)"
DRY_RUN=0
NOTES_FILE=""
while (( $# > 0 )); do
  case "$1" in
    --tag) TAG="${2:?--tag 需要一个值}"; shift 2 ;;
    --notes-file) NOTES_FILE="${2:?--notes-file 需要一个路径}"; shift 2 ;;
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
if (( DRY_RUN )); then
  echo "[publish] dry-run：跳过 apksigner 校验（正式发布会强制校验）"
elif [[ -n "${BUILD_TOOLS_DIR:-}" && -x "$BUILD_TOOLS_DIR/apksigner" && -n "${JAVA_HOME:-}" ]]; then
  "$BUILD_TOOLS_DIR/apksigner" verify --print-certs "$APK" | head -3
else
  echo "[publish] 跳过 apksigner 校验（找不到 build-tools 或 JDK）" >&2
fi

NOTES="$(mktemp -t sidekick-release-notes)"
trap 'rm -f "$NOTES"' EXIT

# 说明只讲「用户能感知的变化」：feat / fix / perf。
# docs、chore、style、test、ci 这类工程与文档提交不进 release 页面（它们属于 git 历史与 docs/history.md）。
if [[ -n "$NOTES_FILE" ]]; then
  [[ -f "$NOTES_FILE" ]] || fail "找不到说明文件：$NOTES_FILE"
  cp "$NOTES_FILE" "$NOTES"
else
  PREV_TAG="$(git -C "$ROOT_DIR" describe --tags --abbrev=0 --exclude="$TAG" 2>/dev/null || true)"
  if [[ -n "$PREV_TAG" ]]; then
    RANGE="$PREV_TAG..HEAD"
    SCOPE="自 $PREV_TAG 以来"
  elif git -C "$ROOT_DIR" rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
    # 同一 tag 覆盖重发：以该 tag 首次发布的提交为基线
    RANGE="$TAG..HEAD"
    SCOPE="自 $TAG 首次发布以来"
  else
    RANGE="HEAD"
    SCOPE="最近提交中"
  fi
  # 先按 type 筛 feat/fix/perf，再排除内部 scope（release/deps/ci/build/docs）
  CHANGES="$(git -C "$ROOT_DIR" log --no-merges --pretty=format:'%s' "$RANGE" 2>/dev/null \
    | grep -E '^(feat|fix|perf)(\([^)]*\))?!?:' \
    | grep -Ev '^[a-z]+\((release|deps|ci|build|docs)\)!?:' \
    | head -20 || true)"
  {
    echo "## Sidekick $TAG"
    echo
    echo "### 安装"
    echo
    echo "- macOS：\`Sidekick-macOS.dmg\`（未签名；首次打开右键 → 打开）"
    echo "- Android：\`Sidekick-Android.apk\`（arm64，release 签名；从 debug 包换过来需先卸载旧版）"
    echo
    echo "### 变更（$SCOPE feat / fix / perf）"
    echo
    if [[ -n "$CHANGES" ]]; then
      echo "$CHANGES" | sed 's/^/- /'
    else
      echo "- 本版本为打包 / 文档 / 工程调整，没有用户可见的功能变化。"
    fi
    echo
    echo "> 说明由 \`scripts/publish-release.sh\` 自动生成，只列 feat / fix / perf；"
    echo "> 文档与工程提交见 [docs/history.md](https://github.com/fouriyeo/sidekick/blob/main/docs/history.md)，取舍见 [decisions.md](https://github.com/fouriyeo/sidekick/blob/main/docs/decisions.md)。"
  } > "$NOTES"
fi

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
echo "[publish] 最新版入口：https://github.com/fouriyeo/sidekick/releases/latest"
