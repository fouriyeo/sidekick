#!/bin/zsh
set -euo pipefail

export PATH="$HOME/Library/Android/sdk/platform-tools:$PATH"
APK="$(cd "$(dirname "$0")/.." && pwd)/app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"

if [[ ! -f "$APK" ]]; then
  echo "APK 不存在，请先运行 scripts/build-android.sh" >&2
  exit 1
fi

adb install -r "$APK"
adb shell am force-stop dev.sidekick.app
adb shell am start -n dev.sidekick.app/.MainActivity
