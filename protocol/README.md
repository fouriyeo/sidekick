# Sidekick 事件协议 v0

当前用于局域网 MVP：WebSocket 文本帧 + 麦克风二进制帧。文本消息是 JSON，用 `type` 区分；音频帧按 session 路由，**不广播**。

服务端把 `chat` / `system` / `status` / `mic.*` / `key.*` 控制消息广播给所有已连接客户端（调试可见）；`status.request` 只回一次当前快照；`focus.request` 由桌面处理并回 `focus.result`；`key.request` 由桌面校验后合成按键并回 `key.result`；麦克风音频帧只进入对应会话缓冲。MVP 阶段无鉴权。

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

AI 联动状态（桌面 → 手机）。桌面把 DSH 的聚合状态与会话列表广播给所有已连接客户端；手机用聚合四态驱动宠物，用 `sessionList` 渲染会话列表。

```json
{
  "type": "status",
  "v": 1,
  "source": "dsh",
  "state": "working",
  "sessions": 1,
  "resume": null,
  "remainingMs": null,
  "sessionList": [
    {
      "id": "…",
      "title": "修复登录",
      "source": "dsh",
      "state": "working",
      "askKind": null,
      "lastEventAt": 1730000000000,
      "completedAt": null
    }
  ],
  "ts": 1730000000000
}
```

- `state`：`idle` / `working` / `asking` / `completed`（产品里的静态 / 工作中 / 等你决定 / 完成）
- `source`：`dsh`（P0）；后续 `claude-code` / `qoder`
- `sessions`：进行中的顶层会话数；只用于桌面调试，手机不展示数字
- `resume`：仅 `completed` 有值；桌面 3 秒后补发该状态
- `remainingMs`：仅 `completed` 有值；手机本地兜底倒计时
- `sessionList`：可选，最多 50 条；旧版桌面不发送，旧版手机忽略
  - `id`：DSH 会话 id（不透明，≤128）
  - `title`：会话标题（单行 ≤80 字符；可空）
  - `source`：会话来源，P0 恒为 `dsh`
  - `state`：`idle` / `working` / `asking`；**不含 completed**，完成态由 `completedAt` 推导
  - `askKind`：`approval` / `question` / null
  - `lastEventAt`：最近有意义事件的桌面时钟 ms
  - `completedAt`：最近一轮完成的桌面时钟 ms；null 表示没有完成记录
- 桌面在收到 completed 后 3 秒主动广播 resume 状态；手机也可用 `remainingMs` 本地回退
- 新客户端连接、手机发 `status.request` 时，桌面立即回当前快照（含 `sessionList`）
- 旧版手机按未知类型/未知字段忽略，不影响聊天/麦克风

### status.request

手机 → 桌面，请求一次当前状态快照；桌面收到后回一条 `status`。

```json
{ "type": "status.request" }
```

### focus.request / focus.result

手机点「等你决定」的会话时，请求电脑把对应软件切到前台（没开则启动）。桌面只接受 `source = dsh`，应用名硬编码映射，不接受手机传来的应用路径。

```json
{ "type": "focus.request", "v": 1, "requestId": "f-…", "source": "dsh", "sessionId": "…", "ts": 1730000000000 }
{ "type": "focus.result", "v": 1, "requestId": "f-…", "source": "dsh", "ok": true, "error": null, "ts": 1730000000001 }
```

- `requestId`：手机生成，用于把结果对回发起方
- `ok=false` 时 `error` 只回错误码：`bad_request` / `rate_limited` / `unsupported_source` / `unsupported_platform` / `launch_failed`
- 桌面全局 1.5s 限频；不自动回答、不发送任何内容

### key.request / key.result

语音输入的结果卡片上，用户主动点「回车」或「清空」时，请求电脑在**最近一次插入文本的目标应用**里合成一次按键。**不自动发送**：只有用户点按才发生。

```json
{ "type": "key.request", "v": 1, "requestId": "k-…", "session": "mic-session-uuid", "action": "enter", "ts": 1730000000000 }
{ "type": "key.result", "v": 1, "requestId": "k-…", "action": "enter", "ok": true, "error": null, "ts": 1730000000001 }
```

- `action`：`enter`（Return）或 `clear`（`⌘A` + `Delete` 清空整个输入框）；其它值回 `bad_request`
- `session`：必须是最近一次 `mic.result(outcome=inserted)` 的会话，且只认发起该会话的连接
- 安全闸门：目标应用必须是插入时记录的前台应用（否则 `target_mismatch`）、不能是密码/安全输入框（`secure_input`）、桌面辅助功能必须已授权（`accessibility_off`）；非 macOS 回 `unsupported_platform`
- 时效与限频：最近一次插入后 30 秒内有效；成功一次即作废；桌面全局 500ms 限频
- `ok=false` 时 `error` 只回错误码：`bad_request` / `no_target` / `session_mismatch` / `target_mismatch` / `secure_input` / `accessibility_off` / `send_failed` / `rate_limited` / `unsupported_platform`
- 结果不含文本、应用名与按键序列；旧版桌面会把 `key.request` 当普通文本广播，解析方按未知类型忽略

## 麦克风消息（v1，已实现）

详细格式/帧布局见 [docs/engineering/protocol-audio.md](../docs/engineering/protocol-audio.md)。

| 方向 | 类型 | 传输 |
| --- | --- | --- |
| 手机 → 桌面 | `mic.start` | JSON |
| 桌面 → 手机 | `mic.ready` | JSON |
| 手机 → 桌面 | PCM16 分片 | Binary（`SK01`） |
| 手机 → 桌面 | `mic.stop` | JSON |
| 桌面 UI → 服务端 | `mic.cancel` | JSON |
| 桌面 → 手机/UI | `mic.cancel` / `mic.partial` / `mic.result` / `mic.state` / `mic.error` | JSON |

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

`mic.cancel`（桌面 → 手机/UI，权威中止）：桌面浮层的人工「取消录音」与服务端看门狗都发这条。`reason=desktop` 表示用户主动取消，`reason=timeout` 表示 `maxMs + 3s` 内没收到 `mic.stop`（手机卡死/停止消息丢失）。手机收到后必须停掉本地采集，**即使本地记录的 session 与消息里的不一致**；旧手机忽略该类型但仍会收到 `mic.state(cancelled)`。

```json
{ "v": 1, "type": "mic.cancel", "session": "0f8fad5b-…", "reason": "desktop", "ts": 1730000000000 }
```

- 桌面 UI 发 `mic.cancel` 时只需带 `v/type/session/ts`；服务端校验并广播权威版本（带 `reason`），不会把请求原样广播。
- 服务端看门狗按每个 `mic.start` 的 `maxMs + 3_000ms` 计时，只中止 session 仍匹配的 active 会话，避免误杀新会话。
- 取消不建转写、不发 `finish-task`、不插入、不写用量。

`mic.result` 可选带 `usage`（`inputTokens` / `outputTokens` / `totalTokens` / `audioDurationMs`）。语音识别只走百炼云端，`mic.ready`/`mic.partial`/`mic.result` 不再有 `engine`/`model`/`fallback` 字段（2026-11-02 双端同版本升级）。

`mic.partial`（桌面 → 手机/UI，云端流式）：

```json
{
  "v": 1,
  "type": "mic.partial",
  "session": "0f8fad5b-d9cb-469f-a165-70867728950e",
  "rev": 12,
  "text": "帮我把这段异步的注释",
  "sentence": 1,
  "ts": 1730000000000
}
```

- `text` 是“已定稿句 + 当前句”的完整可见文本，客户端整体替换；`rev` 只增，客户端丢弃旧 rev。
- 只用于回显，不落字；最终文本以 `mic.result.text` 为准。
- 服务端 50ms 节流，句子结束强制发送；旧手机忽略该类型。
- 不再带 `engine`。

音频帧：

```text
SK01 | version=1 | flags | reserved | session(16B) | sequence(u32 BE) | PCM16 LE payload
```

规则：

- 音频帧绝不广播；服务端按 session 追加到内存缓冲。
- 单会话：同一客户端重复 `mic.start` 以**最新会话**为准（旧会话中止并广播 `mic.state(cancelled)`）；另一个客户端正在录音时返回 `mic.error(session_busy)`，不抢会话。
- `mic.stop` 必须 owner + session 匹配才生效；不匹配回 `mic.error(session_mismatch)`，不清理 active（避免旧会话迟到的 stop 误杀新会话）。没有 active 且 reason=cancel 时补发一条 `mic.state(cancelled)` 清理陈旧浮层。
- `mic.result` 含结果原因和文本；文本只给手机结果卡片，不写日志。结果卡片上的「回车/清空」走 `key.request`（见上文），不是 `mic.*` 的子类型。
- 语音识别只由桌面直连百炼，手机不接触 API Key；失败直接报错，不回退本机。
- `mic.result.usage` 记入 `asr_usage.json`，模型页区间切换展示今天/7/30/365；`asr_usage_stats()` 返回最近 365 天 `days`。
- 详细字段、超时与测试向量见协议文档。

## 实现映射（当前代码）

- 桌面服务端：`app/src-tauri/src/desktop_server.rs`（axum `/ws`、动态端口、UDP 发现、麦克风会话）
- 桌面 UI：`app/src/desktop/lib/ws-client.ts`（本机回环）；麦克风状态浮层 `desktop/features/mic-receiver`
- 手机 App：`app/src-tauri/src/mobile_client.rs`；前端通过 `connect_server` / `send_chat` / `mic_*` 命令与 `conn` / `chat` 事件通信
- 麦克风协议：`app/src-tauri/src/mic_protocol.rs`、`app/src/protocol/messages.ts`、`audio-frame.ts`
- 结果卡片手动按键：`app/src-tauri/src/desktop_keys.rs`（安全闸门/按键计划/目标注册表）、`desktop_server.rs`、`mobile_client.rs`、`app/src/mobile/features/mic/mic-store.ts`
- 云端识别：`app/src-tauri/src/asr_config.rs`、`asr_keychain.rs`、`asr_cloud.rs`、`bailian_asr.rs`、`asr_usage.rs`、`asr_pricing.rs`（见 [asr-cloud-bailian.md](../docs/engineering/asr-cloud-bailian.md)）
- 局域网发现（UDP，非本协议）：`app/src-tauri/src/discovery.rs`，报文与算法见 [lan-discovery.md](../docs/engineering/lan-discovery.md)
- AI 状态：`app/src-tauri/src/dsh_hook.rs`（回环接收/聚合/广播/快照）、`app/src/dsh-hook/sidekick-hook.mjs`（DSH 本地脚本）、`app/src/mobile/features/pet/ai-status.ts`（手机四态）
- AI 会话列表：`app/src/mobile/features/sessions/`（列表/清除标记）；focus 唤起：`app/src-tauri/src/app_focus.rs`、`desktop_server.rs`、`mobile_client.rs`
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
