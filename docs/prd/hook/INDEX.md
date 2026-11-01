---
doc: prd/hook/INDEX
title: AI 联动（Hook）功能索引
status: draft
updated: 2026-11-02
load: on-demand
owner: product
children:
  - PRD.md
  - SPEC.md
  - ACCEPTANCE.md
related:
  - ../pet/INDEX.md
  - ../../engineering/dsh-hook.md
---

# AI 联动（Hook）

把电脑 AI 的工作状态变成手机宠物的四种状态和三种声音；第一期接 DeepSeek Harness（DSH），不安装第三方插件。

## 一句话

- **做什么**：桌面端一个「AI 联动」页，开关后把 DSH 的「开始工作 / 等你决定 / 完成」推给手机；手机宠物用明显的动作和短音效表达。
- **不做什么**：不在手机上回答 AI、不做文本消息、不做关闭 App 后的推送、不做任务详情/进度条。
- **边界**：只同步状态和会话数，不同步提示词、回复、工具参数、文件路径。

## 读哪篇

| 你要做什么 | 读这篇 | 体量 |
| --- | --- | --- |
| 产品评审：为什么、范围、规则、指标 | [PRD.md](./PRD.md) | M |
| 设计/前端：四态动作、声音、桌面页、优先级 | [SPEC.md](./SPEC.md) | M |
| 测试：安装、事件、动作、声音、隐私 | [ACCEPTANCE.md](./ACCEPTANCE.md) | M |
| 实现：DSH 脚本、Rust 桥、协议、文件布局 | [engineering/dsh-hook.md](../../engineering/dsh-hook.md) | M |

## 当前结论

- DSH 接入用**本地脚本注入**：Sidekick 写 `~/.dsh/profiles/<profile>/plugins/sidekick-hook.mjs` 并在 `cordis.patch.yml` 插入一行；不装 npm 包、不改 DSH 源码。
- 首次开启需要重启 DSH 一次；之后开关只改配置，脚本 1 秒内热生效。
- 四态：**静态、工作中、等你决定、完成（3 秒）**；工作中要非常繁忙，等你决定要着急找人，完成要爆发庆祝。
- 三个音效：开工、提问、完成；默认关闭，可在宠物设置试听。
- 聚合所有**顶层**会话；子代理 P0 不计数。显式提问/审批才算「等你决定」，自由文本提问不算。

## 关联

- 宠物状态机与存档：[pet/SPEC.md](../pet/SPEC.md)
- 协议：[protocol/README.md](../../../protocol/README.md)
- 决策：[decisions.md](../../decisions.md)
