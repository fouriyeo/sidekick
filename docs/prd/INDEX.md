---
doc: prd/INDEX
title: 功能需求分支索引
status: active
updated: 2026-11-05
load: on-demand
children:
  - pet/INDEX.md
  - mic/INDEX.md
  - hook/INDEX.md
  - usage/INDEX.md
  - shell/INDEX.md
---

# 功能需求分支

本期三类需求：两个主功能（宠物、麦克风）+ AI 联动（DSH hook）+ 应用外壳（指挥舱：导航 / 状态词 / 首用清单）。**不要同时读两份 PRD**，除非你在处理跨功能契约。

## 读哪篇

| 功能 | 一句话 | 状态 | 入口 |
| --- | --- | --- | --- |
| 情绪宠物 | 竖屏手机里的黏土小宠物，纯陪伴 | 代码完成，真机待补 | [pet/INDEX.md](./pet/INDEX.md) |
| 外设麦克风 | 按住手机说话，电脑本机转文字并输入 | P0 已实现，真机/自动粘贴待回归 | [mic/INDEX.md](./mic/INDEX.md) |
| AI 联动（DSH） | 桌面开关把 AI 状态推给手机，宠物四态 + 三音效 | 开发中 | [hook/INDEX.md](./hook/INDEX.md) |
| Token 用量看板 | 桌面第 6 页 + 手机设置二级页；客户端/会话/模型分组 + 价格表 | 开发中（2026-11-06，D82–D84） | [usage/INDEX.md](./usage/INDEX.md) |
| 应用外壳（指挥舱） | 桌面 5 视图 + 手机 3 档 + 状态语言 + 首用清单 | 代码完成，待真机回归（2026-11-05，D79） | [shell/INDEX.md](./shell/INDEX.md) |

## 每个功能怎么读

```text
INDEX.md（一页摘要 + 阅读地图）
  ├─ PRD.md          产品/评审：为什么、做什么、规则、优先级
  ├─ SPEC.md         设计/前端：布局、状态机、AI 联动、文案
  └─ ACCEPTANCE.md   测试/开发：Given-When-Then
```

- 产品评审：INDEX → PRD。
- 设计/前端：INDEX → SPEC；需要规则时再读 PRD 对应章节。
- 测试：INDEX → ACCEPTANCE；需要背景时再读 PRD 第 3 节。
- 技术方案：直接去 `engineering/`，不要从 PRD 里找实现。

## 跨功能契约

1. 宠物和麦克风共享手机竖屏舞台，但代码分属 `mobile/features/pet` 与 `mobile/features/mic`。
2. 麦克风状态优先于宠物情绪；倾听时暂停随机 idle，结束后恢复之前心情。
3. 宠物不遮挡麦克风按钮、波形、计时、取消区。
4. 麦克风不依赖宠物渲染成功；宠物降级不影响录音/转写。
5. 任何功能都不自动发送/回车；只输入文本。用户在结果卡片主动点按「回车/清空」属于显式操作，不算自动发送。
6. AI 联动只影响宠物展示状态，不改变宠物存档/作息规则；倾听优先于 AI 状态，结束后恢复。
7. 应用外壳只决定承载位置（导航 / 页面归属 / 状态词 / 首用清单），不改宠物、麦克风、AI 联动的内部状态机与隐私口径；状态词以 [shell/SPEC.md](./shell/SPEC.md) 为准。

产品范围见 [product/scope.md](../product/scope.md)；规范见 [standards/INDEX.md](../standards/INDEX.md)。

## 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-10-31 | 创建两份 PRD；确定纯陪伴宠物、AI 语音输入麦克风、横屏双姿态 |
| 2026-11-02 | 新增 AI 联动（DSH hook）PRD/SPEC/AC；桌面开关 + 本地脚本注入 + 手机四态/三音效 |
| 2026-11-04 | 麦克风结果卡片新增手动「回车/清空」按钮（`key.request`/`key.result`），明确不属于自动发送（D68） |
| 2026-11-04 | 宠物触摸互动下线（D69）：删除摸摸/戳/爱心/亲密度/`interacting` 与设置页无障碍入口，点击宠物无反应 |
| 2026-11-05 | 新增应用外壳（指挥舱）PRD/SPEC/AC：桌面 5 视图 + 手机 3 档 + 状态语言 + 首用清单（D79） |
| 2026-11-05 | 首次命名/改名下线：宠物固定显示「小跟班」，`onboarded` 只表示是否已见过面；删除 `name` 存档字段、`NAME_SET`/`celebrating`/`happy`/爱心，旧存档 `name` 忽略不迁移 |
| 2026-11-06 | 新增 Token 用量看板 PRD/SPEC/AC：桌面第 6 导航「用量」+ 手机「设置 › 用量」+ 客户端/会话/模型分组 + 模型价格表（D82–D84） |
