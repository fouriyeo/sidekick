# 决策记录

> 按时间追加，不改写历史结论；新决策标注日期。

## D1 · 命名：小跟班 / Sidekick（2026-10-31）

- 背景：需要一个直白、一听就懂、又带宠物感的名字。
- 决策：中文「小跟班」，英文代号 Sidekick，仓库 `sidekick`。
- 放弃：Familiar/使魔（过于中二、难理解）、Tether（含义偏冷）、信鸽（不贴产品形态）等。

## D2 · 手机端必须是独立 App（2026-10-31）

- 背景：曾提出用手机浏览器打开电脑提供的网页来验证互通。
- 决策：手机端做真正的安卓 App（Tauri 安卓目标），网页只作为下载入口与调试预览。
- 原因：用户明确要求「手机用的不是浏览器，是软件」；长期形态是常驻宠物 App，需要应用身份、后台与后续 BLE 能力。

## D3 · 技术栈：Tauri 2 双端（2026-10-31）

- 决策：桌面端与手机端都用 Tauri 2（Rust 核心 + Web 前端），单仓库共用代码。
- 放弃：Flutter（用户最终选择 Tauri；Flutter 工具链也曾在国内网络卡住）、React Native、原生 Kotlin、Electron、纯 Node 守护进程。
- 代价：Tauri 移动端蓝牙生态弱（未来蓝牙需自写 Kotlin 插件或加 Python sidecar）；Android 工具链较重。
- 收益：Rust 侧完全掌控网络/传输；Web UI 迭代快；桌面端天然有 GUI 与服务端能力。

## D4 · 通信：局域网 WebSocket 优先，蓝牙延后（2026-10-31）

- 背景：最初设想蓝牙优先；用户改主意先验证同一局域网互通。
- 决策：MVP 走局域网 `ws://<IP>:8848/ws`；蓝牙作为后续传输方案。
- 原因：局域网链路简单可靠，能最快验证「手机 ↔ 电脑」核心闭环；蓝牙预研已证明可行但工程量大（见 `ble-notes.md`）。
- 长期设想：蓝牙负责发现/唤醒与网络隔离场景，局域网负责数据；传输层可替换。

## D5 · 角色：电脑服务端、手机客户端（2026-10-31）

- 决策：电脑起 HTTP/WS 服务；手机 App 主动连接电脑。
- 原因：电脑侧网络与常驻能力更稳；手机端库生态成熟（中心设备）；iOS 后台更友好。

## D6 · 手机端用 Rust 建连，而非 WebView WebSocket（2026-10-31）

- 决策：前端通过 Tauri 命令/事件调用 Rust 中的 tokio-tungstenite 客户端。
- 原因：规避 Android WebView 对 `ws://` 混合内容的限制；为未来换蓝牙传输保留统一接口。

## D7 · 单仓库 + `app/` 目录（2026-10-31）

- 决策：Tauri 项目统一放在 `app/`（最初为 `desktop/`，后重命名）；协议与文档放 `protocol/`、`docs/`。
- 原因：桌面与手机共用前端与协议，单仓库降低同步成本。

## D8 · 协议 v0：广播式 chat/system，无鉴权（2026-10-31）

- 决策：WebSocket JSON 文本帧，服务端广播；仅 `chat` / `system` 两类消息。
- 原因：MVP 先验证通道；AI 接入阶段再扩展 `status` / `ask` / `answer` / `notify` / `input`。
- 代价：同网段任何人可连；后续必须补配对与鉴权。

## D9 · 蓝牙预研：Python + bless 验证 Mac 外设（2026-10-31）

- 结果：Mac 可正常广播自定义 GATT 服务；遇到并解决 CoreBluetooth「cached values must be read-only」限制。
- 结论：技术可行，但当前暂停；重启前先决定 Tauri 插件还是 Python sidecar。详见 `ble-notes.md`。

## D10 · MVP 直接分发 debug APK（2026-10-31）

- 决策：先用 debug APK（约 120–240MB）在真机验证，接受体积。
- 后续：生成 keystore、配置 release 签名，产出 10–20MB 级安装包，并打包桌面发行版。

## D11 · 手机端页面提供「下载 App」按钮（2026-10-31）

- 决策：桌面服务 `/` 落地页提供 `/download/apk` 下载按钮；桌面窗口扫码即可直达。
- 原因：用户扫码后希望直接下载安装，而不是手动找安装包。

## D12 · 前端包管理器迁移到 pnpm（2026-10-31）

- 决策：前端依赖管理从 npm 切换到 pnpm；`package.json` 锁定 `packageManager: pnpm@11.22`，`pnpm-lock.yaml` 入库，删除 `package-lock.json`；Tauri 的 `beforeDevCommand` / `beforeBuildCommand` 改为 `pnpm dev` / `pnpm build`。
- 原因：安装更快、磁盘占用更小、依赖隔离更严格，避免多包管理器混用。
- 影响：文档、脚本、`tauri.conf.json` 中的 npm/npx 命令同步更新。

## D13 · 清理模板残留与未使用依赖（2026-10-31）

- 移除：未引用的模板 SVG（`app/src/assets`）、未使用的 `tauri-plugin-opener`（前后端依赖与 capability）、本地 Python 实验环境 `daemon/`（约 50MB，知识保留在 `docs/ble-notes.md`）。
- 保留：`app/src-tauri/icons`（打包需要）、`capabilities/default.json`（`core:default`）。
- 构建产物继续不入库；`gen/` 保持忽略、按需生成。

## D14 · 前端框架与样式：React 19 + Tailwind CSS v4（2026-10-31）

- 背景：现有前端为原生 DOM + 手写 CSS；下一步宠物界面是状态驱动 + 高频动画，继续手写会失控。
- 决策：前端框架采用 React 19（Vite 8 + TypeScript 6）；样式采用 Tailwind CSS v4（CSS-first，`@theme` 令牌）；不引入 SCSS。
- 放弃：Vue 3.5（可用，但 shadcn/Base UI、Motion、Rive 的 React 资料更多）、Svelte 5（生态小）、继续原生（宠物 UI 维护成本高）。
- 代价：React 运行时约 60KB gzip；Tailwind v4 要求 Android WebView ≥ 111、macOS WKWebView ≥ Safari 16.4（macOS 13.3+）。
- 规范：`frontend-architecture.md`。

## D15 · 组件库：shadcn/ui + Base UI（2026-10-31）

- 决策：常规交互组件采用 shadcn/ui，primitive base 选 Base UI（`@base-ui/react`）；组件复制进仓库维护，不混用 Radix 版本。
- 原因：视觉可完全定制，适合宠物产品；自带无障碍；2026-07 起 shadcn 默认 Base UI。
- 放弃：daisyUI（偏成品、复杂交互弱）、Ant Design/Mantine（重、后台感）、纯 headless（工作量大）。
- 规范：`frontend-architecture.md` 第 7 节、`dependency-policy.md`。

## D16 · 动画分层：Motion + Rive（2026-10-31）

- 决策：UI 动效用 Motion；宠物主体用 Rive 状态机；CSS 只做微动效。GSAP/anime.js 暂不引入，Live2D 后置。
- 原因：一层一个引擎，避免重复能力和包体膨胀；Rive 的状态机最适合 idle/working/waiting。
- 代价：Rive 需要美术资产与编辑器；运行时和 `.riv` 必须懒加载；CSP 需允许 WASM。
- 规范：`frontend-architecture.md` 第 8 节。

## D17 · 开源依赖治理：准入清单与预算（2026-10-31）

- 决策：新增 npm/Rust 依赖必须过 6 项准入（必要性、维护、许可证、体积、安全、可替换性）；新增运行时依赖记入本文件。
- 预算：首屏 JS ≤ 150KB gzip、CSS ≤ 40KB、宠物 chunk ≤ 600KB（JS+WASM）、`.riv` ≤ 2MB。
- 放弃：为单个函数引整库、CDN 运行时、重复能力的库（SCSS+Tailwind、GSAP+Motion、Redux+Zustand 等）。
- 规范：`dependency-policy.md`。

## D18 · shadcn Base UI 实施：base-nova + cn（2026-10-31）

- 决策：shadcn 采用 `base-nova` 风格；组件复制进 `src/shared/ui`；类名合并用 `cn` 包（替代 clsx + tailwind-merge）；CSS 引入 `shadcn/tailwind.css` 与 `tw-animate-css`。
- 原因：这是 shadcn 2026 registry 的默认 Base UI 组合，减少自造适配层；`cn` 零依赖、API 兼容。
- 代价：`shadcn` 包作为运行时 CSS 依赖存在；`cn` 是较新的包，需按依赖规范跟踪维护状态。
- 规范：`frontend-architecture.md` 第 7 节、`dependency-policy.md` 第 7/9 节。

## D19 · 文档体系：树形 + 懒加载（2026-10-31）

- 决策：文档按问题域分 `product / standards / prd / engineering` 四个分支，根入口 `docs/INDEX.md`；每层索引只做路由，叶子只讲一件事；AI 每次最多读 1 个分支索引 + 2 篇叶子。
- 原因：项目文档增多后，AI 每次全量读取会挤占上下文，也容易读到过期内容；树形索引让“该读哪篇”可执行。
- 代价：新增文档要维护 frontmatter 与父索引；改事实要先找“唯一归属”。
- 规范：`docs/standards/documentation.md`；检查脚本 `scripts/check-docs.mjs`。

## D20 · 宠物本期定位：纯陪伴优先（2026-10-31）

- 决策：本期宠物只做情绪陪伴（命名、idle、摸摸/戳、情绪记忆、双姿态、麦克风联动）；AI 工作状态映射放 P2。
- 原因：先把“像一个生命”做扎实，避免宠物变成状态指示灯；情绪价值是产品差异化的第一入口。
- 代价：Claude Code / Qoder 状态联动延后；用户可能期待宠物显示任务状态，需在 PRD/关于页说明。
- 规范：`docs/prd/pet/PRD.md`。

## D21 · 麦克风本期：AI 语音输入优先（2026-10-31）

- 决策：手机当无线麦克风，服务 AI 语音输入（按住说话 → 电脑转文字 → 输入当前 AI 工具）；系统级虚拟麦克风（会议/录音）放 P2。
- 原因：AI prompt 输入是高频痛点；系统虚拟声卡驱动工程量大、分发复杂，不适合先做。
- 代价：不能用于会议/录音软件；需要在产品文案里说清“不是系统麦克风”。
- 规范：`docs/prd/mic/PRD.md`。

## D22 · 手机横屏双姿态：支架 + 手持（2026-10-31）

- 决策：手机只做横屏，支持支架模式（dock）与手持模式；自动判断 + 手动锁定；切换是状态，不是响应式断点。
- 原因：用户实际会“放在支架上”和“拿起来说话”两种场景；一套布局无法同时满足远看和拇指可达。
- 代价：多一套布局与切换逻辑；自动判断可能不准，需保留手动。
- 规范：`docs/standards/ux.md`、两份 SPEC。

## D23 · 宠物视觉：夜灯桌宠 + 柔软黏土（2026-10-31）

- 决策：暗色舞台 + 一处暖光；宠物走柔软黏土/手绘矢量，Rive 状态机；不做像素风、写实 3D、霓虹/玻璃。
- 原因：与“情绪价值、想摸、桌边小生命”最匹配；Rive 适合表情/动作组合，也符合现有依赖基线。
- 代价：美术资产是关键路径；中端安卓需控制网格/粒子与阴影。
- 规范：`docs/standards/visual.md`。

## D24 · 麦克风默认本机转写，不上云（2026-10-31）

- 决策：本期语音只在本机转写；不默认上传云端、不保存原始音频；云端 ASR 需单独开关与决策。
- 原因：语音内容敏感；本机转写能建立信任，也避免网络依赖与 API 成本。
- 代价：需要模型/系统能力选型与体积/准确率权衡；需 spike 对比 macOS Speech 与 whisper.cpp。
- 规范：`docs/engineering/audio-pipeline.md`。

## D25 · 文本输入只输入、不发送（2026-10-31）

- 决策：麦克风只把文字输入到当前焦点；绝不自动回车/发送；目标窗口变化、无输入框、密码框时只复制并提示。
- 原因：自动提交可能把未检查的内容发给 AI/他人，风险不可接受；宁可多一步粘贴。
- 代价：部分场景需要用户手动粘贴；自动粘贴依赖辅助功能权限。
- 规范：`docs/prd/mic/PRD.md`、`docs/standards/ux.md`。

## D26 · 架构组织：单仓库、双产物、平台分目录（2026-10-31）

- 决策：保留一个仓库、一个 Tauri 工程，构建 macOS App 与安卓 APK 两个独立产物；前端按 `entries / desktop / mobile / shared / protocol` 分目录，禁止跨平台 import；桌面与手机各自固定布局，不做跨端自适应。
- 原因：共享协议/类型/设计令牌降低同步成本；平台分目录避免 UI 与业务逻辑搅在一起；拆分独立仓库会让 AI 上下文与文档双份维护。
- 代价：仍需维护一套 Tauri 配置与双端构建；需要边界检查脚本防止越界。
- 规范：`docs/standards/engineering.md`。

## D27 · 项目子智能体与 Skill（2026-10-31）

- 决策：在 `.qoder/agents/` 创建文档导航、PRD 评审、宠物设计、音频工程、协议守门 5 个子智能体；在 `.qoder/skills/` 创建 `sidekick-docs`、`sidekick-feature` 两个项目 Skill。
- 原因：把“读哪篇、按什么标准评审、功能怎么交付”固化成可复用能力，减少每次对话重复解释。
- 代价：需要随文档结构变化维护；子智能体只读，不替代主代理决策。
- 规范：`AGENTS.md` 第 2.5/5 节。

## D28 · 宠物存档使用 Tauri plugin-store（2026-10-31）

- 决策：宠物存档走官方 `@tauri-apps/plugin-store` / `tauri-plugin-store` 2.5.0，文件 `sidekick-pet.json`；通过 `PetStorage` adapter 隔离，版本化、迁移、损坏回退、500ms 防抖、后台立即写。
- 原因：存档是宠物记忆的核心，需要比 WebView localStorage 更稳的本地文件；官方插件支持 Android，避免自写存储层。localStorage 只保留服务器地址。
- 代价：新增一个 Tauri 插件与 Rust 依赖；Rust/Android 构建需回归。
- 规范：`docs/engineering/pet-runtime.md`、`docs/dependency-policy.md`。

## D29 · 宠物姿态只做手动切换（2026-10-31）

- 决策：P0 的 docked/handheld 只由设置手动切换，默认 docked；自动判定（充电/拿起）归 P1，不接传感器。
- 原因：P0 先把两套布局、320ms 过渡和设置做稳；传感器检测需要 Android 插件与权限，风险高。
- 代价：支架/手持需要用户手动选择；自动体验延后。
- 规范：`docs/prd/pet/PRD.md`、`docs/standards/ux.md`。

## D30 · 宠物戳/摸规则（2026-10-31）

- 决策：普通戳 <250ms、冷却 2 秒；冷却期点击丢弃、不计数、不排队。摸摸 = 1.5 秒内 ≥2 次方向变化 + 持续 3 秒 → happy、爱心 ≤6；指针抬起后 2 秒回 idle。快速连戳归 P1。
- 原因：原 PRD 的“2 秒内 3 次戳”与“2 秒冷却”互斥；先把可验收的普通互动做稳。
- 代价：快速连戳的“扭头”彩蛋延后。
- 规范：`docs/prd/pet/SPEC.md`、`docs/standards/ux.md`。

## D31 · 宠物麦克风联动延后，声音/常亮不接能力（2026-10-31）

- 决策：本轮不实现麦克风采集/UI；状态机保留 `MIC_START/SUCCESS/CANCEL/ERROR` 与 Rive trigger 契约。声音、屏幕常亮设置显示“暂未接入”。
- 原因：麦克风是独立阶段；无音频资产与常亮插件时不做假开关。
- 代价：PET-AC-22/23/24/25/26、AC-34/39 本轮未覆盖；麦克风阶段补齐。
- 规范：`docs/prd/pet/ACCEPTANCE.md`、`docs/engineering/pet-runtime.md`。

## D32 · 宠物为主界面，聊天保留入口（2026-10-31）

- 决策：手机默认进入宠物舞台；左上设置、右上聊天；聊天保留为调试/辅助视图，返回宠物不丢状态。
- 原因：宠物是产品情感入口；聊天仍用于局域网验证与后续状态事件。
- 代价：聊天不再是默认页；需要保持连接状态单一事实源。
- 规范：`docs/prd/pet/SPEC.md`、`app/src/mobile/app.tsx`。

## D33 · 不强制横屏或竖屏（2026-10-31）

- 决策：移除“请横屏使用”覆盖层，不在 OS/窗口层强制方向；竖屏沿用同一宠物舞台与设置页（设置页窄屏单列），不提供单独竖屏布局。
- 原因：用户明确不需要强制方向；横屏仍是设计基准，但不应阻断竖屏使用。此决定替代 D22 中“手机只做横屏”的方向限制。
- 代价：竖屏需要额外检查安全区、气泡与控件不遮挡；麦克风阶段的竖屏录音策略另行评估。
- 规范：`docs/standards/ux.md`、`docs/prd/pet/SPEC.md`、`docs/prd/pet/ACCEPTANCE.md`。

## D34 · Android WebView 103 的兼容回退（2026-10-31）

- 决策：宠物 P0 在当前 Realme（Android System WebView 103）上使用 hex/rgb 颜色作为 `oklch` 的回退（`@supports` 内保留 oklch），并用未分层 `100vh` 覆盖 Tailwind 的 `h-dvh`；不降级 Tailwind。
- 原因：真机 WebView 103 不支持 `oklch`、`dvh` 与 `color-mix`，原实现会出现舞台高度塌缩、按钮/卡片颜色透明。用户要求不强制升级 WebView 也能正常使用。
- 代价：`color-mix` 的 hover/透明度细节在 103 上弱化；建议后续升级 WebView，或逐步把关键 opacity 写法改成独立颜色令牌。
- 规范：`app/src/shared/styles/tokens.css`、`app/src/shared/styles/globals.css`、`docs/frontend-architecture.md`。

## D35 · 姿态按屏幕方向自动切换（2026-10-31）

- 决策：`useOrientation` 监听屏幕方向，横屏 → docked、竖屏 → handheld；设置可手动覆盖，下一次方向变化恢复自动。充电/拿起等传感器判定仍归 P1。
- 原因：方向是最稳定、无需权限的姿态信号；真机已验证 `matchMedia`/`screen.orientation` 可用，能减少用户手动切换。
- 代价：手动选择只在当前方向有效；录音中切换布局仍按 P1 契约处理。
- 规范：`docs/prd/pet/SPEC.md`、`docs/standards/ux.md`、`app/src/mobile/features/pet/use-orientation.ts`。
