---
doc: engineering/asr-cloud-bailian
title: 百炼云端流式语音识别方案
status: active
updated: 2026-11-02
load: on-demand
owner: engineering
---

# 百炼云端流式语音识别方案

> 回答“云端识别怎么接、音频怎么走、Key 放哪、失败怎么办”。产品规则见 [mic PRD](../prd/mic/PRD.md)，本机模型见 [asr-model.md](./asr-model.md)，协议字段见 [protocol-audio.md](./protocol-audio.md)。
> 状态：代码已实现（2026-11-02）；真实百炼账号、Keychain 授权、真机流式/回退验收待补。

## 1. 目标、范围与非目标

**目标**

- 桌面设置可选百炼云端引擎，默认模型 `qwen-audio-3.1-asr-flash-streaming`。
- 手机按住说话时，桌面把 16k PCM16 实时转发到百炼，中间结果实时回显到手机与桌面浮层。
- 松手后只把最终文本插入一次；云端失败可用本机 whisper 兜底。
- Key 只在桌面 Keychain；配置文件不出现明文。

**范围**

- 单厂商（阿里云百炼）、单配置、单会话。
- 流式回显 + 最终落字；不做“边识别边逐字输入目标应用”。
- 手机不直连百炼、不持有 Key、不下载云端模型。

**非目标**

- 多厂商、账号体系、计费面板、配额管理。
- 云端音频/文本历史、录音文件上传、说话人分离、翻译。
- 按句追加输入（P1 评估）、VAD 锁定说话（P1）。
- 改手机采集格式：仍是 16k / mono / PCM16。

## 2. 第一性原理与取舍

1. **桌面是唯一有 Key、有音频、能落字的节点**：云端会话、Key、最终插入都在桌面；手机只采集、显示、取消。
2. **引擎可替换**：本机 whisper 与百炼是同一会话的两种引擎；协议与手机 UI 不感知厂商细节。
3. **流式只做可见反馈**：中间结果实时展示，但只有最终文本进入剪贴板/自动粘贴，避免重复、乱序、撤销栈污染。
4. **失败只降一次**：云端失败用已缓存 PCM 跑本机；结果标注来源，绝不插入两次。
5. **默认本机、云端显式开启**：沿用产品原则 P5；必须勾选隐私同意后才能启用云端。

| 取舍 | 决定 | 理由 |
| --- | --- | --- |
| 手机直连 vs 桌面中转 | 桌面中转 | Key 不下手机；降级/日志/插入集中 |
| 流式上屏 vs 最终一次插入 | 只回显，最终一次插入 | 中间结果会改字，直接输入会重复/无法撤销 |
| 每会话新建 WS vs 复用 | v1 每会话新建 | 隔离/取消简单；连接耗时被音频缓冲掩盖 |
| Keychain vs 0600 文件 | Keychain | Key 比剪贴板文本更敏感；配置只存非敏感项 |
| 默认引擎 | 本机 | 隐私原则；云端需用户显式启用 |
| 云端失败 | 默认回退本机（可关） | 一次可用优先；结果标注来源 |

## 3. 架构与数据流

```text
手机（16k PCM16，现有协议）
  │ mic.start / SK01 音频帧 / mic.stop
  ▼
桌面 axum WS 服务
  ├─ 引擎路由（会话开始时快照配置）
  ├─ 本机：PCM 缓冲 → whisper-rs → 文本
  └─ 百炼：PCM 缓冲（等 task-started）→ wss 百炼 → 中间结果
        ├─ mic.partial（50ms 节流）→ 手机 + 桌面浮层
        └─ mic.result（最终文本）→ 剪贴板 + Cmd+V + 手机结果卡
```

- 手机仍按现有 `mic.start` → 音频帧 → `mic.stop` 工作；桌面 `handle_audio_frame` 同时把帧追加到会话 PCM 缓冲（供回退）并转发给云端会话。
- 云端会话在 `task-started` 前把帧缓存在内存；收到后先补发缓存，再实时转发。
- 音频帧仍是 `SK01` 二进制；转发给百炼时去掉 28 字节头，只发 PCM16 payload。
- 桌面 PCM 缓冲上限 65 秒 / 2.2MB（沿用现有 `MAX_SESSION_BYTES`）；云端转发队列无额外持久化，取消/断线即丢弃。

## 4. 会话状态机

```text
idle
 → mic.start
   → 选引擎
     ├─ bailian：connecting（缓存音频）
     │    → task-started → streaming（补发 + 实时）
     │    → result-generated → 组装 → mic.partial
     │    → mic.stop(release/timeout) → finalizing（finish-task）
     │       → task-finished → insert → delivered
     │       → 失败/超时/空 → fallback-local（若有）→ delivered(local)
     └─ local：buffering → mic.stop → processing → insert → delivered
 → cancel/background/disconnect/mic_lost → cancelled（丢弃、关闭云端）
```

- 云端配置在 `mic.start` 时不可用且本机可用：直接走本机，`mic.ready.engine=local`，结果 `fallback=true`。
- 云端可用但收尾失败：用同一份 PCM 跑本机；结果 `engine=local`、`fallback=true`。
- 取消类 `mic.stop`：直接 abort 云端，不发送 `finish-task`、不插入。

## 5. 百炼 WebSocket 协议映射

### 5.1 地址与鉴权

- 默认（北京，兼容旧域名）：`wss://dashscope.aliyuncs.com/api-ws/v1/inference`。
- 新加坡：`wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference`。
- 业务空间：`wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`（新加坡为 `ap-southeast-1`）；填写 Workspace ID 时同时发送 `X-DashScope-WorkSpace`。
- 请求头：`Authorization: Bearer <API Key>`、`user-agent: Sidekick/0.1`；不传 `X-DashScope-DataInspection`。
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
- `keep_dialect=false` 表示方言转普通话；`vad_model` 默认近场，可在设置改远场。
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
| `task-finished` | 读 `payload.usage`，组装最终文本，结束会话 |
| `task-failed` | 读 `header.error_code/error_message`，映射错误码 |

- `heartbeat=true` 或空文本丢弃。
- `sentence_end=false` 更新当前句；`true` 写入已定稿句表，按 `sentence_id` 升序拼接。
- `usage`：`input_tokens` / `output_tokens` / `total_tokens` / `duration`（秒，转毫秒）。

## 6. 配置与密钥

### 6.1 配置文件

`~/Library/Application Support/Sidekick/asr.json`，`0600`，临时文件 + rename 原子写：

```json
{
  "version": 1,
  "engine": "local",
  "consentCloud": { "granted": false, "at": 0 },
  "fallbackToLocal": true,
  "bailian": {
    "endpoint": "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
    "workspaceId": "",
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

- `engine`：`local` / `bailian`；默认 `local`。
- 读取失败/坏 JSON 用默认值并打日志，不阻断本机。
- 配置里**没有 Key**；Key 只存 Keychain。

### 6.2 Keychain

- Service `dev.sidekick.app.asr.bailian`；Account `default`。
- 使用 `security-framework` 的 `passwords::{set,get,delete}_generic_password`；进程内缓存一次，保存/清除时失效。
- 开发版重编译可能触发 macOS 重新授权提示；读取失败回 `cloud_key_unavailable`，不落明文。

### 6.3 地址解析

- `https://` 自动转 `wss://`，`http://` 转 `ws://`；缺路径补 `/api-ws/v1/inference`；无 scheme 补 `wss://`。
- `{WorkspaceId}` / `{workspaceId}` 占位符必须被业务空间 ID 替换。
- 非 localhost 的 `ws://` 拒绝；空地址/空模型拒绝。
- 业务空间 ID 只允许字母、数字、`-`、`_`。

## 7. Tauri 命令与前端契约

| 命令 | 说明 |
| --- | --- |
| `asr_cloud_status()` | 引擎、是否配置/有 Key/掩码、同意、回退、本机可用、完整 `BailianConfig`；不含完整 Key |
| `asr_cloud_save({ input })` | `{ config, consent, fallbackToLocal, apiKey?, clearKey? }`；先写 Keychain 再原子写配置 |
| `asr_cloud_test({ config, apiKey? })` | 草稿或已存配置握手 + 320ms 静音测试；返回 `{ok, latencyMs, model, errorCode, message}` |
| `asr_engine_select({ engine })` | 切 `local` / `bailian`；云端需配置完整且已同意 |
| `asr_cloud_clear()` | 删除 Key、重置云端配置、切回本机 |

- 前端类型在 `app/src/shared/lib/tauri.ts`：`CloudAsrEngine`、`CloudAsrConfig`、`CloudAsrStatus`、`CloudAsrSaveInput`、`CloudAsrTestResult`。
- 保存顺序：先记住旧 Key，再写 Keychain（新 Key/清除），最后原子写 `asr.json`；配置落盘失败会用旧 Key 回滚。极端情况下回滚也失败，错误信息会同时说明配置错误与回滚错误。测试连接不发送真人音频、不保存草稿。

## 8. 文本组装、去重与截断

- 已定稿句按 `sentence_id` 存入 `BTreeMap`；重复 id 覆盖为最后一次，不重复拼接。
- 当前句 `sentence_end=false` 只在未定稿时追加到可见文本末尾。
- `visible_text = 已定稿句按 id 升序 + 当前句`；`mic.partial` 直接发完整可见文本，客户端整体替换。
- `task-finished` 时用同一可见文本作为最终文本；换行转空格、压缩空白、最多 2000 字，沿用 `normalize_transcript`。
- 最终文本为空 → `empty_transcript`；开启回退且本机可用时改跑本机。

## 9. 超时、背压与降级

| 项 | 值 |
| --- | --- |
| 连接超时 | 5s |
| `task-started` 等待 | 3s |
| `finish-task` 收尾 | 8s |
| `CloudHandle::wait` | 9s |
| 测试连接收尾 | 5s |
| 本机转写超时 | 10s（沿用） |
| 会话缓冲 | 65s / 2.2MB |

- 云端转发队列无界，但音频总量受桌面会话缓冲上限约束；写失败/连接关闭 → `cloud_network`，走回退。
- 降级触发：未配置、握手失败、`task-started` 超时、WS 断开、`task-failed`、收尾超时、最终结果为空。
- 降级只在会话结束前发生一次；结果 `engine=local`、`fallback=true`；本机不可用则 `failed`，不插入。

## 10. 错误码与文案

| 代码 | 含义 | 用户文案 |
| --- | --- | --- |
| `cloud_not_configured` | 未启用/未同意/地址或 Key 缺失 | 云端还没配置，去电脑设置 → 语音识别填百炼地址和 API Key。 |
| `cloud_key_invalid` | 握手 401，或 task-failed 的鉴权错误 | 百炼 API Key 无效或已过期，去电脑设置重新保存。 |
| `cloud_forbidden` | 握手 403，或 task-failed 的 code 含 forbidden/permission/accessdenied | 这个 Key 没有该模型或业务空间的权限。 |
| `cloud_rate_limited` | 429/限流 | 百炼限流了，稍等一会儿再说。 |
| `cloud_quota_exceeded` | 额度不足 | 百炼额度不足，去控制台检查。 |
| `cloud_model_not_found` | 模型不存在/地域不可用 | 模型不存在，或当前地域不可用。 |
| `cloud_network` | DNS/TLS/断网/写失败 | 连不上百炼，检查电脑网络。 |
| `cloud_timeout` | 连接/等待/收尾超时 | 百炼响应超时，这段没转完。 |
| `cloud_task_failed` | 其他 task-failed | 百炼识别失败，再说一次试试。 |
| `cloud_key_unavailable` | Keychain 读取失败 | 读取不到电脑上保存的密钥，去设置重新保存。 |
| `cloud_cancelled` | 内部取消（不面向用户） | 已取消 |

- `mic.result.fallback=true` 时手机/桌面追加“云端不可用，已用本机转写。”；不算失败。
- 错误文案集中在 `app/src/shared/lib/mic-status-copy.ts`。

## 11. 隐私与安全

- 默认本机；启用云端前必须勾选“录音会发送到阿里云百炼”的同意。
- 音频从电脑直达用户配置的百炼地域，不经过 Sidekick 服务器；不落盘、不写历史。
- Key 只在 Keychain；配置、日志、状态接口、手机端都没有完整 Key。
- 日志只记引擎/模型/连接耗时/首条 partial/收尾耗时/字节数/tokens/错误码；不记文本、音频、Key。
- 取消/断线立即 abort 云端；不补发、不重试。
- 切换回本机后不再产生云端请求。

## 12. 测试与验收

- Rust 单测：`run-task`/`finish-task` 载荷、地址解析、句子组装/去重、usage 解析、错误映射、Keychain 常量、配置归一化。
- Rust 集成：本地 mock WebSocket 服务模拟 `task-started`/`result-generated`/`task-finished`，断言 partial 广播与最终文本；断言 `task-started` 前不发音频。
- 手工：正确/错误 Key、无 Workspace、业务空间域名、断网、Keychain 拒绝、取消、60 秒、连续 10 次、回退。
- 验收：见 [ACCEPTANCE.md](../prd/mic/ACCEPTANCE.md) 的 CLOUD-1..12。
- 指标：首条 partial 延迟、松手→插入 p95、云端失败率、回退成功率、单次 tokens/时长；只本地记录。

## 13. 风险与未验证

| 风险/待验证 | 影响 | 应对 |
| --- | --- | --- |
| 旧域名是否支持该模型（官方建议业务空间域名） | 默认配置不可用 | 设置页支持业务空间模板；Phase 0 用真实 Key 验证后决定默认值 |
| 输出是否稳定简体中文 | 用户要求简体 | `language_hints=["zh"]` + `keep_dialect=false`；真实语音验收 |
| Keychain 在 dev 重编译后弹授权/拒绝 | 开发体验 | 文档说明；失败给“重新保存”，不落明文 |
| 保存配置失败时 Key 已更新 | 半更新 | 已实现旧 Key 回滚；回滚失败会在错误里说明 |
| 公网/VPN/代理不可达 | 连接失败 | 自定义地址；错误文案；本机回退 |
| 云端准确率/长音频收尾 | 体验 | 30 句测试集；8s 收尾 + 回退 |
| 流式事件重复/乱序 | 文本重复 | sentence_id 去重 + `rev` 守卫 + 只插入一次 |
| 多厂商/多业务空间 | 当前不支持 | v1 单配置；后续按 provider/account 扩展 |

## 14. 代码映射

| 位置 | 职责 |
| --- | --- |
| `app/src-tauri/src/asr_config.rs` | `asr.json` 读写/归一化/校验/地址解析/掩码 |
| `app/src-tauri/src/asr_keychain.rs` | macOS Keychain 存取/删除 |
| `app/src-tauri/src/asr_cloud.rs` | 配置状态、Key 缓存、5 个 Tauri 命令、测试连接 |
| `app/src-tauri/src/bailian_asr.rs` | WebSocket 会话、run-task/finish-task、事件解析、句子组装、partial 广播、probe |
| `app/src-tauri/src/desktop_server.rs` | 引擎路由、帧转发/缓冲、`mic.ready`/`mic.partial`/`mic.result`、回退 |
| `app/src-tauri/src/desktop_mic.rs` | `insert_transcript` 共用落字路径（本机/云端/回退） |
| `app/src/protocol/messages.ts` | `MicPartialMessage`、`MicEngine`、`MicUsage`、`mic.ready/result` 可选字段 |
| `app/src/shared/lib/tauri.ts` | `CloudAsr*` 类型与命令绑定 |
| 桌面 `desktop/features/settings` | 语音识别设置页（引擎切换、云端表单、测试/保存） |
| 桌面 `desktop/features/mic-receiver` | 实时文本/来源徽标/回退提示 |
| 手机 `mobile/features/mic` | 录音卡实时文本、来源徽标、结果卡回退说明 |

外部参考：[模型页](https://www.alibabacloud.com/help/zh/model-studio/qwen-audio-3-1-asr-flash-streaming)、[WebSocket 接入指南](https://www.alibabacloud.com/help/zh/model-studio/qwen-audio-asr-streaming-websocket-api)、[客户端事件](https://www.alibabacloud.com/help/zh/model-studio/qwen-audio-asr-streaming-client-events)、[服务端事件](https://www.alibabacloud.com/help/zh/model-studio/qwen-audio-asr-streaming-server-events)。
