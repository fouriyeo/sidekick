# 架构

## 拓扑

```
手机 App（Tauri Android，WS 客户端）
      │  ws://<电脑IP>:8848/ws（局域网）
      ▼
桌面 App（Tauri，HTTP/WS 服务端，0.0.0.0:8848）
      ├─ 桌面 UI（同一 WS 客户端，本机回环）
      ├─ HTTP /              手机落地页（下载 App + 网页聊天预览）
      └─ HTTP /download/apk  直接下发 debug APK

未来：Claude Code hooks → 桌面服务事件源；BLE 作为另一种传输。
```

## 桌面端（`app/src-tauri/src/lib.rs` · `desktop_server` 模块）

- Tauri 启动时在 `setup` 中用 `tauri::async_runtime::spawn` 启动 axum 服务。
- 端口固定 **8848**，绑定 `0.0.0.0`。
- 状态：`broadcast::Sender<String>` + 在线计数。
- 路由：`/`、`/ws`、`/download/apk`。
- 收到任意文本帧 → 打印 `[ws] recv:` → 原样广播。
- 连接 / 断开 → 广播 `system` 消息（含当前连接数，瞬时值）。
- `server_info` 命令返回局域网 IP / 端口 / URL，前端用于展示与二维码。
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
- 为什么在 Rust 侧建连而不是 WebView 里 `new WebSocket`：
  - 规避 Android WebView 对混合内容（https 页面里连 ws://）的限制；
  - 将来换 BLE 传输时只改 Rust 传输层，前端命令/事件不变。

## 前端（`app/src/main.ts`）

- 启动时 `invoke("app_role")` → 给 `<body>` 加 `mobile` 类并渲染手机视图，或渲染桌面视图。
- 桌面视图：`server_info` → 显示地址、二维码；本地 `ws://127.0.0.1:8848/ws` 收发。
- 手机视图：地址输入（localStorage 记忆）→ `connect_server`；监听 `conn` / `chat` 渲染消息；`send_chat` 发送。
- 消息气泡方向由 `parseMessage(raw, selfRole)` 判定：`from === selfRole` 为「我」。

## 手机落地页（`app/src-tauri/mobile/index.html`）

- 扫码后打开的网页：含「下载 App」按钮（`/download/apk`）与网页版快捷聊天（调试用，不是正式客户端）。
- 页面通过 `include_str!` 打包进 Rust 二进制。

## 协议

- 传输：WebSocket 文本帧 JSON；当前消息类型 `chat` / `system`，广播语义。
- 详细定义与未来事件（status / ask / answer / notify / input）见 `protocol/README.md`。

## 当前限制与技术债

- 无鉴权、无加密，仅限可信局域网。
- 手机端无自动重连（需手动重新连接）；桌面 UI 有简单重连。
- 无历史持久化；广播会回显自己发送的消息。
- 端口固定；单机单实例；调试客户端会混入在线人数统计。
- 仅 debug 构建（debug 签名）；release 签名与正式打包未配置。
- `app/src-tauri/gen/` 不入库，需 `npm run tauri android init` 重新生成。
