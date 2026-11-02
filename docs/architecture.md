# 架构

> 组织方式：单仓库、双产物（macOS 桌面 App + 安卓 APK）；前端目标按 `desktop` / `mobile` / `shared` / `protocol` 分目录，桌面与手机各自固定布局，**不做跨端自适应**。规范见 [standards/engineering.md](./standards/engineering.md)。

## 拓扑

```
手机 App（Tauri Android，WS 客户端）
      ├─ ① UDP 广播探测 → 桌面发现响应器（固定 47820）
      └─ ② ws://<电脑IP>:<真实端口>/ws（局域网）
      ▼
桌面 App（Tauri，HTTP/WS 服务端，0.0.0.0:47810 起，被占用自动顺延）
      ├─ 桌面 UI（同一 WS 客户端，本机回环）
      ├─ HTTP /              手机落地页（下载 App + 网页聊天预览）
      └─ HTTP /download/apk  直接下发 debug APK

AI 状态：DeepSeek Harness（DSH）→ 本地脚本 → Sidekick 回环桥 → WS `status` → 手机宠物；Claude Code hooks 与 BLE 作为后续事件源/传输。详见 [engineering/dsh-hook.md](./engineering/dsh-hook.md)。
```

## 桌面端（`app/src-tauri/src/lib.rs` · `desktop_server` 模块）

- Tauri 启动时在 `setup` 中用 `tauri::async_runtime::spawn` 启动 axum 服务。
- 端口按候选 `47810`–`47814`、`8848` 依次 bind，第一个成功者生效（默认 `47810`，不常用且避开临时端口段），绑定 `0.0.0.0`；真实端口写入 `BOUND_PORT`，`server_info` 等就绪（≤3s）后返回。
- 服务起来后启动 UDP 发现响应器（固定 `47820`）：收到局域网 probe 即单播回「主机名 + 真实端口」，算法与报文见 [engineering/lan-discovery.md](./engineering/lan-discovery.md)。
- 状态：`broadcast::Sender<String>` + 在线计数。
- 路由：`/`、`/ws`、`/download/apk`。
- 收到任意文本帧 → 打印 `[ws] recv:` → 原样广播。
- 连接 / 断开 → 广播 `system` 消息（含当前连接数，瞬时值）。
- `server_info` 命令返回局域网 IP / 真实端口 / URL / `discoveryPort`；前端用于展示地址、自动发现状态与按需展开的二维码。
- `/download/apk` 从 `gen/android/.../app-universal-debug.apk` 流式读取 APK；文件不存在返回 404 提示。

## 手机端（`app/src-tauri/src/lib.rs` · `mobile_client` 模块）

- 与桌面端共用同一 `run()`，通过 `cfg(desktop)` / `cfg(mobile)` 分流；手机端**不启动** HTTP 服务。
- 状态 `ClientState`：`Mutex<Option<mpsc::UnboundedSender<String>>>`。
- `connect_server(addr)`：
  - 规范化地址（可只给 `IP:port`，缺省端口 8848、路径 `/ws`）；
  - `tokio-tungstenite` 异步连接；
  - 读循环把文本帧 `emit("chat", text)`；写循环从 channel 取消息发送；
  - 连接/断开 `emit("conn", {online})`。
- `send_chat(text)`：取出保存的发送端，构造 `{"type":"chat","from":"phone","text","ts"}`。
- `discover_servers()`：`spawn_blocking` 里做一次 UDP 广播探测（1500ms 窗口），返回 `{name, ip, port, addr}[]`；网络异常只记日志、返回空数组。
- 重复 `connect_server` 会先取消旧连接（任务 abort + generation 守卫），避免旧连接退出时清空新连接状态；连接超时 4s。
- 为什么在 Rust 侧建连而不是 WebView 里 `new WebSocket`：
  - 规避 Android WebView 对混合内容（https 页面里连 ws://）的限制；
  - 将来换 BLE 传输时只改 Rust 传输层，前端命令/事件不变。

## 前端（`app/src/main.ts`）

> 目标架构已定稿（2026-10-31）：React 19 + Tailwind v4 + shadcn/ui（Base UI）+ Motion；**尚未迁移**，本节描述的是当前实现。规范见 `frontend-architecture.md`，依赖治理见 `dependency-policy.md`。

- 启动时 `invoke("app_role")` → 给 `<body>` 加 `mobile` 类并渲染手机视图，或渲染桌面视图。
- 桌面视图：`server_info` → 显示地址、二维码；本地 `ws://127.0.0.1:8848/ws` 收发。
- 手机视图：地址输入（localStorage 记忆）→ `connect_server`；监听 `conn` / `chat` 渲染消息；`send_chat` 发送。
- 消息气泡方向由 `parseMessage(raw, selfRole)` 判定：`from === selfRole` 为「我」。

## 手机落地页（`app/src-tauri/mobile/index.html`）

- 扫码后打开的网页：含「下载 App」按钮（`/download/apk`）与网页版快捷聊天（调试用，不是正式客户端）。
- 页面通过 `include_str!` 打包进 Rust 二进制。

## 协议

- 传输：WebSocket 文本帧 JSON；当前消息类型 `chat` / `system` / `status` / `status.request`，广播语义（status.request 只回请求方）。
- 详细定义与未来事件（ask / answer / notify / input）见 `protocol/README.md`；DSH 联动见 [engineering/dsh-hook.md](./engineering/dsh-hook.md)。

## 当前限制与技术债

- 无鉴权、无加密，仅限可信局域网；发现只暴露「有人在跑 Sidekick + 主机名 + 端口」。
- 手机端断连自动重连：退避 1s→2s→4s→8s→16s→30s，每次先静默 UDP 重新发现（覆盖 IP/端口变化）；桌面 UI 固定 1.5s 重连。协议无心跳，半开连接（电脑睡眠/路由器静默丢包）检测依赖 TCP，待补。
- 无历史持久化；广播会回显自己发送的消息。
- 端口自动回退；桌面端强制单实例（`tauri-plugin-single-instance`），第二个进程只聚焦已有窗口后退出，因此 UDP 47820 与 47815–47819 回环桥都只有一个主人（D60）。
- 广播可能被路由器/AP 隔离拦截；此时降级为手动地址。
- 调试客户端会混入在线人数统计。
- 仅 debug 构建（debug 签名）；release 签名与正式打包未配置。
- `app/src-tauri/gen/` 不入库，需 `pnpm tauri android init` 重新生成。
