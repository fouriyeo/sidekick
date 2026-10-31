# Sidekick 文档

> **唯一入口：[INDEX.md](./INDEX.md)**。本页只做人类导览，不复制内容。
> 文档按“树形 + 懒加载”组织：先读总索引，再选一个分支，最多读 2 篇叶子。

## 先读

1. [../AGENTS.md](../AGENTS.md) — 项目上下文、命令、已知坑。
2. [INDEX.md](./INDEX.md) — 按任务选分支。

## 分支

| 分支 | 内容 | 入口 |
| --- | --- | --- |
| 产品 | 原则、用户、范围、指标 | [product/INDEX.md](./product/INDEX.md) |
| 规范 | 文档、产品、交互、视觉、工程 | [standards/INDEX.md](./standards/INDEX.md) |
| PRD | 情绪宠物、外设麦克风 | [prd/INDEX.md](./prd/INDEX.md) |
| 工程 | 音频链路、协议提案、宠物运行时、测试 | [engineering/INDEX.md](./engineering/INDEX.md) |

## 基础文档（现有事实源）

- [architecture.md](./architecture.md) — 系统架构、接口、限制
- [frontend-architecture.md](./frontend-architecture.md) — 前端目标架构、目录、样式/组件/动画/性能
- [dependency-policy.md](./dependency-policy.md) — 依赖准入、许可证、体积预算
- [setup.md](./setup.md) — 环境、构建、无线调试
- [status.md](./status.md) — 进度、已验证内容、已知问题
- [decisions.md](./decisions.md) — 关键选型与取舍
- [ble-notes.md](./ble-notes.md) — 蓝牙预研（非主线）
- [../protocol/README.md](../protocol/README.md) — 事件协议 v0

## 维护

- 新文档带 frontmatter，并在父索引登记；事实只写一处。
- 修改事实先改“唯一归属”，再同步索引；不要复制正文。
- 改完运行 `node scripts/check-docs.mjs`。
- 规则细节见 [standards/documentation.md](./standards/documentation.md)。
