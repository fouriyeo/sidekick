# 小跟班 · Sidekick

<p align="center">
  <img src="brand/logo-horizontal.svg" width="420" alt="小跟班 · Sidekick" />
</p>

把手机变成电脑的外设与 AI 宠物：电脑把 AI/任务状态推到手机，你在手机上收通知、回答 AI 的提问、发快捷指令、语音输入。

当前进度：**局域网 MVP 已验证**；前端脚手架、产品规范与两份 PRD 已就绪；宠物与麦克风待实现。

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
- `brand/` — logo 源文件（SVG 图标、横版组合、App 图标、favicon）
- `protocol/` — 手机与电脑之间的事件协议
- `docs/` — 架构、决策、环境、状态、蓝牙预研
- `scripts/` — 构建/安装脚本

## 品牌资源

- `brand/` — logo 源文件：`logo-icon.svg`、`logo-horizontal.svg`、`logo-horizontal-dark.svg`、`logo-appicon.svg`、`logo-favicon.svg`
- 修改后重新生成全平台图标：`cd app && pnpm tauri icon ../brand/logo-appicon.svg`
- Web favicon：`app/public/favicon.svg`（来自 `brand/logo-favicon.svg`）

## 文档

- `AGENTS.md` — 给 AI / 新协作者的入口（先读这个）
- `docs/INDEX.md` — 文档树入口（树形 + 懒加载）
- `docs/product/` — 产品原则、用户、范围、指标
- `docs/standards/` — 产品、交互、视觉、工程规范
- `docs/prd/pet/` — 情绪宠物 PRD / SPEC / ACCEPTANCE
- `docs/prd/mic/` — 外设麦克风 PRD / SPEC / ACCEPTANCE
- `docs/engineering/` — 音频链路、协议提案、宠物运行时、测试
- `docs/architecture.md` — 架构与接口
- `docs/frontend-architecture.md` — 前端目标架构与规范
- `docs/status.md` — 进度、已验证内容、已知问题
- `docs/setup.md` — 环境、构建、无线调试、WebView 调试
- `docs/decisions.md` — 关键选型与取舍记录
- `docs/dependency-policy.md` — 开源依赖治理
- `docs/ble-notes.md` — 蓝牙预研笔记
- `protocol/README.md` — 事件协议 v0

## 路线

- [x] 局域网双向通信（2026-10-31）
- [x] 前端脚手架（React 19 + Tailwind v4 + shadcn/Base UI + Motion + Rive）
- [x] 产品规范与两份 PRD（2026-10-31）
- [ ] 前端平台分目录 + 连接/聊天迁移
- [ ] 情绪宠物（手机横屏、纯陪伴）
- [ ] 外设麦克风（AI 语音输入）
- [ ] Claude Code / Qoder hook 接入（通知 + 远程回答）
- [ ] release 签名与打包
- [ ] 配对与鉴权
- [ ] 蓝牙通道 / iOS
