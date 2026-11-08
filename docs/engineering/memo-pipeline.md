---
doc: engineering/memo-pipeline
title: 语音备忘录技术方案（手机独立 AI 管道 + 局域网镜像）
status: active
updated: 2026-11-08
load: on-demand
owner: engineering
children: []
related:
  - ../prd/memo/PRD.md
  - ../prd/memo/SPEC.md
  - protocol-audio.md
  - asr-cloud-bailian.md
  - ../decisions.md
---

# 语音备忘录技术方案

> 回答「怎么实现」。产品规则见 [PRD](../prd/memo/PRD.md)，界面见 [SPEC](../prd/memo/SPEC.md)。
> 结论先行：**手机是主设备**（录音 + 转写 + 结构化 + 本地库），电脑只在同一局域网做只读镜像。不改现有 `mic.*` 语音输入链路。

## 1. 边界与关键决定

| 决定 | 内容 | 原因 |
| --- | --- | --- |
| 采集 | MVP：WebView `getUserMedia` + ScriptProcessor（仅前台）；P1 再换原生 `AudioRecord` + 前台服务 | 不做后台录音就不需要原生层；先复用现有麦克风链路，降低风险（D118） |
| 编码 | 16k mono PCM16 WAV（32KB/s，约 115MB/小时） | MVP 不引入编码/解码依赖；P2 再评估 AAC/Opus 与压缩 |
| 后台录音 | 暂缓（P1）：原生采集 + 前台服务 + 通知 | 用户明确降级，先不做（D118） |
| 转写 | 手机直连百炼，分段（5 分钟）流式 | 不依赖电脑；文件转写要 OSS 公网 URL，成本高 |
| 结构化 | 百炼兼容模式 Chat Completions（默认 qwen-plus），JSON 输出 | 与 ASR 共用 Key，成本低 |
| 存储 | 手机 SQLite + App 私有音频目录；桌面镜像 SQLite | 离线可用；音频不进 BLOB |
| 同步 | 桌面为镜像、手机为所有者（单写者）；仅局域网 | 无账号、无公网；单写者免冲突 |
| 鉴权 | 同步前设备配对换 token，消息定向下发；Key 下发用一次性配对码 | 现有 WS 无鉴权、广播 |
| 不改动 | `mic.*` / `protocol-audio.md` / 语音输入 UI | 两条链路独立，互不影响 |

## 2. 手机端结构

```text
WebView UI（React，src/mobile/features/memo）
   │ invoke / event "memo"
Rust core（src-tauri/src/memo/）
   ├─ types.rs / wav.rs / db.rs / storage.rs   共享（两端都编）
   ├─ mobile/mod.rs                            状态 + Tauri 命令
   ├─ mobile/recording.rs                      录音分片 → WAV、崩溃恢复
   ├─ mobile/cloud.rs                          百炼 WS 分段转写
   ├─ mobile/llm.rs                            qwen-plus 结构化（webpki rustls）
   ├─ mobile/pipeline.rs                       单飞队列 + 状态机
   ├─ mobile/keys.rs                           secure.json（Key/token）
   ├─ mobile/sync.rs                           hello/push/SK02/commit
   ├─ desktop/mod.rs                           配对码、镜像库、定向回包
   └─ ../memo_protocol.rs                      SK02 帧编解码
   │
桌面 WS 服务（desktop_server.rs）：per-client 定向发送 + memo.* 路由
P1 预留：MemoRecorderService（ForegroundService + AudioRecord）+ Keystore
```

- MVP 录音在 WebView：复用现有 `getUserMedia` + ScriptProcessor，PCM 分片经 Tauri 命令交给 Rust 写 WAV；不做前台服务、不做常驻通知。
- 锁屏/后台录音（P1）：Kotlin `MemoRecorderService` + `AudioRecord` 替换采集层，管道与 UI 不变（见 §3.6）。
- 前端只通过 Tauri 命令读数据、控制录音、看状态；**不直接碰文件与 SQL**。
- Rust 侧不依赖 `tauri-plugin-fs`：App 私有目录用 `app_data_dir()` 拿到路径即可。

## 3. 录音可靠性（MVP：仅前台）

1. **仅前台**：录音期间调用现有 `set_keep_screen_on(true)` 保持屏幕常亮；切后台、锁屏、按返回都触发 `visibilitychange` / 页面卸载 → 停止并保存；不做前台服务与常驻通知（P1）。
2. **分片写盘**：WebView 每 30 秒把累积 PCM 交给 Rust，追加到 `tmp/<memoId>.part`；停止时回填 WAV header 并 rename；崩溃后扫描 `.part` 恢复。
3. **状态在磁盘**：`recording.json`（会话 id、开始时间、已写字节、状态）每次分片更新；启动时据此恢复。
4. **麦克风被抢占**：`track.onended` / AudioContext 异常 → 停止、写盘、提示；不自动恢复。
5. **上限**：2 小时自动停止；WAV 约 115MB/小时，设置页显示占用（P2 再压缩）。
6. **P1 预留（暂缓）**：原生 `AudioRecord` + `foregroundServiceType="microphone"` + 常驻通知 + partial wake lock + OEM 电池白名单引导；麦克风焦点丢失处理；真机 30/60/120 分钟温升与电量。进 P1 时只替换采集层，管道与 UI 不变。

## 4. 处理管道

### 4.1 队列

- 录音结束（或恢复）后创建任务：`memo_id` + 分段列表 + 状态。
- 单并发：一次只处理一条备忘录，按分段顺序；失败段记录 `failed_segment`，重试从该段继续。
- 任务持久化在 SQLite；App 重启后扫描 `pending/transcribing/structuring` 继续。
- 网络判断：录音结束先试连一次；无网直接 `offline`，监听网络回调（Android `ConnectivityManager` 或 30s 轮询）。

### 4.2 ASR

- 每段 5 分钟 PCM16 16k → 百炼 WebSocket（`run-task` / 二进制 PCM / `finish-task`），复用 [asr-cloud-bailian.md](./asr-cloud-bailian.md) 的消息格式与错误码。
- 手机端需要 TLS：`tokio-tungstenite` 的移动目标当前只开 `connect`，**必须加 `rustls-tls-native-roots`**，并在启动时安装 `ring` provider（与桌面 `tls.rs` 同做法）。
- 依赖固定官方域名；手机不允许填地址（防 Key 重定向）。
- 断线重试：单段最多重试 1 次，仍失败标红；不重发已完成段。
- 用量：每段 usage 累加到本地 `memo_usage`（时长/Token），设置页可看；与桌面 `asr_usage.json` 不混。

### 4.3 LLM 结构化

- Endpoint：百炼兼容模式 `POST /compatible-mode/v1/chat/completions`；模型默认 `qwen-plus`，可在设置切换（白名单 2–3 个）。
- 输入：转写全文（超长按 8k 字截断，保留首尾）+ 用户已有类型分布（可选）。
- System prompt 要求只输出 JSON：`{title, type, summary, todos[], tags[]}`，字段长度约束；温度 0.2。
- 校验：JSON 解析失败 → 重试 1 次（提示词加「只输出 JSON」）→ 仍失败则 `type=memo`、标题取首句、摘要空。
- 超时 20s；失败保留转写，状态 `done` 但 `ai_status=failed`，详情显示「重新整理」。
- 成本：一次结构化约 1–3k Token，按 qwen-plus 价格可忽略；不做流式。

## 5. 本地数据

### 5.1 目录

```text
<app files>/memo/
  ├─ audio/<memoId>.wav                # 合并后 WAV（MVP，P2 再压缩）
  ├─ tmp/<memoId>.part                 # 写入中（停止时回填 header + rename）
  ├─ tmp/recording.json                # 崩溃恢复标记（id / startedAt / bytes）
  ├─ secure.json                       # Key + token + deviceId（0600，MVP）
  └─ sidekick.db                       # SQLite
```

桌面：`~/.sidekick/sidekick.db`、`~/.sidekick/memos/audio/<id>.wav`、`~/.sidekick/memo_devices.json`（只存 token 的 sha256，0600）。桌面 UI 是独立一级页「备忘录 ⌘3」（D123，`app/src/desktop/pages/memo-page.tsx`），剪贴板页不再承载备忘录分段。

### 5.2 Schema（v1）

```sql
CREATE TABLE memos (
  id TEXT PRIMARY KEY,            -- UUIDv7，手机生成
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  type TEXT NOT NULL,             -- memo|todo|idea
  title TEXT NOT NULL,
  summary TEXT,
  todos_json TEXT,
  tags_json TEXT,
  transcript TEXT,
  duration_ms INTEGER NOT NULL,
  audio_path TEXT,
  audio_bytes INTEGER,
  audio_sha256 TEXT,
  status TEXT NOT NULL,           -- pending|transcribing|structuring|done|failed|offline
  ai_status TEXT,                 -- ok|failed|skipped
  failed_segment INTEGER,
  last_error TEXT,
  segment_total INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,             -- 墓碑（同步用）
  synced_at INTEGER,              -- 电脑确认时间；编辑/删除会清空以便重推
  rev INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE memo_segments (memo_id TEXT, idx INTEGER, text TEXT, status TEXT, PRIMARY KEY(memo_id, idx));
CREATE TABLE memo_kv (key TEXT PRIMARY KEY, value TEXT);  -- 预留键值（当前未用）
CREATE INDEX memos_created ON memos(created_at DESC);
```

- `PRAGMA journal_mode=WAL`、`user_version=1`；建表用 `CREATE TABLE IF NOT EXISTS`，后续迁移按版本追加。
- rusqlite 是阻塞式：命令层用 `spawn_blocking`，**不在 axum/tokio 运行时里直接做长写**。
- 音频文件与行同事务语义：先写文件成功再插行；删除先删行再删文件（失败留孤儿，启动时清理）。

## 6. Key 下发与存储（已实现）

1. 桌面「语音 › 手机备忘录」生成 6 位一次性码（`memo_pair_code_create`，2 分钟、错 3 次作废，只存内存）。
2. 手机设置页输入码 → `memo.pair.request {code, deviceId, deviceName}`；桌面校验后**定向**回 `memo.pair.result {ok, token, key}`。配对与取 Key 合一，不需要单独的「发送 Key」步骤。
3. **MVP 存储偏差**：手机把 `apiKey + deviceId + token` 存 App 私有目录 `memo/secure.json`（0600、Android 沙箱 + FBE），**没有上 Keystore**。Keystore 需要往 `gen/android` 注入 Kotlin（每次 `android init` 都要 patch），风险大于收益，列 P1；代码集中在 `memo/mobile/keys.rs`，升级只换这一层。
4. 手动粘贴兜底：同一文件、同一掩码展示；清除只删本机 Key，不远程擦除。
5. 传输仍是局域网明文 WS：一次性码 + 定向发送 + 2 分钟/3 次限制；token 只用于同步鉴权，不做连接层握手。

## 7. 局域网镜像同步

### 7.1 角色与规则

- 手机 = 所有者：创建/编辑/删除都只发生在手机；桌面 = 只读镜像。
- 单写者 → 无内容冲突；同步只需「手机推、电脑收」。
- 设备配对：电脑生成 6 位一次性码，手机输入 → 双方保存 `deviceId + token`；之后连接上用 `memo.hello` 出示 token，桌面只接受已配对连接的 `memo.*` 写入。
- 心跳：**MVP 没做**（沿用现有 WS 的 FIN/RST 断连检测）；断线不阻塞本机功能，回网/回前台重跑同步。

### 7.2 消息（已实现，详见 `protocol/README.md`）

```json
{ "type": "memo.pair.request", "code": "123456", "deviceId": "…", "deviceName": "Realme" }
{ "type": "memo.pair.result", "ok": true, "token": "…", "key": "sk-…" }
{ "type": "memo.hello", "deviceId": "…", "token": "…" }
{ "type": "memo.hello.ack", "ok": true }
{ "type": "memo.push", "memos": [ { "id": "…", "rev": 3, "type": "todo", "title": "…", "durationMs": 42000, "audioBytes": 12345, "audioSha256": "…", "createdAt": 1730000000000, "deletedAt": null } ] }
{ "type": "memo.push.ack", "ids": ["…"] }
{ "type": "memo.audio.begin", "memoId": "…", "bytes": 12345, "sha256": "…" }
{ "type": "memo.audio.begin.ack", "memoId": "…", "offset": 0 }
{ "type": "memo.audio.ack", "memoId": "…", "offset": 4096 }
{ "type": "memo.audio.commit", "memoId": "…" }
{ "type": "memo.audio.committed", "memoId": "…", "ok": true }
{ "type": "memo.delete", "memoId": "…" }
{ "type": "memo.delete.ack", "memoId": "…", "ok": true }
```

- 音频帧：**`SK02`** + memoId 长度(u16 LE) + memoId + offset(u64 LE) + payload；桌面按 magic 与 `SK01` 分流。
- 手机实现是「先 hello、再推元数据、再逐条传音频」，不等 ack 才发下一块（WS 保序）；`memo.audio.committed{ok}` 才写 `synced_at`。没有 cursor/心跳，未同步条目每次全量重推，桌面按 id upsert 去重。
- 断线：手机保留 `synced_at=null`，回网/回前台/录音完成后重跑同步；半截音频从 0 重传（桌面 begin 会 truncate 临时文件）。
- 删除：手机 `deleted_at` 墓碑随 push 推送，桌面删行与文件；桌面不产生删除。

### 7.3 桌面存储

- `~/.sidekick/sidekick.db`（rusqlite，WAL，0600）+ `~/.sidekick/memos/audio/<memoId>.wav`。
- 只读镜像表字段与手机同构（去掉 `synced_at` 语义），迁移独立 `user_version`。
- 音频播放：Tauri `asset` 协议读本地文件（capability 限 `~/.sidekick/memos/**`），或复制到临时文件用 `convertFileSrc`；不把音频塞进 base64。

## 8. 隐私与安全红线

1. 转写/标题/摘要只落手机与电脑本机；日志只打事件、错误码、时长、字节数。
2. Key 仅：手机 `memo/secure.json`（0600，MVP；Keystore P1）、电脑 `asr.json`（0600）；**不进 WebView 存储、不进日志、不进崩溃上报**。
3. 同步消息只发给已配对连接；未配对客户端收不到 `memo.*`；`memo.*` 不走广播。
4. 音频默认保留（用户可关）；删除即删文件与行；不做云备份。
5. 手机不允许自定义 ASR/LLM 地址；只允许官方域名，防 Key 转发。
6. 首次录音前一次告知（音频会发百炼），不重复弹。

## 9. 依赖与构建（实际）

| 依赖 | 用途 | 注意 |
| --- | --- | --- |
| `rusqlite`（bundled） | 双端 SQLite | 已过 NDK arm64 构建；Android 用 cargo-ndk |
| `tokio-tungstenite` + `rustls-tls-webpki-roots` | 手机直连百炼 ASR（wss） | 手机目标专用；webpki roots 避开 Android 平台证书校验器的 JNI 初始化 |
| `reqwest`（rustls-no-provider）+ `webpki-roots` | 手机 LLM HTTP | 用 `use_preconfigured_tls` 注入自建 webpki ClientConfig；ring provider 启动时装 |
| `sha2` | 音频校验 | 纯 Rust |
| 无新增（录音） | WebView `getUserMedia` + ScriptProcessor | 不引 MediaCodec/前台服务 |
| `protocol-asset`（tauri feature） | 两端播放本地 WAV | `assetProtocol.scope` 限 `$HOME/.sidekick/memos/**` 与 `$APPDATA/memo/**` |

## 10. 风险与 spike 清单

1. **手机 TLS**（最高）：移动目标 rustls 编译与证书根；先跑通一段 30 秒录音直连百炼。
2. **SQLite on Android**：rusqlite bundled 的 NDK 构建与 WAL 行为。
3. **WAV 体积**：约 115MB/小时（2 小时 230MB）；设置页显示占用，P2 再压缩（D118）。
4. **同步半状态**：断网/杀进程后的续传与去重；必须有 e2e 用例（M-17）。
5. **LLM 输出稳定性**：固定 JSON schema + 重试 + 兜底；抽样 50 条人工看标题质量。
6. **WebView 长录音稳定性**：主线程/PCM buffer 压力；每 30 秒分片并及时释放，避免内存堆积。

## 11. 分阶段实施

| 阶段 | 交付 | 验证 |
| --- | --- | --- |
| S1（代码完成） | WebView 前台录音 + Rust 管道 + SQLite + 手机列表/详情 + 手动 Key/配对取 Key | 真机录 10 分钟出结果；断网排队 |
| S2（代码完成） | 配对 token + 同步协议 + 桌面镜像 + 定向下发 | M-16/17/18/19；待真机联调 |
| S3（P1，暂缓） | 原生后台录音 + 常驻通知 + 电池引导 | M-02b/03 真机 |
| S4 | 配对码下发 Key、搜索、左滑删除、待办勾选 | P1 清单 |
| P2 | AAC/Opus 压缩、发热/耗电、用量与成本 | 后续单独评估 |

**实施顺序建议**：先 spike 第 1–3 项（TLS / SQLite / WAV 长录音），再动数据层与 UI；桌面镜像最后；后台录音 P1 再启动。

## 12. 实现映射（2026-11-08）

- 共享核心：`app/src-tauri/src/memo/{types,wav,db,storage}.rs`、`memo_protocol.rs`；手机 `memo/mobile/{mod,recording,cloud,llm,pipeline,keys,sync}.rs`；桌面 `memo/desktop/mod.rs`。
- 手机命令：`memo_list/get/update/delete/delete_audio/storage_stats`、`memo_recording_{start,append,finish,cancel,status}`、`memo_recover/retry`、`memo_key_{status,save,clear}`、`memo_pair_{request,apply}`、`memo_sync_{now,pending}`。
- 桌面命令：`memo_list`、`memo_get`、`memo_pair_code_create`；桌面服务新增 per-client 定向发送与 `memo.*`/`SK02` 路由。
- UI：手机 `mobile/features/memo/*` + 顶栏 `NotebookPen` + 设置「备忘录/百炼 Key/从电脑配对」；桌面 `desktop/pages/memo-page.tsx` + `desktop/features/memo/*` + 语音页「配对手机」（D123 起为独立一级页，D124 起为左日历 + 右当日列表）。
- 测试：Rust 201（新增 memo 13 + SK02 2）；前端 761（v0.3 新增日历 15 + 手势 7 + 手机页 6 + 桌面页 4 等），`tsc/lint/build/check-docs/check-boundaries` 全绿；浏览器 QA `scripts/qa-memo.mjs` 14 个用例无溢出/console error，并走通首录告知→锁定→保存；debug APK 已重打（314MB）。
- 与设计稿的偏差：Key 用 App 私有文件（非 Keystore）；手机固定官方端点；没有 cursor/心跳，全量重推；桌面只读，无编辑/删除。
- v0.3 交互改版（D124，2026-11-08）：两端新增周/月日历、手机底部录音条与 C 双模、首录隐私 Sheet、录音中 guard、详情复制全文；日期聚合走 `shared/lib/calendar.ts` + 前端 `Map<dayKey, MemoSummary[]>`，**没有新增 Tauri 命令、协议字段或 SQLite 迁移**。SPEC v0.2 的「顶部录音卡 + 今天/更早分组」是实现漂移，已删除；`memo_list` 仍全量倒序，>2000 条再评估区间查询。
