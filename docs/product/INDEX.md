---
doc: product/INDEX
title: 产品分支索引
status: active
updated: 2026-11-05
load: on-demand
children:
  - principles.md
  - users.md
  - scope.md
  - metrics.md
---

# 产品分支

回答四个问题：**为什么做、给谁做、这期做什么、怎么判断做成了**。

## 读哪篇

| 你要回答的问题 | 读这篇 | 体量 |
| --- | --- | --- |
| 遇到取舍，按什么排序？ | [principles.md](./principles.md) | S |
| 用户是谁、在什么场景用？ | [users.md](./users.md) | S |
| 这期做什么、不做什么？ | [scope.md](./scope.md) | S |
| 成功怎么衡量、埋点怎么记？ | [metrics.md](./metrics.md) | S |

只回答“范围”就只读 `scope.md`，不要顺手读完整分支。

## 一页产品定位

- 产品：小跟班 · Sidekick。
- 形态：手机竖着放在桌边，是电脑的外设，也是会回应的桌宠。
- 本期两个功能：
  1. **情绪宠物**：纯陪伴，不考核、不催办、不制造焦虑。
  2. **外设麦克风**：按住手机说话，电脑经百炼云端转文字，输入到当前 AI 工具。
- 平台矩阵（唯一归属：[scope.md](./scope.md#2-平台矩阵)）：
  - 手机：宠物主体 + 麦克风采集。
  - 桌面：麦克风接收 / 百炼云端转写 / 文本输入 + 状态浮窗 + 语音页（百炼配置/关键词/用量）；本期不渲染宠物。
  - 共享：协议类型、设计令牌、无平台语义的组件。

## 与其它分支的关系

- 规则怎么写 → [standards/INDEX.md](../standards/INDEX.md)
- 功能需求 → [prd/INDEX.md](../prd/INDEX.md)
- 技术方案 → [engineering/INDEX.md](../engineering/INDEX.md)
- 重大取舍 → [decisions.md](../decisions.md)

## 维护

- 产品原则、范围、指标变化时，先改本分支，再检查 PRD 和规范里的引用。
- 不在这里写实现方案、布局细节或接口定义。
