---
doc: design/token-dashboard-v1
title: Token 用量看板 V1 设计归档
status: archived
updated: 2026-11-06
load: on-demand
owner: design
related:
  - ../../prd/usage/INDEX.md
  - ../../decisions.md
  - ../../engineering/token-usage-pricing.md
---

# Token 用量看板 V1 设计归档

> 2026-11-06 定稿并已落地的「声呐总览」V1。评审时对比过三版：V1 声呐总览、V2 预算舱、V3 潮汐；用户选定 **V1**，本轮只落地 V1 + 模型价格能力，V2 预算/5h 额度与 V3 时段洞察留到 P1。

## 设计方向

- **首屏回答三件事**：今天/区间花了多少、缓存有多省、AI 的消耗花在哪（客户端 / 会话 / 模型）。
- **桌面**：第 6 个一级页「用量」（⌘4；系统 ⌘5、设置 ⌘6）；4 KPI + 近 30 天花费柱阵 + 缓存环 + Token 五桶 + 分组明细；分组是卡片内 Tab，不新增页面级筛选。
- **手机**：从「设置 › 用量」进入只读二级页；区间汇总 + 近 14 天花费 + Token 构成 + 分组 + 价格来源；返回设置，录音中禁切页。
- **价格表**：模型分组卡脚进入右侧 Sheet（桌面）；手机只读来源/更新时间，刷新在电脑完成。只用于对照与缺价估算，实际花费以 DSH `costCny` 为准，估算标 `≈`。
- **图表**：全部 div/CSS（柱阵、conic-gradient 环、占比条），不引图表库、不写 SVG 数据图。

## 关键规格

| 项 | 规格 |
| --- | --- |
| 桌面窗口 | 1180×760 基准，最小 960×640；内容最大宽 880、左右 24；960 单列 |
| 桌面壳 | 72 导航 6 项；48 全局状态条；56 页头；页内滚动 |
| 手机壳 | `.mobile-clean` 干净版；MiSans Normal 400；标题 17 / 卡片 16 / 正文 13 |
| 区间 | 今天 / 近 7 天 / 近 30 天 / 近 180 天；金额人民币微元 |
| 分组 | 客户端 / 会话 / 模型；默认会话；Top 8 + 其他；会话按 id 跨天合并 |
| 隐私 | 外发只有聚合 Token/金额/日期/会话标题（≤80）/模型 ID 与接入方；不含提示词、路径、cwd；模型开关关闭时手机隐藏模型 Tab（D83） |
| 价格 | seed + 缓存 + overrides + DeepSeek 官方峰谷；override > DeepSeek 官方 > 远程 > seed；24h 自动刷新、60s 手动限频、失败保留上次、stale 7 天（D84） |

## 实现落点

- 桌面：[usage-page.tsx](../../../app/src/desktop/pages/usage-page.tsx)、[features/usage](../../../app/src/desktop/features/usage/usage-store.ts)
- 手机：[usage-page.tsx](../../../app/src/mobile/features/usage/usage-page.tsx)、[more-page.tsx](../../../app/src/mobile/features/settings/more-page.tsx)
- Rust：[token_usage.rs](../../../app/src-tauri/src/token_usage.rs)、[token_pricing.rs](../../../app/src-tauri/src/token_pricing.rs)、[pricing_seed.json](../../../app/src-tauri/src/pricing_seed.json)
- 协议：[protocol/README.md](../../../protocol/README.md) 的 `usage.request` / `usage`
- 决策：[D82](../../decisions.md)（导航与页面）、D83（手机模型 ID）、D84（价格表）

## 评审材料处理

- 设计对比页、三版 HTML、截图、字体/样式 mock、调研笔记均为一次性评审材料，已删除，不入库。
- 评审结论已沉淀：产品规则 [prd/usage](../../prd/usage/INDEX.md)、工程方案 [token-usage-pricing.md](../../engineering/token-usage-pricing.md)、决策 D82–D84。
- 需要重新看视觉时，以已落地页面为准；不要再把 `design-lab/` 当事实源。
