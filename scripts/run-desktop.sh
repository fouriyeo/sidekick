#!/usr/bin/env bash
# 独立运行桌面端（不依赖 Vite dev server）。
#
# 原因：Tauri 的 debug 二进制默认是 dev 模式（没有 `custom-protocol` feature），
# 启动时去加载 `http://localhost:1420`；没有 `pnpm tauri dev` 的 Vite dev server
# 时窗口就是白屏。加 `--features tauri/custom-protocol` 后前端 dist 会打进二进制，
# 直接跑 `target/debug/desktop` 也能正常显示。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/app"

pnpm build
cargo build --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol

# 用本机自签名证书重签：cargo 产物是 ad-hoc 链接器签名，cdhash 每次编译都变，
# TCC 会把重编译当成新 App（系统设置里勾着、App 里显示未授权）。固定证书后
# 设计需求是 `identifier "dev.sidekick.app" and certificate root = H"…"`，重建不变。
"$ROOT/scripts/sign-desktop-dev.sh" src-tauri/target/debug/desktop \
  || echo "[sign] 未签名：先跑 scripts/setup-dev-signing.sh（不签的话重编译后辅助功能授权会失效）"

exec src-tauri/target/debug/desktop
