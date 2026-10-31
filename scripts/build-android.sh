#!/bin/zsh
set -euo pipefail

export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.2.12479018"
export ANDROID_NDK_HOME="$NDK_HOME"
export PATH="$HOME/.cargo/bin:$ANDROID_HOME/platform-tools:$PATH"

cd "$(dirname "$0")/../app"
pnpm tauri android build --debug --target aarch64 --apk
