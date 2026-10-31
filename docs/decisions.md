# 决策记录

> 按时间追加，不改写历史结论；新决策标注日期。

## D1 · 命名：小跟班 / Sidekick（2026-10-31）

- 背景：需要一个直白、一听就懂、又带宠物感的名字。
- 决策：中文「小跟班」，英文代号 Sidekick，仓库 `sidekick`。
- 放弃：Familiar/使魔（过于中二、难理解）、Tether（含义偏冷）、信鸽（不贴产品形态）等。

## D2 · 手机端必须是独立 App（2026-10-31）

- 背景：曾提出用手机浏览器打开电脑提供的网页来验证互通。
- 决策：手机端做真正的安卓 App（Tauri 安卓目标），网页只作为下载入口与调试预览。
- 原因：用户明确要求「手机用的不是浏览器，是软件」；长期形态是常驻宠物 App，需要应用身份、后台与后续 BLE 能力。

## D3 · 技术栈：Tauri 2 双端（2026-10-31）

- 决策：桌面端与手机端都用 Tauri 2（Rust 核心 + Web 前端），单仓库共用代码。
- 放弃：Flutter（用户最终选择 Tauri；Flutter 工具链也曾在国内网络卡住）、React Native、原生 Kotlin、Electron、纯 Node 守护进程。
- 代价：Tauri 移动端蓝牙生态弱（未来蓝牙需自写 Kotlin 插件或加 Python sidecar）；Android 工具链较重。
- 收益：Rust 侧完全掌控网络/传输；Web UI 迭代快；桌面端天然有 GUI 与服务端能力。

## D4 · 通信：局域网 WebSocket 优先，蓝牙延后（2026-10-31）

- 背景：最初设想蓝牙优先；用户改主意先验证同一局域网互通。
- 决策：MVP 走局域网 `ws://<IP>:8848/ws`；蓝牙作为后续传输方案。
- 原因：局域网链路简单可靠，能最快验证「手机 ↔ 电脑」核心闭环；蓝牙预研已证明可行但工程量大（见 `ble-notes.md`）。
- 长期设想：蓝牙负责发现/唤醒与网络隔离场景，局域网负责数据；传输层可替换。

## D5 · 角色：电脑服务端、手机客户端（2026-10-31）

- 决策：电脑起 HTTP/WS 服务；手机 App 主动连接电脑。
- 原因：电脑侧网络与常驻能力更稳；手机端库生态成熟（中心设备）；iOS 后台更友好。

## D6 · 手机端用 Rust 建连，而非 WebView WebSocket（2026-10-31）

- 决策：前端通过 Tauri 命令/事件调用 Rust 中的 tokio-tungstenite 客户端。
- 原因：规避 Android WebView 对 `ws://` 混合内容的限制；为未来换蓝牙传输保留统一接口。

## D7 · 单仓库 + `app/` 目录（2026-10-31）

- 决策：Tauri 项目统一放在 `app/`（最初为 `desktop/`，后重命名）；协议与文档放 `protocol/`、`docs/`。
- 原因：桌面与手机共用前端与协议，单仓库降低同步成本。

## D8 · 协议 v0：广播式 chat/system，无鉴权（2026-10-31）

- 决策：WebSocket JSON 文本帧，服务端广播；仅 `chat` / `system` 两类消息。
- 原因：MVP 先验证通道；AI 接入阶段再扩展 `status` / `ask` / `answer` / `notify` / `input`。
- 代价：同网段任何人可连；后续必须补配对与鉴权。

## D9 · 蓝牙预研：Python + bless 验证 Mac 外设（2026-10-31）

- 结果：Mac 可正常广播自定义 GATT 服务；遇到并解决 CoreBluetooth「cached values must be read-only」限制。
- 结论：技术可行，但当前暂停；重启前先决定 Tauri 插件还是 Python sidecar。详见 `ble-notes.md`。

## D10 · MVP 直接分发 debug APK（2026-10-31）

- 决策：先用 debug APK（约 120–240MB）在真机验证，接受体积。
- 后续：生成 keystore、配置 release 签名，产出 10–20MB 级安装包，并打包桌面发行版。

## D11 · 手机端页面提供「下载 App」按钮（2026-10-31）

- 决策：桌面服务 `/` 落地页提供 `/download/apk` 下载按钮；桌面窗口扫码即可直达。
- 原因：用户扫码后希望直接下载安装，而不是手动找安装包。

## D12 · 前端包管理器迁移到 pnpm（2026-10-31）

- 决策：前端依赖管理从 npm 切换到 pnpm；`package.json` 锁定 `packageManager: pnpm@11.22`，`pnpm-lock.yaml` 入库，删除 `package-lock.json`；Tauri 的 `beforeDevCommand` / `beforeBuildCommand` 改为 `pnpm dev` / `pnpm build`。
- 原因：安装更快、磁盘占用更小、依赖隔离更严格，避免多包管理器混用。
- 影响：文档、脚本、`tauri.conf.json` 中的 npm/npx 命令同步更新。

## D13 · 清理模板残留与未使用依赖（2026-10-31）

- 移除：未引用的模板 SVG（`app/src/assets`）、未使用的 `tauri-plugin-opener`（前后端依赖与 capability）、本地 Python 实验环境 `daemon/`（约 50MB，知识保留在 `docs/ble-notes.md`）。
- 保留：`app/src-tauri/icons`（打包需要）、`capabilities/default.json`（`core:default`）。
- 构建产物继续不入库；`gen/` 保持忽略、按需生成。
