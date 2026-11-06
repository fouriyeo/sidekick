---
doc: design/mobile-ui-v16
title: 手机端 v16 干净版 UI 归档
status: archived
updated: 2026-11-06
load: on-demand
owner: design
related:
  - ../../prd/shell/PRD.md
  - ../../prd/shell/SPEC.md
  - ../../decisions.md
---

# 手机端 v16 干净版 UI 归档

> 2026-11-05 定稿并已落到手机端的 v16 视觉方案，配合 D80（两页壳）与 D81（MiSans 字体）阅读。
> 设计原则：iOS 的「内容优先 + 克制 tint + 清楚层级」，但不照搬 Liquid Glass / SF 蓝；手机端只留宠物页与设置二级页，没有底部 tab。
> **本归档不保留 HTML 原型与截图**：视觉以已落地页面为准（`app/src/mobile/`）；过程素材按 D71 与 [git.md](../../standards/git.md) 不入库，2026-11-06 已清理。

## 关键规格

- 手机只有两页：宠物（根）/ 设置（二级）。顶栏 gear / 连接状态 / chat；无底部 tab。
- 宠物页：会话卡置顶（折叠 1 行 / 展开 5 行、working wash、× 二次确认）→ 无底色鲸鱼（230 / 展开 220）→ 居中 56 薄荷圆麦克风（距底 24）。
- 结果卡：弹窗三段 grabber + header 16「已输入」+ content 13 单行 + footer 15「清空 / ↵ 回车」；总高约 125；清空二次确认。
- 令牌：`app/src/mobile/styles/clean.css`（`.mobile-clean`，浅/深两套，只作用手机）。
- 字体：MiSans Normal 400（随包 WOFF2，D81）；会话标题 15；设置说明行高 1.45；正文 13。
- 角色：鲸鱼不重绘、不染色、不加 filter；桌面端不受影响。

## 实现与决策

- 代码落点：`app/src/mobile/{app.tsx,ui-store.ts,styles/clean.css}`、`app/src/mobile/features/{pet,sessions,settings,mic}/**`、`app/src/mobile/shell/{pet-top-bar,page-header}.tsx`。
- 决策：D80（两页壳 / 删动态页 / 会话置顶 / 结果卡三段）、D81（MiSans + 字号/行高）。
- 验收：`docs/prd/shell/ACCEPTANCE.md` 的 SHL-AC-26…47、SHL-AC-55…59；真机基础页已验，录音禁切页 / 结果卡清空 / 320 宽待补。
