---
doc: standards/git
title: Git 提交与推送规范
status: active
updated: 2026-11-14
load: on-demand
owner: engineering
---

# Git 提交与推送规范

> 目标：每次 push 都可追溯、可回滚、已验证；提交历史给人看，不是给机器看。
> 适用范围：所有对 `fouriyeo/sidekick` 的提交与推送（包括 AI 代提交）。

## 1. 提交信息：中文

格式：

```text
type(scope): 中文摘要

- 中文正文要点一
- 中文正文要点二
```

- `type` 用英文小写：`feat` / `fix` / `refactor` / `perf` / `test` / `docs` / `chore` / `style` / `revert`；`scope` 可选（`pet`、`asr`、`clipboard`、`hook`、`docs`…）。
- **摘要必须是中文**，动词开头，≤ 50 字，不加句号；不写“一些/相关/优化一下”这类空话。
- 正文用中文，写清**改了什么、为什么、怎么验证**；专有名词（WebP、OpenPets、DSH、Tauri）保留英文。
- 一个提交只做一件事；无关改动拆成多个提交。
- 示例：

```text
feat(pet): 宠物改用 BoopFace 渲染与皮肤 201（D136）

- .petSlot 被 max-width 卡成竖长时，按 min(宽,高) 取方形格子
- sprite 层设为方形 + overflow:hidden 居中，相邻行不再泄漏
- 真机 WebView devtools 验证：单元素、方形、帧位置持续推进
```

## 2. Push 前必须验证

| 改动范围 | 必跑 |
| --- | --- |
| 前端/逻辑 | `pnpm typecheck`、`pnpm lint`、`pnpm test` |
| 构建/资源 | `pnpm build`（确认皮肤等资源只进对应平台 chunk） |
| 手机端（`app/src/mobile`、皮肤/资源、原生命令） | `scripts/build-android.sh && scripts/install-android.sh`，真机至少验证关键路径 |
| 文档 | `node scripts/check-docs.mjs` |
| 平台目录/依赖 | `node scripts/check-boundaries.mjs` |
| 发布安装包 | `scripts/package-release.sh` → `scripts/publish-release.sh`；确认 APK `apksigner verify` 通过、dmg 可挂载、Releases 上传成功 |
| 协议/消息类型 | 同步 `protocol/README.md` 与相关 docs |

- 先 `git status` + `git diff --stat` 核对范围，别把无关文件、设计素材、大二进制带进来。
- 未验证的提交不要推；本地提交可以先留着，验证通过再推。

## 3. 推送流程

1. `git fetch`，确认当前分支与 `origin/main` 没有分叉；有分叉先 rebase，不 force push。
2. 只推 `main`；推送后 `git status -sb` 确认 `## main...origin/main` 且无 ahead/behind。
3. 不提交构建产物：`app/dist`、`node_modules`、`src-tauri/target`、`gen/`、APK、DMG、`.venv`。
   - **安装包不再入库（D125，撤销 D63）**：`release/` 只是本地构建目录（`/release/*.dmg`、`/release/*.apk` 已 gitignore），分发走 `scripts/publish-release.sh` → GitHub Releases。debug APK 120–314MB，任何情况下都不要入库。
   - 历史原因：旧规则把两个包提交进 `main`，Git 为每份二进制保留副本，仓库历史膨胀到 285MB；2026-11-08 用 `git filter-repo` 重写历史抹除。
4. 设计过程素材（截图/GIF/预览页）默认不入库；需要归档时先问，放 `brand/` 下并控制体积。测试/走查过程产物（`artifacts/`）同理，落点与清理见 [quality.md §5.1](../engineering/quality.md)。

## 4. 不可逆操作

- `force push`、删除远端分支、改仓库可见性、重写历史：**先问用户**，说明原因和影响范围。
- 已推送的提交不回改历史，用新增提交修正。

## 5. 与文档/决策的关系

- 改动跨端或改协议：同步 `protocol/README.md` 与 docs（见 [documentation.md](./documentation.md)）。
- 重大技术取舍：追加 `docs/decisions.md`（沿用现有 D 编号）。
- 提交信息里引用相关文档/决策编号（如 `D57`），方便回溯。
- Release 说明不直接摘 `git log`：由 `scripts/publish-release.sh` 只取 `feat/fix/perf`，`docs/chore/style/test/ci` 不进发布页面；纯文档改动不发版。
