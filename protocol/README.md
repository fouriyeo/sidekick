# Sidekick 事件协议

当前用于局域网 MVP：WebSocket 文本帧 + 麦克风/备忘录二进制帧。文本消息是 JSON，用 `type` 区分；音频帧按 session 路由，**不广播**。

> 这篇回答：所有已实现消息的类型、字段语义与兼容规则。
> 不包含：麦克风消息与 `SK01` 帧格式（唯一归属 [docs/engineering/protocol-audio.md](../docs/engineering/protocol-audio.md)）、云端识别与用量（[asr-cloud-bailian.md](../docs/engineering/asr-cloud-bailian.md)）、备忘录管道（[memo-pipeline.md](../docs/engineering/memo-pipeline.md)）、发现（[lan-discovery.md](../docs/engineering/lan-discovery.md)）。

服务端把 `chat` / `system` / `status` / `desktop.status` / `usage` / `mic.*` / `key.*` 控制消息广播给所有已连接客户端（调试可见）；`status.request` 只回一次当前快照（`status` + `desktop.status`）；`focus.request` 由桌面处理并回 `focus.result`；`key.request` 由桌面校验后合成按键并回 `key.result`；麦克风音频帧只进入对应会话缓冲。MVP 阶段无鉴权。

## 连接

- 地址：`ws://<电脑IP>:<端口>/ws`；端口由桌面端在候选端口（默认 `47810`）中取第一个可用的
- 手机一般不用手填：App 启动后通过局域网 UDP 发现自动拿到电脑地址与真实端口，详见 [docs/engineering/lan-discovery.md](../docs/engineering/lan-discovery.md)
- 编码：UTF-8 JSON 文本帧，一条消息一帧

## 消息类型

### chat

双向聊天消息。

```json
{ "type": "chat", "from": "desktop", "text": "hello", "ts": 1730000000000 }
```

- `from`：`desktop` 或 `phone`；`ts`：毫秒时间戳

### system

服务端生成的系统提示（连接、断开等）。可选 `clients` 字段表示当前在线客户端数（含桌面本机窗口与网页预览；旧服务端不发送，旧客户端忽略）。

```json
{ "type": "system", "text": "客户端已连接，当前 2 个", "clients": 2 }
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
      "tool": "bash",
      "lastEventAt": 1730000000000,
      "completedAt": null
    }
  ],
  "ts": 1730000000000
}
```

- `state`：`idle` / `working` / `asking` / `completed`（产品里的静态 / 工作中 / 等你决定 / 完成）；`source`：`dsh`（P0），后续 `claude-code` / `qoder`
- `sessions`：进行中的顶层会话数；只用于桌面调试，手机不展示数字
- `resume` / `remainingMs`：仅 `completed` 有值；桌面 3 秒后补发该状态，手机也可用 `remainingMs` 本地兜底倒计时
- `sessionList`：可选，最多 50 条；旧版桌面不发送，旧版手机忽略
  - `id`：DSH 会话 id（不透明，≤128）；`title`：单行 ≤80 字符，可空；`source`：P0 恒为 `dsh`
  - `state`：`idle` / `working` / `asking`；**不含 completed**，完成态由 `completedAt` 推导
  - `askKind`：`approval` / `question` / null
  - `tool`：可选，仅 `state=working` 有值；粗粒度枚举白名单 `bash` / `read` / `edit` / `search` / `web` / `agent` / `plan` / `tool`。桌面桥对未知值折叠为通用 `tool`（不保留原文），手机端对未知值/非 working 归一为 `null`
  - `lastEventAt`：最近有意义事件的桌面时钟 ms；`completedAt`：最近一轮完成的桌面时钟 ms，null 表示没有完成记录
- 隐私：只同步会话 id、标题、状态、askKind、时间与粗粒度工具类别；**不读取/外发**提示词、回复、工具参数、文件路径、模型名或工具名原文
- 新客户端连接、手机发 `status.request` 时，桌面立即回当前快照（含 `sessionList`）；旧手机按未知类型/未知字段忽略

### status.request

手机 → 桌面，请求一次当前状态快照；桌面收到后回一条 `status`。

```json
{ "type": "status.request" }
```

### desktop.status

电脑侧就绪状态（桌面 → 手机），给手机首用清单的 ③ 百炼 Key / ④ 辅助功能提供真实完成态。只含布尔与时间戳，**不含 Key、掩码、路径或任何内容**。

```json
{
  "type": "desktop.status",
  "v": 1,
  "asrConfigured": true,
  "asrHasKey": true,
  "accessibilityTrusted": true,
  "ts": 1730000000000
}
```

- `asrConfigured`：百炼已配置完整（已同意 + 已存 Key + 地址/模型校验通过）；`asrHasKey`：Key 已保存（允许「已保存但配置不完整」的中间态）；`accessibilityTrusted`：macOS 已授权辅助功能（非 macOS 恒为 false）
- 发送时机：新客户端连接时直发一条；手机发 `status.request` 时随 `status` 快照一起广播
- 旧桌面不发送：旧手机忽略未知类型；旧桌面/未收到时手机 ③④ 显示「在电脑上完成」，**不伪造完成态**

### usage.request / usage

手机用量页请求一份 Token 用量快照（桌面 → 手机）。桌面只读本机 DSH cost-meter 账本后广播聚合结果；不含提示词、回复、工具参数、文件路径、cwd。模型 ID 是否下发受「在手机显示模型分组」开关控制（D83）。

```json
{ "type": "usage.request", "v": 1, "range": "7d", "ts": 1730000000000 }
{
  "type": "usage",
  "v": 1,
  "ts": 1730000000000,
  "data": {
    "range": "7d",
    "generatedAt": 1730000000000,
    "summary": {
      "tokens": 481854387, "input": 3017736, "output": 1247899,
      "cacheRead": 471288704, "cacheWrite": 0, "reasoning": 0,
      "costCnyMicros": 29842039, "estimatedCostMicros": 0,
      "costSource": "ledger", "calls": 1939, "sessions": 15,
      "cacheHitPct": 98.15
    },
    "previous": { "tokens": 0, "costCnyMicros": 0, "costSource": "unknown" },
    "days": [
      { "date": "2026-11-05", "tokens": 481854387, "input": 3017736,
        "output": 1247899, "cacheRead": 471288704, "cacheWrite": 0,
        "costCnyMicros": 29842039, "calls": 1939 }
    ],
    "groups": {
      "clients": [ { "key": "dsh", "label": "DeepSeek Harness", "tokens": 481854387,
        "costCnyMicros": 29842039, "sharePct": 100, "costSource": "ledger" } ],
      "sessions": [],
      "models": [ { "key": "opencode-go:deepseek-v4.1-flash",
        "label": "deepseek-v4.1-flash", "tokens": 481000000,
        "costCnyMicros": 29800000, "sharePct": 99.8,
        "modelId": "deepseek-v4.1-flash", "provider": "OpenCode Go",
        "price": { "inputCnyPerM": 0.288, "outputCnyPerM": 0.067,
          "cacheReadCnyPerM": 0.227, "cacheWriteCnyPerM": 0, "source": "seed" } } ],
      "modelsHidden": false
    },
    "pricing": {
      "source": "remote", "updatedAt": 1730000000000, "lastAttemptAt": 1730000000000,
      "lastError": null, "stale": false, "autoRefresh": true,
      "modelCount": 548, "fxCnyPerUsd": 6.6723, "fxSource": "ledger",
      "mobileModels": true
    },
    "coverageDays": 6,
    "ledger": { "available": true, "reason": null }
  }
}
```

- `range`：`today` / `7d` / `30d` / `180d`；非法值按 `7d`。`summary` / `days` / `groups` 与桌面 `token_usage_stats` 返回结构同构；金额单位人民币微元（1 元 = 1,000,000），`costSource` 为 `ledger` / `estimated` / `mixed` / `unknown`。
- `previous` 是上一等长周期，用于对比；`coverageDays` 是区间内实际有数据的天数。
- 关闭「在手机显示模型分组」时 `groups.models` 为空数组、`groups.modelsHidden = true`；`status.sessionList` 仍不含模型名（D78 不变）。
- 旧手机忽略未知类型；旧桌面不发送 `usage`，不影响聊天/麦克风/状态。

### focus.request / focus.result

手机点「等你决定」的会话时，请求电脑把对应软件切到前台（没开则启动）。桌面只接受 `source = dsh`，应用名硬编码映射，不接受手机传来的应用路径。

```json
{ "type": "focus.request", "v": 1, "requestId": "f-…", "source": "dsh", "sessionId": "…", "ts": 1730000000000 }
{ "type": "focus.result", "v": 1, "requestId": "f-…", "source": "dsh", "ok": true, "error": null, "ts": 1730000000001 }
```

- `requestId`：手机生成，用于把结果对回发起方；`ok=false` 时 `error` 只回错误码：`bad_request` / `rate_limited` / `unsupported_source` / `unsupported_platform` / `launch_failed`
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

语音识别只由桌面直连百炼，手机不接触 API Key，失败直接报错、不回退本机。消息为 `mic.start` / `mic.ready` / `mic.partial` / `mic.result` / `mic.state` / `mic.error` / `mic.stop` / `mic.cancel`；音频是 `SK01` 二进制帧（`magic + version + flags + session UUID + sequence + PCM16`），只按 session 进入内存缓冲、**绝不广播**；`mic.stop` 的 `reason` 为 `release` / `cancel` / `timeout` / `background` / `disconnect` / `mic_lost`，只有 `release` / `timeout` 转写；单端重复 `mic.start` 以最新会话为准，异端回 `mic.error(session_busy)`；`mic.cancel` 是权威中止（桌面人工/`maxMs + 3s` 看门狗），手机收到必须停采集；取消不转写、不插入、不写用量。

**字段、帧布局、状态机、测试要点以 [docs/engineering/protocol-audio.md](../docs/engineering/protocol-audio.md) 为唯一事实源，本文不再复制。**

## 规划中的事件（均未实现）

以下类型只是名称与用途预留，当前**任何一端都不发送**；实现时先补本文与 `protocol-audio.md` 的字段表，再改两端解析：

| 类型 | 预留用途 |
| --- | --- |
| `ask` | AI 需要用户决策（权限确认、反问），带 `id` 与 `options` |
| `answer` | 用户对 `ask` 的回复，通过 `id` 配对 |
| `notify` | 单向通知（任务完成等），带 `level` |
| `input` | 用户回传（语音文字、快捷指令等），带 `kind` |

## 语音备忘录（memo.*，已实现）

手机是唯一写者，电脑只读镜像。所有 `memo.*` 控制消息都**不进入聊天广播**；Key、token、音频 ack 通过定向发送只回发起连接；配对结果由手机 Rust 直接落盘，Key 不进 WebView。管道细节见 [memo-pipeline.md](../docs/engineering/memo-pipeline.md)。

### 配对（一次性 6 位码）

- 桌面「语音 › 手机备忘录 › 配对手机 / 发送 Key」调用 `memo_pair_code_create` 生成 6 位码，2 分钟有效、错 3 次作废。
- 手机 → 桌面：`memo.pair.request {code, deviceId, deviceName}`；桌面 → 手机（定向）：`memo.pair.result {ok, token, key}`。
- 失败时 `ok:false` + `error`。`key` 可能为 `null`（电脑没配百炼）。手机把 token/Key 存 App 私有目录（MVP，Keystore 留 P1）。

### 同步

手机连上电脑后先 `memo.hello {deviceId, token}`，再推未同步条目：

- `memo.push {memos:[...]}`：元数据批量（≤50/批），电脑 upsert 后回 `memo.push.ack {ids}`；墓碑用 `deletedAt`。
- `memo.audio.begin {memoId, bytes, sha256}` → 电脑回 `memo.audio.begin.ack {memoId, offset}`；音频分块用二进制 `SK02` 帧：`SK02` + `memoId` 长度(u16 LE) + `memoId` + `offset`(u64 LE) + payload。
- 每块电脑回 `memo.audio.ack {memoId, offset}`；偏移不连续直接 `memo.error`。
- `memo.audio.commit {memoId}` → 电脑校验大小与 sha256，回 `memo.audio.committed {memoId, ok}`；手机收到 `ok:true` 才写 `synced_at`。
- `memo.delete {memoId}` 可显式墓碑；当前实现也接受 `memo.push` 里的 `deletedAt`。

未配对连接发 `memo.push/audio.*` 一律 `memo.error{code:"sync_failed"|"audio_*_failed"}`，不落库。同步是手机单写者，不做 CRDT/双向编辑。

## 实现映射（当前代码）

- 桌面服务端：`app/src-tauri/src/desktop_server.rs`（axum `/ws`、动态端口、UDP 发现、麦克风会话）
- 桌面 UI：`app/src/desktop/lib/ws-client.ts`（本机回环）；麦克风状态浮层 `desktop/features/mic-receiver`
- 手机 App：`app/src-tauri/src/mobile_client.rs`；前端通过 `connect_server` / `send_chat` / `mic_*` 命令与 `conn` / `chat` 事件通信
- 麦克风协议：`app/src-tauri/src/mic_protocol.rs`、`app/src/protocol/messages.ts`、`audio-frame.ts`（细节见 [protocol-audio.md](../docs/engineering/protocol-audio.md)）
- 结果卡片手动按键：`app/src-tauri/src/desktop_keys.rs`（安全闸门/按键计划/目标注册表）、`desktop_server.rs`、`mobile_client.rs`、`app/src/mobile/features/mic/mic-store.ts`
- 云端识别：`app/src-tauri/src/asr_config.rs`、`asr_keychain.rs`、`asr_cloud.rs`、`bailian_asr.rs`、`asr_usage.rs`、`asr_pricing.rs`（见 [asr-cloud-bailian.md](../docs/engineering/asr-cloud-bailian.md)）
- 局域网发现（UDP，非本协议）：`app/src-tauri/src/discovery.rs`，报文与算法见 [lan-discovery.md](../docs/engineering/lan-discovery.md)
- AI 状态：`app/src-tauri/src/dsh_hook.rs`（回环接收/聚合/广播/快照）、`app/src/dsh-hook/sidekick-hook.mjs`、`app/src/mobile/features/pet/ai-status.ts`（手机四态）
- AI 会话列表：`app/src/mobile/features/sessions/`；focus 唤起：`app/src-tauri/src/app_focus.rs`、`desktop_server.rs`、`mobile_client.rs`
- 首用清单电脑侧状态：`desktop_server.rs`（`desktop_status_message` / 新连接直发 / `status.request` 广播）、`app/src/protocol/messages.ts`、`app/src/mobile/features/first-use/store.ts` 与 `settings/more-page.tsx`
- 手机浏览器落地页：`app/src-tauri/mobile/index.html`（仅调试/下载入口，不是正式客户端）
