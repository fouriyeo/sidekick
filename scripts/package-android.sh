#!/bin/zsh
# 打包安卓端 release APK → release/Sidekick-Android.apk（固定文件名，覆盖旧文件）
# 首次运行会在 ~/.sidekick/ 生成本地签名密钥（不提交、不分享）。
set -euo pipefail

# JAVA_HOME：优先显式环境变量，其次系统 java_home，最后 Homebrew JDK。
# macOS 的 /usr/libexec/java_home 不认 Homebrew 安装的 openjdk@21，
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
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/app"

# tauri android build 会改写 Cargo.toml（移除移动端不兼容的 macos-private-api），
# 退出时补回来，否则紧接着的桌面 release 打包会卡在 feature allowlist。
restore_desktop_features() {
  node "$SCRIPT_DIR/restore-desktop-features.mjs" || true
}
trap restore_desktop_features EXIT

# gradle 的 rust 任务经 `beforeBuildCommand` 调 pnpm，但工作目录是 gen/android
# （没有 package.json），corepack 在那里读不到 packageManager 会退回全局版本并被拦。
# shim 先切到 app 目录再转给 corepack；用固定路径，避免被 gradle 的 configuration cache 记住临时目录。
PNPM_SHIM_DIR="$APP_DIR/.pnpm-shim"
if command -v corepack >/dev/null 2>&1; then
  mkdir -p "$PNPM_SHIM_DIR"
  printf '#!/bin/sh\ncd "%s" && exec corepack pnpm "$@"\n' "$APP_DIR" >"$PNPM_SHIM_DIR/pnpm"
  chmod +x "$PNPM_SHIM_DIR/pnpm"
  export PATH="$PNPM_SHIM_DIR:$PATH"
fi

RELEASE_DIR="$ROOT_DIR/release"
OUT="$RELEASE_DIR/Sidekick-Android.apk"

KEYSTORE="${SIDEKICK_ANDROID_KEYSTORE:-$HOME/.sidekick/android-release.jks}"
SIGNING_PROPS="${SIDEKICK_ANDROID_SIGNING_PROPS:-$HOME/.sidekick/android-signing.properties}"
KEY_ALIAS="sidekick"

BUILD_TOOLS_DIR="$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)"
if [[ ! -x "$BUILD_TOOLS_DIR/apksigner" ]]; then
  echo "[android] 找不到 apksigner，检查 $ANDROID_HOME/build-tools" >&2
  exit 1
fi

read_prop() {
  # 从 properties 文件读值（只用于签名参数，避免把密码写进命令行）
  grep -m1 "^$1=" "$SIGNING_PROPS" | cut -d= -f2-
}

ensure_signing_key() {
  if [[ -f "$KEYSTORE" && -f "$SIGNING_PROPS" ]]; then
    return
  fi
  echo "[android] 首次打包：生成 Android 签名密钥（$KEYSTORE）"
  mkdir -p "$(dirname "$KEYSTORE")"
  local store_pass key_pass
  store_pass="$(openssl rand -hex 24)"
  key_pass="$store_pass"
  "$JAVA_HOME/bin/keytool" -genkeypair -noprompt \
    -keystore "$KEYSTORE" -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$store_pass" -keypass "$key_pass" \
    -dname "CN=Sidekick, OU=Sidekick, O=Sidekick, C=CN" >/dev/null
  umask 077
  cat > "$SIGNING_PROPS" <<EOF
storeFile=$KEYSTORE
storePassword=$store_pass
keyAlias=$KEY_ALIAS
keyPassword=$key_pass
EOF
  chmod 600 "$KEYSTORE" "$SIGNING_PROPS"
  umask 022
  echo "[android] 密钥与密码已写入 $SIGNING_PROPS（0600），请备份，丢了无法覆盖安装"
}

ensure_signing_key

echo "[android] tauri android build（release）"
cd "$APP_DIR"
node "$SCRIPT_DIR/patch-android-manifest.mjs"
./node_modules/.bin/tauri android build --target aarch64 --apk

APK_DIR="$APP_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/release"
UNSIGNED_APK="$(find "$APK_DIR" -maxdepth 1 -name '*unsigned*.apk' -print -quit 2>/dev/null || true)"
SIGNED_APK="$(find "$APK_DIR" -maxdepth 1 -name '*.apk' ! -name '*unsigned*' -print -quit 2>/dev/null || true)"

mkdir -p "$RELEASE_DIR"
if [[ -n "$UNSIGNED_APK" ]]; then
  ALIGNED="$APK_DIR/sidekick-release-aligned.apk"
  "$BUILD_TOOLS_DIR/zipalign" -p -f 4 "$UNSIGNED_APK" "$ALIGNED"
  SIDEKICK_STORE_PASS="$(read_prop storePassword)"
  SIDEKICK_KEY_PASS="$(read_prop keyPassword)"
  export SIDEKICK_STORE_PASS SIDEKICK_KEY_PASS
  "$BUILD_TOOLS_DIR/apksigner" sign \
    --v4-signing-enabled false \
    --ks "$KEYSTORE" --ks-key-alias "$(read_prop keyAlias)" \
    --ks-pass env:SIDEKICK_STORE_PASS --key-pass env:SIDEKICK_KEY_PASS \
    --out "$OUT" "$ALIGNED"
  rm -f "$ALIGNED" "$OUT.idsig"
elif [[ -n "$SIGNED_APK" ]]; then
  cp -f "$SIGNED_APK" "$OUT"
else
  echo "[android] 构建完成但找不到 APK（$APK_DIR）" >&2
  exit 1
fi

chmod 644 "$OUT"

"$BUILD_TOOLS_DIR/apksigner" verify --print-certs "$OUT" | head -3
echo "✅ $OUT（$(ls -lh "$OUT" | awk '{print $5}')）"
