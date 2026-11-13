# 开源依赖治理规范

> 状态：已生效（2026-10-31）。
> 范围：`app/` 前端 npm 依赖、Rust crates、Tauri 插件、复制型代码（shadcn/ui）、字体/图标/静态资源。
> 相关文档：[frontend-architecture.md](./frontend-architecture.md)、[decisions.md](./decisions.md)。

## 1. 目的

- 控制包体、启动时间、供应链风险和维护成本。
- 避免同类能力重复引入（两套样式、两套动画、两套状态）。
- 让每个依赖都有明确用途、许可证、体积账和退出方案。
- 让 AI 编码时有明确的“可引 / 不可引”边界。

## 2. 依赖分类与原则

| 类型 | 例子 | 审查重点 |
| --- | --- | --- |
| 运行时依赖 | `react`、`@base-ui/react`、`motion`、`zustand` | 许可证、首屏体积、可替换性、安全 |
| 开发期依赖 | `vite`、`@biomejs/biome`、`vitest` | 维护状态、安全、是否影响构建产物 |
| 复制型代码 | shadcn/ui 组件 | 来源、版本、许可证头、后续升级方式 |
| 资源 | 字体、图标、宠物图集（WebP/PNG）、图片 | 授权、体积、是否可商用、是否需署名 |

**基本原则**

1. **原生优先**：平台 API、Web 标准、现有依赖能解决，就不引新库。
2. **一条线一个库**：同一类能力只允许一个主库。
3. **复制优先于运行时**：UI 组件优先 shadcn 复制，而不是引整套组件库。
4. **重库必须懒加载**：首屏不需要的，一律 `lazy()` / 动态 import。
5. **锁文件即事实**：`pnpm-lock.yaml` / `Cargo.lock` 入库，版本可复现。
6. **可替换**：网络、存储、传输、动画都通过 adapter 隔离，库类型不跨 feature 泄漏。
7. **有记录**：新增运行时依赖必须在 `decisions.md` 追加一条；例外必须有时限和负责人。

## 3. 准入六问（每个新依赖必答）

### 3.1 能不能不引？

- 平台 API 是否已覆盖？`Intl`、`structuredClone`、`crypto.randomUUID()`、`fetch`、`WebSocket`、`ResizeObserver`、`Clipboard` 等。
- 现有依赖是否能完成？能否用 20–50 行自写代码替代？
- 禁止“为一个函数引整库”（典型：lodash、moment、is-odd 类）。

### 3.2 还活着吗？

- 最近 12 个月有 release；仓库未 archived。
- 至少 2 名维护者，或有公司/基金会 backing。
- 提供 TypeScript 类型与 ESM；无已知高危未修复 issue。
- 不用 pre-release / RC 作为生产依赖（框架大版本 RC 明确不允许）。

### 3.3 许可证能商用吗？

- 见第 4 节白名单。
- 未知/自定义许可证一律视为不可用。
- 复制型代码保留原许可证与版权声明。

### 3.4 体积可接受吗？

- 新增依赖使首屏 JS 增加 > 20KB gzip：必须在 PR 中说明理由。
- 增加 > 50KB gzip：必须懒加载，且记录到 `decisions.md`。
- 必须可 tree-shake；不能依赖 Node 内置模块（`fs`/`path`/`crypto` 等）。
- 不允许引入只为旧浏览器服务的 polyfill；兼容性按 `frontend-architecture.md` 的基线处理。

### 3.5 安全吗？

- `pnpm audit --prod` 无 high / critical。
- 有 postinstall 脚本的包必须人工审查，并用 `pnpm approve-builds` 显式批准；默认拒绝。
- 不在运行时加载 CDN 脚本/样式/字体。
- 兼容 CSP：不允许 `eval`（WASM 运行时除外，需 `wasm-unsafe-eval` 并在 CSP 中显式声明）。

### 3.6 换得掉吗？

- 网络/存储/传输/动画必须包一层 adapter；feature 只依赖项目内接口。
- 不把第三方库的类型（如 Base UI 内部类型、宠物组件内部类型）暴露到 feature 之外。
- PR 中写一句“如果不用它，替代方案是什么”。

## 4. 许可证策略

**直接允许**

- MIT、Apache-2.0、BSD-2-Clause、BSD-3-Clause、ISC、0BSD、Unlicense、CC0（仅资源）。

**条件允许（需 review + 记录）**

- MPL-2.0：文件级 copyleft；修改过的文件必须开源；尽量不修改，或把修改隔离在单独文件。
- LGPL-2.1/3.0：JS 打包场景边界模糊，默认避免；确需使用走单独决策。
- OFL：字体；只允许子集化后随包分发，保留许可证。
- 双许可证（如 MIT OR Apache-2.0）：选 MIT/Apache-2.0 其一并记录。

**禁止**

- GPL-2.0/3.0、AGPL-3.0、SSPL、BUSL、Commons Clause、CC-BY-NC、任何“非商业/仅评估/禁止商用”条款。
- 无许可证或许可证不明。
- 要求公开整个应用源码的条款。

**执行**

- 前端：`pnpm licenses list` + PR 人工确认。
- Rust：`cargo deny check licenses`；`deny.toml` 在首次引入第三方 crate 时落地。
- 复制型代码：保留上游版权/许可证；在本文件第 7 节或 PR 中登记来源与版本。
- 资源：字体/图标/图集同样按本节审查，不因为是“素材”就跳过。

## 5. 体积与性能预算

| 项 | 预算 | 说明 |
| --- | --- | --- |
| 首屏 JS | ≤ 150KB gzip | React + 基础组件 + 连接/聊天壳 |
| 首屏 CSS | ≤ 40KB gzip | Tailwind 按需输出 |
| 单次新增依赖 | ≤ 20KB gzip 首屏 | 超过需说明；> 50KB 必须懒加载 |
| 宠物 chunk | ≤ 600KB JS | BoopFace 组件 + 皮肤 catalog 在 mobile chunk 内 |
| 宠物皮肤 painter | ≤ 250KB（懒加载） | 只在用到皮肤时下载；201 只触发 material 一族 |
| 中端安卓首屏 | ≤ 1.5s | Realme 真机 |
| 动画 | 60fps | 只动 transform/opacity |

- 预算按“gzip 后”计算；测量用 `pnpm build` + `vite-bundle-visualizer`（或同类工具）。
- 预算调整必须写入 `decisions.md`，不能静默放宽。

## 6. 版本与升级

- `package.json` 使用精确版本；新增依赖用 `pnpm add --save-exact`（pnpm 11 实测 `.npmrc` 的 `save-exact` 不生效）；升级后提交 lockfile。
- `pnpm-lock.yaml` 入库；`packageManager` 锁定 pnpm 版本；禁止 `--no-lockfile`、禁止手动改 lockfile。
- 升级节奏：
  - 安全补丁：7 天内处理。
  - patch/minor：每月一次，集中 PR。
  - major：单独 PR，单独验证，不在功能分支夹带。
  - 框架/构建大版本（React、Vite、Tailwind）：先开实验分支，跑完验收清单再合。
- CI 必须跑：`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm audit --prod`。
- Rust：`cargo audit`、`cargo deny check`、`cargo outdated`；Tauri 插件锁 2.x，不混 1.x。

## 7. 基线依赖（2026-10-31）

| 包 | 用途 | 引入方式 | 许可证 | 备注 |
| --- | --- | --- | --- | --- |
| `react` / `react-dom` | UI 运行时 | 首屏 | MIT | 19.3.x |
| `@tauri-apps/api` | invoke / listen | 首屏 | MIT/Apache-2.0 | 2.x |
| `@tauri-apps/plugin-store` | 宠物存档（plugin-store） | 手机宠物按需 | MIT/Apache-2.0 | 2.5.0；对应 Rust `tauri-plugin-store` 2.5.0 |
| `tailwindcss` / `@tailwindcss/vite` | 样式 | 构建期 | MIT | 4.3.x |
| `@base-ui/react` | 无样式 primitive | 首屏（按组件） | MIT | shadcn 的 base |
| `motion` | UI 动画 | 首屏（按需） | MIT | 14.8.x |
| `zustand` | 客户端状态 | 首屏 | MIT | 5.0.x |
| `lucide-react` | 图标 | 首屏（tree-shake） | ISC | 1.65.x |
| `cn` / `class-variance-authority` | 类名合并 / 变体 | 首屏 | MIT | `cn` 替代 clsx + tailwind-merge |
| `shadcn` | 主题 CSS（`shadcn/tailwind.css`） | 首屏 | MIT | CLI 仍用 `pnpm dlx`；包只 import CSS |
| `tw-animate-css` | shadcn 的 CSS 动效类 | 首屏 | MIT | 不是 JS 动画引擎 |
| `qrcode` | 桌面二维码 | 桌面 entry | MIT | 现有依赖，保留 |
| `reqwest` | 模型价格目录刷新（公开 GET） | Rust 桌面运行时 | MIT/Apache-2.0 | 0.13.x；`default-features=false`，features `json`/`gzip`/`rustls-no-provider`，rustls provider 与 ASR 共用 `tls.rs`（D84） |
| `sonner` | Toast | 首屏（按需） | MIT | shadcn 推荐 |
| `zod` 或 `valibot` | 协议边界校验 | 按需 | MIT | 二选一；只在边界用 |
| `@biomejs/biome` | lint / format | 开发期 | MIT | 2.6.x |
| `vitest` | 测试运行器 | 开发期 | MIT | 5.0.x |
| `@testing-library/react` | 组件测试 | 开发期 | MIT | 版本以 lockfile 为准 |
| `@testing-library/jest-dom` | DOM 断言 | 开发期 | MIT | 7.0.x |
| `jsdom` | 测试 DOM 环境 | 开发期 | MIT | 30.x |
| `vite-bundle-visualizer` | 体积分析 | 开发期 | MIT | 按需 |
| `boopface` | 手机宠物渲染器 + 皮肤（例外，见下） | 运行时 | MIT | 0.8.0（精确锁） |

说明：

- `shadcn` CLI 用 `pnpm dlx`；2026 版 registry 的 CSS 入口会 import `shadcn/tailwind.css`，因此 `shadcn` 包也是运行时依赖（只使用其 CSS）。
- `cn` 替代 `clsx` + `tailwind-merge`；不要再装后两者。
- `tw-animate-css` 是 shadcn 组件的 CSS 过渡类，不是第二套 JS 动画引擎。
- 复制出来的组件由项目维护，见第 9 节。
- `qrcode` 如果后续被 React 组件替代，按新增依赖流程走。
- **`boopface@0.8.0`（例外登记，2026-11-14）**：手机宠物的渲染器与皮肤，原生 Web Component、零运行时依赖、MIT。准入六问的实际结论：
  - 用途明确：替换 D127 里唯一无 LICENSE 的随包资产（760KB 图集），同时把矢量/皮肤/动作一次拿到。
  - 体积：首屏 +约 38KB gzip（超过 §3 的 20KB 说明线）；皮肤 painter 是懒加载 chunk（约 190KB，随包但不首屏）。
  - **维护方只有一位（CX ArtLab），不满足 §3.2「≥2 名维护者」** → 按例外处理：精确锁 `0.8.0`（不用 `^`），负责人 = 项目所有者，复核时间 = 2027-05 或上游发布 1.0 时，退出方案 = vendor 源码到 `app/src/mobile/features/pet/vendor/`（MIT 允许）或 fork。
  - 授权：代码 MIT，角色形象不随 MIT 转让 → 只作内嵌形象，不宣称原创（NOTICE 记录）。
  - 不满足「pre-release 不入生产」的字面要求（0.8.0 是 1.0 前版本，但非 RC/pre-release）；风险由锁版本 + 单点调用面（`boop-pet.tsx` 一个文件）兜住。

## 8. 禁止与慎用

**禁止**

- jQuery、Bootstrap、Foundation。
- moment.js（用 `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat`）。
- 全量 lodash（需要时用 `lodash-es` 单函数导入，或自写 20 行）。
- 完整 Ant Design / Mantine / Element Plus（与设计方向冲突）。
- 运行时 CSS-in-JS：emotion、styled-components。
- 第二套 JS 动画引擎：GSAP、anime.js（除非 `decisions.md` 立项）。`tw-animate-css` 是 shadcn 的 CSS 工具，不算第二套引擎。
- 第二套状态库：Redux、Jotai、MobX。
- 第二套样式方案：SCSS、Less、UnoCSS（除非替换 Tailwind 并走决策）。
- iconfont、CDN 字体/脚本/样式。
- Node-only 或 Electron-only 的库。
- 任何 GPL / AGPL / SSPL / Commons Clause 依赖。

**慎用（必须懒加载 + 记录）**

- Lottie / dotLottie：只做非交互装饰。
- Live2D：授权、体积、性能成本高；后置。
- 虚拟列表（`@tanstack/react-virtual`）：消息 > 200 条再引。
- Markdown 渲染 + 语法高亮（`react-markdown` + Shiki）：AI 回答需要时再引。
- 图表库（ECharts / Recharts）：有统计页再评估。
- i18n 框架：当前中文优先，有第二语言需求再引。
- 日期库（date-fns / dayjs）：先用 `Intl`；确需复杂时区/计算再引。
- 主题库（next-themes）：不引；主题运行时用 `shared/lib/theme.ts` + `data-theme`/`.dark` 双写，避免为单一切换场景加依赖。

**原生替代**

| 需求 | 原生方案 |
| --- | --- |
| 日期/时间格式化 | `Intl.DateTimeFormat` |
| 相对时间 | `Intl.RelativeTimeFormat` |
| 数字/货币 | `Intl.NumberFormat` |
| 深拷贝 | `structuredClone` |
| UUID | `crypto.randomUUID()` |
| 防抖/节流 | 自写 hook（20 行内） |
| 剪贴板 | `navigator.clipboard` |
| 观察尺寸/可见性 | `ResizeObserver` / `IntersectionObserver` |
| 简单弹层 | 优先 shadcn/Base UI，不引第二套 |

## 9. 复制型代码（shadcn/ui）治理

- shadcn 组件是 MIT 代码，复制进 `shared/ui` 后由项目维护；`components.json` 入库。
- 固定 `base-nova`（Base UI），不混 Radix；新增组件前先确认 base。
- CSS 入口已引入 `shadcn/tailwind.css` 与 `tw-animate-css`；类名合并用 `cn`（不要混 clsx/tailwind-merge）。
- 当前已复制：button、input、label、dialog、sheet、tabs、switch、tooltip、sonner；其余按需添加。
- 新增：`pnpm dlx shadcn@latest add <component>`；review 生成的代码后再提交。
- 修改：保持可访问性与 API 名称；重大改动在文件头记一行来源/原因。
- 升级：逐组件 diff，不整目录覆盖；升级后跑 typecheck + 相关测试。
- 不把业务逻辑塞进 `shared/ui`；业务封装放 `features/*/components`。

## 10. Rust / Tauri 依赖

- 同一套原则：必要性、维护、许可证、体积（编译时间/产物体积）、安全、可替换。
- 基线：`tauri` 2.x、`serde`、`tokio`、`axum`、`tokio-tungstenite`、`tauri-plugin-store` 2.5.0、`base64` 0.22、`arboard` 3.7（仅桌面剪贴板，关闭 image feature）；不重复引入 HTTP/WS 框架。
- 桌面剪贴板/自动输入：`core-graphics` 0.25（Cmd+V）、`macos-accessibility-client` 0.0.2（辅助功能授权提示）、`objc2-app-kit` / `objc2-foundation` 0.3（NSPasteboard 类型过滤）。均为桌面目标，不进安卓包。
- 本机 whisper 下线（2026-11-02）：移除 `whisper-rs` 0.16 及 cmake/libclang 构建前提；不再有模型下载/选择/删除。旧 `models/` 目录不参与运行。
- 百炼云端 ASR（2026-11-02，桌面目标；均已存在于 Cargo.lock，无新增版本）：
  - `security-framework = "3"`：仅用于清除旧版 macOS Keychain 条目；API Key 已改存 `asr.json`（0600）。Cargo.lock `3.7.0`，MIT/Apache-2.0。
  - `tokio-tungstenite = "0.24"`（desktop target，features `connect` + `rustls-tls-native-roots`）：百炼 WebSocket；TLS 使用系统根证书，`rustls` / `tokio-rustls` / `rustls-native-certs` 已在 lock；MIT。
  - `uuid = "1"`（v4）：生成 `run-task` 的 `task_id`；Cargo.lock `1.29.0`；MIT/Apache-2.0。
  - `chrono = "0.4"`（features `clock`）：用量按本机时区切天；Cargo.lock `0.4.45`；MIT/Apache-2.0。
  - 以上都只在桌面目标使用，不进安卓包；无额外前端依赖。
- 单实例（2026-11-03，仅桌面目标）：`tauri-plugin-single-instance = "2"`（Cargo.lock `2.5.5`），防止桌面端多开抢 UDP 47820 发现端口、互相覆盖 DSH hook endpoint（D60）；Apache-2.0 OR MIT；官方 Tauri 插件，macOS 用 Unix socket 加锁，`zbus` 等依赖只在 Linux 目标编译；不进安卓包。
- 不再下载模型权重；旧 `models/` 目录不参与运行；百炼模型、Key 与语音用量口径见 [asr-cloud-bailian.md](./engineering/asr-cloud-bailian.md)。
- Tauri 插件只用官方或维护良好的社区插件；capabilities 最小权限。
- 新增 crate 前跑 `cargo tree -d` 看是否已有重复能力；`cargo deny` 管许可证；`cargo audit` 管漏洞。
- 协议类型如果引入 `ts-rs` / `tauri-specta`，生成物入库并在 CI 校验一致性。

## 11. PR 审查清单（复制到 PR 模板）

- [ ] 用途明确，替代方案已评估（不用它会怎样）
- [ ] 许可证在白名单内；复制型代码保留版权
- [ ] 首屏体积增量已测量（before / after）
- [ ] > 20KB gzip 有说明；> 50KB 已懒加载
- [ ] 无 Node 内置依赖、无未经批准的 postinstall
- [ ] `pnpm audit --prod` 无 high / critical
- [ ] 新增运行时依赖已在 `decisions.md` 记录
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 通过
- [ ] 相关文档（架构/协议/状态）已同步

## 12. 审计命令与频率

```bash
# 前端
pnpm audit --prod
pnpm outdated
pnpm licenses list
pnpm why <package>
pnpm approve-builds
pnpm build
pnpm dlx vite-bundle-visualizer

# Rust
cargo audit
cargo deny check
cargo outdated
cargo tree -d
```

- 每月第一个工作日跑一次前端 + Rust 审计；结果记录在 PR/issue，必要时更新 `history.md` 与 `status.md`。
- 高危漏洞：立即评估；不可修复则移除依赖或隔离使用，并记录到 `decisions.md`。

## 13. 例外与记录

- 任何例外（许可证、体积、重复能力）必须写入 `decisions.md`，包含：原因、替代方案、到期时间、负责人。
- 例外默认 3 个月复审；到期未续期则移除。
- 本规范由项目维护者批准；AI 代理只能按规范建议，不能自行放宽。
