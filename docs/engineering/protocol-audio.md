---
doc: engineering/protocol-audio
title: 音频协议提案
status: draft
updated: 2026-10-31
load: on-demand
owner: engineering
---

# 音频协议提案（v1，未实现）

> 现状：协议 v0 只有 `chat` / `system`，文本 JSON，服务端广播。见 [protocol/README.md](../../protocol/README.md)。
> 本文新增麦克风会话与二进制音频帧；实现前需评审，不与现有消息破坏兼容。
> 2026-10-31 spike 暂时使用 JSON `voice.start` / `voice` / `voice.cancel` + base64 WAV，未采用本文二进制帧；正式 P0 前必须按本文实现或先修订协议。

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
| 桌面 → 手机 | `mic.ready` | JSON | 会话已就绪 |
| 手机 → 桌面 | 音频帧 | Binary | PCM/Opus 分片 |
| 手机 → 桌面 | `mic.stop` | JSON | 停止/取消/超时 |
| 桌面 → 手机 | `mic.result` | JSON | 输入/复制/失败结果 |
| 桌面 → 桌面 UI | `mic.state` | JSON | 浮窗状态 |
| 桌面 → 桌面 UI | `asr.final` | JSON | 转写结果（可选预览） |
| 桌面 → 手机/UI | `asr.error` | JSON | 错误码 |
| 桌面 → 手机 | `mic.error` | JSON | 采集/会话错误 |

P1 才加 `asr.partial`（流式中间结果）。

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
  "frameMs": 100,
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
{ "v": 1, "type": "mic.ready", "session": "...", "ts": 1730000000000 }
```

- 桌面准备好接收后发送；手机收到后再开始发音频（或先发少量预热帧，最多 3 帧）。
- 超时 2 秒未收到 → 手机上报告知“电脑端没准备好”。

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
  "latencyMs": 1820,
  "ts": 1730000000000
}
```

`outcome`：`inserted`（自动输入）、`copied`（仅复制）、`failed`。
`reason`（failed）：`asr_failed` / `target_mismatch` / `secure_input` / `insert_failed` / `asr_timeout`。

### 3.5 mic.state（桌面 → 桌面 UI）

```json
{ "v": 1, "type": "mic.state", "session": "...", "state": "listening", "ts": 1730000000000 }
```

`state`：`arming` / `listening` / `processing` / `delivered` / `error` / `idle`。

### 3.6 asr.final / asr.error

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

- 每帧 100ms = 3200 bytes payload；总帧约 3228 bytes。
- `sequence` 从 0 递增；桌面发现丢帧只记录，不请求重传（实时场景重传无意义）。
- `flags.last` 可选；正常结束以 `mic.stop` 为准，不依赖 last。
- 单帧 payload 上限 64KB；超过丢弃并告警。

### 4.2 为什么用二进制

- JSON + base64 会让 3200 bytes 膨胀到 ~4.3KB，且解析开销大。
- 二进制帧在 axum/tokio-tungstenite 都原生支持；调试可用十六进制转储。
- 控制消息仍用 JSON，保持可读性。

## 5. 路由

- 桌面服务维护 `sessions: HashMap<Uuid, AudioSession>`。
- 二进制帧只按 session 投递到转写任务；**不进入现有广播通道**。
- 文本 `mic.*` 消息可按现有广播给桌面 UI，但手机不应收到其它会话的音频/结果。
- 未知 session 的二进制帧直接丢弃并计数；不创建新会话。
- 同一 session 重复 `mic.start`：忽略第二个，回 `mic.error`（`session_busy`）。

## 6. 会话状态机

```text
idle
  → (手机 mic.start) → arming
  → (桌面 mic.ready) → listening
  → (二进制帧) → listening
  → (手机 mic.stop: release/timeout) → processing
  → (asr.final + insert) → delivered
  → (error) → error → idle
  → (cancel/background/disconnect/mic_lost) → idle（丢弃）
```

超时：

- `arming` 2 秒未 ready → `mic.error`。
- `listening` 60 秒上限由手机端计时并停；桌面也做 65 秒兜底。
- `processing` 10 秒未完成 → `mic.error`（`asr_timeout`），丢弃。

## 7. 向后兼容

- 现有 `chat` / `system` 不变；旧客户端忽略未知 `type`。
- 新客户端在 `mic.start` 前不发送二进制帧；旧服务端会忽略二进制，手机收到 `mic.error` 或超时。
- 版本字段 `v:1`；新增字段保持可选；破坏性改动升 `v:2`，双端同时升级。
- `protocol/messages.ts` 用 discriminated union；Rust 用 `serde(tag = "type")`，未知类型不崩溃。

## 8. 安全

- P0 仅可信局域网、无鉴权/加密；协议不承诺公网安全。
- session UUID 随机；不接受客户端指定他人 session。
- 限制帧大小、会话数（每客户端 1 个）、录音时长；防止内存耗尽。
- 不记录音频 payload；日志只记 session 前缀、序列号范围、字节数。
- P1 加配对/长期密钥/加密后，再考虑跨网络。

## 9. 实现映射

| 位置 | 职责 |
| --- | --- |
| `app/src-tauri/src/lib.rs` `desktop_server` | 新增 `/ws` 二进制分支、session 路由、audio 缓冲 |
| 桌面 `desktop/features/mic-receiver` | 浮窗状态、结果提示、设置 |
| 手机 `mobile/features/mic` | 录音 UI、状态、权限、最近结果 |
| 手机 Rust `mobile_client` | `mic.start/stop`、音频分片发送、结果事件 |
| `app/src/protocol/messages.ts` | 消息类型、type guard |
| `app/src/shared/lib/tauri.ts` | 命令/事件唯一出口 |

## 10. 测试向量

| 用例 | 输入 | 期望 |
| --- | --- | --- |
| 正常会话 | start → 3 帧 → stop(release) | ready → 转写 → result(inserted) |
| 取消 | start → 1 帧 → stop(cancel) | 不转写；缓冲清空 |
| 未知 session | 二进制帧 session=X | 丢弃并计数；不崩溃 |
| 重复 start | 同 session 两次 start | 第二次 `mic.error(session_busy)` |
| 超时 | start 后不发 ready | 2 秒后 `mic.error(arming_timeout)` |
| 断线 | 录音中关闭 WS | 手机会话结束；桌面清理缓冲 |
| 大帧 | payload >64KB | 丢弃并告警 |
| 旧客户端 | 只发 chat | 行为不变 |

## 11. 版本与迁移

- P0 上线前：协议评审 + 双端 mock 测试 + 真机端到端。
- P1 扩展：`asr.partial`、`codec: opus`、`lock` 模式；字段可选，不破坏 v1。
- P2：BLE 传输复用同一消息语义，只换承载层。
- 每次协议变更同步：`protocol/README.md`、本文、`protocol/messages.ts`、Rust 类型、[decisions.md](../decisions.md)。
