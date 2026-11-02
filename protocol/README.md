# Sidekick 事件协议 v0

当前用于局域网 MVP：WebSocket 文本帧 + 麦克风二进制帧。文本消息是 JSON，用 `type` 区分；音频帧按 session 路由，**不广播**。

服务端把 `chat` / `system` / `status` / `mic.*` 控制消息广播给所有已连接客户端（调试可见）；`status.request` 只回一次当前快照；麦克风音频帧只进入对应会话缓冲。MVP 阶段无鉴权。

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

### status

AI 联动状态（桌面 → 手机）。桌面把 DSH 的聚合状态广播给所有已连接客户端；手机只负责表现，不展示任务内容。

```json
{
  "type": "status",
  "v": 1,
  "source": "dsh",
  "state": "working",
  "sessions": 1,
  "resume": null,
  "remainingMs": null,
  "ts": 1730000000000
}
```

- `state`：`idle` / `working` / `asking` / `completed`（产品里的静态 / 工作中 / 等你决定 / 完成）
- `source`：`dsh`（P0）；后续 `claude-code` / `qoder`
- `sessions`：进行中的顶层会话数；只用于桌面调试，手机不展示数字
- `resume`：仅 `completed` 有值；桌面 3 秒后补发该状态
- `remainingMs`：仅 `completed` 有值；手机本地兜底倒计时
- 桌面在收到 completed 后 3 秒主动广播 resume 状态；手机也可用 `remainingMs` 本地回退
- 新客户端连接、手机发 `status.request` 时，桌面立即回当前快照
- 旧版手机按未知类型忽略，不影响聊天/麦克风

### status.request

手机 → 桌面，请求一次当前状态快照；桌面收到后回一条 `status`。

```json
{ "type": "status.request" }
```

## 麦克风消息（v1，已实现）

详细格式/帧布局见 [docs/engineering/protocol-audio.md](../docs/engineering/protocol-audio.md)。

| 方向 | 类型 | 传输 |
| --- | --- | --- |
| 手机 → 桌面 | `mic.start` | JSON |
| 桌面 → 手机 | `mic.ready` | JSON |
| 手机 → 桌面 | PCM16 分片 | Binary（`SK01`） |
| 手机 → 桌面 | `mic.stop` | JSON |
| 桌面 → 手机/UI | `mic.partial` | JSON |
| 桌面 → 手机/UI | `mic.result` / `mic.state` / `mic.error` | JSON |

`mic.start` 示例：

```json
{
  "v": 1,
  "type": "mic.start",
  "session": "0f8fad5b-d9cb-469f-a165-70867728950e",
  "codec": "pcm16",
  "sampleRate": 16000,
  "channels": 1,
  "frameMs": 128,
  "maxMs": 60000,
  "ts": 1730000000000
}
```

`mic.stop` 的 `reason`：`release` / `cancel` / `timeout` / `background` / `disconnect` / `mic_lost`；只有 `release` / `timeout` 会转写。

`mic.ready` 可选带 `engine`（`local` / `bailian`）与 `model`；`mic.result` 可选带 `engine` / `model` / `fallback` / `usage`（`inputTokens` / `outputTokens` / `totalTokens` / `audioDurationMs`）。旧客户端/旧桌面按 `local`、无 usage 处理。

`mic.partial`（桌面 → 手机/UI，云端流式）：

```json
{
  "v": 1,
  "type": "mic.partial",
  "session": "0f8fad5b-d9cb-469f-a165-70867728950e",
  "rev": 12,
  "text": "帮我把这段异步的注释",
  "sentence": 1,
  "engine": "bailian",
  "ts": 1730000000000
}
```

- `text` 是“已定稿句 + 当前句”的完整可见文本，客户端整体替换；`rev` 只增，客户端丢弃旧 rev。
- 只用于回显，不落字；最终文本以 `mic.result.text` 为准。
- 服务端 50ms 节流，句子结束强制发送；旧手机忽略该类型。

音频帧：

```text
SK01 | version=1 | flags | reserved | session(16B) | sequence(u32 BE) | PCM16 LE payload
```

规则：

- 音频帧绝不广播；服务端按 session 追加到内存缓冲。
- 单会话；重复 `mic.start` 返回 `mic.error(session_busy)`。
- `mic.result` 含结果原因和文本；文本只给手机结果卡片，不写日志。
- 云端引擎由桌面直连百炼，手机不接触 API Key；云端失败可回退本机，`mic.result.fallback=true`。
- 详细字段、超时与测试向量见协议文档。

## 实现映射（当前代码）

- 桌面服务端：`app/src-tauri/src/desktop_server.rs`（axum `/ws`、动态端口、UDP 发现、麦克风会话）
- 桌面 UI：`app/src/desktop/lib/ws-client.ts`（本机回环）；麦克风状态浮层 `desktop/features/mic-receiver`
- 手机 App：`app/src-tauri/src/mobile_client.rs`；前端通过 `connect_server` / `send_chat` / `mic_*` 命令与 `conn` / `chat` 事件通信
- 麦克风协议：`app/src-tauri/src/mic_protocol.rs`、`app/src/protocol/messages.ts`、`audio-frame.ts`
- 云端识别：`app/src-tauri/src/asr_config.rs`、`asr_keychain.rs`、`asr_cloud.rs`、`bailian_asr.rs`（见 [asr-cloud-bailian.md](../docs/engineering/asr-cloud-bailian.md)）
- 局域网发现（UDP，非本协议）：`app/src-tauri/src/discovery.rs`，报文与算法见 [lan-discovery.md](../docs/engineering/lan-discovery.md)
- AI 状态：`app/src-tauri/src/dsh_hook.rs`（回环接收/聚合/广播/快照）、`app/src/dsh-hook/sidekick-hook.mjs`（DSH 本地脚本）、`app/src/mobile/features/pet/ai-status.ts`（手机四态）
- 手机浏览器落地页：`app/src-tauri/mobile/index.html`（仅调试/下载入口，不是正式客户端）

## 规划中的事件（AI 接入阶段）

### status（已实现）

已在上文「消息类型 → status」落地；桌面 DSH 联动与手机四态已使用。

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

## 音频通道（已实现）

麦克风使用低开销的二进制音频帧，且**不能广播**给其它客户端：

- 控制消息：`mic.start` / `mic.ready` / `mic.stop` / `mic.result` / `mic.state` / `mic.error`；
- 音频帧：`magic + version + session UUID + sequence + PCM16`；
- 桌面按 session 路由到内存缓冲，不进入现有广播通道；
- P0 仅可信局域网、无鉴权；配对/加密在 P1。

实现前评审已完成；现有 `chat` / `system` 行为不变。详见
[`docs/engineering/protocol-audio.md`](../docs/engineering/protocol-audio.md)。
