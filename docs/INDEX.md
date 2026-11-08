---
doc: INDEX
title: Sidekick 文档总索引
status: active
updated: 2026-11-08
load: always
children:
  - product/INDEX.md
  - standards/INDEX.md
  - prd/INDEX.md
  - engineering/INDEX.md
  - design/INDEX.md
---

# Sidekick 文档总索引

> 唯一入口。先读 `../AGENTS.md`（项目上下文），再从这里按任务选 **1 个**分支；不要一次读完整棵文档树。

## 0. 懒加载阅读协议

1. 只读本页 + 你需要的 **1 个**分支索引。
2. 在分支索引里最多选 **2 篇**叶子文档。
3. 够用就停；不要读“可能相关”的兄弟文档。
4. 要改代码时，再按 [standards/engineering.md](./standards/engineering.md) 找现有架构、依赖、协议文档。
5. 回答或提交时写清引用了哪些文档；发现索引过期，顺手更新。

详细规则见 [standards/documentation.md](./standards/documentation.md)。机器检查：`node scripts/check-docs.mjs`。

## 1. 按任务选分支

| 你要做什么 | 先读 | 最多再读 |
| --- | --- | --- |
| 查现在什么状态、待验收、下一步 | [status.md](./status.md) | 该功能 INDEX |
| 查为什么这么定 / 是否被取代 | [decisions.md](./decisions.md) | 该功能的 engineering 文档 |
| 查什么时候做了什么 | [history.md](./history.md) | 无 |
| 查踩过的坑、硬约束 | [engineering/pitfalls.md](./engineering/pitfalls.md) | 对应 engineering 文档 |
| 产品方向、取舍、优先级 | [product/INDEX.md](./product/INDEX.md) | 该分支 1–2 篇 |
| 写 / 评审 PRD、验收标准 | [prd/INDEX.md](./prd/INDEX.md) | [standards/product.md](./standards/product.md) |
| 交互、竖屏、反馈、无障碍 | [standards/INDEX.md](./standards/INDEX.md) | [standards/ux.md](./standards/ux.md) |
| 视觉、配色、动效、宠物资产 | [standards/INDEX.md](./standards/INDEX.md) | [standards/visual.md](./standards/visual.md) |
| 实现任何功能（宠物 / 麦克风 / 备忘录 / 用量 / 外壳 / AI 联动） | [prd/INDEX.md](./prd/INDEX.md) | 该功能 INDEX + engineering 对应篇 |
| 前端架构、依赖、平台边界 | [standards/engineering.md](./standards/engineering.md) | [frontend-architecture.md](./frontend-architecture.md) / [dependency-policy.md](./dependency-policy.md) |
| 环境、构建、调试 | 直接读 | [setup.md](./setup.md) |
| 发版：打包、签名、上传 GitHub Releases、回滚补发 | [engineering/release.md](./engineering/release.md) | [setup.md](./setup.md) |
| 维护文档体系 | [standards/documentation.md](./standards/documentation.md) | 本页 |

## 2. 目录树

```text
docs/
├─ INDEX.md                     ← 你在这里
├─ status.md                    # 当前快照 / 待验收 / 技术债 / 下一步
├─ history.md                   # 变更历史（按日期，含 D 编号与证据）
├─ decisions.md                 # 决策记录（含取代关系与编号勘误）
├─ architecture.md              # 系统拓扑、模块职责、数据与存储
├─ frontend-architecture.md     # 前端分层、样式/令牌、状态管理、边界
├─ dependency-policy.md         # 依赖准入与许可证
├─ setup.md                     # 环境、构建、打包、调试
├─ ble-notes.md                 # 蓝牙预研（冻结，非主线）
├─ product/                     # 为什么做、给谁做、这期做什么
├─ standards/                   # 文档/产品/交互/视觉/工程/git 规范
├─ prd/                         # pet / mic / hook / usage / shell / memo
├─ engineering/                 # 技术方案 + pitfalls.md（坑与硬约束）
└─ design/                      # 设计归档（ARCHIVE.md，只读结论）
```

## 3. 事实的唯一归属

| 事实 | 唯一归属 |
| --- | --- |
| 产品原则 / 本期范围 / 指标 | [product/principles.md](./product/principles.md) / [scope.md](./product/scope.md) / [metrics.md](./product/metrics.md) |
| 交互规则 / 视觉令牌与宠物美术 | [standards/ux.md](./standards/ux.md) / [standards/visual.md](./standards/visual.md) |
| 前端架构与目录 | [frontend-architecture.md](./frontend-architecture.md) |
| 系统拓扑与模块 | [architecture.md](./architecture.md) |
| 依赖准入 | [dependency-policy.md](./dependency-policy.md) |
| 发版与分发流程 | [engineering/release.md](./engineering/release.md) |
| 现有协议 / 音频协议 | [../protocol/README.md](../protocol/README.md) / [engineering/protocol-audio.md](./engineering/protocol-audio.md) |
| 语音输入链路 / 百炼云端 | [prd/mic/](./prd/mic/INDEX.md) / [engineering/audio-pipeline.md](./engineering/audio-pipeline.md) / [engineering/asr-cloud-bailian.md](./engineering/asr-cloud-bailian.md) |
| 剪贴板 / AI 联动 / 用量 / 备忘录 / 外壳 | 各自 `prd/<feature>/` + 同名 `engineering/*.md` |
| 踩过的坑与硬约束 | [engineering/pitfalls.md](./engineering/pitfalls.md) |
| 当前进度 / 历史 / 重大决策 | [status.md](./status.md) / [history.md](./history.md) / [decisions.md](./decisions.md) |
| 设计归档（只读） | [design/ARCHIVE.md](./design/ARCHIVE.md) |

同一条规则只写一处，其它地方用链接；不要复制。

## 4. 维护

- 新增文档：写 frontmatter → 在父索引登记 → 跑 `node scripts/check-docs.mjs`。
- 修改事实：先改“唯一归属”文档，再检查引用它的索引；不要在多处改同一个数字。
- 废弃文档：`status: deprecated`，保留链接，写明替代文档；确认无引用后删除。
- 新增的坑写 [engineering/pitfalls.md](./engineering/pitfalls.md)，不要往 `AGENTS.md` 堆流水账；变更记 [history.md](./history.md)，取舍记 [decisions.md](./decisions.md)。
