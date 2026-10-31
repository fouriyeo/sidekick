---
name: sidekick-docs
description: Sidekick 项目文档导航与懒加载。用户问“这个项目怎么做/规范在哪/读 PRD/下一步做什么/文档在哪”时使用；先读 docs/INDEX.md，再按任务选一个分支，最多读 2 篇叶子，不批量读取 docs。
---

# Sidekick 文档导航

## 何时使用

- 需要查 Sidekick 的产品原则、范围、PRD、交互/视觉规范、工程方案、进度。
- 需要回答“这个功能怎么设计”“下一步做什么”“文档在哪”。
- 需要判断某个改动该同步哪些文档。

## 阅读协议

1. 始终先读 `AGENTS.md` + `docs/INDEX.md`。
2. 从根索引的“按任务选分支”选 **1 个**分支，读它的 `INDEX.md`。
3. 在分支索引里选 **最多 2 篇**叶子；先读摘要/表格，不够再读具体章节。
4. 够用就停；不要读“可能相关”的兄弟文档。
5. 需要跨分支时最多再开 1 个分支索引；仍不够就向用户说明缺什么。
6. 不修改文件；回答时用 `path:line` 标依据。

## 快速路由

| 问题 | 分支 |
| --- | --- |
| 为什么做、给谁、这期做什么 | `docs/product/INDEX.md` |
| PRD、优先级、验收 | `docs/prd/INDEX.md` |
| 横屏、触控、反馈、无障碍 | `docs/standards/ux.md` |
| 配色、字体、宠物资产、动效 | `docs/standards/visual.md` |
| 平台边界、依赖、DoD | `docs/standards/engineering.md` |
| 音频链路、协议、宠物运行时 | `docs/engineering/INDEX.md` |
| 进度、环境、决策 | `docs/status.md` / `docs/setup.md` / `docs/decisions.md` |

## 维护

- 发现索引过期、链接错误、内容冲突：先指出，再建议改哪一篇。
- 新增文档：写 frontmatter → 在父索引登记 → 跑 `node scripts/check-docs.mjs`。
- 事实只写一处；其它地方用链接，不复制。

## 输出格式

1. 结论（3–8 行）。
2. 依据（`path:line`）。
3. 下一步读/改哪篇。
4. 文档未覆盖的部分。
