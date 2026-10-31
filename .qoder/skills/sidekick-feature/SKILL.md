---
name: sidekick-feature
description: Sidekick 功能交付流程。用户要“做宠物/做麦克风/实现新功能/从 PRD 做到上线”时使用；按 产品原则→PRD→SPEC→AC→spike→实现→真机验收→文档同步 执行，保持平台边界和隐私底线。
---

# Sidekick 功能交付

## 适用

- 实现情绪宠物、外设麦克风，或任何新功能。
- 把 PRD 变成可交付代码。
- 不确定先做什么、该读哪篇、该找哪个子代理。

## 开工前（必须）

1. 读 `docs/INDEX.md`、`docs/product/scope.md`、目标功能的 `docs/prd/<feature>/INDEX.md`。
2. 确认：
   - 平台归属（手机 / 桌面 / 共享）；
   - P0 范围（≤5 个模块）；
   - 是否触碰隐私、权限、自动输入、协议；
   - 哪些是高风险，需要先 spike。
3. 读 `docs/standards/engineering.md` 的平台边界；不要在 `mobile/` 里 import `desktop/`，反之亦然。
4. 需要评审时用子代理：
   - `sidekick-prd-reviewer`：PRD 质量门；
   - `sidekick-pet-designer`：宠物体验/视觉/动效；
   - `sidekick-audio-engineer`：麦克风链路；
   - `sidekick-protocol-guardian`：协议一致性；
   - `sidekick-docs-router`：文档导航。

## 交付阶段

### 1. 需求确认

- 读 PRD + SPEC + ACCEPTANCE；把 P0 规则转成任务。
- 发现规则冲突/缺口：先改文档，再写代码；不要“代码里先猜一个”。
- 范围外想法进 P1/P2，不夹带。

### 2. 技术 spike（高风险才做）

- 麦克风：Android 采集、本机 ASR、macOS 文本输入，各设通过门槛。
- 宠物：Rive 资产/状态机、真机 60fps、降级路径。
- Spike 代码可丢弃；结论写回 `engineering/` 和 `decisions.md`。

### 3. 实现

- 目录：`mobile/features/<feature>`、`desktop/features/<feature>`、`shared/`、`protocol/`。
- Tauri 只走 `shared/lib/tauri.ts`；协议类型集中；不裸 invoke。
- 音频不落盘、不后台、不日志全文；文本输入不自动回车/发送。
- 宠物只动 transform/opacity；Rive 失败有静态降级。
- 文案集中管理；错误文案说明原因 + 下一步。

### 4. 验证

- 单元/组件/集成测试；P0 AC 全过。
- 真机：Realme 横屏、支架/手持；麦克风测权限/后台/断网/密码框/窗口切换。
- 性能：60fps、p95 延迟、掉电；隐私：无音频文件、无全文日志、无云端上传。
- 命令：`pnpm typecheck && pnpm lint && pnpm test && pnpm build`；`node scripts/check-docs.mjs`。

### 5. 收尾

- 更新 `docs/status.md`、`docs/decisions.md`（重大取舍）、协议/架构/索引。
- 把新增的坑写进 `AGENTS.md` 第 8 节或对应文档。
- 发版门见 `docs/engineering/quality.md#10-发布门`。

## 红线

- 不自动发送/回车；不在密码框自动输入；目标窗口变化只复制。
- 不后台录音；不保存原始音频；不把转写全文写日志。
- 不把桌面功能塞进手机壳，或反之。
- 不为 P0 引入第二套动画/状态/样式/请求库。
- 不跳过真机测试；不把 P0 缺口留到“下期”。
