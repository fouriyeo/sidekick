#!/usr/bin/env bash
# 顶部状态条（NSPanel）自检截图：重启桌面端（预览模式）→ 等窗口 → 只截顶部中央区域。
# 用法：scripts/hud-shot.sh [输出路径]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/tmp/hud-shot.png}"

pkill -f "target/debug/desktop" 2>/dev/null || true
sleep 2
: > /tmp/sidekick-desktop.log
(SIDEKICK_HUD_PREVIEW=1 "$ROOT/scripts/run-desktop.sh" > /tmp/sidekick-desktop.log 2>&1 &)

# 构建 + 启动最多等 4 分钟；日志出现监听就绪再截
for _ in $(seq 1 120); do
  if grep -q "菜单栏图标已就绪" /tmp/sidekick-desktop.log 2>/dev/null; then break; fi
  sleep 2
done
sleep 4

# 主屏逻辑宽度 → 状态条 380×40 居中在距顶 44pt 处；多留 40pt 边看阴影。
W=$(osascript -e 'tell application "Finder" to get bounds of window of desktop' | awk -F', ' '{print $3}')
X=$(( (W - 300) / 2 - 40 ))
screencapture -x -R "${X},24,380,110" "$OUT"
echo "$OUT"
