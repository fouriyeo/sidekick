---
doc: design/usage-dashboard-v2
title: 用量看板 v2 设计归档
status: archived
updated: 2026-11-06
load: on-demand
owner: design
related:
  - ../../prd/usage/INDEX.md
  - ../../engineering/desktop-ios-ui.md
  - ../../decisions.md
---

# 用量看板 v2 设计归档

> 2026-11-06 定稿的「深潜仪表 / 花费剖面」v2：桌面宽幅数据页 + 手机紧凑仪表。用户先看 HTML 视觉稿确认方向（「这一版还不错」），再落地 D97/D98。V1 的 2×2 卡片与固定柱阵归档见 [token-dashboard-v1](../token-dashboard-v1/README.md)。

## 设计方向

- **一句话**：把用量页从「设置列表里的四格卡片」变成一台仪表——花费是主角，曲线讲形状，光谱讲构成，账本讲去向。
- **数据语言（两端共用）**：花费大数 + 环比 → 当前区间的花费剖面 → Token 光谱 + 占比 → 按花费排序的账本。手机只换布局与交互（触摸、无 y 轴），不换语言。
- **桌面**：宽 900、无白卡、等宽数字；剖面有 y 轴、网格、日均虚线、峰值标注、今日呼吸点；下半区左构成/价格、右账本。
- **手机**：无卡片、hairline 分区、花费 hero + 三读数；剖面 150 高、无 y 轴、拖动气泡；分组行底 3px 占比条；价格只读。
- **主题**：深色「深海仪表」/ 浅色「海玻璃纸面」；暗色只给小面积细线与面积淡渐变，不做大光晕（OLED）。

## 关键规格

| 项 | 桌面（D97） | 手机（D98） |
| --- | --- | --- |
| 内容宽 | 900（`PageShell size="wide"`，max-w 956） | 390 / 360 / 320，左右 16 |
| 页头 | `compact`：无 34/600 大标题，工具栏 17/600 常显 | 44 + 13 副行（保留隐私承诺） |
| 区间/分组 | 下划线 tab、`aria-pressed` | 同左（区间 44 / 分组 36 高） |
| 图表 | SVG 900×196，y 轴 + 网格 + 悬停 + 今日/单日 | SVG 150 高，无 y 轴，触摸拖动 + 气泡 |
| 构成 | 10px 光谱 + 5 行 | 8px 光谱 + 5 行 |
| 账本 | 行内按金额降序 + 3px 占比条 + Token/金额 | 同左（行高 56–64） |
| 价格 | 左下价格行 → Sheet | 只读价格行，无刷新 |
| 断点 | <1080 hero 换行、下半区单列 | 仅竖屏 |

## 令牌与实现落点

- 桌面：[usage.css](../../../app/src/desktop/styles/usage.css)（`.dsl-usage`）、[usage-page.tsx](../../../app/src/desktop/pages/usage-page.tsx)、[features/usage](../../../app/src/desktop/features/usage/usage-hero.tsx)、[PageShell wide](../../../app/src/desktop/shell/page-shell.tsx)、[PageHeader compact](../../../app/src/desktop/shell/page-header.tsx)
- 手机：[usage.css](../../../app/src/mobile/styles/usage.css)（`.mobile-usage`）、[usage-page.tsx](../../../app/src/mobile/features/usage/usage-page.tsx)、[spend-profile.tsx](../../../app/src/mobile/features/usage/spend-profile.tsx)
- 共享数学：[usage-chart.ts](../../../app/src/shared/lib/usage-chart.ts)（刻度/路径/日期/环比/百分比/排序）
- 五桶颜色：缓存读 c1 薄荷、输入 c2 蓝、输出 c3 琥珀、缓存写 c4 紫、推理 c5 灰绿；**不再用 chart-2 蓝表示缓存读**。
- 色彩纪律：命中率不只靠颜色传达（数值 + 文字总在场）；估算 `≈`、未知 `—`、上期 0 隐藏环比。

## 已知限制

- 后端分组 Top 8 已按**金额降序**选取（D102，同额再按 Token）；UI 也按金额排序并标「按花费」；会话标题缺失时从 DSH 会话缓存只读回填（D103）。
- 桌面等宽数字依赖系统 SF Mono/Menlo 回退；无字体包。
- 图表是手写 SVG（无图表库），a11y 由 aria-label + sr-only 表兜底；jsdom 中断言不了几何，只测内容与交互语义。
- 视觉稿里的主题切换按钮、4 项导航没有进入实现（主题走系统/设置，导航是 D94 的 5 项）。
