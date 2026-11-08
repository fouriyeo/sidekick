#!/usr/bin/env bash
# 建一个本机自签名「代码签名」证书，让 macOS TCC（辅助功能 / 屏幕录制等）授权
# 在反复重编译开发二进制后仍然有效。
#
# 背景：cargo 产出的调试二进制是 ad-hoc 链接器签名，每次重新链接 cdhash 都会变；
# 没有开发者证书时 TCC 只能按 cdhash 认人，于是「系统设置里明明勾着、App 里却显示
# 未授权」。换成固定证书后，TCC 记的是 `identifier + certificate leaf`，重建不变。
#
# 幂等：已存在有效身份时直接退出（要重建加 --recreate）。
# 副作用：往登录钥匙串导入一张自签名证书 + 私钥（默认 ~/.sidekick/dev-signing/ 留底），
# 并把该证书在「代码签名」策略上设为信任根；不改变其它 App 的授权。
set -euo pipefail

IDENTITY="${SIDEKICK_SIGN_IDENTITY:-Sidekick Dev}"
SIGN_DIR="${SIDEKICK_SIGN_DIR:-$HOME/.sidekick/dev-signing}"
KEYCHAIN="${SIDEKICK_SIGN_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"
P12_PASS="${SIDEKICK_SIGN_P12_PASS:-sidekick-local-dev}"

RECREATE=0
[ "${1:-}" = "--recreate" ] && RECREATE=1

log() { printf '[sign] %s\n' "$*"; }
die() { printf '[sign] 失败：%s\n' "$*" >&2; exit 1; }

# ---- openssl：系统 LibreSSL 的 req 没有 -addext，优先用 brew 的 OpenSSL 3 ----
OPENSSL=""
for candidate in \
  "${SIDEKICK_OPENSSL:-}" \
  /opt/homebrew/opt/openssl@3/bin/openssl \
  /usr/local/opt/openssl@3/bin/openssl \
  "$(command -v openssl || true)"; do
  [ -n "$candidate" ] && [ -x "$candidate" ] || continue
  if "$candidate" req -help 2>&1 | grep -q -- "-addext"; then
    OPENSSL="$candidate"
    break
  fi
done
[ -n "$OPENSSL" ] || die "找不到支持 -addext 的 openssl（brew install openssl@3）"
log "openssl: $OPENSSL"

# ---- 已有身份？ ----
if security find-identity -v -p codesigning 2>/dev/null | grep -q "\"$IDENTITY\""; then
  if [ "$RECREATE" -eq 0 ]; then
    log "签名身份「$IDENTITY」已存在且有效，无需重建（要重建用 --recreate）"
    security find-identity -v -p codesigning | grep "\"$IDENTITY\""
    exit 0
  fi
  log "--recreate：先删除旧证书与私钥"
  security delete-identity -c "$IDENTITY" 2>/dev/null || true
  security delete-certificate -c "$IDENTITY" 2>/dev/null || true
fi

mkdir -p "$SIGN_DIR"
chmod 700 "$SIGN_DIR"
KEY="$SIGN_DIR/sidekick-dev.key"
CERT="$SIGN_DIR/sidekick-dev.crt"
P12="$SIGN_DIR/sidekick-dev.p12"

# ---- 生成自签名证书（带 codeSigning EKU，codesign 才肯用） ----
if [ ! -f "$KEY" ] || [ ! -f "$CERT" ]; then
  log "生成自签名证书：CN=$IDENTITY"
  "$OPENSSL" req -x509 -newkey rsa:2048 -nodes -sha256 -days 3650 \
    -keyout "$KEY" -out "$CERT" \
    -subj "/CN=$IDENTITY/O=Sidekick Local Dev/C=CN" \
    -addext "basicConstraints=critical,CA:false" \
    -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=critical,codeSigning" \
    -addext "subjectKeyIdentifier=hash" 2>/dev/null
fi
chmod 600 "$KEY"
chmod 644 "$CERT"

# ---- 导入登录钥匙串（-T 指定 codesign 可用；-A 免 ACL 弹窗） ----
log "导入到登录钥匙串：$KEYCHAIN"
rm -f "$P12"
# macOS Security.framework 不吃 OpenSSL 3 默认的 PBES2/AES p12（报 MAC verification failed），
# 用 -legacy（PBE-SHA1-3DES + SHA1 MAC）才认得；LibreSSL 没有 -legacy 时退回默认。
"$OPENSSL" pkcs12 -export -legacy -inkey "$KEY" -in "$CERT" -name "$IDENTITY" \
  -out "$P12" -passout "pass:$P12_PASS" 2>/dev/null \
  || "$OPENSSL" pkcs12 -export -inkey "$KEY" -in "$CERT" -name "$IDENTITY" \
    -out "$P12" -passout "pass:$P12_PASS" 2>/dev/null
security import "$P12" -k "$KEYCHAIN" -P "$P12_PASS" \
  -T /usr/bin/codesign -T /usr/bin/security -A >/dev/null || die "security import 失败"
rm -f "$P12"

# ---- 信任设置：仅「代码签名」策略，trustRoot ----
log "设置代码签名信任（用户域，不需要 sudo）"
security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$CERT" \
  || die "add-trusted-cert 失败（可能需要允许系统弹窗，或权限被 MDM 接管）"

# ---- 校验 ----
if ! security find-identity -v -p codesigning | grep -q "\"$IDENTITY\""; then
  security find-identity -v -p codesigning >&2 || true
  die "导入后仍未找到有效身份，见上面列表（可能是证书未被信任）"
fi

log "完成，当前可用签名身份："
security find-identity -v -p codesigning | grep "\"$IDENTITY\""
log "下一步：scripts/sign-desktop-dev.sh 重签二进制，然后在系统设置里授权一次"
