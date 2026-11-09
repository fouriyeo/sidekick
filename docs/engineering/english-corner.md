---
doc: engineering/english-corner
title: 英语角（生词本）技术方案
status: active
updated: 2026-11-09
load: on-demand
owner: engineering
related:
  - ../prd/english-corner/INDEX.md
  - ../../protocol/README.md
  - memo-pipeline.md
---

# 英语角（生词本）技术方案

> 这篇回答：英语角的 Rust 模块、命令契约、AI 管道、双端同步与用量口径怎么实现。
> 不包含：产品规则与验收用例（见 [PRD](../prd/english-corner/INDEX.md)）、界面视觉规格（见 SPEC）。

## 1. 模块与文件

```text
app/src-tauri/src/word/
├─ mod.rs        # 共享导出 + cfg 分流（照 memo）
├─ types.rs      # WordRow / WordDetail / Explanation / 同步 JSON
├─ db.rs         # rusqlite：words.db（桌面 ~/.sidekick，手机 app_data/word）
├─ llm.rs        # 百炼 compatible-mode：解释 / 造句；JSON 修复与兜底
├─ usage.rs      # word_usage.json（0600）日汇总 + chat 价格常量
├─ sync.rs       # word.* 载荷解析、合并规则、游标
├─ desktop.rs    # 桌面 Tauri 命令 + 剪贴板候选
└─ mobile.rs     # 手机 Tauri 命令 + 同步触发
```

- 模块声明照 [memo/mod.rs](../../app/src-tauri/src/memo/mod.rs)：`db/types/llm/usage/sync` 无条件，`desktop` / `mobile` 各自 `#[cfg]`。
- 状态：`Arc<WordState>`（db + usage 锁 + 配置），桌面在 `setup` 里 `manage`，手机同理。
- 命令注册：桌面 [lib.rs](../../app/src-tauri/src/lib.rs) `generate_handler!`，手机另一份；前端常量表在 [tauri.ts](../../app/src/shared/lib/tauri.ts)。

## 2. 命令契约（两端同名，手机多 sync_now，桌面多 clipboard_candidates）

| 命令 | 入参 | 返回 | 说明 |
| --- | --- | --- | --- |
| `word_list` | `{query?}` | `WordSummary[]` | 按 `updated_at` 倒序，LIMIT 2000 |
| `word_get` | `{word}` | `WordDetail \| null` | 按 normalized 查 |
| `word_add` | `{word, context?, source?}` | `WordDetail` | 插入 pending，normalized 去重 |
| `word_explain` | `{word, context?}` | `WordDetail` | 调 LLM；失败抛错误码，词条保留 failed |
| `word_delete` | `{word}` | `void` | 墓碑（`deleted_at`） |
| `word_generate` | `{words: string[]}` | `WordGenerateResult` | 5–10 词，3–5 句 |
| `word_usage` | — | `WordUsageStats` | 今日/近 30 天 + 日明细 |
| `word_status` | — | `WordStatusInfo` | Key/同意/配对/模型/词条数 |
| `word_consent` | `{agreed}` | `WordStatusInfo` | 首次使用同意 |
| `word_clipboard_candidates` | — | `string[]` | 桌面：从剪贴板历史提取英文词 |
| `word_sync_now` | — | `void` | 手机：立即同步 |

错误码（`String` 直接返回给前端）：`need_consent` / `no_key` / `not_paired` / `invalid_word` / `model_error` / `rate_limited` / `timeout` / `bad_json` / `sync_failed`。

## 3. 数据模型

`words.db`（两端同 schema，桌面 `~/.sidekick/words.db`、手机 `<app_data>/word/words.db`，0600）：

```sql
CREATE TABLE words(
  id TEXT PRIMARY KEY, word TEXT NOT NULL, normalized TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL, explanation TEXT, note TEXT, context TEXT,
  source TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  explained_at INTEGER, deleted_at INTEGER, model TEXT, prompt_version INTEGER,
  rev INTEGER NOT NULL DEFAULT 1, last_error TEXT
);
```

- `id = normalized`（trim + 小写 + 连续空白折叠为单个空格），天然去重。
- 删除只写 `deleted_at`；启动时清理 90 天前的墓碑。
- 解释存 JSON 字符串（`WordExplanation`），解析失败按 `bad_json` 处理并保留原文用于重试。

## 4. AI 管道

- 端点：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`；模型 `qwen3.8-flash`（2026-11-09 用真实 AK 探测：HTTP 200、解释 2.2–4.6s、in≈170/out≈150–230 tokens）。
- 参数：`temperature 0.3`（造句 0.6）、`max_tokens 800`（造句 500）、`enable_thinking:false`、超时 25s、失败重试 1 次。
- TLS：桌面先 `tls::ensure_crypto_provider()`；手机沿用 [memo llm](../../app/src-tauri/src/memo/mobile/llm.rs) 的 webpki roots 单例。
- 解析：先取首个 `{` 到末个 `}`，再尝试补全缺失的 `}`/`]`（实测模型偶发漏右括号），仍失败 → 重试 → `bad_json`。
- 提示词版本号写入 `prompt_version`；缓存命中（同 normalized + model + 版本已有解释）不发请求。
- 外发内容：单词原文 + 可选语境句；造句只发选中的词条单词。**不发**词库全量、剪贴板历史、设备信息。

## 5. 双端同步（`word.*`，写进 [protocol/README.md](../../protocol/README.md)）

- 鉴权：复用备忘录配对令牌——`word.hello{deviceId, token, since}` 内部调用 `MemoHub::hello`；未配对回 `word.error{sync_failed}` 且不落库。
- 下行：`word.snapshot{words[], done}`（每批 ≤100，`updated_at > since`，含 90 天内墓碑）；手机应用后 `cursor = serverNow`（桌面时钟权威）。
- 上行：`word.push{words[]}`（≤200/批）→ `word.push.ack{ids, cursor}`。
- 变更广播：桌面 `word.changed{words[]}` 广播给其他已配对连接；本地同时 emit `word-changed` 给 WebView。
- 合并（字段级）：`created_at=min`；`updated_at=max`；解释/状态优先「ready 且 explained_at 较新」；`note/context` 后写胜；较新墓碑删除；`rev+1`。
- 单飞锁照 memo 的 `syncing` 标志；未连接/未配对是常态，不打错误日志。

## 5.5 语音合成（qwen-audio-3.1-tts-plus）

- 接口：`POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer`（非流式），body 含 `model/input{text,voice,format:"mp3",sample_rate:24000,rate,language_hints:["en"],instruction}`。
- 音色：默认 `longanhuan_v3.1`（旗舰女声，中英双语），可用 `word.json › voice` 覆盖；单词语速 0.85、句子 1.0。
- 指令：单词「清晰标准的英式英语、只读单词」；句子「自然流畅、注意连读语调」。
- 返回：`output.audio.url`（24h）+ `usage.characters`；Rust 下载后写入 `word_audio/<sha256>.mp3`（0600，tmp+rename），**同文本+音色+语速只合成一次**，重复播放 0 请求 0 费用。
- 缓存键：`sha256(model|voice|rate|text)`；改音色/语速/文本会重新合成。
- 失败兜底：桌面回退 macOS `say`（离线），返回 `fallback=true` 且无文件；手机直接返回错误码。
- 计费：按字符，1.4 元/万字符（北京），记入 `word_usage.json` 的 `ttsCalls/ttsCharacters/ttsCostCnyMicros`；缓存命中不重复计费。
- 播放：前端 `useWordAudio()` 把本地路径用 `convertFileSrc` 转 URL 播放；同一时刻只播一条，重复点停止。asset 协议作用域已加 `$HOME/.sidekick/word_audio/**`、`$APPDATA/word/**`。

## 6. 用量与价格

- `word_usage.json`（0600，tmp+rename）：`{version, days: {date: {calls, promptTokens, completionTokens, costCnyMicros}}}`。
- 价格常量（元/百万 token）：解释/造句输入 `0.8`、输出 `2.7`；语音合成 `1.4` 元/万字符。
- 只在本页展示「今日/近 30 天 + 估算」，不并入 DSH 账本看板（口径不同，见 [token_usage.rs](../../app/src-tauri/src/token_usage.rs)）。

## 7. 隐私

- 首次使用必须显式同意（`word_consent`），未同意调用返回 `need_consent`。
- 日志只打错误码，不打词条正文、语境句、Key。
- 剪贴板候选只读最近 20 条文本、提取英文 token、长度 ≤64；不落库直到用户确认。

## 8. 验证要点

- `cargo test`：normalize/合并/墓碑/JSON 修复/用量汇总/db CRUD。
- 真实 AK 冒烟：1 个词解释 + 3 词造句，检查 JSON 可解析、usage 字段、延迟。
- 双端联调：手机配对 → 桌面新增 → 手机 2s 内可见；手机新增 → 桌面 30s 内可见；断网重试；删除同步。
