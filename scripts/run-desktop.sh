#!/usr/bin/env bash
# 独立运行桌面端（不依赖 Vite dev server）。
#
# 原因：Tauri 的 debug 二进制默认是 dev 模式（没有 `custom-protocol` feature），
# 启动时去加载 `http://localhost:1420`；没有 `pnpm tauri dev` 的 Vite dev server
# 时窗口就是白屏。加 `--features tauri/custom-protocol` 后前端 dist 会打进二进制，
# 直接跑 `target/debug/desktop` 也能正常显示。
set -euo pipefail

cd "$(dirname "$0")/../app"

pnpm build
cargo build --manifest-path src-tauri/Cargo.toml --features tauri/custom-protocol

exec src-tauri/target/debug/desktop
