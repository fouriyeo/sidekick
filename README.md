# 小跟班 · Sidekick

把手机变成电脑的外设与 AI 宠物：电脑把 AI/任务状态推到手机，你在手机上收通知、回答 AI 的提问、发快捷指令、语音输入。

当前进度：**局域网 MVP 已验证** —— Tauri 桌面端（服务端）+ Tauri 安卓 App（客户端）可双向收发消息。

## 快速开始

```bash
cd app && pnpm install
pnpm tauri dev             # 桌面端
scripts/build-android.sh   # 构建安卓 debug APK
scripts/install-android.sh # 安装并启动（需 adb 已连接手机）
```

手机与电脑连同一 Wi-Fi，在 App 里填 `电脑IP:8848` 连接。桌面窗口会显示地址与二维码，扫码打开的页面里也有「下载 App」按钮。

## 目录

- `app/` — Tauri 项目（桌面端 + 安卓端同一代码库）
- `protocol/` — 手机与电脑之间的事件协议
- `docs/` — 架构、决策、环境、状态、蓝牙预研
- `scripts/` — 构建/安装脚本

## 文档

- `AGENTS.md` — 给 AI / 新协作者的入口（先读这个）
- `docs/architecture.md` — 架构与接口
- `docs/status.md` — 进度、已验证内容、已知问题
- `docs/setup.md` — 环境、构建、无线调试、WebView 调试
- `docs/decisions.md` — 关键选型与取舍记录
- `docs/ble-notes.md` — 蓝牙预研笔记
- `protocol/README.md` — 事件协议 v0

## 路线

- [x] 局域网双向通信（2026-10-31）
- [ ] Claude Code / Qoder hook 接入（通知 + 远程回答）
- [ ] 宠物界面
- [ ] release 签名与打包
- [ ] 蓝牙通道
- [ ] iOS
