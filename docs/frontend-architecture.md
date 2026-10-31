# 前端技术架构

> 状态：已定稿（2026-10-31）；依赖与脚手架已安装，**React UI 尚未迁移**，当前入口仍是原生 DOM + 手写 CSS。
> 组织：单仓库、双产物；前端按 `desktop` / `mobile` / `shared` / `protocol` 分目录；桌面与手机固定布局，不做跨端自适应。宠物本期定位纯陪伴，PRD 见 [prd/pet/](./prd/pet/INDEX.md)。
> 范围：`app/` 下 Tauri 桌面端与安卓端共用的 WebView 前端。
> 不含：`app/src-tauri/mobile/index.html` 静态落地页（继续用原生 HTML，保持轻量）。
> 依赖准入与许可证细则见 [dependency-policy.md](./dependency-policy.md)。

## 1. 目标与约束

- 双端共用基础层（协议/设计令牌/无平台语义组件），但 UI 按平台分包；桌面与手机各自固定布局，**不做跨端自适应**。
- 下一步核心是情绪宠物（纯陪伴）；AI 状态映射后续接入，聊天降级为辅助视图。规格见 [prd/pet/](./prd/pet/INDEX.md)、[prd/mic/](./prd/mic/INDEX.md)。
- 高度依赖 AI 编码：优先选生态成熟、示例多、可复制控制的方案。
- 运行在 Tauri WebView：macOS WKWebView + Android System WebView；没有 Node、没有 SSR。
- 小团队维护：不引入重型框架、重复能力或需要长期专人维护的依赖。

## 2. 技术栈

| 层 | 选型 | 2026-10-31 版本基线 | 说明 |
| --- | --- | --- | --- |
| 框架 | React | 19.3.x | 函数组件 + Hooks；不做 SSR |
| 构建 | Vite + TypeScript | Vite 8.3.x / TS 6.0.x | 继续用 Vite；`tsc --noEmit` 做类型检查 |
| 样式 | Tailwind CSS v4 | 4.3.x | CSS-first；`@theme` 令牌；不引 SCSS |
| 组件 | shadcn/ui + Base UI | shadcn 4.23.x（base-nova）/ `@base-ui/react` 1.9.x | 组件复制进仓库；Base UI 为唯一 primitive base |
| 类名合并 | `cn` + CVA | `cn` 0.5.x / CVA 0.7.x | `cn` 替代 clsx + tailwind-merge |
| UI 动画 | Motion | 14.8.x | 进出场、布局、手势、spring |
| 宠物动画 | Rive | `@rive-app/react-canvas` 4.38.x | 状态机驱动；懒加载 |
| 状态 | Zustand | 5.0.x | 跨 feature 客户端状态 |
| 图标 | lucide-react | 1.65.x | SVG，按需 tree-shake |
| 动效工具 | `tw-animate-css` | 1.4.x | shadcn 组件内置 CSS 过渡类，不替代 Motion |
| 质量 | Biome + Vitest | Biome 2.6.x / Vitest 5.0.x | lint / format / test |
| Tauri API | `@tauri-apps/api` | 2.x | 只通过 `shared/lib/tauri.ts` 使用 |

版本说明：上表是 2026-10-31 实际安装的基线；实际版本以 `pnpm-lock.yaml` 为准。升级按 [dependency-policy.md](./dependency-policy.md) 执行，不追 pre-release（例如 Vue 3.6/Vapor 这类 RC 不作为选型依据）。

## 3. 分层与目录

```text
app/
├─ index.html                 # 只保留 #root 与 /src/main.tsx
├─ src/
│  ├─ main.tsx                # app_role → 动态 import 对应 entry
│  ├─ entries/
│  │  ├─ desktop.tsx          # 桌面壳：窗口布局、侧栏、聊天
│  │  └─ mobile.tsx           # 手机壳：安全区、底部输入、宠物全屏
│  ├─ desktop/                # 桌面专属（固定窗口布局）
│  │  ├─ features/
│  │  │  ├─ connect/          # 服务地址、二维码、连接状态
│  │  │  ├─ chat/             # 消息列表、输入、系统消息
│  │  │  └─ mic-receiver/     # 麦克风状态浮窗、转写结果、输入提示
│  │  └─ components/
│  ├─ mobile/                 # 手机专属（只做横屏）
│  │  ├─ features/
│  │  │  ├─ connect/          # 地址输入、连接状态
│  │  │  ├─ pet/              # 宠物舞台、Rive 绑定、状态映射
│  │  │  ├─ mic/              # 按住说话、波形、权限、结果
│  │  │  └─ settings/         # 设置、配对、关于
│  │  └─ components/
│  ├─ shared/
│  │  ├─ ui/                  # shadcn 复制组件（button/dialog/sheet/...）
│  │  ├─ lib/
│  │  │  ├─ tauri.ts          # invoke/listen 唯一出口
│  │  │  ├─ utils.ts          # cn() 等
│  │  │  └─ format.ts         # Intl 等纯函数
│  │  └─ styles/
│  │     ├─ globals.css       # @import "tailwindcss"; 基础样式
│  │     └─ tokens.css        # @theme 设计令牌
│  ├─ protocol/
│  │  └─ messages.ts          # 与 Rust 协议一一对应的类型
│  └─ assets/
│     ├─ pet/                 # .riv、宠物贴图（懒加载）
│     └─ icons/               # 少量自有 SVG
```

**依赖方向（必须遵守）**

- `entries` → 对应平台的 `desktop` / `mobile` features → `shared` → `protocol`；`features` 之间不直接互相 import。
- `mobile` 不 import `desktop`，`desktop` 不 import `mobile`；`shared` 不 import 任何平台目录。
- 平台目录各自固定布局，不写跨端响应式断点；共享组件不承担跨平台布局。
- 平台职责见 [standards/engineering.md](./standards/engineering.md#2-平台职责) 与 [product/scope.md](./product/scope.md#2-平台矩阵)。
- `features` 不直接 `invoke`/`listen`，统一走 `shared/lib/tauri.ts`。
- `shared/ui` 只放通用 UI，不放业务逻辑。

**不引入的东西**

- 路由库：只有两个角色和少量视图，用状态切换；以后有深链接需求再单独决策。
- 请求库（axios/SWR/React Query）：数据来自 Tauri 命令与事件，不需要。
- Redux/Jotai/MobX：Zustand 足够；组件局部状态用 `useState`/`useReducer`。
- CSS-in-JS（emotion/styled-components）：与 Tailwind、CSP 都冲突。
- 组件库全家桶（Ant Design/Mantine）：视觉与体积都不合适。

## 4. 启动与角色分流

`app/index.html` 只保留：

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

`app/src/main.tsx` 负责角色判定与按需加载：

```tsx
import { invoke } from "@tauri-apps/api/core";
import { createRoot } from "react-dom/client";
import "./shared/styles/globals.css";

async function bootstrap() {
  const root = createRoot(document.getElementById("root")!);
  const role = await invoke<string>("app_role");

  if (role === "mobile") {
    const { mountMobile } = await import("./entries/mobile");
    mountMobile(root);
  } else {
    const { mountDesktop } = await import("./entries/desktop");
    mountDesktop(root);
  }
}

void bootstrap();
```

规则：

- 不再给 `<body>` 加 `mobile` 类来切换视图；两个 entry 各自挂载，CSS 作用域冲突从结构上消失。
- `mobile/features/pet` 内部用 `lazy(() => import(...))` 加载 Rive 运行时；`.riv` 资源在宠物视图挂载后再加载，不进入首屏 chunk。
- 开发时开启 `StrictMode`，用来暴露重复订阅/缺失清理；所有 `listen` 必须返回清理函数。
- 落地页 `app/src-tauri/mobile/index.html` 继续走 Rust `include_str!`，不接 React。

## 5. 数据流与 Tauri 边界

```text
UI 事件
  → feature store/action
  → shared/lib/tauri.ts（唯一出口）
  → Tauri invoke / listen
  → Rust（桌面 axum / 手机 tokio-tungstenite）
  → 事件回传（conn / chat / status）
  → shared/lib/tauri.ts 类型化监听
  → store
  → UI
```

规则：

- 所有命令名、事件名、参数类型集中在 `shared/lib/tauri.ts`；feature 里不出现裸字符串 `invoke("...")`。
- 协议类型集中在 `protocol/messages.ts`，用 `type` 字段做 discriminated union。
- 边界校验：来自 WebSocket/Rust 的 payload 先校验再进 store；协议简单时用手写 type guard，复杂后引 zod/valibot（只在这一个边界用）。
- 桌面 UI 目前直接连 `ws://127.0.0.1:8848/ws`；手机走 Rust 传输。这个差异保留，未来换 BLE 只改 Rust/`tauri.ts`，UI 不变。
- 连接状态收敛为一个状态机：`disconnected → connecting → connected → error`；所有界面读同一个 store，不各自维护 `online` 布尔值。
- 事件订阅在 entry 挂载时注册一次，卸载时取消；不要在每次渲染里 `listen`。

## 6. 样式规范

**基础**

- `shared/styles/globals.css` 依次引入 `tailwindcss`、`tw-animate-css`、`shadcn/tailwind.css`、`./tokens.css`；`@custom-variant dark` 使用 `.dark` 类。
- 设计令牌以 shadcn 语义名为基线：`background`、`foreground`、`card`、`popover`、`primary`、`secondary`、`muted`、`accent`、`destructive`、`border`、`input`、`ring`、`radius`；品牌值只在 `tokens.css` 覆盖。
- `shadcn/tailwind.css` 只提供 variants/utilities；颜色值在 `tokens.css` 定义。
- 暗色优先：`:root, .dark` 先共用暗色值，`<html class="dark">`；浅色主题以后再加，不在本期实现。
- 字体用系统栈：`-apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif`；不打包完整中文字体。
- 图标统一用 lucide-react；不引 iconfont、不内联一大段 SVG path。

**令牌示例**

```css
/* shared/styles/tokens.css */
:root,
.dark {
  --radius: 0.75rem;
  --background: oklch(0.18 0.02 260);
  --foreground: oklch(0.93 0.01 260);
  --primary: oklch(0.62 0.19 265);
  --primary-foreground: oklch(0.98 0.01 260);
  --border: oklch(0.3 0.02 260);
  --ring: oklch(0.62 0.19 265);
  --motion-ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-border: var(--border);
  --color-ring: var(--ring);
  --radius-lg: var(--radius);
  --ease-out-soft: var(--motion-ease-out-soft);
}
```

完整令牌集见 `app/src/shared/styles/tokens.css`。

**类名与组件**

- 条件类名统一用 `cn()`（来自 `cn` 包，已替代 `clsx` + `tailwind-merge`）；不要手写字符串拼接。
- 多变体组件用 CVA（shadcn 默认方案）；不要为每个变体写一套 CSS。
- 类名顺序：布局 → 盒模型 → 排版 → 视觉 → 状态；启用 Biome 的 `useSortedClasses` 时自动排序。
- 不给 `<body>` 或全局元素写“状态类”做布局切换；用组件边界和 `data-*` 属性。
- 动态值（进度、位移）用 CSS 变量传，不在 JSX 里拼复杂字符串。

**移动端**

- 所有全屏容器使用 `env(safe-area-inset-*)`；底部输入区必须避开手势条。
- 高度用 `100dvh` / `min-h-dvh`，不要用 `100vh`；键盘弹出时用 `visualViewport` 调整底部输入区。
- 点击目标 ≥ 44×44 px；图标按钮要有 `aria-label`。
- 安卓上避免大面积 `backdrop-filter`、`filter: blur()`、阴影动画；优先 `transform`/`opacity`。
- 桌面窗口可缩放：用 `min-w`/`max-w` 与 grid/flex，不写死像素宽度；手机 entry 不假设桌面尺寸。

## 7. 组件规范（shadcn/ui + Base UI）

- 唯一 primitive base：**Base UI**（`@base-ui/react`），风格固定 `base-nova`。不要同时引入 Radix 版本；如果某个组件 Base UI 没有，用 Base UI 组合实现，或单独决策。
- `components.json` 必须入库，记录 base、别名、Tailwind 配置；别名统一指向 `@/shared/ui` 与 `@/shared/lib/utils`，Vite/TS 配置 `@` → `src`。
- 类名合并用 `cn`（`cn` 包）；不要再安装 `clsx`/`tailwind-merge`。
- CSS 入口已引入 `tw-animate-css` 与 `shadcn/tailwind.css`；`shadcn` 包只用于这份 CSS，CLI 仍用 `pnpm dlx`。
- 新增组件用：

```bash
pnpm dlx shadcn@latest add button input label dialog sheet tabs switch tooltip sonner
```

- 复制进来的组件归项目所有：可以改样式，但要保持 API 名称与可访问性行为；改动较大时在文件头写一行来源与修改原因。
- 文件命名统一 kebab-case（如 `chat-bubble.tsx`），组件导出 PascalCase（如 `ChatBubble`），与 shadcn 保持一致。
- `shared/ui` 只放无业务语义的组件；业务封装放 `desktop|mobile/features/*/components`。
- 不要给每个 shadcn 组件再包一层；直接用在 feature 里，确有必要再抽。
- 表单、弹窗、抽屉、Toast 优先用现成组件；聊天气泡、宠物卡片、状态条用 Tailwind 自己写。
- 可访问性底线：键盘可达、`focus-visible` 可见、图标按钮有标签、消息列表用 `aria-live="polite"`、颜色对比 ≥ 4.5:1。
- 升级 shadcn 组件时逐个人工 diff；不要整目录覆盖，避免冲掉定制。

## 8. 动画规范

**三层，一层一个引擎**

| 层 | 引擎 | 用途 | 约束 |
| --- | --- | --- | --- |
| 微动效 | CSS transition/keyframes | hover、press、颜色、透明度、呼吸灯 | ≤ 150–200ms；只动 transform/opacity/color |
| 界面 | Motion | 进出场、列表增删、布局变化、弹窗/抽屉、手势 | spring 或统一 easing；`AnimatePresence` 管卸载 |
| 角色 | Rive | 宠物 idle/开心/困倦/倾听/庆祝、交互反馈；AI 状态后续接入 | 状态机输入驱动；懒加载；后台暂停 |

规则：

- 不并行引入 GSAP/anime.js；如果未来确实需要复杂时间线，先在 `decisions.md` 立项，再引。
- 只动 `transform` 和 `opacity`；不动 `width/height/top/left`，不在安卓上动 `box-shadow`/`filter`。
- 统一时长令牌：120 / 180 / 240 / 320ms；缓动统一用 `--ease-out-soft` 或 Motion spring，不随手写 `ease-in-out`。
- 尊重 `prefers-reduced-motion: reduce`：关闭非必要动效，保留状态切换的即时反馈。
- 首屏关键内容不做入场动画；避免“先空后跳”。
- 长列表（> 50 条）不做 `layout` 动画；超过 200 条考虑虚拟列表（按需引入）。

**宠物与 Rive**

- 情绪状态 → Rive 输入映射集中在 `mobile/features/pet/stateMachine.ts`，UI 不直接操作 Rive 内部节点；协议 status 映射后续接入。
- Rive 运行时和 `.riv` 只在宠物视图挂载时加载；离开页面销毁实例。
- 监听 `visibilitychange`，后台暂停 Rive，回前台恢复，省电。
- 先在 Realme 真机测 60fps，再决定是否需要 WebGL 渲染器；默认 canvas 渲染器。
- 若最终美术是像素风，改用序列帧 + CSS/Canvas 更合适；该选择由美术方向决定，需在 `decisions.md` 记录。

## 9. 状态管理

- Zustand 5；按 feature 拆 store：`useConnectionStore`、`useChatStore`、`usePetStore`、`useSettingsStore`、`useUiStore`。
- store 只存“真状态”，派生值用 selector 计算；不存重复数据。
- 连接状态是唯一事实源；聊天/宠物界面只读它，不各自维护 `online`。
- 本地持久化只存设置（服务器地址、偏好）；聊天记录暂不落盘，等存储方案确定。
- 不引全局事件总线；Tauri 事件在 `shared/lib/tauri.ts` 里转成 store action。
- 组件局部 UI 状态（展开/收起、输入草稿）留在组件内，不进全局 store。
- 视图切换用 `useUiStore` 的 `view` 字段（`chat | pet | settings`），不进 URL、不引路由。

## 10. 质量与测试

- TypeScript `strict`；禁止 `any` 跨边界；外部数据用 `unknown` + 校验。
- Biome 负责 lint + format；不混用 ESLint + Prettier（除非有明确规则缺口，再单独决策）。
- Vitest + Testing Library：协议解析、状态机映射、纯函数、关键组件。
- Tauri API 在测试里 mock；不依赖真实 Rust 进程。
- 端到端继续用现有 CDP + `adb` 脚本；Tauri WebView 暂不接 Playwright。
- 每次提交前：`pnpm typecheck && pnpm lint && pnpm test && pnpm build`。
- 新增脚本建议：`typecheck`、`lint`、`format`、`test`、`test:watch`。

## 11. 性能预算

| 项 | 目标 | 测量方式 |
| --- | --- | --- |
| 首屏 JS（gzip） | ≤ 150KB | `pnpm build` + 可视化分析 |
| 首屏 CSS（gzip） | ≤ 40KB | 同上 |
| 宠物懒加载 chunk | ≤ 600KB（JS+WASM） | 同上 |
| `.riv` 资源 | ≤ 2MB，按需 | 构建产物 |
| 中端安卓首屏 | ≤ 1.5s | Realme 真机 + WebView 远程调试 |
| 动画帧率 | 60fps | Chrome Performance / 真机目测 |
| 长任务 | 无 > 50ms 的主线程任务 | Performance 面板 |

- 预算是目标值；Phase 1 测完基线后校准一次，放宽必须记录到 `decisions.md`。
- 只有首屏需要的依赖进主 chunk；Rive、Markdown、语法高亮、虚拟列表一律 `lazy`。
- 禁止全量引入：`import { Button } from "..."` 而不是 `import * as ...`。
- 图片用 WebP/AVIF；图标用 SVG；不打包字体文件（品牌字体必须子集化）。

## 12. 兼容性与安全

**浏览器底线**

- Chrome / Android System WebView ≥ 111
- Safari / macOS WKWebView ≥ 16.4（macOS 13.3+）
- Firefox ≥ 128（仅桌面调试参考）

真机预检：

```bash
adb shell dumpsys package com.google.android.webview | grep versionName
# 没有输出再试：
adb shell dumpsys package com.android.webview | grep versionName
```

低于 111 时按顺序处理：升级 WebView → 提高最低支持版本 → 退回 Tailwind 3.4/UnoCSS（需在 `decisions.md` 记录）。不要用 SCSS 当兼容补丁。

**Tauri 配置**

- `withGlobalTauri` 设为 `false`；前端统一 `import { invoke } from "@tauri-apps/api/core"`。
- CSP 不允许长期为 `null`。上线前按 Tauri 推荐值收紧，并为 Rive 的 WASM 增加 `script-src 'wasm-unsafe-eval'`；逐项验证 IPC、asset 协议、WebSocket `connect-src`。
- capabilities 最小权限：只开实际用到的命令/插件。
- 不在前端保存配对密钥/长期凭证；密钥留在 Rust/系统钥匙串。
- 不加载 CDN 脚本、字体、样式；所有资源随包分发。

## 13. 迁移计划

当前进度（2026-10-31）：依赖、Vite/TS 别名、Tailwind、shadcn Base UI（base-nova）、Biome、Vitest 已就绪；Phase 1 的 React entry 与连接/聊天尚未迁移。

| 阶段 | 内容 | 退出标准 |
| --- | --- | --- |
| 0. 预检 | 真机 WebView 版本、开分支、记录当前包体/启动时间 | 版本 ≥ 111 或已决定降级方案 |
| 1. 骨架 | React + Vite + Tailwind + shadcn + Biome；两个 entry；连接 + 聊天 1:1 复刻 | 双端连接/收发与现状一致，Rust 未改 |
| 2. 宠物 | Rive 舞台、情绪状态机、懒加载、后台暂停 | 真机 60fps，聊天仍可用 |
| 3. 麦克风 | 手机采集 + 桌面转写/输入、协议扩展、权限与降级 | 真机按住说话全链路通过 |
| 4. 收尾 | 设置/配对 UI、补齐测试、删除旧 DOM/`styles.css`、包名 `desktop` → `sidekick` | 无旧代码引用，测试通过 |
| 5. 加固 | CSP、release 签名、性能预算验收、桌面/安卓回归 | 验收清单全绿 |

约束：

- Phase 1 不改 Rust、不改协议；Phase 2 先做情绪宠物，不接 `status`；Phase 3 才引入音频协议；`status` 映射放 P2（麦克风稳定后）。
- 不在同一次改动里同时换框架、改协议、加宠物。
- 每阶段结束更新 `status.md`，重大取舍追加 `decisions.md`。

## 14. 验收清单

- [ ] 桌面 `pnpm tauri dev` 正常启动，`[server] listening` 出现
- [ ] 安卓 `scripts/build-android.sh && scripts/install-android.sh` 成功
- [ ] 手机连接 `IP:8848` 状态为「已连接」
- [ ] 双向聊天与现状一致，气泡方向正确
- [ ] 构建产物中两个 entry 分 chunk，运行时只加载对应角色的一份
- [ ] 宠物情绪状态切换与 [pet PRD](./prd/pet/PRD.md) 一致；协议 status 接入后另测
- [ ] Realme 真机动画 60fps，无长期掉帧
- [ ] `prefers-reduced-motion` 下无强制动画
- [ ] 首屏 JS/CSS 在预算内
- [ ] CSP 开启后无控制台报错（IPC/asset/WASM 都通）
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全绿
- [ ] 无裸 `.mobile` 之类全局选择器；安全区/键盘不遮挡输入框

## 15. 未决事项

- 真机 WebView 版本（决定 Tailwind v4 是否可直接用）。
- 宠物美术方向：已定柔软黏土/手绘矢量，Rive（2026-10-31）；像素/序列帧不采用。
- 聊天记录是否持久化、存哪里（SQLite/tauri-plugin-store）。
- 浅色主题是否要做；当前只做暗色。
- 协议类型是否用 ts-rs 自动生成；等协议字段稳定后再定。
- iOS 端 Rive/WebView 性能，后续单独评估。
