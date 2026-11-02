---
doc: engineering/asr-cloud-bailian
title: 百炼云端流式语音识别方案
status: active
updated: 2026-11-02
load: on-demand
owner: engineering
---

# 百炼云端流式语音识别方案

> 回答“云端识别怎么接、音频怎么走、Key 放哪、失败怎么办、费用怎么看”。产品规则见 [mic PRD](../prd/mic/PRD.md)，模型页与用量口径见 [asr-model.md](./asr-model.md)，协议字段见 [protocol-audio.md](./protocol-audio.md)。
> 状态：代码已实现（2026-11-02）；真实百炼账号、Keychain 授权、真机流式/用量统计验收待补。

## 1. 目标、范围与非目标

**目标**

- 语音识别只使用百炼云端，默认模型 `qwen-audio-3.1-asr-flash-streaming`。
- 手机按住说话时，桌面把 16k PCM16 实时转发到百炼，中间结果实时回显到手机与桌面浮层。
- 松手后只把最终文本插入一次；失败直接报错，不再回退本机。
- Key 只在桌面 Keychain；配置文件不出现明文。
- 桌面「模型」页配置百炼并查看按天 Token/费用统计。

**范围**

- 单厂商（阿里云百炼）、单配置、单会话。
- 流式回显 + 最终落字；不做“边识别边逐字输入目标应用”。
- 手机不直连百炼、不持有 Key、不下载模型。

**非目标**

- 多厂商、账号体系、官方账单同步。
- 云端音频/文本历史、录音文件上传、说话人分离、翻译。
- 按句追加输入（P1 评估）、VAD 锁定说话（P1）。
- 改手机采集格式：仍是 16k / mono / PCM16。

## 2. 第一性原理与取舍

1. **桌面是唯一有 Key、有音频、能落字的节点**：云端会话、Key、用量、最终插入都在桌面；手机只采集、显示、取消。
2. **云端唯一**：本机 whisper 已下线，配置、协议、UI 都不再有 `engine`/`fallback`；未配置就直接失败。
3. **流式只做可见反馈**：中间结果实时展示，但只有最终文本进入剪贴板/自动粘贴，避免重复、乱序、撤销栈污染。
4. **失败不降级**：连接/鉴权/收尾失败都回 `mic.error`/`mic.result(failed)`，不插入、不切换引擎。
5. **费用必须可解释**：每次 task-finished 的 usage 都按本机日期入账，模型页用区间切换展示今天/7/30/365；只估算，以百炼账单为准。

| 取舍 | 决定 | 理由 |
| --- | --- | --- |
| 手机直连 vs 桌面中转 | 桌面中转 | Key 不下手机；音频、日志、插入集中 |
| 流式上屏 vs 最终一次插入 | 只回显，最终一次插入 | 中间结果会改字，直接输入会重复/无法撤销 |
| 每会话新建 WS vs 复用 | 每会话新建 | 隔离/取消简单；连接耗时被音频缓冲掩盖 |
| Keychain vs 0600 文件 | Keychain | Key 比剪贴板文本更敏感；配置只存非敏感项 |
| 失败回退本机 vs 直接报错 | 直接报错 | 本机引擎已下线；避免两套识别/插入逻辑 |
| 用量存本地 vs 只读 API | 本地按天汇总 | 百炼无按日查询；本地足够回答“今天花了多少” |

## 3. 架构与数据流

```text
手机（16k PCM16，现有协议）
  │ mic.start / SK01 音频帧 / mic.stop
  ▼
桌面 axum WS 服务
  ├─ 会话开始时读 asr.json + Keychain；未配置直接 mic.error
  ├─ 云端会话：PCM 缓冲（等 task-started）→ wss 百炼 → 中间结果
  │     ├─ mic.partial（50ms 节流）→ 手机 + 桌面浮层
  │     └─ task-finished → 记用量 → mic.result（最终文本）→ 剪贴板 + Cmd+V
  └─ 模型页：asr_cloud_* 命令 + asr_usage_* 命令
```

- 手机仍按现有 `mic.start` → 音频帧 → `mic.stop` 工作；桌面把帧追加到会话 PCM 缓冲并转发给云端会话。
- 云端会话在 `task-started` 前把帧缓存在内存；收到后先补发缓存，再实时转发。
- 音频帧仍是 `SK01` 二进制；转发给百炼时去掉 28 字节头，只发 PCM16 payload。
- 会话缓冲上限 65 秒 / 2.2MB（`MAX_SESSION_BYTES`）；取消/断线即丢弃。

## 4. 会话状态机

```text
idle
 → mic.start
   → 配置/Key 检查失败 → mic.error(cloud_not_configured|cloud_key_unavailable) → idle
   → 云端：connecting（缓存音频）
        → task-started → streaming（补发 + 实时）
        → result-generated → 组装 → mic.partial
        → mic.stop(release/timeout) → finalizing（finish-task）
           → task-finished → 记用量 → insert → delivered
           → 失败/超时/空 → mic.result(failed) → error
 → cancel/background/disconnect/mic_lost → cancelled（丢弃、abort 云端）
```

- `mic.start` 时 `session_config()` 失败：直接回 `mic.error`，不建立 `ActiveMic`。
- 收尾失败：`mic.result(outcome=failed, reason=cloud_*)`；不插入。
- 最终文本为空：`empty_transcript`；仍记录 usage（百炼已计费）。
- 取消类 `mic.stop`：直接 abort 云端，不发送 `finish-task`、不插入。

## 5. 百炼 WebSocket 协议映射

### 5.1 地址与鉴权

- 默认（北京，兼容旧域名）：`wss://dashscope.aliyuncs.com/api-ws/v1/inference`。
- 新加坡：`wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference`。
- 业务空间：直接填完整 URL，例如 `wss://ws-123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`（新加坡 `ap-southeast-1`）；把 `{WorkspaceId}` 换成真实 ID。不再发送 `X-DashScope-WorkSpace`。
- 请求头：`Authorization: Bearer <API Key>`、`user-agent: Sidekick/0.1`；不传 `X-DashScope-DataInspection`。TLS 用 rustls 0.23，必须在建连前显式安装 CryptoProvider（`rustls::crypto::ring::default_provider().install_default()`）；`Cargo.toml` 直接依赖 `rustls`（`default-features=false`，features `ring`/`std`/`tls12`），不要依赖其它 crate 的 feature 合并。删除 `reqwest` 后曾因没有 provider 在 TLS 握手 panic，被误报成 `cloud_network`。
- 握手 401 → `cloud_key_invalid`；403 → `cloud_forbidden`（Key 有效但无模型/业务空间权限）；其他 HTTP 状态 → `cloud_network`。

### 5.2 run-task

```json
{
  "header": { "action": "run-task", "task_id": "<uuid>", "streaming": "duplex" },
  "payload": {
    "task_group": "audio",
    "task": "asr",
    "function": "recognition",
    "model": "qwen-audio-3.1-asr-flash-streaming",
    "parameters": {
      "format": "pcm",
      "sample_rate": 16000,
      "keep_dialect": false,
      "vad_model": "near_meeting_16k",
      "max_sentence_silence": 800,
      "heartbeat": true,
      "language_hints": ["zh"],
      "vocabulary": { "异步": 5, "剪贴板": 5 }
    },
    "input": {}
  }
}
```

- `language_hints` 为空时不传；`vocabulary` 为空时不传，非空时每项权重固定 5，最多 50 个。
- `keep_dialect=false` 表示方言转普通话；`vad_model` 默认近场，可在模型页改远场。
- 收到 `task-started` 前不得发送音频；发送的是**二进制 PCM16**，不是 JSON。

### 5.3 finish-task

```json
{
  "header": { "action": "finish-task", "task_id": "<same uuid>", "streaming": "duplex" },
  "payload": { "input": {} }
}
```

### 5.4 服务端事件

| 事件 | 处理 |
| --- | --- |
| `task-started` | 结束等待，补发缓存，进入实时转发 |
| `result-generated` | 读 `payload.output.sentence`：`text`、`sentence_id`、`sentence_end`、`heartbeat` |
| `task-finished` | 读 `payload.usage`（duration 秒→毫秒），组装最终文本，记用量，结束会话 |
| `task-failed` | 读 `header.error_code/error_message`，映射错误码 |

- `heartbeat=true` 或空文本丢弃。
- `sentence_end=false` 更新当前句；`true` 写入已定稿句表，按 `sentence_id` 升序拼接。3.1 的中间结果按 `sentence_id` **整体替换**，不要逐条追加；`sentence_begin=true` 且 `text` 为空时忽略。可见文本通过 `mic.partial` 实时回显手机，最终文本仍只插入一次。

## 6. 配置与密钥

### 6.1 配置文件

`~/Library/Application Support/Sidekick/asr.json`，`0600`，临时文件 + rename 原子写：

```json
{
  "version": 1,
  "consentCloud": { "granted": false, "at": 0 },
  "keyPresent": false,
  "keyHint": null,
  "bailian": {
    "endpoint": "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
    "model": "qwen-audio-3.1-asr-flash-streaming",
    "languageHints": ["zh"],
    "keepDialect": false,
    "vadModel": "near_meeting_16k",
    "maxSentenceSilenceMs": 800,
    "heartbeat": true,
    "vocabulary": []
  }
}
```

- 只有 `{version, consentCloud, keyPresent, keyHint, bailian}`；旧版 `engine` / `fallbackToLocal` 字段会被忽略。
- `keyPresent` 只表示是否保存过 Key，`keyHint` 是掩码尾号，用于状态展示，避免每次读 Keychain。
- 读取失败/坏 JSON 用默认值并打日志，不阻断启动。
- 配置里**没有 Key**；Key 只存 Keychain。

### 6.2 Keychain

- Service `dev.sidekick.app.asr.bailian`；Account `default`；macOS 登录钥匙串，不是 Sidekick 文件/服务器。读取时机：打开模型页/`asr_cloud_status()` **不读**，只用 `keyPresent`/`keyHint`；保存新 Key/清除 Key、测试连接（无临时 Key）、真正录音建会话才读，因此开页不弹密码。
- 使用 `security-framework`；进程内缓存一次，写/删时失效。开发版重编译签名变化可能再次弹 macOS 授权；读取失败回 `cloud_key_unavailable`，不落明文。
- 跨平台：当前仅 macOS；Windows/Linux 的 `asr_keychain` 是报错占位，需接 Credential Manager / libsecret（或跨平台 keyring）后才支持；桌面目前只发 macOS。

### 6.3 地址解析

- `https://` 自动转 `wss://`，`http://` 转 `ws://`；缺路径补 `/api-ws/v1/inference`；无 scheme 补 `wss://`。
- 服务地址需是完整 URL；用业务空间专属域名时，用户自己把 `{WorkspaceId}` 换成真实 ID。代码检测到未替换的 `{WorkspaceId}`/`{workspaceId}` → 报“请填写完整服务地址…”。
- 非 localhost 的 `ws://` 拒绝；空地址/空模型拒绝。

## 7. Tauri 命令与前端契约

| 命令 | 说明 |
| --- | --- |
| `asr_cloud_status()` | 是否配置/已保存 Key、同意、完整 `BailianConfig`；内部用 `keyPresent`/`keyHint` 元数据，不读 Keychain、不含完整 Key；对外字段名仍为 `hasKey`/`keyMasked` |
| `asr_cloud_save({ input })` | `{ config, consent, apiKey?, clearKey? }`；先写 Keychain 再原子写配置，失败回滚 Key |
| `asr_cloud_test({ config, apiKey? })` | 草稿或已存配置握手 + 320ms 静音测试；返回 `{ok, latencyMs, model, errorCode, message}` |
| `asr_cloud_clear()` | 删除 Key、重置配置 |
| `asr_usage_stats()` | 今天/7/30/365 汇总 + 最近 365 天 `days` + `priceNote` |
| `asr_usage_clear()` | 把 `asr_usage.json` 重置为空汇总并返回空统计 |

- 前端类型在 `app/src/shared/lib/tauri.ts`：`CloudAsrConfig`、`CloudAsrStatus`、`CloudAsrSaveInput`、`CloudAsrTestResult`、`UsageStats`/`UsageSummary`/`UsageDay`。
- 保存顺序：先记住旧 Key，再写 Keychain（新 Key/清除），最后原子写 `asr.json`；配置落盘失败会用旧 Key 回滚。回滚也失败时错误信息同时说明配置错误与回滚错误。
- 测试连接不发送真人音频、不保存草稿。

## 8. 文本组装、去重与截断

- 已定稿句按 `sentence_id` 存入 `BTreeMap`；重复 id 覆盖为最后一次，不重复拼接。
- 当前句 `sentence_end=false` 只在未定稿时追加到可见文本末尾。
- `visible_text = 已定稿句按 id 升序 + 当前句`；`mic.partial` 直接发完整可见文本，客户端整体替换。
- `task-finished` 时用同一可见文本作为最终文本；换行转空格、压缩空白、最多 2000 字，沿用 `transcript::normalize_transcript`。
- 最终文本为空 → `empty_transcript`；仍记录 usage。

## 9. 用量与费用统计

- 文件：`~/Library/Application Support/Sidekick/asr_usage.json`，`0600`，原子写；只存每日汇总，不存文本/Key/音频。
- 每次 `task-finished` 拿到 `usage` 后**先记账**，再插入；即使插入失败/空结果也计费。`total_tokens` 取 `total_tokens` 与 `input+output` 的较大值；全零且无时长则跳过。
- 按本机时区（`chrono::Local`）切天；最多保留 400 天，超出删最旧。
- `UsageStats`：`today` / `last7Days` / `last30Days` / `last365Days` 汇总 + `days`（最近 365 天，今天起倒序，缺失补 0）+ `priceNote`。
- 模型页区间切换：今天（无明细）、近 7 天（7 行）、近 1 个月（30 行）、近 1 年（按自然月约 12 行）；只展示当前区间一张汇总卡。
- 金额：人民币微元（1 元 = 1,000,000）；按 endpoint 判断地域：
  - 北京：输入 ¥6/百万、输出 ¥4.5/百万 → 6,000,000 / 4,500,000 微元。
  - 新加坡（含 `dashscope-intl` / `ap-southeast-1` / `singapore`）：输入 ¥6.781/百万、输出 ¥5.104/百万 → 6,781,000 / 5,104,000 微元。
  - 自定义/未知地址按北京估算；`priceNote` 固定说明“估算，以百炼账单为准”。
- 清空统计只把 `asr_usage.json` 重写为空汇总（文件保留），不影响 `asr.json`/Keychain。

## 10. 超时、背压与失败

| 项 | 值 |
| --- | --- |
| 连接超时 | 5s |
| `task-started` 等待 | 3s |
| `finish-task` 收尾 | 8s |
| `CloudHandle::wait` | 9s |
| 测试连接收尾 | 5s |
| 会话缓冲 | 65s / 2.2MB |

- 云端转发队列无界，但音频总量受会话缓冲上限约束；写失败/连接关闭 → `cloud_network`。
- 失败不降级：`mic.result(failed)` 或 `mic.error`；不插入、不重试、不切换引擎。
- 取消/断线立即 abort 云端；不补发。

## 11. 错误码与文案

| 代码 | 含义 | 用户文案 |
| --- | --- | --- |
| `cloud_not_configured` | 未同意/地址或 Key 缺失 | 云端还没配置，去电脑「模型」页填百炼地址和 API Key。 |
| `cloud_key_invalid` | 握手 401，或 task-failed 的鉴权错误 | 百炼 API Key 无效或已过期，去电脑「模型」页重新保存。 |
| `cloud_forbidden` | 握手 403，或 task-failed 的 code 含 forbidden/permission/accessdenied | 这个 Key 没有该模型或业务空间的权限。 |
| `cloud_rate_limited` | 429/限流 | 百炼限流了，稍等一会儿再说。 |
| `cloud_quota_exceeded` | 额度不足 | 百炼额度不足，去控制台检查。 |
| `cloud_model_not_found` | 模型不存在/地域不可用 | 模型不存在，或当前地域不可用。 |
| `cloud_network` | DNS/TLS/断网/写失败 | 连不上百炼，检查电脑网络。 |
| `cloud_timeout` | 连接/等待/收尾超时 | 百炼响应超时，这段没转完。 |
| `cloud_task_failed` | 其他 task-failed | 百炼识别失败，再说一次试试。 |
| `cloud_internal` | 云端任务 panic/异常结束 | 云端会话异常结束，请重启 Sidekick 再试。 |
| `cloud_key_unavailable` | Keychain 读取失败 | 读取不到电脑上保存的密钥，去「模型」页重新保存。 |
| `cloud_cancelled` | 内部取消（不面向用户） | 已取消 |

- 错误文案集中在 `app/src/shared/lib/mic-status-copy.ts`。
- 模型页测试连接直接显示 `errorCode` + 中文原因。

## 12. 隐私与安全

- 语音识别只走百炼；使用前必须在模型页勾选“录音会发送到阿里云百炼”。
- 音频从电脑直达用户配置的百炼地域，不经过 Sidekick 服务器；不落盘、不写历史。
- Key 只在 Keychain；配置、日志、状态接口、手机端都没有完整 Key。
- 日志只记模型/连接耗时/首条 partial/收尾耗时/字节数/tokens/错误码；不记文本、音频、Key。
- 取消/断线立即 abort 云端；不补发、不重试。
- 用量文件只存每日数字，不含文本/Key/音频。

## 13. 模型页（桌面）

桌面主导航「AI 联动」之后的「模型」页：上半部分百炼配置，下半部分用量统计；设置 Sheet 只保留自动输入权限与剪贴板。字段、统计口径与展示格式见 [asr-model.md](./asr-model.md)。

## 14. 测试与验收

- Rust 单测：载荷/地址解析/句子组装/usage/错误映射/价格换算/区间汇总/365 天补零/400 天裁剪。
- Rust 集成：mock WS 断言 partial、最终文本、`task-started` 前不发音频、usage 入账。
- 手工/验收：正确/错误 Key、业务空间完整 URL/占位符、断网、Keychain 拒绝、取消、60 秒、统计清空、跨天；见 [ACCEPTANCE.md](../prd/mic/ACCEPTANCE.md) 的 CLOUD-1..12 与 MODEL-1..11。
- 指标：首条 partial 延迟、松手→插入 p95、失败率、单次 tokens/费用；只本地记录。

## 15. 风险与未验证

| 风险/待验证 | 影响 | 应对 |
| --- | --- | --- |
| 旧域名/业务空间域名支持 | 默认配置不可用 | 用真实 Key 验证；业务空间直接粘贴完整 URL |
| Keychain 授权/拒绝、保存失败 | 开发体验/半更新 | 失败提示重新保存；配置失败回滚旧 Key |
| 用量估算与账单不一致 | 费用误读 | `priceNote` 明示估算，以账单为准 |

## 16. 代码映射

核心：`asr_config.rs`、`asr_keychain.rs`、`asr_cloud.rs`、`bailian_asr.rs`、`asr_usage.rs`、`asr_pricing.rs`、`desktop_server.rs`、`desktop_mic.rs`、`transcript.rs`；桌面模型页在 `desktop/features/models`，协议在 `protocol/messages.ts` 与 `shared/lib/tauri.ts`。

外部参考：[模型页](https://www.alibabacloud.com/help/zh/model-studio/qwen-audio-3-1-asr-flash-streaming)、[WebSocket 接入指南](https://www.alibabacloud.com/help/zh/model-studio/qwen-audio-asr-streaming-websocket-api)、[客户端事件](https://www.alibabacloud.com/help/zh/model-studio/qwen-audio-asr-streaming-client-events)、[服务端事件](https://www.alibabacloud.com/help/zh/model-studio/qwen-audio-asr-streaming-server-events)。
