# 架构

> 单仓库、双产物：macOS 桌面 App（服务端 + UI）+ Android App（客户端），共用 `app/`。
> 前端按 `desktop` / `mobile` / `shared` / `protocol` 分目录，两平台各自固定布局，**不做跨端自适应**。规范见 [standards/engineering.md](./standards/engineering.md)。

## 1. 拓扑

```text
手机 App（Tauri Android，WS 客户端）
      ├─ ① UDP 广播探测 255.255.255.255:47820 → 桌面发现响应器单播回「主机名 + 真实端口」
      └─ ② ws://<电脑IP>:<真实端口>/ws（局域网）
      ▼
桌面 App（Tauri，axum HTTP/WS 服务端，0.0.0.0:47810 起，被占自动顺延）
      ├─ 桌面 UI（本机 WS 客户端）
      ├─ HTTP /              手机落地页（下载 App + 网页聊天预览）
      ├─ HTTP /download/apk  下发安装包（优先编译期嵌入的 release APK）
      └─ HTTP 47815–47819    DSH hook 回环桥（只绑 127.0.0.1，Bearer token）

AI 状态：DeepSeek Harness（DSH）→ 本地 hook 脚本 → 回环桥 → WS `status` → 手机宠物。
语音：手机 WebView 采集 PCM16 → `mic.*` + `SK01` 帧 → 桌面代理百炼云端 ASR → 剪贴板 + Cmd+V。
备忘录：手机录音 → 百炼分段转写 + qwen-plus 归类 → 手机 SQLite → `memo.*` + `SK02` 分块 → 桌面只读镜像。
```

## 2. 桌面端（`app/src-tauri/src/`）

| 模块 | 职责 |
| --- | --- |
| `desktop_server.rs` | axum 服务：`/`、`/ws`、`/download/apk`；端口按 `47810–47814`、`8848` 依次 bind；广播 chat/status/usage/mic/memo；`desktop.status`、`server_info` |
| `discovery.rs` | UDP 发现：探测/回包/响应器（固定 `47820`）+ 桌面 IP 选择（`pick_lan_ip`） |
| `mobile_client.rs` | 手机侧 tokio-tungstenite 客户端（`connect_server` / `discover_servers` / 发送命令） |
| `tray.rs` / `activation.rs` / `menu.rs` | 菜单栏常驻、关窗隐藏、`Regular`↔`Accessory` 切换、中文菜单 |
| `usage_panel.rs` / `panel_glass.rs` | 用量小看板第二窗口 + 原生磨砂玻璃层 |
| `asr_*.rs` / `bailian_asr.rs` / `mic_protocol.rs` / `transcript.rs` | 百炼云端 ASR、Key/配置/用量、音频协议与文本组装 |
| `clipboard_manager.rs` / `desktop_keys.rs` | 剪贴板历史与隐私过滤、结果卡「回车/清空」安全闸门 |
| `memo/` / `memo_protocol.rs` | 备忘录：手机推送、桌面只读 SQLite 镜像、`SK02` 分块 |
| `dsh_hook*.rs` / `app_focus.rs` | DSH 插件注入与回环桥、唤起 DSH 窗口 |
| `token_usage.rs` / `token_pricing.rs` / `asr_pricing.rs` / `asr_usage.rs` | Token / 语音用量聚合与价格表 |
| `keep_awake.rs` / `haptics.rs` / `app_paths.rs` / `tls.rs` | 屏幕常亮、触感、数据目录、rustls provider |

- 启动：`setup` 里 spawn axum 服务 → 绑定 UDP 响应器 → 建立 hook 桥 → 建托盘与看板窗口。
- 数据流：任一 WS 文本帧先打 `[ws] recv:` 再广播；连接/断开广播 `system`（含瞬时连接数）。
- 单实例：`tauri-plugin-single-instance` 最先注册，第二个进程只聚焦已有窗口后退出（D60）。

## 3. 手机端

- 与桌面共用 `run()`，`cfg(desktop)` / `cfg(mobile)` 分流；手机**不启动** HTTP 服务。
- `connect_server(addr)`：规范化地址（可只写 `IP:端口`）→ tokio-tungstenite 连接 → 读循环 `emit("chat")`、写循环从 channel 发送；4s 超时；重复调用先 abort 旧连接 + generation 守卫。
- `discover_servers()`：`spawn_blocking` 里做一次 UDP 探测（1500ms 窗口），异常返回空数组。
- 事件：`conn {online}`、`chat <JSON 字符串>`；命令清单见 `AGENTS.md §3` 与 `protocol/README.md`。
- 为什么要 Rust 侧建连：规避 WebView 混合内容限制，并为换传输层（BLE）留统一接口。

## 4. 前端

- `src/main.tsx`：`createRoot` + `invoke("app_role")` → 动态 import `entries/desktop.tsx` 或 `entries/mobile.tsx`；**不再给 `<body>` 加平台类**（历史黑屏原因）。
- 路由是组件状态（桌面 `route.view` / 手机 `ui-store.view`），不写 URL、不引路由库。
- 样式按平台分作用域：`.desktop-ios`（`desktop/styles/ios.css`）、`.mobile-clean`（`mobile/styles/clean.css`）；`tokens.css` 只作共享基础与宠物舞台色。
- 订阅统一走 `shared/lib/tauri.ts`（`listen` 异步 + pending/cleanup）；协议类型在 `src/protocol/`。
- 详见 [frontend-architecture.md](./frontend-architecture.md)。

## 5. 数据与存储

| 位置 | 内容 |
| --- | --- |
| `~/.sidekick/asr.json` | 百炼配置 + API Key（0600，明文；不用 Keychain） |
| `~/.sidekick/asr_usage.json` | 语音用量每日汇总（0600，≤400 天） |
| `~/.sidekick/clipboard.json` | 剪贴板历史（0600，上限可配 10–200） |
| `~/.sidekick/sidekick.db` | 备忘录只读镜像（桌面；手机是写者） |
| `~/.sidekick/token_pricing*.json` | 模型价格缓存与覆盖 |
| `~/.dsh/sidekick/config.json` | DSH hook 开关与桥端口 |
| `$DSH_HOME/storages/cost-meter/ledger.json` | Token 账本（只读） |

首次启动从旧 `~/Library/Application Support/Sidekick/` 复制一次同名 JSON（不覆盖、只一次）。手机侧备忘录库与 Key 在其 App 私有目录（0600）。

## 6. 分发与打包

- 桌面 `build.rs` 把 `release/Sidekick-Android.apk` 编译期嵌进二进制，`/download/apk` 优先下发它——所以**先打 APK 再打 DMG**；新克隆需先本地打一次 APK。
- 安装包不再入库（D125，撤销 D63）：`release/` 是本地目录、已 gitignore，分发走 `scripts/publish-release.sh` → GitHub Releases。
- Android 侧 `gen/` 不入库，`tauri android init` 后要重跑 `scripts/patch-android-manifest.mjs`；`tauri android build` 会剥掉 `macos-private-api`，由 `scripts/restore-desktop-features.mjs` 补回。

## 7. 限制与技术债

- 无鉴权、无加密，仅限可信局域网；发现只暴露「有人在跑 Sidekick + 主机名 + 端口」。配对鉴权待做。
- 协议无心跳：进程退出/断网靠 FIN/RST（实测 ~0.5s），电脑睡眠/静默丢包可能长时间仍显示「已连接」。
- 广播可能被路由器/AP 隔离拦截（5G、访客 Wi-Fi、VPN）；企业网可能只放行单播（D73），此时只能手动地址或扫码。
- 桌面 UI 固定 1.5s 重连；手机退避 1s→30s，切后台暂停。
- 安装包未签名/公证（macOS）；Android 用本地 keystore。自动更新未配置。
- 详细坑与边界见 [engineering/pitfalls.md](./engineering/pitfalls.md)。
