---
doc: prd/INDEX
title: 功能需求分支索引
status: active
updated: 2026-10-31
load: on-demand
children:
  - pet/INDEX.md
  - mic/INDEX.md
---

# 功能需求分支

本期只有两个功能，各自一个子目录。**不要同时读两份 PRD**，除非你在处理跨功能契约。

## 读哪篇

| 功能 | 一句话 | 状态 | 入口 |
| --- | --- | --- | --- |
| 情绪宠物 | 横屏手机里的黏土小宠物，纯陪伴 | 代码完成，真机/Rive 待补 | [pet/INDEX.md](./pet/INDEX.md) |
| 外设麦克风 | 按住手机说话，电脑本机转文字并输入 | P0 已实现，真机/自动粘贴待回归 | [mic/INDEX.md](./mic/INDEX.md) |

## 每个功能怎么读

```text
INDEX.md（一页摘要 + 阅读地图）
  ├─ PRD.md          产品/评审：为什么、做什么、规则、优先级
  ├─ SPEC.md         设计/前端：布局、状态机、手势、文案
  └─ ACCEPTANCE.md   测试/开发：Given-When-Then
```

- 产品评审：INDEX → PRD。
- 设计/前端：INDEX → SPEC；需要规则时再读 PRD 对应章节。
- 测试：INDEX → ACCEPTANCE；需要背景时再读 PRD 第 3 节。
- 技术方案：直接去 `engineering/`，不要从 PRD 里找实现。

## 跨功能契约

1. 宠物和麦克风共享手机横屏舞台，但代码分属 `mobile/features/pet` 与 `mobile/features/mic`。
2. 麦克风状态优先于宠物情绪；倾听时暂停随机 idle，结束后恢复之前心情。
3. 宠物不遮挡麦克风按钮、波形、计时、取消区。
4. 麦克风不依赖宠物渲染成功；宠物降级不影响录音/转写。
5. 任何功能都不自动发送/回车；只输入文本。

产品范围见 [product/scope.md](../product/scope.md)；规范见 [standards/INDEX.md](../standards/INDEX.md)。

## 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-10-31 | 创建两份 PRD；确定纯陪伴宠物、AI 语音输入麦克风、横屏双姿态 |
