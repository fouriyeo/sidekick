---
doc: INDEX
title: Sidekick 文档总索引
status: active
updated: 2026-11-06
load: always
children:
  - product/INDEX.md
  - standards/INDEX.md
  - prd/INDEX.md
  - engineering/INDEX.md
  - design/INDEX.md
---

# Sidekick 文档总索引

> 唯一入口。先读 `../AGENTS.md`（项目上下文），再从这里按任务选一个分支；不要一次读完整棵文档树。

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
| 产品方向、取舍、优先级 | [product/INDEX.md](./product/INDEX.md) | 该分支 1–2 篇 |
| 写 / 评审 PRD | [prd/INDEX.md](./prd/INDEX.md) | [standards/product.md](./standards/product.md) |
| 设计竖屏、触控、反馈 | [standards/INDEX.md](./standards/INDEX.md) | [standards/ux.md](./standards/ux.md) |
| 视觉、配色、动效、宠物资产 | [standards/INDEX.md](./standards/INDEX.md) | [standards/visual.md](./standards/visual.md) |
| 实现宠物 | [prd/pet/INDEX.md](./prd/pet/INDEX.md) | PRD / SPEC + [engineering/pet-runtime.md](./engineering/pet-runtime.md) |
| 实现麦克风 | [prd/mic/INDEX.md](./prd/mic/INDEX.md) | PRD / SPEC + [engineering/audio-pipeline.md](./engineering/audio-pipeline.md) + [engineering/protocol-audio.md](./engineering/protocol-audio.md) + [engineering/asr-model.md](./engineering/asr-model.md) + [engineering/asr-cloud-bailian.md](./engineering/asr-cloud-bailian.md) |
| 做桌面剪贴板 | [engineering/clipboard-manager.md](./engineering/clipboard-manager.md) | 该篇 |
| 做自动发现 | [engineering/lan-discovery.md](./engineering/lan-discovery.md) | 该篇 |
| 做 AI 联动 / DSH hook / 宠物四态 / 会话列表 | [prd/hook/INDEX.md](./prd/hook/INDEX.md) | PRD / SPEC + [engineering/dsh-hook.md](./engineering/dsh-hook.md) |
| 做 Token 用量看板 / 模型价格 / 三种分组 | [prd/usage/INDEX.md](./prd/usage/INDEX.md) | PRD / SPEC + [engineering/token-usage-pricing.md](./engineering/token-usage-pricing.md) |
| 做语音备忘录 / 录音卡 / 手机独立 AI 归类 | [prd/memo/INDEX.md](./prd/memo/INDEX.md) | PRD / SPEC + [engineering/memo-pipeline.md](./engineering/memo-pipeline.md) |
| 改应用外壳 / 导航 / 状态词 / 首用清单 | [prd/shell/INDEX.md](./prd/shell/INDEX.md) | PRD / SPEC / AC |
| 前端架构、依赖、平台边界 | [standards/engineering.md](./standards/engineering.md) | [frontend-architecture.md](./frontend-architecture.md) / [dependency-policy.md](./dependency-policy.md) |
| 查进度、环境、构建 | 直接读 | [status.md](./status.md) / [setup.md](./setup.md) |
| 记录重大决策 | 直接读 | [decisions.md](./decisions.md) |
| 维护文档体系 | [standards/documentation.md](./standards/documentation.md) | 本页 |

## 2. 目录树

```text
docs/
├─ INDEX.md                     ← 你在这里（始终加载）
├─ product/                     # 为什么做、给谁做、这期做什么
│  ├─ INDEX.md
│  ├─ principles.md             # 产品原则与取舍顺序
│  ├─ users.md                  # 用户画像、场景、JTBD
│  ├─ scope.md                  # 本期范围、平台矩阵、非目标
│  └─ metrics.md                # 北极星、护栏、埋点、隐私
├─ standards/                   # 全项目规范
│  ├─ INDEX.md
│  ├─ documentation.md          # 文档树、元数据、懒加载协议
│  ├─ product.md                # PRD / 优先级 / 变更 / 质量门
│  ├─ ux.md                     # 竖屏、反馈、AI 联动、无障碍
│  ├─ visual.md                 # 深海声呐双主题、令牌、宠物资产、动效
│  └─ engineering.md            # 平台边界、依赖方向、DoD
├─ prd/                         # 功能需求
│  ├─ INDEX.md
│  ├─ pet/                      # INDEX + PRD / SPEC / ACCEPTANCE
│  ├─ mic/                      # INDEX + PRD / SPEC / ACCEPTANCE
│  ├─ hook/                     # INDEX + PRD / SPEC / ACCEPTANCE（AI 联动）
│  ├─ usage/                    # INDEX + PRD / SPEC / ACCEPTANCE（Token 用量看板）
│  ├─ shell/                    # INDEX + PRD / SPEC / ACCEPTANCE（桌面简约 iOS + 手机两页壳）
│  └─ memo/                     # INDEX + PRD / SPEC / ACCEPTANCE（语音备忘录：手机独立录音 + AI 归类 + 局域网镜像）
├─ engineering/                 # 技术方案
│  ├─ INDEX.md
│  ├─ audio-pipeline.md         # 采集 → 传输 → 转写 → 输入
│  ├─ protocol-audio.md         # 麦克风音频协议（已实现）
│  ├─ asr-model.md              # 百炼语音页/关键词、Token/费用统计
│  ├─ clipboard-manager.md      # 桌面剪贴板历史与隐私过滤
│  ├─ dsh-hook.md               # DSH 本地脚本注入、Rust 桥、四态协议
│  ├─ token-usage-pricing.md   # Token 用量账本、聚合、模型价格表
│  ├─ memo-pipeline.md         # 语音备忘录：手机独立录音、分段转写、LLM 归类、局域网镜像
│  ├─ desktop-ios-ui.md         # 电脑端「简约 iOS」界面契约（实现契约）
│  ├─ lan-discovery.md          # UDP 发现与动态端口
│  ├─ pet-runtime.md            # 帧动画图集、状态机、持久化、性能
│  └─ quality.md                # 测试矩阵、真机验收、发布门
├─ design/                      # 设计归档（已落地：mobile-ui-v16 / token-dashboard-v1）
│  ├─ mobile-ui-v16/            # INDEX + README（无过程素材）
│  └─ token-dashboard-v1/       # INDEX + README（无过程素材）
├─ architecture.md              # 现有：系统架构与接口
├─ frontend-architecture.md     # 现有：前端目标架构与规范
├─ dependency-policy.md         # 现有：依赖准入与许可证
├─ setup.md                     # 现有：环境、构建、调试
├─ status.md                    # 现有：进度与已知问题
├─ decisions.md                 # 现有：决策记录
└─ ble-notes.md                 # 现有：蓝牙预研（非主线）
```

> 文档体量、读法与叶子行数上限见 [standards/documentation.md](./standards/documentation.md)。
## 4. 当前阶段（2026-11-06）

- 已完成：局域网 MVP、自动发现与动态端口、前端 Phase 1、宠物 P0 代码、麦克风（百炼云端唯一）代码、语音页/关键词 + 用量统计、桌面剪贴板 P1、断连自动重连、屏幕常亮/触感、双主题（D71/D76）、首次命名/改名下线（2026-11-05）；D69/D77/D78 继续有效。
- 已完成（代码，待交互回归）：**桌面「简约 iOS」重做**（D85，2026-11-06）——224 侧栏 + 概览 / 剪贴板 / 备忘录 / 用量 / 语音 / 设置 6 个一级入口 + iOS 分组列表 + 二级页，取代 D79 的 6 视图；2026-11-06 第二轮：**Liquid Glass 质感层（D86）**——sticky 玻璃工具栏、彩色图标块、胶囊控件、弹簧动效与 grain，玻璃只做控件层；**D101/D104：语音先收回「设置 › 语音输入」单页、再升为第 4 个一级入口「语音 ⌘4」**（配置 / 关键词 / 用量三段，内部不再 push）；**D119：第 2 个一级页「内容」改名「剪贴板」，设置 › 剪贴板二级页删除、历史与设置都只在剪贴板页**；**D123：备忘录拆为独立一级页「备忘录 ⌘3」**；手机两页壳（D80/D81）不变。产品规则见 [prd/shell](./prd/shell/INDEX.md)，实现契约见 [engineering/desktop-ios-ui.md](./engineering/desktop-ios-ui.md)，结构见 [frontend-architecture.md](./frontend-architecture.md)。
- 代码完成（待真机/隐私验收）：**AI 联动（DSH hook）**——产品规则见 [prd/hook](./prd/hook/INDEX.md)，技术方案见 [engineering/dsh-hook.md](./engineering/dsh-hook.md)。
- 代码完成（待验收，2026-11-06）：**Token 用量看板 V1**——桌面一级「用量」+ 手机宠物页顶栏今日数字（点开用量页，v17 / D93）+ 模型价格表；产品规则见 [prd/usage](./prd/usage/INDEX.md)，技术方案见 [engineering/token-usage-pricing.md](./engineering/token-usage-pricing.md)（D82–D84）。
- 代码完成（待真机，2026-11-06，D93）：**手机顶栏 v17**——连接状态收成信号塔图标（连上只显示图标、未连上才补短词），今日用量数字上顶栏（点开用量页），设置页移除用量入口；浏览器 QA 390/320 双主题无溢出/无 console error。
- 未开始：手机回答 AI 提问、Claude Code / Qoder hook、配对鉴权、iOS。
- 平台边界：单仓库、双产物；桌面与手机各自固定布局，不做跨端自适应。

## 5. 事实的唯一归属

| 事实 | 唯一归属 |
| --- | --- |
| 产品原则 | [product/principles.md](./product/principles.md) |
| 本期范围 | [product/scope.md](./product/scope.md) |
| 指标与埋点口径 | [product/metrics.md](./product/metrics.md) |
| 交互规则 | [standards/ux.md](./standards/ux.md) |
| 视觉令牌与宠物美术 | [standards/visual.md](./standards/visual.md) |
| 前端架构与目录 | [frontend-architecture.md](./frontend-architecture.md) |
| 依赖准入 | [dependency-policy.md](./dependency-policy.md) |
| 现有协议 | [../protocol/README.md](../protocol/README.md) |
| 麦克风音频协议 | [engineering/protocol-audio.md](./engineering/protocol-audio.md) |
| 模型页 / 用量统计 / 云端识别 | [engineering/asr-model.md](./engineering/asr-model.md) / [engineering/asr-cloud-bailian.md](./engineering/asr-cloud-bailian.md) |
| 桌面剪贴板 | [engineering/clipboard-manager.md](./engineering/clipboard-manager.md) |
| 重大决策 | [decisions.md](./decisions.md) |
| 宠物存档与运行时 | [engineering/pet-runtime.md](./engineering/pet-runtime.md) |
| AI 联动（DSH）产品规则 | [prd/hook/PRD.md](./prd/hook/PRD.md) |
| Token 用量看板 / 模型价格 | [prd/usage/INDEX.md](./prd/usage/INDEX.md) / [engineering/token-usage-pricing.md](./engineering/token-usage-pricing.md) |
| 语音备忘录产品规则 / 手机独立 AI 管道与局域网镜像 | [prd/memo/INDEX.md](./prd/memo/INDEX.md) / [engineering/memo-pipeline.md](./engineering/memo-pipeline.md) |
| 应用外壳：桌面简约 iOS 结构 / 导航 / 页面归属 / 状态词 / 首用清单 | [prd/shell/INDEX.md](./prd/shell/INDEX.md)（桌面实现契约 [engineering/desktop-ios-ui.md](./engineering/desktop-ios-ui.md)） |
| AI 四态动作/声音/桌面页 | [prd/hook/SPEC.md](./prd/hook/SPEC.md) |
| DSH 脚本/桥/安装/协议 | [engineering/dsh-hook.md](./engineering/dsh-hook.md) |
| 当前进度 | [status.md](./status.md) |

同一条规则只写一处，其它地方用链接；不要复制。

## 6. 维护

- 新增文档：写 frontmatter → 在父索引登记 → 跑 `node scripts/check-docs.mjs`。
- 修改事实：先改“唯一归属”文档，再检查引用它的索引；不要在多处改同一个数字。
- 废弃文档：`status: deprecated`，保留链接，写明替代文档。
- 索引维护是改动的一部分；提交前检查链接和行数。
