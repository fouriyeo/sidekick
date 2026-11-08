# 贡献指南

谢谢来看 Sidekick。这是一个个人项目开源出来的，代码量不大但结构比较固定，改之前建议先花 10 分钟读一遍入口文档。

## 开始之前

1. 读 [AGENTS.md](../AGENTS.md)（项目上下文、命令、Top 12 坑）与 [docs/INDEX.md](../docs/INDEX.md)（文档路由）。
2. 环境按 [docs/setup.md](../docs/setup.md) 装：macOS arm64、Rust、Node 24 + pnpm 11、JDK 21、Android SDK 37 / NDK 27.2。
3. 只改文档的话，跑 `node scripts/check-docs.mjs` 就够了。

## 能改什么 / 先问什么

- **欢迎**：bug 修复、文档纠错、平台兼容（WebView 版本、真机型号）、测试补充、可访问性改进。
- **先开 issue 讨论**：新功能、协议变更（`protocol/README.md` 与 Rust/双端解析要三处同步）、换依赖（受 [docs/dependency-policy.md](../docs/dependency-policy.md) 约束）、改产品规则（PRD/SPEC）。
- **不要提交**：构建产物（`app/dist`、`node_modules`、`src-tauri/target`、`gen/`、APK/DMG）、本地配置（`~/.sidekick/` 下的任何东西）、字体文件或图集的新版本（先谈许可）。

## 开发约定

- 平台边界：`mobile` 不 import `desktop`，反之亦然；`shared` 不 import 两者。边界检查：`node scripts/check-boundaries.mjs`。
- Tauri 调用统一走 `app/src/shared/lib/tauri.ts`，不要在组件里裸 `invoke`。
- 样式：桌面 `.desktop-ios`（`desktop/styles/ios.css`）、手机 `.mobile-clean`（`mobile/styles/clean.css`）；`tokens.css` 只作共享基础。
- 文档：新文档写 frontmatter 并在父索引登记；事实只写一处；改完跑 `check-docs`。

## 提交前必跑

```bash
cd app && pnpm typecheck && pnpm lint && pnpm test && pnpm build
node scripts/check-docs.mjs && node scripts/check-boundaries.mjs
```

改 Rust：`cd app/src-tauri && cargo test --lib`。改桌面/手机 UI：跑 `scripts/qa-desktop-ios.mjs` / `scripts/qa-memo.mjs`（浏览器 QA，不需要真机）。

## 提交信息

中文摘要，type/scope 用英文：

```text
feat(pet): 会话卡完成态改为自动展开

- 说明为什么改
- 说明怎么验证
```

一个提交只做一件事；提交信息里可以引用决策号（如 `D107`）。

## Issue / PR

- Bug 请用 issue 模板，附：系统版本、手机型号 + WebView 版本、复现步骤、日志（注意打码 Key 与会话内容）。
- PR 请保持范围聚焦，描述里写清「改了什么 / 为什么 / 怎么验证」；涉及界面变更请附截图。
- 提交即表示你同意以 [MIT](../LICENSE) 许可贡献代码。

## 不接受的改动

- 往仓库里塞二进制、字体、图集或大文件。
- 把服务端口暴露到公网、给局域网协议加"假鉴权"（真要做得先写 ADR 进 `docs/decisions.md`）。
- 自动发送/自动回车、后台偷偷录音、把转写全文写日志。
