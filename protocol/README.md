# Sidekick 事件协议 v0

当前用于局域网 MVP：WebSocket 文本帧，每条消息是一个 JSON 对象，用 `type` 区分。

服务端把收到的消息**广播**给所有已连接客户端（桌面 UI、手机 App、调试客户端）。MVP 阶段无鉴权。

## 连接

- 地址：`ws://<电脑IP>:<端口>/ws`；端口由桌面端在候选端口（默认 `47810`）中取第一个可用的
- 手机一般不用手填：App 启动后通过局域网 UDP 发现自动拿到电脑地址与真实端口，详见 [docs/engineering/lan-discovery.md](../docs/engineering/lan-discovery.md)
- 编码：UTF-8 JSON 文本帧，一条消息一帧

## 消息类型

### chat

双向聊天消息。

```json
{
  "type": "chat",
  "from": "desktop",
  "text": "hello",
  "ts": 1730000000000
}
```

- `from`：`desktop` 或 `phone`
- `ts`：毫秒时间戳

### system

服务端生成的系统提示（连接、断开等）。

```json
{
  "type": "system",
  "text": "客户端已连接，当前 2 个"
}
```

## 实现映射（当前代码）

- 桌面服务端：`app/src-tauri/src/lib.rs` 的 `desktop_server` 模块（axum `/ws`）
- 桌面 UI：`app/src/desktop/lib/ws-client.ts`（本机回环）
- 手机 App：Rust `mobile_client` 模块；前端通过 `connect_server` / `send_chat` 命令发送，通过 `conn` / `chat` 事件接收
- 局域网发现（UDP，非本协议）：`app/src-tauri/src/discovery.rs`，报文与算法见 [lan-discovery.md](../docs/engineering/lan-discovery.md)
- 手机浏览器落地页：`app/src-tauri/mobile/index.html`（仅调试/下载入口，不是正式客户端）

## 规划中的事件（AI 接入阶段）

### status

```json
{ "type": "status", "state": "working|idle|waiting", "detail": "...", "ts": 1730000000000 }
```

驱动宠物表情与状态展示。

### ask

AI 需要用户决策（权限确认、反问）。

```json
{ "type": "ask", "id": "uuid", "source": "claude-code", "prompt": "...", "options": ["allow", "deny"], "ts": 1730000000000 }
```

### answer

用户对 `ask` 的回复，通过 `id` 配对。

```json
{ "type": "answer", "id": "uuid", "value": "allow", "ts": 1730000000000 }
```

### notify

单向通知（任务完成等）。

```json
{ "type": "notify", "text": "...", "level": "info|warn|error", "ts": 1730000000000 }
```

### input

用户回传（语音文字、快捷指令等）。

```json
{ "type": "input", "kind": "voice|shortcut|text", "text": "...", "ts": 1730000000000 }
```

## 音频通道（提案，未实现）

麦克风需要低开销的二进制音频帧，且**不能广播**给其它客户端。提案见
[`docs/engineering/protocol-audio.md`](../docs/engineering/protocol-audio.md)：

- 控制消息仍用 JSON：`mic.start` / `mic.ready` / `mic.stop` / `mic.result` / `mic.state`；
- 音频用二进制帧：`magic + version + session UUID + sequence + PCM16`；
- 桌面按 session 路由到转写任务，不进入现有广播通道；
- P0 仅可信局域网、无鉴权；配对/加密在 P1。

实现前需评审；现有 `chat` / `system` 行为不变。
