---
doc: prd/INDEX
title: 功能需求分支索引
status: active
updated: 2026-11-13
load: on-demand
children:
  - pet/INDEX.md
  - mic/INDEX.md
  - hook/INDEX.md
  - usage/INDEX.md
  - shell/INDEX.md
  - memo/INDEX.md
  - english-corner/INDEX.md
  - playground/INDEX.md
---

# 功能需求分支

本期七类主需求；另设「玩法」候选池（非主功能，未排期）。**不要同时读两份 PRD**，除非你在处理跨功能契约。变更历史见 [history.md](../history.md)，当前状态与待验收项见 [status.md](../status.md)。

## 读哪篇

| 功能 | 一句话 | 状态 | 入口 |
| --- | --- | --- | --- |
| 情绪宠物 | 竖屏手机里的宠物宠物，纯陪伴 | 代码完成，真机 60fps / 存档跨重启待补 | [pet/INDEX.md](./pet/INDEX.md) |
| 外设麦克风 | 按住手机说话 → 电脑写剪贴板并合成 Cmd+V | 代码完成（百炼云端唯一），自动粘贴真机矩阵待补 | [mic/INDEX.md](./mic/INDEX.md) |
| AI 联动（DSH） | 桌面 hook 把 AI 状态推给手机：四态 + 会话列表 | 代码完成，待真机/隐私验收 | [hook/INDEX.md](./hook/INDEX.md) |
| Token 用量看板 | 桌面「用量 ⌘4」+ 手机顶栏今日数字；客户端/会话/模型分组 + 价格表 | 代码完成，真实账本对账待补 | [usage/INDEX.md](./usage/INDEX.md) |
| 应用外壳 | 桌面 6 个一级页（剪贴板/备忘录/用量/语音/英语角/设置）+ Liquid Glass；手机两页 + 备忘录全屏页；状态词 + 首用清单 | 代码完成，窗口/真机目检待补 | [shell/INDEX.md](./shell/INDEX.md) |
| 语音备忘录 | 手机前台录音 → 分段转写 → LLM 归类 → 本地库；电脑同局域网只读镜像 | S1+S2 代码完成，真机配对/同步待验收 | [memo/INDEX.md](./memo/INDEX.md) |
| 英语角 | 生词本：记录 → AI 解释 → 用我的词造句；桌面 ⌘7 + 手机全屏页 + 局域网双向同步 | 代码完成，真机/QA 待验收 | [english-corner/INDEX.md](./english-corner/INDEX.md) |
| 玩法（候选池） | 非主线的趣味小功能集合；K歌/人声扩音为首个候选 | 方案已存，未开发/未排期 | [playground/INDEX.md](./playground/INDEX.md) |

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
2. 麦克风不依赖宠物渲染成功，宠物降级不影响录音/转写；录音时只保留 `micListening` 门禁（宠物不再响应麦克风，D77）。
3. 宠物不遮挡麦克风按钮、波形、计时、取消区。
4. 任何功能都不自动发送/回车；只输入文本。结果卡上的「回车/清空」是用户显式点按，不算自动发送（D68）。
5. AI 联动只影响宠物展示状态，不改变宠物存档/作息规则。
6. 应用外壳只决定承载位置（导航 / 页面归属 / 状态词 / 首用清单），不改宠物、麦克风、AI 联动的内部状态机与隐私口径；状态词以 [shell/SPEC.md](./shell/SPEC.md) 为准。
7. 语音输入（不落盘、不后台）与语音备忘录（用户可见的落盘链路）是两条链路，隐私口径不要混写。

产品范围见 [product/scope.md](../product/scope.md)；规范见 [standards/INDEX.md](../standards/INDEX.md)；实现边界见 [engineering/INDEX.md](../engineering/INDEX.md)。
