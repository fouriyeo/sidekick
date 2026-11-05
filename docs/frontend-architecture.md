# 前端技术架构

> 状态：已定稿（2026-10-31）；依赖与脚手架已安装，Phase 1 已完成；宠物 P0 已实现 OpenPets schema 2 帧动画图集（含 poster 降级）；2026-11-04 视觉系统为「深海声呐」双主题（D71/D76，默认跟随系统、宠物舞台随主题）；2026-11-05 桌面按 D79 完成「指挥舱 A」5 视图壳，2026-11-06 按 D82 增第 6 视图「用量」；手机按 D80 完成干净版两页壳（宠物 + 设置，591 tests 全绿，真机已验证基础页，主题运行时见 §6）。
> 组织：单仓库、双产物；前端按 `desktop` / `mobile` / `shared` / `protocol` 分目录；桌面与手机固定布局，不做跨端自适应。宠物本期定位纯陪伴，PRD 见 [prd/pet/](./prd/pet/INDEX.md)；壳与导航规则见 [prd/shell/](./prd/shell/INDEX.md)。
> 范围：`app/` 下 Tauri 桌面端与安卓端共用的 WebView 前端。
> 不含：`app/src-tauri/mobile/index.html` 静态落地页（继续用原生 HTML，保持轻量）。
> 依赖准入与许可证细则见 [dependency-policy.md](./dependency-policy.md)。

## 1. 目标与约束

- 双端共用基础层（协议/设计令牌/无平台语义组件），但 UI 按平台分包；桌面与手机各自固定布局，**不做跨端自适应**。
- 下一步核心是情绪宠物（纯陪伴）；AI 联动（DSH hook）已作为独立 P1 接入四态展示；2026-11-05 起桌面按 D79 采用「指挥舱 A」壳（5 视图，D82 增「用量」为第 6 视图），手机按 D80 改为两页壳（宠物 / 设置；无底栏），聊天降级为「系统 › 消息」/手机消息页。规格见 [prd/pet/](./prd/pet/INDEX.md)、[prd/mic/](./prd/mic/INDEX.md)、[prd/hook/](./prd/hook/INDEX.md)、[prd/shell/](./prd/shell/INDEX.md)。
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
| 宠物动画 | 帧动画图集 | OpenPets schema 2（WebP） | 一列一帧；rAF 播放；mobile chunk 内 |
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
│  │  ├─ desktop.tsx          # 挂载桌面指挥舱壳（`desktop/app.tsx`）
│  │  └─ mobile.tsx           # 挂载手机两页壳（`mobile/app.tsx` + `.mobile-clean`）
│  ├─ desktop/                # 桌面专属（指挥舱壳，固定窗口布局）
│  │  ├─ app.tsx              # 桌面根：外壳 + 视图切换 + 全局层（辅助功能条/麦克风浮层）
│  │  ├─ shell/               # icon-rail / global-status-bar / page-header / page-shell / page-chips / card / system-segments
│  │  ├─ pages/               # overview / sessions / content / system / settings 五个一级页
│  │  ├─ features/            # 各页 Section（不自带页头）：connection / chat / clipboard / hook / models / settings / mic-receiver
│  │  ├─ lib/                 # desktop-nav、status/clients/activity/voice store、activity-events、ws-client
│  │  └─ components/          # 跨页小组件（EmptyState 等）
│  ├─ mobile/                 # 手机专属（只做竖屏）
│  │  ├─ app.tsx              # 手机根：宠物 + 设置/二级页 + 返回栈
│  │  ├─ shell/               # page / page-header / pet-top-bar
│  │  ├─ features/
│  │  │  ├─ pet/              # 首屏：舞台、鲸鱼、会话卡容器
│  │  │  ├─ asking/           # 等你决定页
│  │  │  ├─ first-use/        # 首用清单（4 步；本地只验前两步；设置页 banner 复用）
│  │  │  ├─ sessions/         # 会话卡 / 会话行 / 清除标记 / D78 工具动作
│  │  │  ├─ mic/              # 按住说话、圆钮/胶囊、权限、结果卡
│  │  │  ├─ connect/          # 连接页、扫码、重连（connection-view）
│  │  │  ├─ chat/             # 消息页（通道调试）
│  │  │  └─ settings/         # 更多：设置整页（页面化）
│  │  ├─ ui-store.ts          # MobileView 枚举 + scanOpen + offlineReturnView
│  │  └─ styles/
│  ├─ shared/
│  │  ├─ ui/                  # shadcn 复制组件 + signal-bars / status-chip / theme-options
│  │  ├─ lib/
│  │  │  ├─ tauri.ts          # invoke/listen 唯一出口
│  │  │  ├─ theme.ts          # 主题偏好：initTheme/useTheme/setThemePreference
│  │  │  ├─ status.ts         # AI 四态文案/优先级（两端共用）
│  │  │  ├─ sessions.ts       # 会话行派生（D78 工具动作白名单）
│  │  │  ├─ activity.ts       # 最近发生的类型与派生
│  │  │  ├─ activity-store.ts # 内存 store 工厂（cap 20，不落盘）
│  │  │  ├─ mic-status-copy.ts # 麦克风状态文案（两端共用）
│  │  │  ├─ local-storage.ts  # 安全 localStorage 读写（含 sidekick:theme）
│  │  │  ├─ utils.ts          # cn() 等
│  │  │  └─ format.ts         # Intl 等纯函数
│  │  └─ styles/
│  │     ├─ globals.css       # @import "tailwindcss"; 基础样式
│  │     └─ tokens.css        # @theme 设计令牌
│  ├─ protocol/
│  │  ├─ messages.ts          # 与 Rust 协议一一对应的类型
│  │  └─ audio-frame.ts       # 麦克风二进制帧编解码/测试向量
│  └─ assets/
│     ├─ pet/                 # 图集/海报（mobile chunk）
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
- `mobile/features/pet` 内部加载 `assets/openpet/` 的图集与播放器；图集独立文件、只进 mobile chunk，不进入桌面首屏。
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
- 桌面 UI 直接连本机 `ws://127.0.0.1:<server_info.port>/ws`（端口由服务端动态分配）；手机走 Rust 传输，并先用 `discover_servers` 发现电脑。这个差异保留，未来换 BLE 只改 Rust/`tauri.ts`，UI 不变。
- 连接状态收敛为一个状态机：`disconnected → connecting → connected → error`；所有界面读同一个 store，不各自维护 `online` 布尔值。
- 事件订阅在 entry 挂载时注册一次，卸载时取消；不要在每次渲染里 `listen`。
- 协议增量（D79）：`system` 消息增加可选 `clients`（当前在线客户端数，含桌面本机窗口与网页预览），桌面 `desktop-clients-store` 展示 `max(0, clients - 1)` 台设备；旧服务端不发送、旧客户端忽略。`status.sessionList` 的 `tool` 仍按 D78 双端白名单，展示文案集中在 `shared/lib/sessions.ts`。
- 桌面本地动作：会话页 / 总览的「在 DSH 打开」走本地 WS 发 `focus.request` 并读 `focus.result`，不新增协议、不接受手机传来的应用路径。
- 数据 store 只存协议真实字段：AI 状态 / 会话列表 / 在线数 / 最近发生都来自事件；「最近发生」仅内存（cap 20），重启清空，不落盘。
- **浏览器 dev mock 没有本地 WS**：`?role=desktop` 下「在 DSH 打开」（本地 WS 发 `focus.request`）不会生效，必须在 `pnpm tauri dev` / 真机验证；dev mock 已补 `__TAURI_EVENT_PLUGIN_INTERNALS__` 供新增订阅使用。

## 6. 样式规范

**基础**

- `shared/styles/globals.css` 依次引入 `tailwindcss`、`tw-animate-css`、`shadcn/tailwind.css`、`./tokens.css`；`@custom-variant dark` 使用 `.dark` 类。
- 设计令牌以 shadcn 语义名为基线：`background`、`foreground`、`card`、`popover`、`primary`、`secondary`、`muted`、`accent`、`destructive`、`border`、`input`、`ring`、`radius`；品牌值只在 `tokens.css` 覆盖。
- `shadcn/tailwind.css` 只提供 variants/utilities；颜色值在 `tokens.css` 定义。
- 视觉系统是「深海声呐」双主题（2026-11-04，D71）：`tokens.css` 的 `:root` 放深色（无 JS/回退兜底），`:root[data-theme="light"]` 放浅色；**颜色不再由 `.dark` 块承载**。`.dark` 只服务 Tailwind 的 `dark:` 变体，必须与 `data-theme` 同步。
- 令牌全部 hex（真机 WebView 103 不支持 `oklch`/`color-mix`），`--radius: 12px`；语义色板与用法见 [standards/visual.md](./standards/visual.md)。
- 字体用系统栈：`-apple-system, "PingFang SC", "Noto Sans CJK SC", "Helvetica Neue", sans-serif`；数据/地址/用量用 `ui-monospace`；`body` 开启 `tabular-nums`；不打包完整中文字体。
- 图标统一用 lucide-react；不引 iconfont、不内联一大段 SVG path。

**主题运行时**

主题必须在 CSS/React 之前确定，否则首屏会闪；持久化 key 为 `sidekick:theme`。

1. `app/index.html` 的 `<head>` 内联防闪脚本（在样式与入口脚本之前执行）：
   - 读 `localStorage["sidekick:theme"]`，只接受 `system | light | dark`，非法/缺失一律 `system`（默认跟随系统，D76）；
   - `system` 用 `matchMedia("(prefers-color-scheme: light)")` 解析；
   - 同时写 `<html>` 的 `data-theme`（令牌）、`dark` class（Tailwind `dark:` 变体）与 `color-scheme`；localStorage 被禁用（隐私模式等）时静默回退深色。
2. `shared/lib/theme.ts` 是运行时唯一出口：
   - `ThemePreference = "system" | "light" | "dark"`（默认 `system`），`ResolvedTheme = "light" | "dark"`；
   - `initTheme()`：入口调用一次，应用当前偏好并挂上系统监听；
   - `useTheme()`：`useSyncExternalStore`，返回 `{ preference, resolved }`；
   - `setThemePreference(pref)`：写 localStorage + 立即应用，切换即时生效、不刷新；
   - `applyTheme` 负责双写 `data-theme` + `.dark` + `color-scheme`，三者不能只改一个。
3. 跟随系统与多窗口同步：偏好为 `system` 时监听 `matchMedia("(prefers-color-scheme: light)")` 的 `change`；任意窗口改偏好通过 `storage` 事件同步到其它窗口。
4. Sonner 跟随主题：`shared/ui/sonner.tsx` 用 `useTheme().resolved` 作为 `<Sonner theme={...}>`，不写死 dark。
5. 设置入口：桌面「设置 → 外观」与手机「更多 → 外观」共用 `shared/ui/theme-options.tsx`（跟随系统 / 浅色 / 深色，`aria-pressed`）；默认跟随系统，宠物舞台的 `--pet-*` 也一起跟随（D76）。

**令牌示例**

```css
/* shared/styles/tokens.css（节选；完整值以此文件为准） */
:root {
  --radius: 12px;
  --motion-ease-out-soft: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-1: 120ms;
  --dur-2: 180ms;
  --dur-3: 240ms;
  --dur-4: 320ms;

  /* 深色（:root 基座；偏好默认 system，按系统解析） */
  --background: #06181e;
  --foreground: #dceceb;
  --card: #0b242c;
  --primary: #3fc4a0;
  --primary-foreground: #032019;
  --border: #2b5560;
  --input: #578893;
  --ring: #6ef0c8;
  --signal: #6ef0c8;
  --whale: #8fb6e0;
  --wash: #10393b;
  --abyss: #030e12;
  color-scheme: dark;
}

:root[data-theme="light"] {
  /* 浅色（第二主题）：海面雾光 + 海玻璃 */
  --background: #e7efed;
  --foreground: #0e2a2b;
  --card: #f5faf8;
  --primary: #095b51;
  --primary-foreground: #f7fdfb;
  --border: #a4beb9;
  --input: #6f8f89;
  --ring: #0a7764;
  --signal: #0a7764;
  --whale: #28618c;
  --wash: #dfece8;
  --abyss: #082229;
  color-scheme: light;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-signal: var(--signal);
  --color-whale: var(--whale);
  --radius-sm: 10px;
  --radius-md: 12px;
  --radius-lg: 14px;
  --radius-xl: 16px;
  --ease-out-soft: var(--motion-ease-out-soft);
}
```

完整令牌集（含 `--pet-*`、`--chart-*`、`--shadow-*`）见 `app/src/shared/styles/tokens.css`；语义解释见 [standards/visual.md](./standards/visual.md) §3。`--pet-*` 也随 `data-theme` 切换（深色深海自发光 / 浅色海玻璃舞台，D76）；始终深色的表面用 `.deep-sea-scope` 重新钉住深色 pet 令牌与浮层用到的壳层信号色（如桌面麦克风浮层）。

**类名与组件**

- 条件类名统一用 `cn()`（来自 `cn` 包，已替代 `clsx` + `tailwind-merge`）；不要手写字符串拼接。
- 多变体组件用 CVA（shadcn 默认方案）；不要为每个变体写一套 CSS。
- 类名顺序：布局 → 盒模型 → 排版 → 视觉 → 状态；启用 Biome 的 `useSortedClasses` 时自动排序。
- 不给 `<body>` 或全局元素写“状态类”做布局切换；用组件边界和 `data-*` 属性。主题切换统一走 `data-theme` + `.dark`，不要手改 `<html>` 的 class。
- 颜色令牌已随 `data-theme` 变化，组件优先用语义类（`bg-card`、`text-muted-foreground`）；只有需要针对主题换结构/图片时才用 `dark:`。
- 动态值（进度、位移）用 CSS 变量传，不在 JSX 里拼复杂字符串。

**移动端**

- 所有全屏容器使用 `env(safe-area-inset-*)`；底部输入区必须避开手势条。
- 高度用 `100dvh` / `min-h-dvh`；真机 WebView 103 不支持 `dvh`，`globals.css` 里未分层的 `.h-dvh { height: 100vh }` / `.min-h-dvh { min-height: 100vh }` 兜底优先于 Tailwind 分层工具类，**不要删**。
- 键盘弹出时用 `visualViewport` 调整底部输入区，避免输入框被遮挡。
- 点击目标 ≥ 44×44 px；图标按钮要有 `aria-label`。
- 安卓上避免大面积 `backdrop-filter`、`filter: blur()`、阴影动画；优先 `transform`/`opacity`。
- 桌面窗口可缩放：用 `min-w`/`max-w` 与 grid/flex，不写死像素宽度；设计基准 1180×760（最小 960×640），手机 entry 不假设桌面尺寸。

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
| 角色 | 帧动画图集 | 宠物 idle/工作/等待/完成与后续状态行 | 10fps；后台暂停；减少动效冻结首帧；图集失败降级 poster |

规则：

- 不并行引入 GSAP/anime.js；如果未来确实需要复杂时间线，先在 `decisions.md` 立项，再引。
- 只动 `transform` 和 `opacity`；不动 `width/height/top/left`，不在安卓上动 `box-shadow`/`filter`。
- 统一时长令牌：120 / 180 / 240 / 320ms；缓动统一用 `--ease-out-soft` 或 Motion spring，不随手写 `ease-in-out`。
- 尊重 `prefers-reduced-motion: reduce`：关闭非必要动效，保留状态切换的即时反馈。
- 首屏关键内容不做入场动画；避免“先空后跳”。
- 长列表（> 50 条）不做 `layout` 动画；超过 200 条考虑虚拟列表（按需引入）。

**宠物与帧动画图集**

- App 语义 → 图集状态的映射集中在 `mobile/features/pet/sprite-state-map.ts`（候选链，先匹配存在的状态行，否则回落 idle）；AI 四态由 `ai-status.ts` 独立驱动。
- 图集在 mobile entry 内按需加载；播放器 `sprite-pet.tsx` 只改 `background-position`，不创建额外 canvas。
- 监听 `visibilitychange` / 覆盖层状态，后台暂停帧循环，回前台继续；减少动效冻结第 0 帧。
- 先在 Realme 真机测 60fps；单帧 256px 在 ~500px 舞台是 2 倍放大，必要时换 512 cell 资产（代码不用改）。
- 新增状态行流程见 `docs/engineering/pet-runtime.md` §3.2；不再引入 Rive 等重运行时。

## 9. 状态管理

- Zustand 5；按 feature 拆 store：`useConnectionStore`、`useChatStore`、`usePetStore`、`useSettingsStore`、`useUiStore`（桌面另有 `desktop/lib/*-store`）。
- store 只存“真状态”，派生值用 selector 计算；不存重复数据。
- 连接状态是唯一事实源；聊天/宠物界面只读它，不各自维护 `online`。
- 本地持久化：服务器地址用 localStorage；宠物存档用 plugin-store（adapter 隔离）；聊天记录暂不落盘。
- 不引全局事件总线；Tauri 事件在 `shared/lib/tauri.ts` 里转成 store action。
- 组件局部 UI 状态（展开/收起、输入草稿）留在组件内，不进全局 store。
**壳与视图（D79）**

- 桌面：`desktop/lib/desktop-nav.ts` 定义 `DesktopView = overview | sessions | content | usage | system | settings`、`SystemSection = connection | voice | hook | chat`、导航项与 ⌘1–⌘6；壳只维护「当前视图 + 系统分段」，不进 URL、不引路由。
- 手机：`mobile/ui-store.ts` 的 `MobileView = pet | settings | chat | asking | offline` + `scanOpen`；根页面按 view 渲染宠物/设置/二级页，无底部 tab；返回栈在 `mobile/system-back.ts`。
- 视图切换不是数据状态：当页数据由数据 store 提供——桌面 `useDesktopStatusStore`（status / sessionList / updatedAt）、`useDesktopClientsStore`（clients 近似台数）、`useDesktopActivityStore`（最近事件）、`useDesktopVoiceStore`（最近一次语音）、`desktop-activity-events.ts`（事件→最近发生）；手机 `session-store`（会话卡 + 清除标记）与 `first-use/store.ts`（`micReady` / `dismissed` 本机持久化）；`activity-store` 暂留但不再渲染。
- `status` 解析集中在数据 store；D78 的工具动作文案由 `shared/lib/sessions.ts` 统一派生，桌面与手机共用，不各写一套映射。
- Android 返回键统一从 `shared/lib/tauri.ts` 的 `subscribeBackButton` 进入（App 启动注册一次）；「更多」页往 `mobile/system-back.ts` 的返回栈压处理函数，其它二级页由 `MobileApp` 按视图层级处理，根页面兜底「再按一次退出」（2 秒窗口，之后调 `exitApp`）。规则见 [standards/ux.md](./standards/ux.md) §4.1。

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
| 宠物图集 | ≤ 1MB WebP，按需 | 构建产物 |
| 中端安卓首屏 | ≤ 1.5s | Realme 真机 + WebView 远程调试 |
| 动画帧率 | 60fps | Chrome Performance / 真机目测 |
| 长任务 | 无 > 50ms 的主线程任务 | Performance 面板 |

- 预算是目标值；Phase 1 测完基线后校准一次，放宽必须记录到 `decisions.md`。
- 只有首屏需要的依赖进主 chunk；图集、Markdown、语法高亮、虚拟列表一律按需。
- 禁止全量引入：`import { Button } from "..."` 而不是 `import * as ...`。
- 图片用 WebP/AVIF；图标用 SVG；不打包字体文件（品牌字体必须子集化）。

## 12. 兼容性与安全

**浏览器底线**

- Chrome / Android System WebView ≥ 111（当前 Realme 为 103；宠物 P0 已加 hex/rgb 颜色与 100vh 回退，`color-mix` 细节降级，见 D34）
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
- CSP 不允许长期为 `null`。上线前按 Tauri 推荐值收紧；逐项验证 IPC、asset 协议、WebSocket `connect-src`。
- capabilities 最小权限：只开实际用到的命令/插件。
- 不在前端保存配对密钥/长期凭证；密钥留在 Rust/系统钥匙串。
- 不加载 CDN 脚本、字体、样式；所有资源随包分发。

## 13. 迁移计划

当前进度（2026-11-05）：Phase 1 已完成。React 双 entry、`protocol/messages.ts`、`shared/lib/tauri.ts`、宠物 P0（OpenPets schema 2 帧动画图集 + poster 降级）、麦克风、桌面剪贴板、AI 联动已落地。桌面按 D79 完成 5 视图壳、D82 增用量页；手机按 D80 完成两页壳（宠物页顶栏 / 会话卡 / 无底色鲸鱼 / 圆形麦克风 / 结果卡弹窗；设置二级页 / 首用 banner / 返回层级），删除 `stream`、`tab-bar`、`now-row` 与动态页；`.mobile-clean` 令牌只作用于手机；全仓 591 tests / tsc / lint / build 全绿，真机 Realme 已验证宠物页/会话展开/设置/返回键，待补录音禁切页、结果卡清空、深色/320 真机。

| 阶段 | 内容 | 退出标准 |
| --- | --- | --- |
| 0. 预检 | 真机 WebView 版本、开分支、记录当前包体/启动时间 | 版本 ≥ 111 或已决定降级方案 |
| 1. 骨架 | React + Vite + Tailwind + shadcn + Biome；两个 entry；连接 + 聊天 1:1 复刻 | 双端连接/收发与现状一致，Rust 未改 |
| 2. 宠物 | 舞台、情绪状态机、plugin-store 存档、单竖屏布局（帧动画图集） | 真机 60fps，聊天仍可用 |
| 3. 麦克风 | 手机采集 + 桌面转写/输入、协议扩展、权限与降级 | 真机按住说话全链路通过 |
| 4. 收尾 | 设置/配对 UI、补齐测试、包名 `desktop` → `sidekick`（旧 DOM/`styles.css` 已随 Phase 1 删除） | 无旧代码引用，测试通过 |
| 5. 加固 | CSP、release 签名、性能预算验收、桌面/安卓回归 | 验收清单全绿 |

约束：

- Phase 1 不改 Rust、不改协议；Phase 2 先做情绪宠物；Phase 3 引入音频协议；`status` 映射在 AI 联动 P1 落地（DSH hook）。
- 不在同一次改动里同时换框架、改协议、加宠物。
- 每阶段结束更新 `status.md`，重大取舍追加 `decisions.md`。

## 14. 验收清单

- [ ] 桌面 `pnpm tauri dev` 正常启动，`[server] listening` 出现
- [ ] 安卓 `scripts/build-android.sh && scripts/install-android.sh` 成功
- [ ] 手机打开 App 自动发现并连接电脑，状态为「已连接」；无发现时可手动输入地址兜底
- [ ] 桌面指挥舱壳：默认总览、状态条三段可点、⌘1–⌘6、辅助功能提示条外壳级、麦克风浮层全局
- [ ] 手机两页壳：默认宠物、顶栏 gear/连接/chat 可点、无底部 tab、会话卡折叠展开、二级页返回层级正确、录音中禁切页、结果卡三段
- [ ] 状态语言两端同词（连接 7 / AI 4 / 麦克风 9），琥珀只给「等你决定」，会话工作行显示 D78 工具动作
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
- 宠物美术方向：改用内置 OpenPets schema 2 帧动画图集（2026-11-02，D57）；自绘 SVG 与 Rive 路线停止。
- 聊天记录是否持久化、存哪里（SQLite/tauri-plugin-store）。
- 协议类型是否用 ts-rs 自动生成；等协议字段稳定后再定。
- iOS 端 WebView 性能与帧动画兼容性，后续单独评估。
