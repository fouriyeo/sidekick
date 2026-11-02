---
doc: engineering/protocol-audio
title: 音频协议提案
status: active
updated: 2026-11-02
load: on-demand
owner: engineering
---

# 音频协议（v1，已实现）

> 现状：协议 v0 的 `chat` / `system` 不变；2026-10-31 实现麦克风会话与二进制帧；2026-11-02 增加云端引擎与流式 `mic.partial`。
> 实现：`app/src-tauri/src/mic_protocol.rs`、`desktop_server.rs`、`mobile_client.rs`、`asr_cloud.rs`、`bailian_asr.rs`；前端类型见 `app/src/protocol/messages.ts` 与 `audio-frame.ts`。

## 1. 目标

- 手机把 100ms PCM 分片低开销地送到桌面。
- 音频**不广播**给其它客户端，只路由到当前会话的转写任务。
- 控制消息仍用 JSON，便于调试与向后兼容。
- 会话可取消、可超时、可断线丢弃；不缓存、不重放。
- 为后续 Opus/BLE 留扩展位。

## 2. 消息总览

| 方向 | 类型 | 传输 | 用途 |
| --- | --- | --- | --- |
| 手机 → 桌面 | `mic.start` | JSON | 开始会话，声明格式 |
| 桌面 → 手机 | `mic.ready` | JSON | 会话已就绪；带 `engine`/`model` |
| 手机 → 桌面 | 音频帧 | Binary | PCM/Opus 分片 |
| 手机 → 桌面 | `mic.stop` | JSON | 停止/取消/超时 |
| 桌面 → 手机/UI | `mic.partial` | JSON | 流式中间结果（已实现） |
| 桌面 → 手机 | `mic.result` | JSON | 输入/复制/失败结果；带 `engine`/`model`/`fallback`/`usage` |
| 桌面 → 桌面 UI | `mic.state` | JSON | 浮窗状态 |
| 桌面 → 桌面 UI | `asr.final` | JSON | 预留，未实现 |
| 桌面 → 手机/UI | `asr.error` | JSON | 预留，未实现 |
| 桌面 → 手机 | `mic.error` | JSON | 采集/会话错误 |

`mic.partial` 于 2026-11-02 实现（云端百炼流式）；`asr.final`/`asr.error` 仍是预留名称，当前不发送。

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

规则：

- `session` 为 UUID v4，手机生成；同一时间只允许一个 active session。
- `codec` P0 只支持 `pcm16`；`opus` 预留。
- 桌面校验格式；不支持则回 `mic.error`，不进入录音。
- `mic.start` 前手机不得发送二进制帧。

### 3.2 mic.ready（桌面 → 手机）

```json
{
  "v": 1,
  "type": "mic.ready",
  "session": "...",
  "engine": "bailian",
  "model": "qwen-audio-3.1-asr-flash-streaming",
  "ts": 1730000000000
}
```

- 桌面准备好接收后发送；P0 手机不等待 `mic.ready`，立即开始发帧（`ready` 用于协议完整性/桌面状态，P1 再恢复握手）。
- `engine`：`local` / `bailian`；旧桌面不带时按 `local` 处理。
- `model`：本机为 whisper 模型 id，云端为百炼模型名。

### 3.3 mic.stop（手机 → 桌面）

```json
{
  "v": 1,
  "type": "mic.stop",
  "session": "...",
  "reason": "release",
  "ts": 1730000000000
}
```

`reason`：

- `release`：正常松手，进入转写。
- `cancel`：用户上滑取消，丢弃音频。
- `timeout`：达到 60 秒上限，转写已收音频。
- `background`：App 进入后台/锁屏，丢弃。
- `disconnect`：连接断开，丢弃。
- `mic_lost`：被其它应用占用，丢弃。

桌面收到 `cancel/background/disconnect/mic_lost` 时删除缓冲，不转写；`release/timeout` 才进入转写。

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
  "engine": "bailian",
  "model": "qwen-audio-3.1-asr-flash-streaming",
  "fallback": false,
  "usage": {
    "inputTokens": 85,
    "outputTokens": 4,
    "totalTokens": 89,
    "audioDurationMs": 2000
  },
  "ts": 1730000000000
}
```

`outcome`：`inserted`（自动输入）、`copied`（仅复制）、`failed`。
`reason`：`accessibility_off` / `target_mismatch` / `secure_input` / `paste_failed` / `model_missing` / `empty_transcript` / `asr_failed` / `asr_timeout` / `insert_failed` / `session_busy` / `session_mismatch` / `cloud_*`。

- `text` 给手机最近一次结果卡片使用；不写日志、不落库。
- `truncated` 表示原文超过 2000 字，只输入了前 2000 字。
- `engine`：本次实际使用的引擎；`fallback=true` 表示云端失败后由本机兜底。
- `usage`：百炼返回的 token/时长；本机/旧桌面可能没有。

### 3.5 mic.partial（桌面 → 手机/桌面 UI）

```json
{
  "v": 1,
  "type": "mic.partial",
  "session": "...",
  "rev": 12,
  "text": "帮我把这段异步的注释",
  "sentence": 1,
  "engine": "bailian",
  "ts": 1730000000000
}
```

- `text` 是“已定稿句 + 当前句”的完整可见文本，客户端整体替换，不做增量拼接。
- `rev` 从 1 递增；同一 session 只接受更大的 `rev`。
- `sentence` 当前句 id；`engine` 可选，旧桌面不带。
- 仅用于回显，不用于落字；最终文本以 `mic.result.text` 为准。
- 服务端按 50ms 节流，句子结束强制发送；上限约 20 条/秒。

### 3.6 mic.state（桌面 → 桌面 UI）

```json
{ "v": 1, "type": "mic.state", "session": "...", "state": "listening", "ts": 1730000000000 }
```

`state`：`listening` / `processing` / `delivered` / `error` / `cancelled` / `idle`（`arming` 是手机本地状态，服务端不发）。

### 3.7 asr.final / asr.error（预留，未实现）

```json
{ "v": 1, "type": "asr.final", "session": "...", "text": "把这段代码改成异步", "lang": "zh-CN", "durationMs": 4200 }
```

```json
{ "v": 1, "type": "asr.error", "session": "...", "code": "asr_failed", "message": "no speech" }
```

- `asr.final` 只发给桌面 UI 做可选预览；默认不在手机显示全文。
- 错误 `message` 只给内部/日志，不给用户；用户文案由 UI 层映射。

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
- `sequence` 从 0 递增；桌面发现丢帧只记录，不请求重传（实时场景重传无意义）。
- `flags.last` 可选；正常结束以 `mic.stop` 为准，不依赖 last。
- 单帧 payload 上限 64KB；PCM16 必须偶数长度；超过/奇数帧丢弃。

### 4.2 为什么用二进制

- JSON + base64 会让 3200 bytes 膨胀到 ~4.3KB，且解析开销大。
- 二进制帧在 axum/tokio-tungstenite 都原生支持；调试可用十六进制转储。
- 控制消息仍用 JSON，保持可读性。

## 5. 路由（实现）

- 桌面服务维护一个 active `ActiveMic { owner, session, pcm, frames, engine, cloud, ... }`，见 `desktop_server.rs`。
- 二进制帧只按 session 追加到该会话缓冲；**不进入广播通道**；未知 session/非 owner 直接丢弃。
- 会话开始时按 `asr.json` 选引擎：本机只缓冲；百炼同时缓冲并转发给云端会话（`bailian_asr::CloudHandle`）。
- `mic.partial` 由云端会话通过同一文本广播通道发出，手机与桌面 UI 都按 session/rev 过滤。
- `mic.start` / `mic.ready` / `mic.stop` / `mic.state` / `mic.result` / `mic.error` 仍走现有文本广播，调试客户端可见；P0 仅单手机，配对/多客户端隔离在 P1。
- 同一时间只允许一个 active session；重复 `mic.start` 回 `mic.error(session_busy)`。
- 缓冲上限 65 秒 / 2.2MB；超过丢弃。

## 6. 会话状态机

```text
idle
  → (手机 mic.start) → 选引擎
    ├─ local：arming → listening → processing → delivered
    └─ bailian：connecting（缓存）→ streaming（partial）→ finalizing → delivered
  → (云端失败/空 + 本机可用) → fallback-local → delivered(local)
  → (cancel/background/disconnect/mic_lost) → idle（丢弃，abort 云端）
```

超时：

- P0 手机在 `mic.start` 后立即开始发帧，不阻塞等待 `mic.ready`；`ready` 目前用于协议完整性/桌面状态。
- `listening` 60 秒上限由手机端计时并停；桌面 65 秒兜底丢弃。
- `processing` 10 秒未完成 → `mic.result(failed, asr_timeout)`；取消标记阻止后续插入。
- 云端：连接 5s、`task-started` 3s、`finish-task` 8s；超时/失败按 §3.4 回退本机（若允许且可用）。
- `arming 2s` 超时与 `mic.ready` 握手仍为 P1。

## 7. 向后兼容

- 现有 `chat` / `system` 不变；旧客户端忽略未知 `type`（包括 `mic.partial`）。
- 新客户端在 `mic.start` 前不发送二进制帧；旧服务端会忽略二进制，手机收到 `mic.error` 或超时。
- `mic.ready`/`mic.result` 的新字段全部可选；旧手机按 `local`/无 usage 处理。
- 版本字段 `v:1`；破坏性改动升 `v:2`，双端同时升级。
- `protocol/messages.ts` 用 discriminated union；Rust 用 `serde(tag = "type")`，未知类型不崩溃。

## 8. 安全

- P0 仅可信局域网、无鉴权/加密；协议不承诺公网安全。
- session UUID 随机；不接受客户端指定他人 session。
- 限制帧大小、会话数（每客户端 1 个）、录音时长；防止内存耗尽。
- 不记录音频 payload；日志只记 session 前缀、序列号范围、字节数、引擎、tokens。
- 云端 Key 只存桌面 Keychain；`asr.json` 不含 Key；手机不接触 Key；未同意不上传。
- P1 加配对/长期密钥/加密后，再考虑跨网络。

## 9. 实现映射（当前代码）

| 位置 | 职责 |
| --- | --- |
| `app/src-tauri/src/desktop_server.rs` | `/ws`、麦克风会话、引擎路由、二进制帧缓冲/转发、`mic.*`/`mic.partial` 广播、回退 |
| `app/src-tauri/src/asr_cloud.rs` | 云端配置/Keychain 缓存/命令/测试连接 |
| `app/src-tauri/src/bailian_asr.rs` | 百炼 WS 会话、run-task/finish-task、句子组装、partial 节流 |
| `app/src-tauri/src/mic_protocol.rs` | 消息/帧解析、session UUID、`MicStopReason` |
| `app/src-tauri/src/desktop_mic.rs` | ASR 后插入、CGEvent、目标应用/安全输入检查 |
| `app/src-tauri/src/asr_models.rs` | 本机模型、下载、prewarm、内存转写 |
| `app/src-tauri/src/mobile_client.rs` | `Outbound::Text/Binary`、`mic_start/mic_frame/mic_stop` |
| 桌面 `desktop/features/mic-receiver` | 应用内语音状态浮层 |
| 手机 `mobile/features/mic` | 录音、波形、手势、权限、结果卡片 |
| `app/src/protocol/messages.ts`、`audio-frame.ts` | 前端类型与帧测试工具 |

## 10. 测试向量

| 用例 | 输入 | 期望 |
| --- | --- | --- |
| 正常会话 | start → 3 帧 → stop(release) | ready → 转写 → result(inserted) |
| 取消 | start → 1 帧 → stop(cancel) | 不转写；缓冲清空 |
| 未知 session | 二进制帧 session=X | 丢弃并计数；不崩溃 |
| 重复 start | 同 session 两次 start | 第二次 `mic.error(session_busy)` |
| 不等待 ready | start 后立即发帧 | 正常接收；P0 不要求先等 ready |
| 断线 | 录音中关闭 WS | 手机会话结束；桌面清理缓冲 |
| 大帧 | payload >64KB | 丢弃并告警 |
| 旧客户端 | 只发 chat | 行为不变 |
| 云端正常 | start → 帧 → stop | ready(engine=bailian) → partial → result(engine=bailian) |
| 云端失败 | 断网/401/task-failed | 有本机则 result(engine=local, fallback=true)；否则 failed |
| 旧手机 | 收到 mic.partial | 忽略；最终 result 正常 |
| partial 乱序 | rev 回退 | 客户端丢弃旧 rev |

## 11. 版本与迁移

- P0 已实现：协议 v1 + whisper-rs + 手机 UI；双端类型/文档/测试向量已同步。
- 2026-11-02：`mic.partial` + 云端引擎字段已实现；`codec: opus`、`lock` 模式仍为 P1。
- P2：BLE 传输复用同一消息语义，只换承载层。
- 每次协议变更同步：`protocol/README.md`、本文、`protocol/messages.ts`、Rust 类型、[decisions.md](../decisions.md)。
