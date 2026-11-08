---
doc: design/ARCHIVE
title: 设计归档（手机 v16 / Token 看板 V1 / 用量看板 v2）
status: archived
updated: 2026-11-08
load: on-demand
owner: design
---

# 设计归档（只读结论）

> 2026-11-08 把三份已落地设计稿压成结论（原 `mobile-ui-v16/`、`token-dashboard-v1/`、`usage-dashboard-v2/` 子目录已删除；D71：HTML 原型、多版对比稿与截图等过程素材不入库）。
> **只读归档，不作为事实源**：视觉以已落地页面为准（`app/src/`），规则以 [prd/](../prd/INDEX.md) 与 [decisions.md](../decisions.md) 为准。

## mobile-ui-v16

- 方向：手机 v16「干净版」——取 iOS 的「内容优先 + 克制 tint + 清楚层级」，不照搬 Liquid Glass / SF 蓝；只留宠物页 + 设置二级页，没有底部 tab（D80）。
- 规格：宠物页 = 顶栏（gear / 连接状态 / 今日用量 / 备忘录 / chat）→ 会话卡浮层 → 无底色鲸鱼（固定 230，不位移）→ 56 薄荷圆麦克风；字号与字重对齐麦克风区（D107）。
- 字体：随包 **HarmonyOS Sans SC Regular 400**（原始 TTF，8.1MB，D91；D81 的字体选择已被 D91 取代）。
- 令牌：`app/src/mobile/styles/clean.css`（`.mobile-clean`，只作用手机）；鲸鱼图集不重绘、不染色、不加 filter。
- 决策：D80（两页壳 / 删动态页）、D81（字号行高）、D91（字体）、D93（顶栏今日用量）、D100（结果卡）、D107（会话卡浮层）；后续改动以 [mic SPEC](../prd/mic/SPEC.md) 与 [shell SPEC](../prd/shell/SPEC.md) 为准。
- 验收：`docs/prd/shell/ACCEPTANCE.md` 的 SHL-AC-26…47、SHL-AC-55…59、SHL-AC-73/74。

## token-dashboard-v1

- 方向：「声呐总览」V1——首屏回答今天/区间花了多少、缓存省了多少、花在哪（客户端 / 会话 / 模型）；对比过 V2 预算舱与 V3 潮汐，用户只选 V1，V2 预算/5h 额度与 V3 时段洞察留 P1。
- 结构：4 KPI + 近 30 天花费柱阵 + 缓存环 + Token 五桶 + 分组明细；图表全 div/CSS，不引图表库、不写 SVG 数据图。
- 价格：模型分组卡脚进右侧 Sheet；实际花费以 DSH `costCny` 为准，缺价才估算并标 `≈`。
- 决策：D82（导航与页面）/ D83（手机模型 ID 开关）/ D84（价格表）；产品规则见 [prd/usage](../prd/usage/INDEX.md)，价格与数据方案见 [engineering/token-usage-pricing.md](../engineering/token-usage-pricing.md)。
- 生效范围：版式已被 v2「深潜仪表」取代（D97 桌面 / D98 手机）；V1 的 2×2 卡片与固定柱阵不再有效。

## usage-dashboard-v2

- 方向：「深潜仪表 / 花费剖面」——花费是主角，曲线讲形状，光谱讲构成，账本讲去向；两端共用同一套数据语言。
- 桌面（D97）：`PageShell size="wide"`（内容约 900、max-w 956）+ `PageHeader compact`；58/500 等宽花费 hero + 环比 + 三读数 + 花费剖面 SVG（y 轴/网格/日均虚线/峰值/今日点）+ Token 光谱 + 按金额排序账本。
- 手机（D98）：无卡片紧凑仪表——花费 hero + 可拖动剖面（无 y 轴、气泡）+ 薄荷缓存光谱 + 账本行底占比条 + 只读价格行。
- 共用：[usage-chart.ts](../../app/src/shared/lib/usage-chart.ts)（刻度/路径/日期/环比/百分比/排序）；令牌在 `desktop/styles/usage.css` / `mobile/styles/usage.css`，不动 `ios.css` / `clean.css` / `tokens.css`。
- 决策与后续：D97/D98，D102（默认「今天 / 模型」、按金额降序 Top 8）、D103（会话标题从 DSH 缓存回填）；桌面契约见 [engineering/desktop-ios-ui.md](../engineering/desktop-ios-ui.md) §9。
- 已知限制：桌面等宽数字依赖系统 SF Mono / Menlo 回退；图表是手写 SVG，a11y 由 `aria-label` + `sr-only` 表兜底。
