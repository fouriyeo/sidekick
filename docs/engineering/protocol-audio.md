---
doc: engineering/protocol-audio
title: 音频协议
status: active
updated: 2026-11-04
load: on-demand
owner: engineering
---

# 音频协议（v1，已实现）

> 现状：协议 v0 的 `chat` / `system` 不变；2026-10-31 实现麦克风会话与二进制帧；2026-11-02 改为百炼云端唯一，增加 `mic.partial` 与 `mic.result.usage`，移除 `engine/model/fallback`。
> 实现：`app/src-tauri/src/mic_protocol.rs`、`desktop_server.rs`、`mobile_client.rs`、`asr_cloud.rs`、`bailian_asr.rs`、`asr_usage.rs`；结果卡片手动按键见 `desktop_keys.rs`；前端类型见 `app/src/protocol/messages.ts` 与 `audio-frame.ts`。

## 1. 目标

- 手机把 100ms PCM 分片低开销地送到桌面。
- 音频**不广播**给其它客户端，只路由到当前会话的云端转写任务。
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
| 桌面 → 手机/UI | `mic.partial` | JSON | 流式中间结果 |
| 桌面 → 手机 | `mic.result` | JSON | 输入/复制/失败结果 + usage |
| 桌面 → 桌面 UI | `mic.state` | JSON | 浮窗状态 |
| 桌面 → 桌面 UI | `asr.final` | JSON | 预留，未实现 |
| 桌面 → 手机/UI | `asr.error` | JSON | 预留，未实现 |
| 桌面 → 手机 | `mic.error` | JSON | 配置/会话错误 |
| 手机 → 桌面 | `key.request` | JSON | 结果卡片手动按键（Return / ⌘A+Delete） |
| 桌面 → 手机/UI | `key.result` | JSON | 按键结果 + 错误码 |

- 语音识别只走百炼云端；协议不再有 `engine`/`model`/`fallback` 字段。
- `mic.partial` 于 2026-11-02 实现；`asr.final`/`asr.error` 仍是预留名称，当前不发送。

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
- 桌面校验配置/Key；未同意、地址/模型无效或无 Key → `mic.error(cloud_not_configured|cloud_key_unavailable)`，不进入会话。
- `mic.start` 前手机不得发送二进制帧。

### 3.2 mic.ready（桌面 → 手机）

```json
{ "v": 1, "type": "mic.ready", "session": "...", "ts": 1730000000000 }
```

- 桌面接受会话后发送；P0 手机不等待 `mic.ready`，立即开始发帧（`ready` 用于协议完整性/桌面状态，P1 再恢复握手）。
- 不再带 `engine`/`model`。

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

- `release`：正常松手，进入收尾。
- `cancel`：用户上滑取消，丢弃音频。
- `timeout`：达到 60 秒上限，收尾已收音频。
- `background`：App 进入后台/锁屏，丢弃。
- `disconnect`：连接断开，丢弃。
- `mic_lost`：被其它应用占用，丢弃。

桌面收到 `cancel/background/disconnect/mic_lost` 时删除缓冲并 abort 云端，不转写；`release/timeout` 才进入收尾。

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
`reason`：`accessibility_off` / `target_mismatch` / `secure_input` / `paste_failed` / `empty_transcript` / `asr_failed` / `asr_timeout` / `insert_failed` / `session_busy` / `session_mismatch` / `cloud_*`。

- `text` 给手机最近一次结果卡片使用；不写日志、不落库。
- `truncated` 表示原文超过 2000 字，只输入了前 2000 字。
- `usage`：百炼返回的 token/时长；失败但百炼返回 usage 时也可能有。
- 不再带 `engine`/`model`/`fallback`。

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

- `text` 是“已定稿句 + 当前句”的完整可见文本，客户端整体替换，不做增量拼接。
- `rev` 从 1 递增；同一 session 只接受更大的 `rev`。
- `sentence` 当前句 id；不再带 `engine`。
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

- 桌面服务维护一个 active `ActiveMic { owner, session, pcm, frames, pricing, cloud, ... }`，见 `desktop_server.rs`。
- 二进制帧只按 session 追加到该会话缓冲；**不进入广播通道**；未知 session/非 owner 直接丢弃。
- 会话开始时读 `asr.json` + Keychain；未配置直接 `mic.error`，不建立会话。
- 插入成功后桌面把 `(owner, session, 前台应用, 时间)` 记到 `KeyRegistry`；`key.request` 在未进入聊天广播前被拦截，校验后放到阻塞线程合成按键，结果广播为 `key.result`。
- 音频帧同时进入内存缓冲并转发给百炼会话（`bailian_asr::CloudHandle`）。
- `mic.partial` 由云端会话通过同一文本广播通道发出，手机与桌面 UI 都按 session/rev 过滤。
- `mic.start` / `mic.ready` / `mic.stop` / `mic.state` / `mic.result` / `mic.error` 仍走现有文本广播，调试客户端可见；P0 仅单手机，配对/多客户端隔离在 P1。
- 同一时间只允许一个 active session；重复 `mic.start` 回 `mic.error(session_busy)`。
- 缓冲上限 65 秒 / 2.2MB；超过丢弃。

## 6. 会话状态机

```text
idle
  → (手机 mic.start) → 配置/Key 检查
    ├─ 失败 → mic.error → idle
    └─ 云端：connecting（缓存）→ streaming（partial）→ finalizing → delivered
  → (task-failed/超时/空) → mic.result(failed) → error
  → (cancel/background/disconnect/mic_lost) → idle（丢弃，abort 云端）
```

超时：

- P0 手机在 `mic.start` 后立即开始发帧，不阻塞等待 `mic.ready`；`ready` 用于协议完整性/桌面状态。
- `listening` 60 秒上限由手机端计时并停；桌面 65 秒兜底丢弃。
- 连接 5s、`task-started` 3s、`finish-task` 8s；失败直接 `mic.result(failed)`，不回退。
- `arming 2s` 超时与 `mic.ready` 握手仍为 P1。

## 7. 向后兼容

- 现有 `chat` / `system` 不变；旧客户端忽略未知 `type`（包括 `mic.partial`）。
- 新客户端在 `mic.start` 前不发送二进制帧；旧服务端会忽略二进制，手机收到 `mic.error` 或超时。
- 2026-11-02 移除了 `mic.ready.engine/model`、`mic.partial.engine`、`mic.result.engine/model/fallback`；双端同版本升级，旧客户端多收字段会忽略，新客户端不依赖这些字段。
- `mic.result.usage` 保留，字段不变。
- 2026-11-04 新增 `key.request` / `key.result`（增量，旧端忽略）；不修改任何 `mic.*` 字段。
- 版本字段 `v:1`；破坏性改动升 `v:2`，双端同时升级。
- `protocol/messages.ts` 用 discriminated union；Rust 用 `serde(tag = "type")`，未知类型不崩溃。

## 8. 安全

- P0 仅可信局域网、无鉴权/加密；协议不承诺公网安全。
- session UUID 随机；不接受客户端指定他人 session。
- 限制帧大小、会话数（每客户端 1 个）、录音时长；防止内存耗尽。
- 不记录音频 payload；日志只记 session 前缀、序列号范围、字节数、tokens。
- 云端 Key 只存桌面 Keychain；`asr.json` / `asr_usage.json` 不含 Key；手机不接触 Key；未同意不上传。
- 手动按键不自动执行：只接受结果卡片点按、只作用于最近一次插入的同一前台应用，30 秒过期且成功即作废；密码框/未授权/焦点变化一律拒绝并只回错误码。
- P1 加配对/长期密钥/加密后，再考虑跨网络。

## 9. 实现映射（当前代码）

| 位置 | 职责 |
| --- | --- |
| `app/src-tauri/src/desktop_server.rs` | `/ws`、麦克风会话、帧转发/缓冲、usage 入账、`mic.*`/`mic.partial` 广播 |
| `app/src-tauri/src/asr_cloud.rs` | 云端配置/Keychain 缓存/命令/测试连接 |
| `app/src-tauri/src/asr_config.rs`、`asr_keychain.rs` | `asr.json`、Keychain |
| `app/src-tauri/src/bailian_asr.rs` | 百炼 WS 会话、run-task/finish-task、句子组装、partial 节流 |
| `app/src-tauri/src/asr_usage.rs`、`asr_pricing.rs` | 用量汇总、365 天 `days`、价格/金额 |
| `app/src-tauri/src/mic_protocol.rs` | 消息/帧解析、session UUID、`MicStopReason` |
| `app/src-tauri/src/desktop_mic.rs`、`transcript.rs` | 文本插入、截断/空白归一、`post_key` 按键合成 |
| `app/src-tauri/src/desktop_keys.rs` | 按键动作解析/计划/安全闸门/目标注册表、`key.result` |
| `app/src-tauri/src/mobile_client.rs` | `Outbound::Text/Binary`、`mic_start/mic_frame/mic_stop/send_key_request` |
| 桌面 `desktop/features/models` | 模型页：百炼配置 + 用量统计 |
| 桌面 `desktop/features/mic-receiver` | 应用内语音状态浮层 |
| 手机 `mobile/features/mic` | 录音、波形、手势、权限、结果卡片、回车/清空按钮 |
| `app/src/protocol/messages.ts`、`audio-frame.ts` | 前端类型与帧测试工具 |

## 10. 测试向量

| 用例 | 输入 | 期望 |
| --- | --- | --- |
| 正常会话 | start → 3 帧 → stop(release) | ready → partial → result(inserted, usage) |
| 未配置 | start（无 Key/未同意） | `mic.error(cloud_not_configured)`，不建会话 |
| Keychain 失败 | start | `mic.error(cloud_key_unavailable)` |
| 取消 | start → 1 帧 → stop(cancel) | 不转写；缓冲清空；abort 云端 |
| 未知 session | 二进制帧 session=X | 丢弃并计数；不崩溃 |
| 重复 start | 同 session 两次 start | 第二次 `mic.error(session_busy)` |
| 不等待 ready | start 后立即发帧 | 正常接收；P0 不要求先等 ready |
| 断线 | 录音中关闭 WS | 手机会话结束；桌面清理缓冲 |
| 大帧 | payload >64KB | 丢弃并告警 |
| 旧客户端 | 只发 chat | 行为不变 |
| 云端失败 | 断网/401/task-failed | `mic.result(failed)` 或 `mic.error`；不插入 |
| 旧手机 | 收到 mic.partial | 忽略；最终 result 正常 |
| partial 乱序 | rev 回退 | 客户端丢弃旧 rev |

## 11. 版本与迁移

- 2026-10-31：协议 v1 + 麦克风会话/二进制帧。
- 2026-11-02：云端唯一；`mic.partial` + `mic.result.usage`；移除 `engine/model/fallback`。
- `codec: opus`、`lock` 模式仍为 P1；P2 BLE 复用同一语义。
- 每次协议变更同步：`protocol/README.md`、本文、`protocol/messages.ts`、Rust 类型、[decisions.md](../decisions.md)。
