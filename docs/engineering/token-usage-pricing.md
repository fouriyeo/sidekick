---
doc: engineering/token-usage-pricing
title: Token 用量与价格技术方案
status: draft
updated: 2026-11-07
load: on-demand
owner: engineering
children: []
related:
  - ../prd/usage/PRD.md
  - ../prd/usage/SPEC.md
  - ../../protocol/README.md
  - ./dsh-hook.md
---

# Token 用量与价格技术方案

> 目标：只读本机 DSH cost-meter 账本，按区间/客户端/会话/模型聚合出 Token 与人民币金额；缺金额时用可追溯的价格表兜底；桌面出页、手机只读。
> 产品规则见 [usage PRD](../prd/usage/PRD.md) 与 [SPEC](../prd/usage/SPEC.md)；协议见 [protocol/README.md](../../protocol/README.md) 的 `usage.request` / `usage`。

## 1. 总览

```text
<DSH_HOME>/storages/cost-meter/ledger.json   ← DSH cost-meter 维护，Sidekick 只读
  → token_usage.rs：mtime+size 缓存 → 解析 → 按天聚合 → 区间/分组
       └─ 缺 costCny 时 → token_pricing.rs（priority：override > DeepSeek 官方峰谷 > 远程/seed × FX）
  → 桌面：Tauri 命令 token_usage_stats(range) → 用量页
  → 手机：WS usage.request{range} → desktop_server 广播 usage{data:TokenUsageStats} → 手机只读页
价格：
pricing_seed.json（内置 USD/1M）/ ~/.sidekick/token_pricing.json（缓存）/ ~/.sidekick/token_pricing_overrides.json（覆盖）
  → token_pricing.rs：来源优先级、峰谷、FX、刷新与限频
```

- 不写账本、不改 DSH 配置、不上传用量；价格刷新只 GET OpenRouter 公开目录。
- 手机不参与聚合，只消费桌面快照；桌面是唯一计算方（用量页与菜单栏小看板共用 `token_usage_stats`）。

## 2. 文件与职责

| 路径 | 职责 |
| --- | --- |
| `app/src-tauri/src/token_usage.rs` | 定位/读取/缓存账本；区间聚合；客户端/会话/模型分组；`token_usage_stats` 命令；`mobile_json()` 隐藏模型分支 |
| `app/src-tauri/src/token_pricing.rs` | `PriceLookup` / `PriceQuote` / `PricingStatus`；seed/缓存/覆盖/FX/峰谷；刷新与限频；4 个 pricing 命令 |
| `app/src-tauri/src/pricing_seed.json` | 内置开放目录快照（USD / 1M tokens），`include_str!` 嵌入 |
| `scripts/update-pricing.mjs` | Node 24 原生 fetch 生成 seed；只 GET 公开目录、无第三方依赖 |
| `app/src-tauri/src/desktop_server.rs` | 处理 `usage.request`：解析 range → `store.stats(range).mobile_json()` → 广播 `usage` |
| `app/src-tauri/src/mobile_client.rs` | `send_usage_request(range)`（校验枚举，非法回「用量区间无效」） |
| `app/src-tauri/src/lib.rs` | 建 `Arc<PricingStore>` / `Arc<TokenUsageStore>`，注册 5 个命令 |
| `app/src/protocol/messages.ts` | `UsageRange` / `TokenUsageStats` / `UsageMessage` / `isUsageMessage` / `parseUsageMessage` |
| `app/src/shared/lib/usage.ts` | 区间标签与格式化（紧凑 Token、¥ 微元、百分比、更新时间、成本来源文案） |
| `app/src/shared/lib/tauri.ts` | `getTokenUsageStats` / `sendUsageRequest` / 4 个 pricing 命令绑定 |
| `app/src/desktop/features/usage/` | 桌面用量页 store 与「模型价格」Sheet（460px）；价格表入口在分组列表卡尾，不在导航 |
| `app/src/desktop/pages/usage-page.tsx` | 桌面用量页（一级「用量」；D85 后 4 项导航里是 ⌘3） |
| `app/src/desktop/panel/usage-panel.tsx` | 菜单栏用量小看板（D108，第二窗口）：复用 `useUsageStore` 与同一命令，固定今天/7 天 + 7 天迷你柱 + 客户端/会话/模型 Top 3 分组 |
| `app/src-tauri/src/usage_panel.rs` | 小看板窗口（`usage-panel`）：预创建/贴图标定位/显示收起、`hide_usage_panel` / `open_usage_page` 命令 |
| `app/src/mobile/features/usage/` | 手机只读页与快照缓存（进入/切区间/回前台请求） |

## 3. 数据源与容错

### 3.1 定位

- `<DSH_HOME>` 解析沿用 `dsh_hook_install::dsh_home()`：`SIDEKICK_DSH_HOME` > `DSH_HOME` > `$HOME/.dsh`（测试用 `SIDEKICK_DSH_HOME`）。
- 账本固定 `<DSH_HOME>/storages/cost-meter/ledger.json`。
- 单文件上限 64MB（`MAX_LEDGER_BYTES`），超限不读，返回 `ledger_too_large`。

### 3.2 依赖字段（只声明这些，其它字段忽略）

```jsonc
{
  "version": 1,
  "config": { "exchangeRate": 6.66 },
  "days": {
    "2026-11-06": {
      "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0,
      "reasoning": 0, "calls": 0,
      "costCny": 0.93,                       // 可选；缺失时按价格表估算
      "byProviderModel": {                   // 可选
        "opencode-go:deepseek-v4.1-flash": { "input": 0, "output": 0,
          "cacheRead": 0, "cacheWrite": 0, "reasoning": 0, "calls": 0, "costCny": 0.79 }
      },
      "sessions": [                          // 可选
        { "id": "session-…", "at": 1793900000000, "title": "可选",
          "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0,
          "reasoning": 0, "calls": 0, "costCny": 0.79,
          "byProviderModel": { /* 同上 */ } }
      ]
    }
  }
}
```

- 未知字段忽略（`serde(default)`），前向兼容 DSH 新增字段；`byProviderModel` 键为 `provider:model`，无冒号时 provider 为空串、整体当 model。
- 浮点 `costCny` 转微元：`round(cny * 1_000_000)`；NaN/负数/无穷按 0。

### 3.3 错误与降级

| 码 | 触发 | 行为 |
| --- | --- | --- |
| `ledger_missing` | 文件不存在/不是文件 | 空数据，`ledger.available=false` |
| `ledger_unreadable` | 读文件失败 | 有缓存用缓存；否则空数据 |
| `ledger_invalid` | JSON 或结构解析失败 | 有缓存用缓存；否则空数据 |
| `ledger_too_large` | >64MB | 不读；空数据 + 提示 |
| `ledger_cache_lock` | 缓存锁 poisoned | 空数据（不 panic） |

- 读取失败但内存有上一次解析结果：返回缓存数据，`ledger.available=true`、`ledger.reason=<失败码>`，页面提示「账本这次没读成功，显示的是上次数据」。
- 不存在/损坏时**不创建、不修复、不重写**账本。
- 解析规则：`days` 中日期键不是 `YYYY-MM-DD` 的跳过；单日/单会话/单模型字段缺失按 0；`sessions[].id` 空白的会话丢弃；会话标题去控制字符、压成单行、截 80 码点，空标题视为无标题。
- 会话标题回填：账本 `sessions[].title` 为空时，只读 `<DSH_HOME>/storages/session_projcache/sessions/<id>.json` 的 `record/rows/title/val`（≤2MB、id 只允许字母数字/`-`/`_`，不读 `titleInput`/消息），仍无才用「会话 + 8 位短 id」；只回填进入 Top 8 的会话行，避免每次统计读上百个缓存文件。

### 3.4 缓存

- 以 `(mtime_nanos, size)` 为签名缓存最近一次解析的 `Vec<DayAgg>`；签名不变直接返回 `clone`（预热 <50ms）。
- 签名变化才 `fs::read` + `serde_json` 重新解析；解析成功替换缓存。
- 命令用 `spawn_blocking` 执行文件 IO，不阻塞 UI 线程。

## 4. 聚合与口径

### 4.1 公式

```text
总 Token        = input + output + cacheRead + cacheWrite + reasoning
缓存命中率      = cacheRead / (input + cacheRead + cacheWrite)   // 分母 0 → null
实际金额微元    = round(costCny * 1e6)                           // 账本优先
估算金额微元    = input×p_in + output×p_out + cacheRead×p_cr + cacheWrite×p_cw
                  （p 为人民币/1M；USD 价先 × FX；reasoning 不参与估算，已知限制）
行占比 sharePct = 行 Token / 区间总 Token × 100
```

- 区间汇总 = 区间内各日聚合之和；金额 = 各日金额之和（每日先四舍五入到微元），保证「合计 = 分项之和」。
- 成本来源：估算部分为 0 → `ledger`；全部为估算 → `estimated`；实际 + 估算混合 → `mixed`；金额为 0 且无估算 → `unknown`（含免费模型 0 元账单，已知口径限制）。
- 每行另带 `estimatedCostMicros`（该行金额中估算的部分）；日金额缺失 `costCny` 时 = Σ 当日各模型估算，某模型无价则贡献 0（不猜）。
### 4.2 区间与覆盖

| range | 天数 | 说明 |
| --- | --- | --- |
| `today` | 1 | 本机当天 |
| `7d` | 7 | 含今天 |
| `30d` | 30 | 含今天 |
| `180d` | 180 | 含今天；账本 `config.historyDays` 通常也是 180 |
| 其它/缺失 | 7 | 服务端归一为 `7d`；手机命令直接拒绝非法值 |

- `days[]`：账本中最近的、最多 180 个**真实存在**的日期（按日升序），不补零、不按区间裁剪；前端按所选区间过滤展示。
- `previous`：与所选区间等长、紧邻的上一个区间的汇总（本周之前 7 天 / 30 天 / 180 天）；V1 收口后两端都不渲染环比，字段保留。无数据时字段为全 0 汇总。
- `coverageDays`：所选区间内有账本日期的天数（含金额缺价但 Token 存在的天）。
- `summary.sessions` / `clients[].sessions`：区间内**唯一会话 id 数**（同一会话跨天只算一次）；分组 `sessions` 行本身也按 id 跨天合并。

### 4.3 分组

- `clients`：P0 只有一行 `{key:"dsh", label:"DeepSeek Harness", sub:"本机 cost-meter · 已接入", sharePct:100}`；其它客户端不进入协议，前端也不渲染「未接入」占位行。
- `sessions`：按 `id` 跨天合并；`label` = 标题或「会话 + 8 位短 id」；`sub` = 「最近 MM-DD HH:mm · N 次调用」；`calls` 为区间内调用数。
- `models`：按 `provider:model` 合并；`label` = model，`provider` = 中文接入方（opencode-go→OpenCode Go；deepseek-account→DeepSeek 账号；deepseek-official→DeepSeek 官方；空→未知接入方）；`sub` = 接入方 + 缓存命中；`price` 为当前报价（CNY/1M）与来源。
- Top 8 + 其他：按**金额降序**（同额再按 Token，D102）排序后超过 8 行截断，追加 `key:"other"`、`label:"其他 N 个会话/模型"`、`tag:"other"`；Token/金额/调用数为被截断行之和，会话组 `sessions` 为剩余数。

## 5. 价格体系

### 5.1 文件与 schema

| 文件 | 权限 | 内容 |
| --- | --- | --- |
| `app/src-tauri/src/pricing_seed.json` | 随包 | `_meta{source,updated_at,count}` + `models{"provider/model":{in,out,cache_read,cache_write,name?}}`，USD / 1M |
| `~/.sidekick/token_pricing.json` | 0600 | 运行期缓存：`version` / `settings{autoRefresh,mobileModels}` / `catalog` / `meta{catalogSource,updatedAt,lastAttemptAt,lastError}`；原子写（temp + rename），失败保留上次成功 |
| `~/.sidekick/token_pricing_overrides.json` | 用户维护 | `fxCnyPerUsd` + 模型价覆盖（可选 `"currency":"CNY"` 直接给人民币价）；键支持 `provider:model` / `model` / 目录 id；优先级最高 |

- 目录不存在时自动创建 `~/.sidekick/`（沿用 `app_paths::data_dir()`，测试用 `SIDEKICK_DATA_DIR`）。
- 价目单位统一为「人民币 / 1M tokens」；远程/seed 的 USD 价 × FX 后再参与估算。

### 5.2 来源优先级与峰谷

```text
override（用户覆盖）
  > deepseek-official（内置 CNY 峰谷表：deepseek-v4-pro / deepseek-v4-flash / deepseek-v4.1-flash / deepseek-flash 别名）
  > remote（OpenRouter 目录，USD/1M × FX）
  > seed（内置快照，USD/1M × FX）
  > 无价（不估算）
```

- DeepSeek 官方：工作日北京时间 09:00–12:00、14:00–18:00 为峰时（等价 UTC 工作日 1–4、6–10 点），其余为谷时；周六日按谷时；`at_ms=None` 用谷时；V1 不处理法定调休。
- 日聚合估算的 `at_ms`：取当天第一个有 `sessions[].at` 的会话时间；没有则 `None`（谷时）。
- 模型匹配：先 `provider:model`，再 `model` 唯一后缀匹配（如 `deepseek-v4.1-flash` → `deepseek/deepseek-v4.1-flash`）；找不到返回 None。
- FX：`overrides.fxCnyPerUsd` > `SIDEKICK_FX_CNY_PER_USD` > 账本 `config.exchangeRate`（带缓存）> 7.0；`fxSource` 记录 override/env/ledger/fallback。

### 5.3 刷新与限频

| 规则 | 值 |
| --- | --- |
| 自动刷新 | 仅在「打开用量页且缓存 >24h」时后台触发一次；每 App 会话最多一次 |
| 手动刷新 | 最短间隔 60s，未到显示「刚刚刷新过，稍后再试」 |
| 失败 | 保留上次成功目录与 `updatedAt`，写 `lastError`；1h 内不自动重试 |
| stale | `updatedAt` 缺失或 >7 天 |
| 单飞 | 刷新单飞（Mutex），并发调用复用同一次请求 |
| 远程请求 | 只 `GET https://openrouter.ai/api/v1/models`；UA `Sidekick/0.1`；10s 超时；≤3 次重定向且最终 host 必须是 openrouter.ai；响应 ≤8MB；不携带任何本机数据 |
| 网络依赖 | 新增运行时 `reqwest`（`default-features=false`，features `json`/`gzip`/`rustls-no-provider`），rustls provider 复用 `tls::ensure_crypto_provider()`（ring） |
| 默认值 | `autoRefresh=true`、`mobileModels=true`（D83） |

### 5.4 `PricingStatus` 与 `PriceQuote`

- `PricingStatus`（camelCase）：`source:"remote"|"seed"|"override"|"mixed"`、`updatedAt`、`lastAttemptAt`、`lastError`、`stale`、`autoRefresh`、`modelCount`、`fxCnyPerUsd`、`fxSource:"override"|"env"|"ledger"|"fallback"`、`mobileModels`。
- `PriceQuote`：`inputCnyPerM` / `outputCnyPerM` / `cacheReadCnyPerM` / `cacheWriteCnyPerM` / `source:"override"|"deepseek-official"|"remote"|"seed"`。

## 6. Tauri 命令

| 命令 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `token_usage_stats` | `range?: "today"\|"7d"\|"30d"\|"180d"` | `Result<TokenUsageStats, string>` | 默认 `7d`；后台线程读账本；返回对象与 `usage.data` 同构 |
| `token_pricing_status` | — | `PricingStatus` | 只读状态 |
| `token_pricing_refresh` | `force: bool` | `Result<PricingStatus, string>` | 手动/自动刷新；60s 限频、失败保留旧值 |
| `token_pricing_set_auto` | `enabled: bool` | `Result<PricingStatus, string>` | 持久化到缓存文件 settings |
| `token_pricing_set_mobile_models` | `enabled: bool` | `Result<PricingStatus, string>` | D83 开关持久化 |
| `send_usage_request`（手机） | `range` | `Result<(), string>` | 非法 range 回「用量区间无效」 |
| `hide_usage_panel`（小看板） | — | `void` | Esc / 点外部后收起第二窗口，不销毁（D108） |
| `open_usage_page`（小看板） | — | `void` | 显示并激活主窗口，再发 `sidekick-navigate` 落到用量页 |

- 数字类型：Token 与微元均为 `u64`；百分比 `f64`（0–100，可空）；时间戳为毫秒 `u64`。

## 7. 协议

### 7.1 `usage.request`（手机 → 桌面）

```json
{ "v": 1, "type": "usage.request", "range": "7d", "ts": 1793900000000 }
```

- 手机在进入用量页、切换区间、连接恢复时发送；桌面解析 `range`，缺失/未知按 `7d` 兜底；手机 8s 无响应提示「电脑没有回应，点这里重试」。
- 旧电脑端不发送 `usage`；手机等待卡显示「还没连上电脑 / 电脑还没回应」，不显示假数字。

### 7.2 `usage`（桌面 → 所有已连接客户端）

```json
{
  "type": "usage",
  "v": 1,
  "ts": 1793900000123,
  "data": {
    "range": "7d",
    "generatedAt": 1793900000120,
    "summary": {
      "tokens": 12345678, "input": 700000, "output": 200000,
      "cacheRead": 11400000, "cacheWrite": 0, "reasoning": 45678,
      "costCnyMicros": 29840000, "estimatedCostMicros": 0,
      "costSource": "ledger", "calls": 314, "sessions": 9, "cacheHitPct": 94.2
    },
    "previous": { "...": "上一等长区间同结构汇总" },
    "days": [
      { "date": "2026-11-06", "tokens": 1234567, "input": 70000, "output": 20000,
        "cacheRead": 1140000, "cacheWrite": 0, "costCnyMicros": 931839, "calls": 30 }
    ],
    "groups": {
      "clients": [ /* UsageRow[] */ ],
      "sessions": [ /* UsageRow[]，含 other 行 */ ],
      "models": [ /* UsageRow[]，含 other 行；开关关闭时为空数组 */ ],
      "modelsHidden": false
    },
    "pricing": { /* PricingStatus */ },
    "coverageDays": 7,
    "ledger": { "available": true, "reason": null }
  }
}
```

- `UsageRow`：`key` / `label` / `sub` / `tokens` / `costCnyMicros` / `estimatedCostMicros` / `costSource` / `sharePct` / `calls` / `sessions` / `cacheHitPct` / `modelId` / `provider` / `tag` / `price`。
- 桌面端到端广播 `store.stats(range).mobile_json()` 的结果：当 `pricing.mobileModels=false` 时 `groups.models=[]` 且 `groups.modelsHidden=true`。
- 手机 `isUsageMessage` 只校验 `type/v/ts/data`，内部字段由 UI 防御性读取；未知字段忽略。
- 隐私白名单：不含提示词、回复、工具参数、文件路径、cwd、会话正文。

## 8. 性能预算与缓存

| 场景 | 预算 | 手段 |
| --- | --- | --- |
| 当前 6–7 天账本（约 0.9MB）冷读 | <300ms | 单次 `serde_json` + 后台线程 |
| 30MB 账本冷读 | <2s | 同上；不阻塞 UI |
| 预热（签名命中） | <50ms | `(mtime,size)` 缓存 + clone |
| 切区间 | 无 >100ms 卡顿 | 缓存复用；前端 `requestSeq` 防旧响应覆盖 |

- 不引入新依赖（价格刷新除外）；解析用现有 `serde_json`，读取用 `std::fs`；手机快照只存内存（最后一个成功 `usage`），不落盘。

## 9. 隐私与安全

- 账本只读；不向 DSH 回写、不改配置、不创建文件。外发字段白名单见 §7；手机模型名/接入方仅在 `mobileModels=true` 时下发（D83），`status.sessionList` 不变（D78）。
- 价格刷新仅访问固定公开 URL；不携带用量、模型名、设备标识；重定向限制 + host 白名单防 SSRF。
- 缓存/覆盖文件 0600；错误日志只记错误码，不记会话标题、模型明细或提示词；不新增遥测。

## 10. 空态与错误码

| 场景 | 数据表现 | UI 文案 |
| --- | --- | --- |
| 无账本 | `ledger.available=false`、`reason="ledger_missing"` | 「还没有用量数据。DSH 开始记账后，这里会自动出现。」 |
| 读失败但有缓存 | `available=true`、`reason` 非空 | 「账本这次没读成功，显示的是上次数据。」 |
| 损坏/不可读/过大 | `available=false`、对应 reason | 「读取用量失败」「账本文件过大」 |
| 区间无数据 | `coverageDays=0`、汇总全 0 | 「这个区间还没有记账数据。」 |
| 全部缺价 | `costSource="unknown"`、`costCnyMicros=0` | 金额「—」+「没有可用价格」 |
| 部分缺价 | `costSource="mixed"` 或 `estimated` | 「部分日期缺价，金额为已知部分。」 |
| 价格刷新失败 | `pricing.lastError` 非空 | 「上次刷新失败：…」 |
| 价格 stale | `pricing.stale=true` | 「价格表已超过 7 天未更新；估算可能偏离账单。」 |

- 价格刷新错误码（`lastError`，UI 原样展示短句）：`network` / `timeout` / `http_status` / `invalid_body` / `too_large` / `unsafe_redirect` / `io`。

## 11. 测试

- Rust：`cargo test token_usage`（fixture：缺文件/损坏/过大、区间边界、跨天会话合并、Top 8 + other、缺价、FX、previous/coverage、缓存签名）；`cargo test token_pricing`（seed 加载、目录解析、非法价、峰谷、override 优先级、FX、限频、stale、开关持久化）；测试不联网、不写真实 `~/.sidekick`。
- 前端：`pnpm exec vitest run src/protocol src/shared/lib/usage src/desktop/features/usage`（协议解析、格式化、store 防旧响应、价格开关）；手机用量页（快照/断连/隐藏模型）。全量：`cargo fmt --check && cargo test`；`pnpm typecheck && pnpm lint && pnpm test && pnpm build`；`node scripts/check-docs.mjs && node scripts/check-boundaries.mjs`；手工走查设计稿、真机四区间/断连/返回、断网刷新、30MB fixture 计时。

## 12. 维护与回滚

- **更新 seed**：`node scripts/update-pricing.mjs` → 校对 `_meta.source="openrouter/api/v1/models"`、`count`、采样若干模型价 → 提交 `app/src-tauri/src/pricing_seed.json`；运行期优先用 `~/.sidekick/token_pricing.json` 缓存，seed 只作首启/离线兜底。覆盖价由用户手动编辑 `~/.sidekick/token_pricing_overrides.json`（0600），页面不提供在线编辑；格式错误时忽略该条，不崩溃。
- **回滚**：回退代码提交即可；`~/.sidekick/token_pricing.json` 可安全删除（自动重建）；覆盖文件属于用户数据，不随回滚删除；DSH 账本全程无写入，无需回滚。已知限制：账本 schema 无契约；`reasoning` 不参与估算；0 元账单被标「缺价」；峰谷不处理法定调休；手机模型名外发受 D83 控制；不做多客户端解析。
