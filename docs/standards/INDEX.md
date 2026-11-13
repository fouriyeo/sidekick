---
doc: standards/INDEX
title: 规范分支索引
status: active
updated: 2026-11-05
load: on-demand
children:
  - documentation.md
  - product.md
  - ux.md
  - visual.md
  - engineering.md
  - git.md
---

# 规范分支

这里放“全项目都要遵守的规则”。功能细节去 `prd/`，实现方案去 `engineering/`。

## 读哪篇

| 你要做什么 | 读这篇 | 体量 |
| --- | --- | --- |
| 新增/维护文档，或让 AI 懒加载文档 | [documentation.md](./documentation.md) | M |
| 写 PRD、排优先级、评审需求、改范围 | [product.md](./product.md) | M |
| 设计两端壳（导航/状态条/页头）、竖屏、触控、手势、反馈、错误文案 | [ux.md](./ux.md) | L |
| 定视觉、配色、字体、宠物资产、动效 | [visual.md](./visual.md) | L |
| 查字号、行高、文字间距、圆角、阴影的具体数值 | [style-guide.html](./style-guide.html) | M |
| 改前端/平台边界/依赖/测试 | [engineering.md](./engineering.md) | M |
| 提交/推送代码，写 commit、判断能不能 push | [git.md](./git.md) | S |

## 约束力顺序

1. [decisions.md](../decisions.md) 里已记录的**最新**决策。
2. 本分支规范。
3. [PRD / SPEC](../prd/INDEX.md) 里的功能规则。
4. 旧文档和代码注释。

当前实现以代码/配置为事实；文档描述目标与规则。两者不一致时，先判断是文档过期还是实现偏离，修一处并在 `decisions.md` 记录重大取舍。

## 规范之间的边界

| 问题 | 不该写在哪 |
| --- | --- |
| 某个功能为什么做、优先级 | `standards/ux.md` |
| 某个按钮在屏幕的坐标 | `prd/*/PRD.md`（PRD 不写视觉布局） |
| 宠物动作名、协议字段 | `standards/visual.md`（应放 `engineering/`） |
| 依赖版本号 | 任何规范文档（以 `pnpm-lock.yaml` / `Cargo.lock` 为准） |

## 维护

- 规范变更影响多个功能时，先改规范，再检查受影响的 PRD/SPEC。
- 只影响一个功能的规则，写进该功能的 SPEC，不要升格为全局规范。
- 新增规范必须能在评审或测试里执行；不能执行的口号不要写。
