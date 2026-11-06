---
doc: prd/usage/ACCEPTANCE
title: Token 用量看板验收用例
status: draft
updated: 2026-11-06
load: on-demand
owner: qa
children: []
related:
  - PRD.md
  - SPEC.md
  - ../../engineering/token-usage-pricing.md
---

# Token 用量看板 · 验收用例

> 覆盖数据对账、覆盖/空态、分组、会话、价格刷新、缺价估算、降级、双端壳、视觉、隐私、性能、质量门、文档与非目标。
> 测试数据建议用 `SIDEKICK_DSH_HOME` 指向 fixture 账本，不污染真实 `~/.dsh`；`~/.sidekick/token_pricing*.json` 测试前备份。

## U-01 数据一致性

- **Given** 固定 fixture 账本（180 天，含 `costCny` 缺失日），`SIDEKICK_DSH_HOME` 指向它。
- **步骤** ① 用 Node 脚本按 [工程方案 §4](../../engineering/token-usage-pricing.md) 公式直算 4 个区间的总 Token、金额、会话数、缓存命中、`coverageDays` 与上一区间；② 桌面逐区间核对；③ 手机逐区间核对。
- **期望** Token / 会话 / 缓存命中 / `coverageDays` 逐项**完全相等**；金额差 ≤1 微元；「今天」只含当天；合计 = 分项之和；`days[]` 只含账本真实日期、不补零、最多 180 条。

## U-02 覆盖与空态

- **Given** ① 无 `ledger.json`；② 账本只有 7 天；③ 账本 JSON 损坏；④ 账本 >64MB。
- **步骤** 分别打开桌面与手机用量页。
- **期望** ① 桌面/手机显示「还没找到 DSH 账本」一行结论 + 重试，`ledger.available=false`，不出现 0 或假图；② 半年区间显示「7 天有数据」，`coverageDays=7`；③ 显示「读取用量失败」/「账本格式暂时认不出来」+ 重试，不崩溃；④ 提示「账本文件异常偏大」，不 OOM；任何情况下账本 mtime/内容不变。

## U-03 分组

- **Given** fixture 含多个 `provider:model` 与 3 个会话。
- **步骤** ① 用 `jq` 汇总模型/会话 Token；② 查看三视角 Top 8 + 其他；③ 切换三视角并观察 KPI/趋势。
- **期望** 组内按 Token 降序；每组最多 8 行明细 + 1 行「其他 N 个」；「其他」行 Token/金额/调用数等于其余行之和（差 ≤1 微元），会话组另计剩余会话数；客户端只有 DSH 真实数据（占 100%），不出现未接入占位行；切换分组不改变上方汇总与趋势。

## U-04 会话

- **Given** fixture 中同一 `session id` 出现在两天，另有一个无标题会话。
- **步骤** 打开分组 › 会话，对照账本 `sessions[].title`。
- **期望** 跨天合并为一行，Token=两天之和，sub 时间为最近一次；标题单行 ≤80；无标题显示「会话 + 8 位短 id」，不猜内容；归档/无 id 的会话不出现。

## U-05 价格刷新与来源优先级

- **Given** 伪造 `~/.sidekick/token_pricing.json` 使 `updatedAt` >24h；准备 overrides fixture；可断网。
- **步骤** ① 打开桌面用量页；② 24h 内再次打开；③ 60s 内连点两次「刷新价格」；④ 断网时强制刷新；⑤ 依次设置 override / DeepSeek 官方模型 / 普通 OpenRouter 模型验证取价与峰谷。
- **期望** ① 后台自动 GET 公开目录一次，成功后 `updatedAt`/来源/`modelCount` 更新且不阻塞首屏；② 24h 内不请求网络；③ 第二次被拒并提示「刚刚刷新过，稍后再试」，不发请求；④ 保留上次成功数据与时间、显示失败原因、1h 内不自动重试；⑤ 优先级 override > DeepSeek 官方 CNY > 远程 > seed；工作日 09–12、14–18 北京时间用峰时价，`at_ms=None` 用谷时；stale >7 天页面明示。

## U-06 缺价估算

- **Given** fixture：A 天有 `costCny`；B 天删 `costCny` 但模型在 seed 有价；C 天模型无价；`overrides.fxCnyPerUsd=7.3`。
- **步骤** 打开用量页，手算 B 天估算值后对照；改回内置汇率再对照。
- **期望** A 天标「DSH 记账」；B 天金额带 `≈`，数值=`input×p_in + output×p_out + cacheRead×p_cr + cacheWrite×p_cw`（人民币微元，USD 价 × FX）；reasoning 不参与估算（已知限制）；C 天显示「缺价」并提示「部分日期缺价，金额为已知部分」；全区间缺价时金额「—」、`costSource=unknown`；FX 变化后估算值按比例变化；ASR 费用不计入。

## U-07 降级

- **Given** 未装 DSH / 无账本；读取中途失败但已有缓存；价格刷新失败；手机断连；旧电脑端（无 `usage` 消息）。
- **步骤** 分别触发上述场景。
- **期望** 空态/原因/下一步齐全；读取失败时显示上次缓存 + 「展示上次成功读取的缓存」，`ledger.available=true`、`reason` 非空；价格失败不影响已有数字；手机显示最后快照/等待卡（「还没连上电脑」「电脑还没回应」），8 秒超时提示「电脑没有回应，点这里重试」；旧电脑端无响应时提示更新；未知字段/未知版本被忽略，不崩溃。

## U-08 桌面壳

- **Given** 1180×760 与 960×640 两种窗口；深浅两套主题。
- **步骤** 核对导航、快捷键、页头、布局与默认视图。
- **期望** 导航 5 项顺序为 概览/语音/内容/用量/设置；⌘1–⌘5 与顺序一致（⌘4=用量、⌘5=设置）；页头大标题 + 区间分段 + 刷新，无说明句/状态胶囊；内容单列、最大宽 720 居中、无横向滚动；没有页脚、没有 mono 大写装饰；重启回概览；深浅主题下文字/数字/图表均清晰可读。

## U-09 手机

- **Given** 真机 390 / 360 / 320 宽；录音中；模型开关开/关。
- **步骤** 宠物页顶栏点今日花费数字进用量页；切区间；切分组；关闭「在手机显示模型分组」后重进；按返回键。
- **期望** 全屏二级页、返回宠物（设置页无「用量」入口）；四区间可用；汇总卡显示「{区间} · 总 TOKEN」+ N 天有数据 + 花费/缓存命中/调用·会话；「近 14 天花费」柱阵有日均；`groups.modelsHidden=true` 时模型 Tab 不出现（当前在模型 Tab 时自动切会话）且客户端 Tab 提示「手机模型分组已在电脑端关闭」；320 宽不横向滚动；录音中入口被拦截；断连显示等待卡/最后快照；字体字号按 D81（标题 17 / 卡片 16 / 正文 13）。

## U-10 视觉兼容

- **Given** Realme RMX3370（WebView 103）、深浅主题、减少动效。
- **步骤** 真机截图逐项对照 SPEC；检查 CSS 与网络请求。
- **期望** 无 `oklch` / `color-mix` / CSS `translate` 引起的错位丢色；桌面用系统字体、手机 MiSans Normal 生效；除 OpenRouter 价格目录外无外部请求；`prefers-reduced-motion` 下无动画；灰度/色弱下仍能靠文字读出数值。

## U-11 隐私与只读

- **Given** 可抓 WS 帧；账本文件；`~/.sidekick/` 文件。
- **步骤** ① 抓取 `usage.request` / `usage`；② `jq` 检查字段；③ 读取前后对比账本 mtime/hash；④ 抓价格刷新请求；⑤ 检查日志与文件权限。
- **期望** 无提示词/回复/工具参数/路径/cwd/正文；标题 ≤80 单行；`groups` 仅含白名单字段；`status.sessionList` 与 D78 完全一致（无模型名）；手机开关关闭时 `groups.models=[]` 且 `modelsHidden=true`；账本未被改写；价格刷新只 GET `openrouter.ai` 公开目录且不带用量；`~/.sidekick/token_pricing*.json` 权限 0600；日志不含业务内容。

## U-12 性能

- **Given** 真实账本（约 0.9MB / 7 天）+ 生成的 30MB fixture。
- **步骤** 重启 App 后首次调用 `token_usage_stats` 计时；30MB 冷读计时；重复调用预热计时；连续切区间。
- **期望** 6–7 天冷读 <300ms；30MB <2s；预热 <50ms；切区间无 >100ms 的 UI 卡死，不阻塞其它页面（读文件走后台线程）。

## U-13 质量门

- **步骤** 跑 `cargo fmt --check`、`cargo test`（含 token_usage / token_pricing 非联网测试）、`cd app && pnpm typecheck && pnpm lint && pnpm test && pnpm build`、`node scripts/check-docs.mjs`、`node scripts/check-boundaries.mjs`。
- **期望** 全部通过；新增测试覆盖：空态、损坏账本、缺价/估算、区间边界、跨天会话、Top 8 + other、价格优先级、峰谷、FX、刷新限频、开关持久化；测试不联网、不写真实 `~/.sidekick`。

## U-14 文档

- **步骤** 检查本次 5 个文档与关联索引/协议。
- **期望** 5 个文件 frontmatter 齐全（doc/title/status/updated/load/owner/children/related），`status: draft`，`updated: 2026-11-06`；行数在预算内；`check-docs` 通过；`protocol/README.md` 含 `usage.request` / `usage`；`decisions.md` 含 D83；`docs/prd/INDEX.md`、`docs/engineering/INDEX.md`、`docs/INDEX.md` 有入口且链接可点。

## U-15 非目标

- **步骤** 全量走查 + 代码/协议审查。
- **期望** 无菜单栏/状态栏入口；无预算、5 小时额度、余额、时段节律、星期分布、热力、半年回顾；未解析 Claude Code / Codex / Qoder 日志；ASR 费用未并入本页；无云同步/导出/告警/分享图；账本零写入；零新增遥测。
