---
doc: prd/usage/INDEX
title: Token 用量看板 · 一页摘要
status: draft
updated: 2026-11-06
load: on-demand
owner: product
children:
  - PRD.md
  - SPEC.md
  - ACCEPTANCE.md
related:
  - ../../engineering/token-usage-pricing.md
  - ../hook/INDEX.md
  - ../../decisions.md
---

# Token 用量看板 · 一页摘要

> 桌面一级页「用量」（⌘3）+ 手机宠物页顶栏「今日花费」数字（点开全屏二级页，D93）：只读本机 DSH cost-meter 账本，展示今天 / 近 7 天 / 近 30 天 / 近半年（180 天）的 Token 与人民币估算花费。
> 本期定位：**应用内看板**。不做菜单栏/状态栏常驻，不做预算、5 小时额度、时段/热力等洞察，不解析其它 AI 工具日志。

## 本期做什么

- 桌面：一级视图「用量」，导航顺序 概览 / 语音 / 内容 / **用量** / 设置；快捷键 ⌘1–⌘5（用量 ⌘4，设置 ⌘5，D85 结构 + D94）。
- 手机：宠物页顶栏右侧显示「今天」花费数字（无快照/账本缺失时退回仪表盘图标），点开全屏只读二级页，页头返回宠物（v17 / D93）；设置页不再有「用量」入口。
- 数据：只读 `<DSH_HOME>/storages/cost-meter/ledger.json`（`SIDEKICK_DSH_HOME` > `DSH_HOME` > `~/.dsh`），四区间汇总 + 按天趋势 + 五桶构成。
- 分组：客户端（P0 仅 DSH）/ 会话（按 id 跨天合并）/ 模型（`provider:model`），每组 Top 8 + 其他。
- 金额：人民币微元；`costCny` 优先，缺失才按价格表估算并标 `≈`；成本来源 ledger / estimated / mixed / unknown。
- 价格：override > DeepSeek 官方 CNY 峰谷 > OpenRouter 远程（USD/1M × FX）> seed；缓存 `~/.sidekick/token_pricing.json`，覆盖 `~/.sidekick/token_pricing_overrides.json`；打开用量页且 >24h 自动刷新，手动 ≥60s，失败保留上次，stale 7 天。
- 协议：`usage.request` / `usage`（带 `data` 包装），手机只读不读文件；关闭「在手机显示模型分组」时 `groups.models=[]` 且 `modelsHidden=true`（D83）。
- 价格表入口在分组列表卡尾（「价格表」/「价格表 · 待更新」），不新增导航。

## 不做什么

- 菜单栏 / 状态栏数字与图标、always-on-top 悬浮窗（用户明确不要）。
- 月预算、5 小时额度、余额、大额会话榜（V2 预算舱）。
- 时段节律、星期分布、18 周热力、近半年回顾/分享图（V3 潮汐）。
- Claude Code / Codex / Qoder 日志解析；ASR 费用合并；云同步、导出、告警。
- 修改 DSH 账本、回写 DSH、上传任何用量或模型名。

## 成功标准

- 页面数字与账本公式直算一致率 100%（金额差 ≤1 微元）。
- 无数据/缺价时给空态与「—」，不编造 0；`usage` 越界字段 0。
- 冷读 <300ms（6–7 天账本）、30MB <2s、预热 <50ms。
- 桌面 1180/960、手机 390/360/320 不溢出；深浅双主题与真机 WebView 103 通过。

## 平台

- 桌面：解析、聚合、价格刷新、桌面页与价格面板、WS 响应（唯一计算方）。
- 手机：只读页 + 内存快照；发 `usage.request`，不读文件、不写价格缓存。
- 共享：协议类型与格式化工具；不共享页面布局。

## 阅读地图

| 你是谁 | 读什么 | 读哪节 |
| --- | --- | --- |
| 产品/评审 | [PRD.md](./PRD.md) | 0–3 节 + 范围外 |
| 设计/前端 | [SPEC.md](./SPEC.md) | 布局、格式化、文案、价格面板 |
| 测试 | [ACCEPTANCE.md](./ACCEPTANCE.md) | U-01–U-15 |
| 技术方案 | [engineering/token-usage-pricing.md](../../engineering/token-usage-pricing.md) | 全部；协议见 [protocol/README.md](../../../protocol/README.md) |

交互规则见 [standards/ux.md](../../standards/ux.md)；视觉令牌见 [standards/visual.md](../../standards/visual.md)；价格来源与 tokei 调研见 [设计归档](../../design/token-dashboard-v1/README.md) 与 [engineering/token-usage-pricing.md](../../engineering/token-usage-pricing.md)。

## 已定决策

- 只做应用内看板，不做菜单栏常驻（用户明确要求）。
- 数据只读本机 DSH 账本；只做 DSH 一家，其它客户端占位「未接入」。
- 手机模型分组默认显示、可关闭（D83）；`status.sessionList` 保持不含模型名（D78 不变）；价格来源与刷新策略见 D84。
- 桌面新增一级「用量」（D82 时是第 6 项；D85 后 4 项导航里位于 ⌘3；D94 后 5 项导航里位于 ⌘4）；价格表入口在分组列表卡尾。
- 价格来源优先级与刷新策略见 [PRD 3.6](./PRD.md#36-价格规则p0)；实现见工程方案 §5。

## 维护规则

- 改口径/字段：先改本目录 PRD/SPEC/AC，再同步 [engineering/token-usage-pricing.md](../../engineering/token-usage-pricing.md)、[protocol/README.md](../../../protocol/README.md) 与 Rust/TS 双端解析。
- 改价格来源/刷新策略：同步本目录、工程方案与 `token_pricing.rs`；新决策追加 [decisions.md](../../decisions.md)。
- 改桌面导航/手机页面归属：同步 [shell/INDEX.md](../shell/INDEX.md) 与 `frontend-architecture.md`。
- 文档改动后跑 `node scripts/check-docs.mjs`。
