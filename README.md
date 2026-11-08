# Sidekick

<p align="center">
  <img src="brand/logo-mark.svg" width="96" height="96" alt="Sidekick" />
</p>

把手机变成电脑的外设与 AI 宠物：电脑把 AI / 任务状态推到手机，你在手机上收状态、按住说话把文字送进电脑、看 Token 用量、录一段语音备忘录。

- 电脑端：macOS（Tauri 2，常驻菜单栏）
- 手机端：Android（Tauri 2，竖屏；与电脑同局域网直连）

> 「小跟班」只是手机宠物角色的名字，App 名是 Sidekick（决策 D114）。

## 现在能做什么

| 能力 | 说明 |
| --- | --- |
| 手机 ↔ 电脑 | 同 Wi-Fi 自动发现（UDP 47820 + 端口回退）、断线自动重连、扫码/手动地址兜底 |
| 电脑端 6 个一级页 | 概览 ⌘1 · 剪贴板 ⌘2 · 备忘录 ⌘3 · 用量 ⌘4 · 语音 ⌘5 · 设置 ⌘6（Liquid Glass 壳） |
| 手机 | 宠物页 + 设置二级页 + 聊天/连接/回答页 + 语音备忘录全屏页 |
| 语音输入 | 按住手机说话 → 百炼云端流式识别 → 写剪贴板并合成 Cmd+V；结果卡可手动「回车 / 清空」 |
| 剪贴板 | 历史 / 搜索 / 置顶 / 隐私过滤，最多保留 100（可配 10–200） |
| Token 用量 | 只读本机 DSH 账本，桌面宽幅仪表 + 手机紧凑仪表 + 菜单栏小看板 |
| 语音备忘录 | 手机录音（前台）→ 分段转写 → LLM 归类（标题/类型/摘要/待办/标签）→ 本地库；电脑同局域网只读镜像 |
| AI 联动 | DSH hook 把 AI 四态与会话列表推到手机，点会话可在电脑唤起 DSH |

**还没做**：手机回答 AI 提问、文本消息、Claude Code / Qoder hook、配对鉴权、正式签名与公证、蓝牙通道、iOS。逐项状态见 [docs/status.md](docs/status.md)。

## 下载

安装包走 GitHub Releases（不进仓库）：

- 最新版：<https://github.com/fouriyeo/sidekick/releases/latest>
  - `Sidekick-macOS.dmg`（未签名；首次打开右键 → 打开）
  - `Sidekick-Android.apk`（arm64，release 签名；从 debug 包换过来需先卸载）

本地构建产物固定落在 `release/`（文件名不变、每次覆盖，**不入库**，D125）。发版上传用 `scripts/publish-release.sh`。

## 快速开始

```bash
cd app && pnpm install
pnpm tauri dev                 # 桌面端（窗口出现即 HTTP/WS 服务已启动）

scripts/build-android.sh       # 构建 Android debug APK（首次需 pnpm tauri android init）
scripts/install-android.sh     # 安装并启动（需 adb 已连接手机）

scripts/package-release.sh     # 打 release：先安卓后桌面 → release/
scripts/publish-release.sh     # 上传到 GitHub Releases
```

手机与电脑连同一 Wi-Fi，打开 App 会自动发现并连接；企业网只放行单播时改用手动地址或扫码。环境、无线调试、WebView 远程调试见 [docs/setup.md](docs/setup.md)。

## 目录

```text
app/          Tauri 项目（桌面 + 安卓共用；src/{desktop,mobile,shared,protocol}）
brand/        品牌母版与矢量标记（appicon.png + logo-mark*.svg）
protocol/     手机 ↔ 电脑事件协议
docs/         文档树（入口 docs/INDEX.md）
release/      本地构建产物（不入库）
scripts/      构建 / 安装 / 打包 / 发布 / QA / 文档检查
```

## 文档

- [AGENTS.md](AGENTS.md) — 给 AI / 新协作者的入口（项目上下文、命令、Top 12 坑）
- [docs/INDEX.md](docs/INDEX.md) — 文档树入口（树形 + 懒加载）
- [docs/status.md](docs/status.md) — 当前状态、待验收、下一步
- [docs/decisions.md](docs/decisions.md) — 决策记录（含取代关系）
- [docs/history.md](docs/history.md) — 变更历史
- [docs/engineering/pitfalls.md](docs/engineering/pitfalls.md) — 踩过的坑与硬约束
- [docs/architecture.md](docs/architecture.md) · [docs/frontend-architecture.md](docs/frontend-architecture.md) · [docs/dependency-policy.md](docs/dependency-policy.md)
- [docs/setup.md](docs/setup.md) — 环境、构建、打包、调试

## 路线

- [x] 局域网双向通信 + 自动发现 + 端口回退（2026-10-31）
- [x] 断连自动重连 / 屏幕常亮 / 触感 / 双主题（2026-11）
- [x] 电脑端「Liquid Glass · iOS 26」六页壳 + 设置二级页
- [x] 菜单栏常驻 + Token 用量小看板（原生磨砂玻璃）
- [x] 语音输入（百炼云端流式）+ 剪贴板历史 + Token / 语音用量统计
- [x] 语音备忘录（手机录音 + AI 归类 + 局域网只读镜像）
- [x] AI 联动（DSH hook 四态 / 会话列表 / 一键唤起）
- [ ] 手机回答 AI 提问、文本消息
- [ ] Claude Code / Qoder hook 接入
- [ ] 配对与鉴权
- [ ] 正式签名 / 公证 / 开机自启
- [ ] 蓝牙通道、iOS

## 品牌与许可

- 品牌标记是「随身卡」（D99）：深青底 `#0F3A3E`、贴顶穿透挂孔、左上斜切角、右下琥珀灯。母版 `brand/appicon.png`（1024 满幅位图）+ `scripts/gen-brand-mark.py`（矢量几何，派生 favicon / 侧栏 / 托盘 / Android 自适应前景）。
- 手机随包字体 HarmonyOS Sans SC Regular（见《HarmonyOS Sans 字体许可协议》，禁止改写/子集化/转 WOFF2；软件内「设置 › 数据与关于」已注明）。
- 宠物帧动画来自 DeepSeek 鲸鱼图集（OpenPets schema 2）；第三方依赖准入见 [docs/dependency-policy.md](docs/dependency-policy.md)。
