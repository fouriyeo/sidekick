---
doc: engineering/protocol-audio
title: 音频协议
status: active
updated: 2026-11-08
load: on-demand
owner: engineering
---

# 音频协议（v1，已实现）

> 这篇回答：麦克风/结果卡片按键相关消息的字段语义、二进制帧格式、会话状态机、兼容性与安全约束。
> 不包含：端到端链路与 macOS 文本输入（见 [audio-pipeline.md](./audio-pipeline.md)）、百炼云端会话与 Key/错误码/用量（见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)）、实现映射与测试用例（见文末 §10）。
> 现状：协议 v0 的 `chat` / `system` 不变；2026-10-31 实现麦克风会话与二进制帧；2026-11-02 改为百炼云端唯一，增加 `mic.partial` 与 `mic.result.usage`，移除 `engine/model/fallback`；2026-11-04 增加 `key.*` 与 `mic.cancel`。

## 1. 目标

- 手机把约 100ms 的 PCM 分片低开销地送到桌面。
- 音频**不广播**给其它客户端，只路由到当前会话的云端转写任务。
- 控制消息仍用 JSON，便于调试与向后兼容。
- 会话可取消、可超时、可断线丢弃；不缓存、不重放；为后续 Opus/BLE 留扩展位。

## 2. 消息总览

| 方向 | 类型 | 传输 | 用途 |
| --- | --- | --- | --- |
| 手机 → 桌面 | `mic.start` | JSON | 开始会话，声明格式 |
| 桌面 → 手机 | `mic.ready` | JSON | 会话已就绪 |
| 手机 → 桌面 | 音频帧 | Binary | PCM16 分片 |
| 手机 → 桌面 | `mic.stop` | JSON | 停止/取消/超时 |
| 桌面 UI → 服务端 | `mic.cancel` | JSON | 人工取消当前 active 会话 |
| 桌面 → 手机/UI | `mic.cancel` | JSON | 权威中止（人工/看门狗），手机必须停采集 |
| 桌面 → 手机/UI | `mic.partial` | JSON | 流式中间结果 |
| 桌面 → 手机 | `mic.result` | JSON | 输入/复制/失败结果 + usage |
| 桌面 → 桌面 UI | `mic.state` | JSON | 浮窗状态 |
| 桌面 → 手机 | `mic.error` | JSON | 配置/会话错误 |
| 手机 → 桌面 | `key.request` | JSON | 结果卡片手动按键（Return / ⌘A+Delete） |
| 桌面 → 手机/UI | `key.result` | JSON | 按键结果 + 错误码 |
| 桌面 → 手机/UI | `asr.final` / `asr.error` | JSON | **预留，未实现**（见 3.7） |

- 语音识别只走百炼云端；协议不再有 `engine`/`model`/`fallback` 字段。

## 3. 控制消息

### 3.1 mic.start（手机 → 桌面）

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

- `session` 为 UUID v4，手机生成；同一时间只允许一个 active session。
- 同端重复 `mic.start` 以最新会话为准：旧会话 abort、广播 `mic.state(cancelled)`，再接受新会话；异端正在录音时回 `mic.error(session_busy)`。
- `codec` P0 只支持 `pcm16`；`opus` 预留。`mic.start` 前手机不得发送二进制帧。
- 桌面校验配置/Key；未同意、地址/模型无效或无 Key → `mic.error(cloud_not_configured|cloud_key_unavailable)`，不进入会话。

### 3.2 mic.ready（桌面 → 手机）

```json
{ "v": 1, "type": "mic.ready", "session": "...", "ts": 1730000000000 }
```

- 桌面接受会话后发送；P0 手机不等待 `mic.ready`，立即开始发帧（`ready` 用于协议完整性/桌面状态，P1 再恢复握手）。不带 `engine`/`model`。

### 3.3 mic.stop（手机 → 桌面）

```json
{ "v": 1, "type": "mic.stop", "session": "...", "reason": "release", "ts": 1730000000000 }
```

`reason`：

- `release`：正常松手，进入收尾。`timeout`：达到 60 秒上限，收尾已收音频。
- `cancel` / `background` / `disconnect` / `mic_lost`：丢弃音频并 abort 云端，不转写。

`mic.stop` 只在 owner + session 都匹配时生效；不匹配回 `mic.error(session_mismatch)`，不清 active（避免旧会话迟到的 stop 误杀新会话）；若当前没有 active 且 `reason=cancel`，补发一条该 session 的 `mic.state(cancelled)` 清理陈旧浮层。

### 3.4 mic.result（桌面 → 手机）

```json
{
  "v": 1,
  "type": "mic.result",
  "session": "...",
  "outcome": "inserted",
  "reason": null,
  "text": "把这段代码改成异步",
  "truncated": false,
  "latencyMs": 1820,
  "usage": { "inputTokens": 85, "outputTokens": 4, "totalTokens": 89, "audioDurationMs": 2000 },
  "ts": 1730000000000
}
```

- `outcome`：`inserted`（自动输入）、`copied`（仅复制）、`failed`。
- `reason`：`accessibility_off` / `target_mismatch` / `secure_input` / `paste_failed` / `empty_transcript` / `asr_failed` / `asr_timeout` / `insert_failed` / `session_busy` / `session_mismatch` / `cloud_*`。
- `text` 只给手机最近一次结果卡片用；不写日志、不落库。`truncated` 表示原文超过 2000 字、只输入了前 2000 字。
- `usage`：百炼返回的 token/时长；失败但百炼返回 usage 时也可能有。不带 `engine`/`model`/`fallback`。

### 3.5 mic.partial（桌面 → 手机/桌面 UI）

```json
{
  "v": 1,
  "type": "mic.partial",
  "session": "...",
  "rev": 12,
  "text": "帮我把这段异步的注释",
  "sentence": 1,
  "ts": 1730000000000
}
```

- `text` 是“已定稿句 + 当前句”的完整可见文本，客户端整体替换，不做增量拼接；`rev` 从 1 递增，客户端丢弃旧 `rev`。
- `sentence` 当前句 id。只用于回显，不用于落字；最终文本以 `mic.result.text` 为准。
- 服务端按 50ms 节流，句子结束强制发送；上限约 20 条/秒。

### 3.6 mic.state（桌面 → 桌面 UI）

```json
{ "v": 1, "type": "mic.state", "session": "...", "state": "listening", "ts": 1730000000000 }
```

`state`：`listening` / `processing` / `delivered` / `error` / `cancelled` / `idle`（`arming` 是手机本地状态，服务端不发）。

### 3.7 asr.final / asr.error（预留，未实现）

`asr.final {session,text,lang,durationMs}` 只做桌面 UI 预览的预留名称；`asr.error {session,code,message}` 的 `message` 只给内部/日志。两者当前**不发送**，用户文案由 UI 层映射。

### 3.8 key.request / key.result（结果卡片手动按键）

语音输入成功后，结果卡片上有「回车」「清空」两个按钮；点按时手机请求桌面在**最近一次插入文本的目标应用**里合成按键。它复用麦克风会话 id，但不是 `mic.*` 的子类型。

```json
{ "v": 1, "type": "key.request", "requestId": "k-…", "session": "mic-session-uuid", "action": "enter", "ts": 1730000000000 }
{ "v": 1, "type": "key.result", "requestId": "k-…", "action": "enter", "ok": true, "error": null, "ts": 1730000000001 }
```

- `action`：`enter` = Return（keycode 36）；`clear` = `⌘A`（keycode 0 + Command）后 40ms 再 `Delete`（keycode 51），清空整个输入框。
- 只在 `mic.result(outcome=inserted)` 后记录目标；只复制/失败不记录，也不显示按钮。
- 安全闸门（顺序固定）：目标应用与插入时不同 → `target_mismatch`；密码/安全输入 → `secure_input`；辅助功能未授权 → `accessibility_off`；合成失败 → `send_failed`。
- 30 秒时效（结果卡片 10 秒，留网络/点击余量）；成功一次即作废；全局 500ms 限频；owner/session 不符回 `session_mismatch`，无记录/已过期回 `no_target`。
- 非 macOS 回 `unsupported_platform`；旧版桌面把 `key.request` 当普通文本广播，新/旧手机解析为未知类型后忽略。
- 不发送任何文本；日志只有 action/outcome/reason 与 `same_app/secure/trusted` 布尔值，不含应用名。

### 3.9 mic.cancel（桌面 UI → 服务端 → 手机/UI）

```json
{ "v": 1, "type": "mic.cancel", "session": "...", "reason": "desktop", "ts": 1730000000000 }
```

- 桌面 UI 发请求时只带 `v/type/session/ts`；服务端拦截后不广播原消息，而是校验并广播权威版本（带 `reason`）。
- `reason=desktop`：用户在桌面浮层点「取消录音」；`reason=timeout`：服务端看门狗在 `maxMs + 3_000ms` 内没等到 `mic.stop`。
- 服务端取当前 active（不限制 owner，取消是安全方向）；没有 active 也回一次 `mic.state(cancelled)` + `mic.cancel`，让两端陈旧浮层自愈。
- 手机收到后必须停本地采集、丢弃音频；**不校验本地会话 id**（旧版本竞态下可能与桌面 active 不一致）。旧手机忽略 `mic.cancel`，但仍会收到 `mic.state(cancelled)`。
- 取消不建转写、不发 `finish-task`、不插入、不写用量；结果卡片不会出现。

## 4. 二进制音频帧

### 4.1 帧格式（P0 PCM16）

```text
offset  size  field
0       4     magic = "SK01"
4       1     version = 1
5       1     flags (bit0 = last frame)
6       2     reserved = 0
8       16    session UUID (RFC 4122 bytes)
24      4     sequence (u32, big-endian)
28      N     payload (PCM16 LE, 16kHz mono)
```

- WebView 103 的 ScriptProcessor 使用 2048 samples；16k 下正好 128ms，设备回退 48k 时重采样后约 683 samples（约 43ms）。`frameMs` 是声明参考值，服务端按实际 payload 累积。
- `sequence` 从 0 递增；桌面发现丢帧只记录，不请求重传（实时场景重传无意义）。`flags.last` 可选，正常结束以 `mic.stop` 为准。
- 单帧 payload 上限 64KB；PCM16 必须偶数长度；超过/奇数帧丢弃。

### 4.2 为什么用二进制

JSON + base64 会让 3200 bytes 膨胀到 ~4.3KB 且解析开销大；二进制帧在 axum/tokio-tungstenite 都原生支持（调试可十六进制转储），控制消息仍用 JSON 保持可读性。

## 5. 路由与单会话（实现规则）

- 桌面维护一个 active `ActiveMic { owner, session, pcm, frames, pricing, cloud, … }`；二进制帧只按 session 追加到该会话缓冲，**不进入广播通道**，未知 session/非 owner 直接丢弃。
- 同一时间只允许一个 active session：同端重复 `mic.start` 以最新会话为准；异端仍回 `mic.error(session_busy)`。
- 每个 `mic.start` 起一个 `maxMs + 3_000ms` 看门狗；到点仍是该 session 的 active 就 `cloud.abort()` 并广播 `mic.state(cancelled)` + `mic.cancel(reason=timeout)`。
- 缓冲上限 65 秒 / 2.2MB，超过丢弃；音频同时进入内存缓冲并转发给百炼会话（`bailian_asr::CloudHandle`）。
- `mic.partial` 走同一文本广播通道发出，手机与桌面 UI 都按 session/rev 过滤；`mic.start` / `mic.ready` / `mic.stop` / `mic.state` / `mic.result` / `mic.error` / `mic.cancel` 走现有文本广播，调试客户端可见。
- 插入成功后桌面把 `(owner, session, 前台应用, 时间)` 记到 `KeyRegistry`；`key.request` 在进入聊天广播前被拦截，校验后放到阻塞线程合成按键，结果广播为 `key.result`。
- 传输层与看门狗的行为边界见 [audio-pipeline.md](./audio-pipeline.md) §5；云端会话见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)。

## 6. 会话状态机（协议视角）

```text
idle
  → (手机 mic.start) → 配置/Key 检查
    ├─ 失败 → mic.error → idle
    └─ 云端：connecting（缓存）→ streaming（partial）→ finalizing → delivered
  → (task-failed/超时/空) → mic.result(failed) → error
  → (cancel/background/disconnect/mic_lost) → idle（丢弃，abort 云端）
```

- P0 手机在 `mic.start` 后立即开始发帧，不阻塞等待 `mic.ready`。
- `listening` 60 秒上限由手机端计时并停；桌面另有 `maxMs + 3s` 看门狗兜底取消（默认 63 秒），并立即广播 `mic.cancel(reason=timeout)`。
- 连接 5s、`task-started` 3s、`finish-task` 8s 的超时与云端状态细节见 [asr-cloud-bailian.md](./asr-cloud-bailian.md) §4/§10；`arming 2s` 超时与 `mic.ready` 握手仍为 P1。

## 7. 向后兼容

- 现有 `chat` / `system` 不变；旧客户端忽略未知 `type`（包括 `mic.partial`）。
- 新客户端在 `mic.start` 前不发送二进制帧；旧服务端会忽略二进制，手机收到 `mic.error` 或超时。
- 2026-11-02 移除了 `mic.ready.engine/model`、`mic.partial.engine`、`mic.result.engine/model/fallback`；双端同版本升级，旧客户端多收字段会忽略。`mic.result.usage` 保留，字段不变。
- 2026-11-04 新增 `key.request` / `key.result`（增量，旧端忽略）；新增 `mic.cancel`（旧手机忽略但会收到 `mic.state(cancelled)`）；同端重复 `mic.start` 由 `session_busy` 改为「以最新会话为准」，异端行为不变。
- 版本字段 `v:1`；破坏性改动升 `v:2`，双端同时升级。`messages.ts` 用 discriminated union；Rust 用 `serde(tag = "type")`，未知类型不崩溃。

## 8. 安全

- P0 仅可信局域网、无鉴权/加密；协议不承诺公网安全。session UUID 随机，不接受客户端指定他人 session。
- 限制帧大小、会话数（每客户端 1 个）、录音时长，防止内存耗尽；不记录音频 payload，日志只记 session 前缀、序列号范围、字节数、tokens。
- 云端 Key 只在桌面本机（口径见 [asr-cloud-bailian.md](./asr-cloud-bailian.md) §6）；手机不接触 Key；未同意不上传。
- 手动按键不自动执行：只接受结果卡片点按、只作用于最近一次插入的同一前台应用，30 秒过期且成功即作废；密码框/未授权/焦点变化一律拒绝并只回错误码。
- P1 加配对/长期密钥/加密后，再考虑跨网络。

## 9. 版本与迁移

- 2026-10-31：协议 v1 + 麦克风会话/二进制帧。
- 2026-11-02：云端唯一；`mic.partial` + `mic.result.usage`；移除 `engine/model/fallback`。
- 2026-11-04：新增 `key.request` / `key.result` 与 `mic.cancel`。
- `codec: opus`、`lock` 模式仍为 P1；P2 BLE 复用同一语义。
- 每次协议变更同步：`protocol/README.md`、本文、`protocol/messages.ts`、Rust 类型、[decisions.md](../decisions.md)。

## 10. 去哪看实现与用例

- 实现映射（`mic_protocol.rs` / `desktop_server.rs` / `desktop_keys.rs` / `mobile_client.rs` / 前端类型）见 [asr-cloud-bailian.md](./asr-cloud-bailian.md) §15；链路视角见 [audio-pipeline.md](./audio-pipeline.md)。
- 协议级要点：正常 `start`→3 帧→`stop(release)` 出 `ready`→`partial`→`result`；未配置/Key 不可用只回 `mic.error`、不建会话；未知 session 帧丢弃不崩溃；payload >64KB 丢弃；partial `rev` 回退被客户端丢弃；旧客户端只发 `chat` 行为不变。完整用例见 [mic ACCEPTANCE](../prd/mic/ACCEPTANCE.md) §2.1 与 §9（云端识别）。

## 11. 遥控录音（v1 追加，2026-11-13）

桌面快捷键把「手机当麦克风」的触发端从手机搬到键盘（单键按一下 / 组合键按住）。**会话模型不变**：session 仍由手机生成、`mic.start` 仍由手机发起，桌面只是多了一个「请开始/结束」的下行命令。

| 方向 | 类型 | 用途 |
| --- | --- | --- |
| 桌面 → 手机 | `mic.remote` | 按下/双击快捷键后请求开始；再按请求结束；录音中 Esc 请求取消 |
| 手机 → 桌面 | `mic.remote.ack` | 回执（ok / 稳定错误码），桌面据此在 HUD 显示「手机在后台」「没给麦克风权限」等 |
| 手机 → 桌面 | `mic.remote.status` | 手机是否响应电脑遥控；连上电脑 + 开关变化时各一次，断连由桌面清理 |

约束：

- `mic.remote` **只能由桌面后端产生**（快捷键 → `mic_remote`），`desktop_server` 不把任何 WS 输入映射成这条命令。
- 手机不在宠物页 / 不在前台 / 关掉开关 / 没给权限时，必须回 ack 错误码，**不允许静默**；桌面 2s 无 ack 按超时提示。
- 安卓 WebView 的自动播放策略可能让 `AudioContext` 起不来：`voice-recorder.ts` 检测到 `state !== "running"` 时抛 `AudioBlockedError`，手机回 `audio_blocked`。
- 电平：手机在每帧音频之后附带一条 `mic.level {session, level: 0-100}`（约 8Hz），桌面只把它转给顶部状态条画波形；不进广播、不落库、不参与转写。
- 只有 `mic.stop(reason=release)` 进入转写；Esc 取消走 `mic.stop(reason=cancel)`，不转写、不插入、不记账。
- 单手机假设：桌面只在恰好 1 台可遥控手机时下发命令；多台要等 P1 角色握手。
