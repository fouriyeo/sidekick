#!/usr/bin/env bash
# 用本机自签名证书重签一个已构建的桌面二进制（或 .app），
# 让 TCC 的辅助功能授权在后续重编译后仍然有效。
#
# 用法：
#   scripts/sign-desktop-dev.sh                # 默认 app/src-tauri/target/debug/desktop
#   scripts/sign-desktop-dev.sh <path>         # 指定二进制或 .app
#
# 约定：identifier 固定为 dev.sidekick.app（与 tauri.conf.json 的 bundle id 一致），
# 这样 TCC 记录的是 `identifier + certificate leaf`，不随 cdhash 变化。
set -euo pipefail

IDENTITY="${SIDEKICK_SIGN_IDENTITY:-Sidekick Dev}"
BUNDLE_ID="${SIDEKICK_SIGN_BUNDLE_ID:-dev.sidekick.app}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-$ROOT/app/src-tauri/target/debug/desktop}"

die() { printf '[sign] 失败：%s\n' "$*" >&2; exit 1; }

[ -e "$TARGET" ] || die "找不到 $TARGET，先构建（scripts/run-desktop.sh 或 pnpm tauri dev）"
if ! security find-identity -v -p codesigning 2>/dev/null | grep -q "\"$IDENTITY\""; then
  die "没有签名身份「$IDENTITY」，先跑 scripts/setup-dev-signing.sh"
fi

# 已签过且身份一致就跳过，避免每次重签浪费时间
CURRENT_ID="$(codesign -dv "$TARGET" 2>&1 | sed -n 's/^Identifier=//p' || true)"
if [ "$CURRENT_ID" = "$BUNDLE_ID" ] && codesign --verify --strict "$TARGET" 2>/dev/null; then
  printf '[sign] 已是 %s 签名，跳过（%s）\n' "$IDENTITY" "$TARGET"
  exit 0
fi

printf '[sign] 重签 %s\n' "$TARGET"
# .app 包不覆盖 identifier：由 Info.plist 的 CFBundleIdentifier（dev.sidekick.app）决定；
# 裸二进制必须显式指定，否则 ld 的 ad-hoc 名字（desktop-<hash>）会跟着变。
SIGN_ARGS=()
case "$TARGET" in
  *.app | *.app/) ;;
  *) SIGN_ARGS=(--identifier "$BUNDLE_ID") ;;
esac
codesign --force --sign "$IDENTITY" ${SIGN_ARGS[@]+"${SIGN_ARGS[@]}"} --timestamp=none "$TARGET" \
  || die "codesign 失败（首次可能弹钥匙串授权，选「始终允许」再试）"

codesign --verify --strict --verbose=2 "$TARGET" 2>&1 | sed 's/^/[sign] /'
codesign -dv "$TARGET" 2>&1 | grep -E 'Identifier=|Authority=|Signature=|CDHash=' | sed 's/^/[sign] /'
printf '[sign] ok\n'
