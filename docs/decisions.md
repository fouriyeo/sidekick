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

## D36 · 麦克风 spike 路径与边界（2026-10-31）

- 决策：spike 用 Tauri WebView `getUserMedia` + `ScriptProcessor`（16kHz/单声道 PCM16）采集，手机 Rust 以 JSON `voice.start` / `voice` / `voice.cancel` + base64 WAV 发送；桌面 Rust 调本机 whisper.cpp（ggml-base）转写，写剪贴板并尝试 Cmd+V；目标应用变化、安全输入或辅助功能未授权时只复制。
- 原因：WebView 采集在 Realme/WebView 103 已实测可用，whisper.cpp 本机可用，先用最短链路验证采集、转写、输入三个高风险点。
- 代价/偏离：JSON base64 WAV 不是最终二进制协议；桌面转写用临时 WAV（立即删除），P0 需改内存/whisper-rs；自动粘贴受 macOS 辅助功能权限限制；手机端暂无上滑取消、波形和结果回传，base 模型准确率有限。
- 规范：`docs/engineering/audio-pipeline.md`、`docs/engineering/protocol-audio.md`、`docs/status.md`。

## D37 · 局域网自动发现用 UDP 广播，不用 mDNS（2026-10-31）

- 背景：手机每次都要扫码或手填 `IP:端口`，IP/端口会变；桌面大二维码长期占位。
- 决策：手机 App 向 `255.255.255.255:47820` 广播一次轻量 probe（1500ms 窗口、3 次），桌面 UDP 响应器单播回「主机名 + 真实端口」；手机用 UDP 源 IP 组装连接地址，自动/点选后走原有 WS 通道。
- 放弃：mDNS/Bonjour（需新 crate，Android 还要 MulticastLock，收益不匹配）、桌面周期广播（无必要，手机按需探测更省电）。
- 代价：路由器禁止广播或 AP 隔离时发现失败，降级为手动地址；发现报文无鉴权，仅暴露「同网段有人在跑 Sidekick」。
- 规范：`docs/engineering/lan-discovery.md`、`app/src-tauri/src/discovery.rs`。

## D38 · 服务端口改为不常用端口 + 候选回退（2026-10-31）

- 背景：8848 被占用时服务直接启动失败，且端口固定让「自动发现」没有意义。
- 决策：候选端口 `47810`–`47814`、`8848` 依次 bind，第一个成功者生效；真实端口通过发现回复与 `server_info` 告知两端；手机 `connect_server` 缺省端口改 47810，显式端口仍兼容。
- 原因：47810 不常用且低于临时端口段（49152–65535），冲突概率低；回退让端口占用不再等于服务不可用。
- 代价：旧版 APK 默认连 8848，升级桌面端后需同步出新 APK（文档已注明）；同机多实例时只有一个实例可被发现。
- 规范：`app/src-tauri/src/lib.rs`、`docs/engineering/lan-discovery.md`。

## D39 · 发现优先、地址兜底；桌面二维码降级为按需展开（2026-10-31）

- 决策：手机 App 启动即自动发现，恰好 1 台电脑时自动连接，多台列点选，0 台给提示并保留「手动输入地址」与上次地址；桌面面板不再常驻大二维码，改为「地址 + 复制 + 自动发现状态」，二维码移入「用手机浏览器打开 / 安装 App」按需展开（仍保留下载入口）。
- 原因：用户明确「电脑端不用整个大二维码一直在那里」；端到端最短路径应是打开 App 就可用。
- 代价：手动输入不再是主路径，需要保留兜底入口与排障文案；桌面二维码变为两步操作（展开→扫）。
- 规范：`app/src/mobile/features/connect/`、`app/src/desktop/features/connect/`、`docs/engineering/lan-discovery.md`。

## D40 · 自动粘贴改为 Sidekick 直接合成 Cmd+V（2026-10-31）

- 背景：spike 用 `osascript -> System Events` 发 Cmd+V，辅助功能授权后仍不可靠，且错误归因在 osascript 而非 Sidekick。
- 决策：由 Sidekick 进程用 `core-graphics` 合成 keycode 9（V）+ Command 的按下/抬起；插入前用 `AXIsProcessTrusted()` 检查自身授权；未授权/目标应用变化/安全输入只复制。设置页提供请求权限、打开系统设置、Finder 定位与重新检测。
- 原因：权限归属于 Sidekick 本身，行为可解释；只发 V，不发送 Return/Enter。
- 代价：macOS 不允许程序自行勾选，用户需手动授权一次；开发二进制重编译后 TCC 可能要求重新授权。
- 规范：`app/src-tauri/src/desktop_mic.rs`、`docs/engineering/audio-pipeline.md`。

## D41 · ASR 改为 whisper-rs 内存转写 + 本机模型管理（2026-10-31）

- 决策：用 whisper-rs 0.16（Metal）在本机转写，不再调 `whisper-cli`、不写临时 WAV；模型目录 `~/Library/Application Support/Sidekick/models`，桌面设置页负责下载/取消/删除/选择，并复用已有 `ggml-base.bin`；保留 tiny/base/small/medium。
- 原因：满足“音频不落盘”，避免 Homebrew 运行依赖；启动 prewarm 后实测 3.9 秒中文约 0.2–0.3s。
- 代价：新增 whisper-rs / reqwest / cmake 构建依赖；模型体积 74MB–1.4GB；base 对代码术语仍有误识，需切 small/medium 或后续测试集优化。
- 规范：`app/src-tauri/src/asr_models.rs`、`docs/engineering/asr-model.md`。

## D42 · 麦克风正式协议：二进制 PCM16 + 单会话（2026-10-31）

- 决策：`mic.start` / `mic.ready` / `mic.stop` 用 JSON；音频用 `SK01 + session + sequence + PCM16` 二进制帧；桌面单 active session、音频不广播、只在 `mic.stop(release/timeout)` 后转写；取消/后台/断连丢弃。
- 原因：JSON base64 WAV 膨胀且解析开销大；单会话足以覆盖 P0 单手机，配对/多客户端隔离在 P1。
- 代价：控制消息仍走广播，同网段调试客户端可见；音频与结果只对单手机场景优化。
- 规范：`app/src-tauri/src/mic_protocol.rs`、`protocol/README.md`、`docs/engineering/protocol-audio.md`。

## D43 · 桌面设置页 + P0 应用内语音浮层（2026-10-31）

- 决策：模型管理与辅助功能入口放在桌面 App 内「设置」Sheet，不单独做网页；语音状态用右上角应用内浮层，不做独立 always-on-top 窗口。
- 原因：模型属于电脑本机能力，手机不应下载；应用内浮层避免新窗口焦点/TCC 复杂度，先满足 P0 反馈。
- 代价：桌面 App 不在前台时看不到浮层；独立小窗与菜单栏入口放 P1。
- 规范：`app/src/desktop/features/settings/`、`app/src/desktop/features/mic-receiver/`。

## D44 · 桌面剪贴板历史作为 P1 辅助能力（2026-10-31）

- 决策：经用户确认，本轮并行实现文本剪贴板历史（搜索/复制/置顶/删除/清空/暂停），作为 P1 辅助能力，不替代宠物/麦克风 P0；只记录文本，跳过 `org.nspasteboard.ConcealedType/TransientType/GeneratedType` 与密码管理器类型，跳过 Sidekick 自身写入；本地 JSON 权限 `0600`，最多 100 条，不联网、不写全文日志。
- 原因：用户明确提出“顺手做剪贴板管理”；复用桌面常驻进程与设置页，成本低；隐私边界必须先定。
- 代价：仅在桌面应用运行时记录；无全局快捷键/菜单栏/图片文件；密码管理器以外的敏感文本无法完全识别。
- 规范：`docs/engineering/clipboard-manager.md`、`app/src-tauri/src/clipboard_manager.rs`、`docs/product/scope.md`。

## D45 · 断连自动重连：指数退避 + 静默重新发现（2026-11-01）

- 背景：手机与电脑断连后不会重试（实测 42s 内 0 次），用户需手动点「连接」；文档把「无自动重连」列为已知问题。
- 决策：手机前端 connection store 在断连、启动未连上、手动连接失败时进入自动重连循环；每次先静默 UDP 重新发现（覆盖 IP/端口回退），发现唯一电脑就连它，发现不到退回上次地址；多台电脑回上次连过的那台，没有上次地址就停止等用户选。退避 1s→2s→4s→8s→16s→30s（之后固定 30s）；手动连接/「重新搜索」立即取消排期并清零退避；App 切后台暂停、回前台立即重试。
- 原因：断连最常见原因是电脑重启、端口回退或 IP 变化，只重连旧地址会失败；重新发现能覆盖这些情况；退避避免高频重试的耗电与日志噪声。
- 放弃：手机 Rust 侧原生重连（可跨 WebView 后台冻结，但要重做发现与 UI 状态协调，留待心跳方案一起评估）；WS 心跳本轮不做（半开连接仍可能延迟发现）。
- 代价：电脑恢复后最多等待一个退避周期（≤30s）才连上；无心跳，半开连接检测仍依赖 TCP。
- 规范：`docs/engineering/lan-discovery.md` 第 6 节、`app/src/mobile/features/connect/connection-store.ts`。

## D46 · 宠物页面屏幕常亮走 Android 窗口标志（2026-11-01）

- 背景：宠物 P0 的「屏幕常亮」设置项标注「暂未接入」；支架模式放在桌边时会被系统锁屏打断，PET-AC-39 记为 P1 未覆盖。
- 决策：新增手机端 Tauri 命令 `set_keep_screen_on({enabled})`，Rust 用 `WebviewWindow::with_webview` + `PlatformWebview::jni_handle()` 直接调 Android `Window.addFlags/clearFlags(FLAG_KEEP_SCREEN_ON)`；前端 `useKeepAwake` 只在「宠物舞台前台可见（含设置弹层）」时开启，聊天页与后台释放；设置页「显示 → 屏幕常亮」变成真开关，默认开、可关闭，旧存档里的 `"never"` 归一化为开。
- 原因：WebView 的 Screen Wake Lock 在 Android System WebView 上可用性/权限前提不确定（Chromium 文档说明 contextless wake lock 需要宿主持有 `WAKE_LOCK`），而窗口标志不依赖 WebView 版本、不需要任何权限，且只在窗口对用户可见时生效，天然满足「宠物页可见才常亮」。不引第三方插件（`tauri-plugin-keep-awake` 等），`jni` 只加在 Android 目标并锁 0.21（与 `tauri-runtime-wry` 一致，不新增 crate 版本）。
- 放弃：`navigator.wakeLock`（真机 WebView 103 风险）；`WAKE_LOCK` 权限 + PowerManager（权限过重）；Kotlin 插件方法（`gen/` 不入库，Raw JNI 代码更少）。
- 代价：iOS 暂为空实现（后续用 `isIdleTimerDisabled` 补同一命令接口）；常亮明显增加耗电，靠设置开关与现有「2 分钟无操作暗到 70%」缓解；JNI 失败只记日志，用户侧静默降级为系统默认熄屏。
- 规范：`app/src-tauri/src/keep_awake.rs`、`app/src/mobile/features/pet/use-keep-awake.ts`、`docs/prd/pet/SPEC.md` §7、`docs/standards/ux.md` §3。

## D47 · 语音转写写入剪贴板历史 + 100 条上限可见（2026-11-01）

- 背景：用户反馈手机语音识别完成后，电脑端系统剪贴板已有文本，但 Sidekick 剪贴板历史找不到（watcher 用一次性 `skip_next` 跳过自身写入）；同时用户希望明确「只保留最近 100 条」。
- 决策：新增 `ClipboardManager::write_text_and_record(text, kind)`：先写系统剪贴板（保留自动粘贴/降级复制），再以 `kind = "voice"` 记入历史一次；`skip_next` 只用于防止 watcher 把同一条文本再记一遍。暂停记录（`enabled = false`）时仍写系统剪贴板、但不入历史。100 条上限沿用 `MAX_ITEMS = 100`（置顶优先、同文本去重、通知/快照结构不变），剪贴板 UI 头部显示 `N / 100 条`、底部说明淘汰规则，`voice` 条目加 Mic 图标与「语音」标签。
- 原因：语音输入与普通复制都是用户想复用的文本，历史缺失会让「语音录入 → 回看/重贴」断链；上限本来已实现但不可见，容易被误解为无限增长/没有隐私边界。
- 代价：历史里会保存语音转写全文（仅本机、`0600`、可暂停/清空）；语音与普通文本共用 100 条配额。
- 规范：`app/src-tauri/src/clipboard_manager.rs`、`app/src-tauri/src/desktop_mic.rs`、`docs/engineering/clipboard-manager.md`、`app/src/desktop/features/clipboard/`。

## D48 · 手持模式录音 UI：按钮锚点与覆盖层分离（2026-11-01）

- 背景：竖屏手持模式按住说话后，录音条/结果卡片把右下按钮容器撑宽，96dp 按钮被 `items-center` 居中，看起来「按住后跳到屏幕中间」；用户反馈这样展示很奇怪。
- 决策：手持模式右下容器只保留按钮本身；录音条/结果卡片/临时提示放独立绝对定位层（按钮上方 8px、右对齐、`pointer-events-none`，结果卡片单独 `pointer-events-auto`）；取消按钮与权限入口固定左下安全区 +24dp。docked（横屏）保持底部居中胶囊，录音条仍在胶囊内部。
- 原因：按钮位置是肌肉记忆锚点，任何状态都不应移动；把覆盖层从布局流里拿出来是最小改动，且不影响 docked 与手势逻辑。
- 代价：覆盖层宽度受 `min(82vw,360px)` 限制；窄屏上卡片与左下取消按钮需在纵向错开（卡片在按钮上方，不与取消按钮重叠）。
- 规范：`app/src/mobile/features/mic/mic-button.tsx`、`docs/prd/mic/SPEC.md` §1.2、`docs/standards/ux.md` §3。

## D49 · 手持语音按钮改底部居中、取消只保留上滑（2026-11-01）

- 背景：用户真机反馈两点：① 按住说话时左下角还有 X 取消按钮，但要去点它必须先松开麦克风按钮，而松手就已经结束录音，这个按钮自相矛盾、实际不可用；② 语音按钮在右下角，用户认为底部居中更合适（与支架模式的居中胶囊一致）。
- 决策：手持模式麦克风改为底部居中 96dp（`left-1/2 -translate-x-1/2`、底部安全区 +24dp）；录音条/结果卡片/临时提示覆盖层放在按钮上方居中；删除左下取消按钮，取消只保留上滑 ≥48dp、滑回 <24dp 继续、松手取消，取消区按钮与录音条变珊瑚色并显示「松手取消」。D48 的「按钮锚点不随覆盖层变化」仍有效，只是锚点从右下改为底部居中；docked 横屏保持胶囊居中。
- 原因：按住说话是单指连续手势，抬手后出现的第二个取消按钮在按住过程中不可达；上滑取消是微信等语音输入的既有心智，代码里本来就有取消区逻辑。底部居中与支架模式位置一致，减少两套位置记忆。
- 放弃：保留左下取消按钮（矛盾）；把取消按钮放到按钮上方（仍需按住时点击，不可行）。
- 代价：取消只依赖手势，缺少「点击取消」的无障碍替代（P1 用 TalkBack/VoiceOver 自定义动作或系统返回键补）；覆盖层居中后，窄屏上结果卡片与权限快捷入口需要错开。
- 规范：`app/src/mobile/features/mic/mic-button.tsx`、`docs/prd/mic/SPEC.md` §1.2、`docs/standards/ux.md` §3。

## D50 · WebView 103 不支持 CSS translate：移动端居中改 flex/mx-auto（2026-11-01）

- 背景：手持语音按钮改底部居中后，无头 Chrome（新版 Chromium）验证通过，但 Realme 真机（Android System WebView 103）上按钮整体偏右 48px（半个按钮宽），覆盖层同样偏右。排查发现 Tailwind v4 的 `-translate-x-1/2` 编译为 CSS `translate: var(--tw-translate-x) var(--tw-translate-y)`，而 CSS `translate` 属性 Chrome 104+ 才支持，WebView 103 直接忽略该声明；无头 Chrome 版本新，掩盖了问题。
- 决策：移动端居中/位移不再用 translate 工具类：需要全宽定位层的用 `inset-x-0` + flex `items-center`；绝对定位的固定宽度子元素用 `left-0 right-0 mx-auto w-[…]`。本次修正麦克风按钮/录音条/结果卡片覆盖层、「再按一次退出」提示、宠物保存失败提示；docked 胶囊也改同一套（原先同样依赖 translate，真机会偏）。dialog/sheet/tooltip 里的 translate 类本轮未动（桌面正常，真机偏移待单独修）。
- 原因：真机是交付目标；WebView 版本锁定在 103（系统组件），只能改写法而不是加 polyfill/升级 WebView。
- 代价：移动端居中写法与桌面不一致（桌面可用 translate）；dialog/sheet/tooltip 仍有真机居中风险，已记入 `docs/status.md` 已知问题。
- 规范：`app/src/mobile/features/mic/mic-button.tsx`、`app/src/mobile/app.tsx`、`app/src/mobile/features/pet/pet-stage.tsx`、`AGENTS.md` 第 8 节。

## D51 · 触感接管：关闭 WebView 默认长按震动 + App 原生 haptic（2026-11-02）

- 背景：真机宠物页屏幕变暗/长按按钮时会「震一下」但并不触发点击；排查确认震动来自 WebView 默认长按（Android `View.performLongClick` → `performHapticFeedback(LONG_PRESS)`），而 App 的 JS `navigator.vibrate` 因 APK 未声明 `VIBRATE` 权限被 Chromium 忽略——设置里的「震动」实际是空开关。
- 决策：新增两个手机端 Tauri 命令：`disable_webview_haptics` 在 App 启动时对 WebView 调 `View.setHapticFeedbackEnabled(false)`（只关 WebView 这个 View）；`haptic({style})` 用 `decorView.performHapticFeedback` 触发 `light/medium/success/error`（`performHapticFeedback` 不需要 VIBRATE 权限，跟随系统「触摸振动」开关；API<30 时 CONFIRM/REJECT 降级为 CONTEXT_CLICK/LONG_PRESS）。前端 `haptics.ts` 收敛为唯一入口（原生命令为主、浏览器回退 `navigator.vibrate`），麦克风按下立即中震，取消/成功/失败沿用现有 effect，并受「震动」开关控制。宠物页禁用长按选中/复制（`user-select:none` + `-webkit-touch-callout` + `contextmenu` 阻止），聊天文本/输入框保留系统选择能力。
- 原因：Android 官方文档明确 `View.performHapticFeedback` + `HapticFeedbackConstants` 不需要 VIBRATE 权限，与系统触感设置一致；比新增 VIBRATE（应用信息显示「控制振动」）更贴合项目一贯的「不新增权限」取向（D46）。
- 放弃：加 VIBRATE + `Vibrator`（能保证震，但多一个权限且不跟随系统触感强度）；继续用 `navigator.vibrate`（WebView 上依赖权限、只有毫秒模式，无系统质感）。
- 代价：系统触感关闭时 App 静默不震（尊重用户设置）；`setHapticFeedbackEnabled(false)` 同时关掉文本选择手柄等 WebView 系统触感（可接受）；iOS 暂无实现，后续用 `UIImpactFeedbackGenerator` 接同一命令。
- 规范：`app/src-tauri/src/haptics.rs`、`app/src/mobile/features/pet/haptics.ts`、`app/src/mobile/features/mic/mic-button.tsx`、`docs/standards/ux.md` §7、`docs/prd/pet/SPEC.md` §7。

## D52 · 自动变暗与最长常亮可配置（2026-11-02）

- 背景：宠物页 2 分钟无操作自动变暗偏短；屏幕常亮没有上限，放桌边可能整夜常亮耗电。
- 决策：`PetSettings` 新增 `dimMinutes`（默认 5，范围 1–60；设置页 1/2/5/10/15/30 分钟）与 `keepAwakeHours`（默认 2，0 = 不限；设置页 1/2/4/8/不限）；`PetStage` 用 `dimMinutes` 驱动变暗遮罩；`useKeepAwake(active, maxDurationMs)` 到点释放 `FLAG_KEEP_SCREEN_ON`，用户点亮屏幕回到前台后重新计时；旧存档缺字段走默认（5 分钟 / 2 小时），越界值夹紧。
- 原因：用户反馈「2 分钟太短」，且常亮是明确耗电项，需要用户可控上限。
- 代价：设置页多两组选项；常亮到点后交给系统按默认策略熄屏（不是 App 主动锁屏），重新计时从回前台开始。
- 规范：`app/src/mobile/features/pet/pet-settings.tsx`、`app/src/mobile/features/pet/use-keep-awake.ts`、`app/src/mobile/features/pet/persistence.ts`、`app/src/mobile/features/pet/pet-stage.tsx`、`docs/prd/pet/SPEC.md` §7。

## D53 · AI 联动：本地脚本注入 DSH，不装第三方 hook 插件（2026-11-02）

- 背景：AI 状态联动原本放在宠物 PRD 的 P2；现在作为独立 P1 功能先做 DSH 最小闭环。用户明确问「不能自己写个脚本配置进去吗」，不希望依赖第三方 hook 插件。
- 决策：Sidekick 写一个本地 `sidekick-hook.mjs` 到 `~/.dsh/profiles/<profile>/plugins/`，并在该 profile 的 `cordis.patch.yml` 追加一个带标记的 `insert` 行；不安装 npm 包、不改 DSH 源码。脚本只订阅 DSH `session/event` / `session/disposed`，把顶层会话聚合为 `idle/working/asking/completed`，POST 到 Sidekick 回环端口；首次需要重启 DSH 一次，之后开关只改配置文件热生效。
- 原因：DSH patch 支持本地文件路径插件（官方文档确认），单文件即可注入；避免第三方插件的安装、版本和维护风险；状态聚合和事件命名由项目自己控制。回环 + token + 只发状态，满足隐私边界。
- 放弃：`dsh-hooks` / `dsh-hooks-plugin` / 官方 Claude Code hook 桥（需装包、事件不完全匹配、用户明确倾向自写脚本）；DSH 源码改动（不可维护）。
- 代价：需要维护本地 DSH 事件适配（DSH 升级可能变）；首次必须重启 DSH；P0 只聚合顶层会话，子代理可能提前完成。
- 规范：`docs/engineering/dsh-hook.md`、`app/src/dsh-hook/sidekick-hook.mjs`、`app/src-tauri/src/dsh_hook*.rs`、`docs/prd/hook/PRD.md`。

## D54 · AI 四态与三音效：动作优先、声音默认关（2026-11-02）

- 背景：用户要求四态动作更夸张、远看能区分；并补充开始/提问/完成事件是否需要声音。
- 决策：四态为静态（悠闲但活着）、工作中（手忙脚乱）、等你决定（着急左右找人）、完成（爆发庆祝 3 秒）；四态在轮廓、速度、道具、主色上明显不同；静态也要有慢动作。声音做三个短音效（开工/提问/完成），默认关闭，可在宠物设置开启和试听；P0 用 Web Audio 合成音，不新增音频文件；提问音最多 2 次，录音/后台静音；完成态固定 3 秒。
- 原因：手机在支架上远看，单靠眼睛/嘴角不够；道具和速度比细微表情更可识别。声音是辅助，办公室/夜间默认不该打扰；合成音零资源/零版权，先验证触发时机，P1 再换专门设计的小宠物叫声。
- 代价：新增 SVG 短爪/道具层和一套 CSS 动画，需要真机 60fps/识别测试；P0 声音可能受系统静音/音乐焦点影响，P1 接原生提示音/音频焦点。
- 规范：`docs/prd/hook/SPEC.md`、`app/src/mobile/features/pet/sound.ts`、`pet-fallback.tsx`、`pet.module.css`。

## D55 · 百炼云端流式 ASR：桌面中转 + Keychain + 默认本机 + 失败回退（2026-11-02，已被 D56 取代）

- 背景：本机 whisper base 在中文术语/同音字上准确率不够；用户要求接入云端语音识别大模型，先只做阿里云百炼，默认模型 `qwen-audio-3.1-asr-flash-streaming`，并要流式回显与桌面模型设置页。
- 决策：桌面端直连百炼 WebSocket（`wss://dashscope.aliyuncs.com/api-ws/v1/inference`，支持业务空间域名）；手机仍只采集 16k PCM16、经局域网送桌面，由桌面转发，手机不接触 API Key。新增 `asr.json`（`0600`，不含 Key）与 macOS Keychain（service `dev.sidekick.app.asr.bailian`）；新增 `asr_cloud_status/save/test/engine_select/clear` 命令与设置页「语音识别」（本机/百炼切换、地址、业务空间、Key、模型、语言/场景/热词、测试连接、回退开关、隐私同意）。流式中间结果用 `mic.partial`（50ms 节流、`rev` 只增、整体替换）回显到手机与桌面浮层；最终文本仍只插入一次。云端失败/空结果且本机模型可用时用同一份 PCM 回退本机，`mic.result` 带 `engine/model/fallback/usage`。默认引擎仍是本机，云端必须显式保存并勾选同意后才能启用。
- 原因：Key 只在桌面、音频不经 Sidekick 服务器，符合本地优先与隐私原则；流式只做可见反馈、最终一次落字，避免中间结果重复/乱序污染目标应用；每会话新建 WS 实现简单、取消干净，连接耗时被音频缓冲掩盖；回退保证一次可用。
- 放弃：手机直连百炼（Key 落手机、网络/降级分散）；流式逐字输入目标应用（中间结果会改字，无法安全撤销）；把 Key 明文写 `asr.json`（泄露面大）；默认强制云端（违背 P5）；多厂商（v1 先单厂商，代码按 provider 隔离）。
- 代价：云端依赖公网/额度/地域；Keychain 在 dev 重编译后可能弹授权；旧域名是否支持该模型需真实账号验证；音频上传需用户显式同意；`mic.partial` 增加协议与 UI 复杂度。
- 规范：`docs/engineering/asr-cloud-bailian.md`、`docs/engineering/audio-pipeline.md` §6、`docs/engineering/protocol-audio.md` §3.5、`app/src-tauri/src/asr_config.rs`、`asr_keychain.rs`、`asr_cloud.rs`、`bailian_asr.rs`、`desktop_server.rs`、`app/src/protocol/messages.ts`、`docs/prd/mic/*`、`protocol/README.md`。

## D56 · 下线本机 whisper，云端唯一；模型页从设置移出；新增按天 Token/费用统计（2026-11-02，已被 D57 更新）

- 背景：本机 whisper 的中文术语/同音字准确率不足，且同时维护本机/云端两套引擎带来 engine/fallback、模型下载、设置页与协议分支的复杂度；用户确定只保留百炼云端。另需回答“今天/这周/这一年用了多少、花了多少”。
- 决策：删除 `asr_models.rs`、`whisper-rs` 依赖、模型下载/选择/删除命令与 `models_dir`，`AsrSettings` 只保留 `{version, consentCloud, bailian}`（旧 `engine/fallbackToLocal` 忽略）；`session_config()` 未配置/未同意/无 Key 直接回 `mic.error`，不再回退本机。桌面主导航改为 聊天 / 剪贴板 / AI 联动 / **模型**，设置 Sheet 只留自动输入权限与剪贴板；模型页含百炼配置与用量统计。新增 `asr_usage.json`（0600、原子写、最多 400 天）按本机日期汇总每次 `task-finished` 的 usage，模型页展示今天/7/30/365 与近 14 天；金额人民币微元，北京 ¥6/¥4.5、新加坡 ¥6.781/¥5.104 每百万 Token，自定义地址按北京估算，`priceNote` 明示估算。协议移除 `mic.ready.engine/model`、`mic.partial.engine`、`mic.result.engine/model/fallback`，保留 `usage`。
- 原因：单引擎减少分支与故障面；失败直接报错比“悄悄换本机”更可解释；模型页把连接配置与费用放在一起，避免设置 Sheet 承担运行态页面；本地按天汇总足以回答费用问题，且不需要后端/账单 API。
- 放弃：保留本机作为兜底（双套逻辑/模型下载/隐私分支）；只存总量不按天（无法看趋势）；直接读百炼账单（无按日 API/凭证复杂）；把模型页留在设置 Sheet（入口深、与聊天/剪贴板不一致）。
- 代价：离线/无网不可用；云端额度/网络成为硬依赖；用量为估算，可能与账单有偏差；旧 `models/` 目录留在磁盘但不参与运行；协议字段移除需双端同版本升级。
- 规范：`docs/engineering/asr-model.md`、`asr-cloud-bailian.md`、`audio-pipeline.md`、`protocol-audio.md`、`docs/prd/mic/*`、`app/src-tauri/src/asr_usage.rs`、`asr_pricing.rs`、`desktop/features/models`、`protocol/README.md`、`AGENTS.md`。

## D57 · 模型页去掉业务空间 ID、用量区间切换、Keychain 开页不读（2026-11-02）

- 背景：业务空间专属域名已经能覆盖权限/地域需求，单独的 `workspaceId` 字段与 `X-DashScope-WorkSpace` 头增加表单/校验复杂度；四张用量卡+14 天固定明细在小屏上信息过密；打开模型页就读 Keychain 会反复触发 macOS 授权。
- 决策：删除 `BailianConfig.workspaceId`；模型页只保留北京/新加坡快捷按钮，业务空间由用户把 `{WorkspaceId}` 换成真实 ID 后粘贴完整 URL；不再发送 `X-DashScope-WorkSpace`，未替换占位符报“请填写完整服务地址…”。`UsageStats.recentDays` 改为 `days`（最近 365 天、今天起倒序、缺失补 0）；模型页改为区间切换（今天/近 7 天/近 1 个月/近 1 年），只显示当前区间一张汇总卡，今天无明细、7/30 按天、1 年按自然月。`AsrSettings` 增加 `keyPresent`/`keyHint` 元数据；`asr_cloud_status()`/模型页开页不读 Keychain，只有保存新 Key/清除、测试连接、录音建会话才读。
- 原因：减少表单字段与错误路径；365 天数据一次返回，前端按区间聚合更简单；避免开页弹系统密码，提升可解释性。
- 放弃：自动拼 business workspace URL（IDs 格式/地域差异大，容易拼错）；一次展示四张卡（屏幕密度低）；状态每次读 Keychain（授权摩擦）。
- 代价：业务空间用户需自己拼 URL；`days` 365 条响应略大；旧 `asr.json` 没有 keyPresent 元数据时需重新保存 Key 才能显示“已保存”；Windows/Linux 仍无 Keychain 实现。
- 规范：`docs/engineering/asr-model.md`、`asr-cloud-bailian.md`、`docs/prd/mic/*`、`docs/setup.md`、`AGENTS.md`、`app/src-tauri/src/asr_config.rs`、`asr_cloud.rs`、`asr_usage.rs`、`desktop/features/models`。

## D57 · 宠物改为 OpenPets schema 2 帧动画图集（复用 deepseek-openpet，下线 SVG/Rive 路线）（2026-11-02）

- 背景：宠物形象没定美术方向；用户提供了可直接播放的 `deepseek-openpet.zip`（OpenPets / Codex schema 2：`pet.json` + `spritesheet`，4 状态 × 16 帧、256px），要求直接复用并压缩为 WebP 内置，协议要「一列一帧、单状态最多 32 帧、兼容 16 帧」，架构预留其它状态行。
- 决策：删除内联 SVG 画层（`pet-fallback.tsx` / `pet-ai-props.tsx` / `pet-canvas.tsx`）与 Rive 预留（`@rive-app/react-canvas` 依赖移除、状态机里的 `rive` effect 与 `riveSignal` 删除）。新增 `sprite-manifest.ts`（严格校验 schema 2：cols ≤32、帧数 1–32、多行/非连续行、行数以解码图高为准）、`sprite-state-map.ts`（App 语义 → 状态候选链）、`sprite-player.ts`（纯函数帧推进）、`sprite-pet.tsx`（rAF + ResizeObserver + 解码校验 + poster 降级）。资产在 `app/src/mobile/features/pet/assets/openpet/`：`spritesheet.webp`（q85，764KB）、`poster.webp`（14KB）、`pet.json`（原样，`image` 改为 webp）。映射：working→working、asking→attention、completed→done（once + 末帧定格）；sleeping/listening/petting/celebrate 为预留候选，图集没有对应行时自动回落 idle。
- 原因：复用现成资产最快验证「图集 + 状态机 + 播放」链路；schema 2 是公开格式，四态与 AI 联动一一对应；候选链让以后补状态行只改美术与 manifest，不动渲染器；WebP 比原 PNG 小 81%，绘制成本远低于 Rive。
- 放弃：继续自绘 SVG 猫与参数化生成图集（角色探索稿 2026-11-06 已清理；鲸鱼来源与授权风险保留在 `brand/pet-character/openpet-review/`）；Rive 运行时与 `.riv` 资产；把四态写死在渲染器里。
- 代价：只有四态，摸摸/倾听没有专属表情（爱心/气泡/触感保留）；单帧 256px 在约 500px 舞台是 2 倍放大、边缘偏软；4096×1024 解码约 16.8MB；资产为 DeepSeek 鲸鱼且 zip 无 LICENSE，正式发版前需确认授权或替换。
- 规范：`app/src/mobile/features/pet/sprite-*.ts(x)`、`assets/openpet/`、`docs/engineering/pet-runtime.md`、`docs/standards/visual.md` §6–§7、`docs/dependency-policy.md`、`docs/prd/pet/SPEC.md` §8。

## D58 · 宠物舞台去掉背景光晕，纯深色背景省 OLED 功耗（2026-11-02）

- 背景：宠物舞台在宠物身后叠加了一个暖色径向光晕（`--pet-glow`，45%×55% at 68% 46%）。OLED 屏幕上大面积亮像素直接耗电，而宠物页默认屏幕常亮（最长 2 小时），光晕会放大耗电并增加烧屏风险。
- 决策：删除舞台的 `radial-gradient` 光晕层，移除 `--pet-glow` 与 `--color-pet-glow` 令牌；宠物舞台保持纯 `--pet-bg` 深色背景，只保留宠物本体、气泡与控制区。以后不再往宠物背景加光晕、大渐变或大面积亮色装饰。
- 原因：OLED 每个像素自发光，功耗与亮度和点亮面积近似成正比；纯黑/深色像素几乎不耗电。省电收益直接体现在常亮场景，同时降低烧屏概率。
- 代价：舞台少了氛围光，宠物与背景对比更强；靠气泡/按钮自身令牌保证可读性。
- 规范：`docs/standards/visual.md` §6/§9、`app/src/mobile/features/pet/pet-stage.tsx`、`app/src/shared/styles/tokens.css`、`AGENTS.md`。

## D59 · rustls 显式 ring CryptoProvider，修复删 reqwest 后的云端 TLS panic（2026-11-02）

- 背景：686df69 删除 `reqwest` 后，云端 ASR 突然全部报“连不上百炼”。复现日志显示 rustls 0.23 在建连时 panic：`Could not automatically determine the process-level CryptoProvider from Rustls crate features`。
- 决策：在 desktop 依赖中直接加入 `rustls = { version = "0.23", default-features = false, features = ["ring", "std", "tls12"] }`，并在 `bailian_asr::connect()` 前用 `std::sync::Once` 调 `rustls::crypto::ring::default_provider().install_default()`；新增单元测试确保 provider 可用。`cloud` 任务异常结束改为 `cloud_internal`，不再误报成 `cloud_network`。
- 原因：rustls 0.23 要求进程级 provider；`reqwest` 之前通过 feature 合并提供了默认 provider，删掉后 `tokio-tungstenite` 的 rustls 只剩 `std`，TLS 握手直接 panic，oneshot 被丢弃后 `wait()` 只能看到“会话已结束”。用 `ring` 避免重新引入 `aws-lc-rs`/cmake 构建依赖。
- 放弃：重新引入 `reqwest`（只为一个 provider，体积/依赖代价大）；启用 rustls 默认 `aws_lc_rs`（会重新引入 C/cmake 构建链）；依赖未来某个 crate 的 feature 合并（不可控）。
- 代价：直接多一个 rustls 依赖；以后删/换 TLS 相关依赖时要跑 `cargo tree -e features -i rustls` 确认 `ring` 仍在。
- 规范：`app/src-tauri/Cargo.toml`、`app/src-tauri/src/bailian_asr.rs`、`docs/engineering/asr-cloud-bailian.md`、`AGENTS.md`。

## D60 · 桌面端强制单实例，避免多开抢发现端口/覆盖 DSH hook 端点（2026-11-03）

- 背景：用户反馈「DSH 明明在工作，手机宠物却一直是 idle」。排查发现桌面上同时跑过两个实例（47810/桥 47815 与 47811/桥 47816）：后启动的实例启动时把 `~/.dsh/sidekick/config.json` 的 `endpoint` 回写成自己的回环端口 `127.0.0.1:47816`，随后该实例退出；DSH hook 脚本每秒重读配置，之后所有上报都 POST 到已无人监听的 47816（`curl` 连接被拒），存活实例的桥永远收不到状态。手机通过 UDP 发现只会拿到先启动实例（47820 归它），所以手机侧一直不更新。手机重启这条路径本身是好的：新 WS 连接会直发快照，手机上线/回前台还会补 `status.request`，实测 force-stop 后重启立刻拿到当前状态。
- 决策：桌面端加入 `tauri-plugin-single-instance`（`Builder` 里最先注册）：再次启动只把已有窗口 `show/unminimize/set_focus` 后让新进程退出；不自己写锁文件/socket。
- 原因：同一台机器上两个桌面实例必然争抢 UDP 47820 发现端口与 47815–47819 回环桥端口，又都能改写同一份 hook 配置，属于设计上就不该存在的状态；官方插件从源头拦住最简单，顺带修掉「双击两次出现两个窗口」。端口本身是动态的，单实例后启动时的 endpoint 回写（`on_endpoint`）就能覆盖端口漂移。
- 放弃：自研 `flock`/Unix socket 单实例（拿不到「聚焦已有窗口」能力，还要自己处理 Windows）；只做 endpoint 周期自愈（两个实例都活着时仍会互相覆盖，手机连的那个依旧拿不到状态）；hook 脚本多端口回退（token 按实例生成，跨实例会 401，且解决不了发现指向问题）。
- 代价：新增一个官方插件依赖（Cargo.lock 新增 34 个条目，`zbus` 等只在 Linux 目标编译，macOS 增量编译约 13s）；不能再同时开两个桌面实例对比调试（需要对比时临时移除插件或改 identifier）；手机、网页预览仍可多客户端同时连。
- 规范：`app/src-tauri/Cargo.toml`、`app/src-tauri/src/lib.rs`、`docs/engineering/dsh-hook.md`、`docs/engineering/lan-discovery.md`、`docs/architecture.md`、`docs/status.md`、`docs/dependency-policy.md`、`AGENTS.md`。

## D61 · API Key 改存本地 asr.json（0600），不再读写 Keychain（2026-11-03）

- 背景：macOS 钥匙串在开发版每次重编译后都可能要求授权/密码，用户反馈模型页和录音链路反复被打断；用户明确提出“直接存成本地 JSON 或应用数据库”。
- 决策：`AsrSettings` 增加 `apiKey` 字段，与配置一起原子写入 `~/Library/Application Support/Sidekick/asr.json`（0600）；`session_config`/`test`/`status` 都只读本地配置，不再调用 Keychain。`keyPresent`/`keyHint` 由 `apiKey` 派生。旧 Keychain 条目不再读取、不自动迁移；升级后需在模型页重新粘贴一次。清除 Key 时顺手尝试删除旧钥匙串条目。`asr_keychain.rs` 只保留删除旧条目的能力。
- 原因：彻底消除 macOS 授权弹窗与跨平台 Keychain 实现差异；用户明确接受以文件权限换取便利。文件已 `0600`，不写日志、不上传、状态接口只返回掩码。
- 放弃：继续用 Keychain（开发体验差、Windows/Linux 无实现）；把 Key 放 Tauri plugin-store/前端 localStorage（更容易被 WebView/前端代码碰到，且不是 Rust 配置的唯一事实源）；自研加密（密钥仍要落地，收益有限）。
- 代价：明文 Key 只靠 0600 权限保护，安全性低于 Keychain；旧钥匙串 Key 不自动迁移；用户需注意不要分享 `asr.json` 或包含它的备份。
- 规范：`app/src-tauri/src/asr_config.rs`、`asr_cloud.rs`、`asr_keychain.rs`、`docs/engineering/asr-cloud-bailian.md`、`asr-model.md`、`AGENTS.md`、`desktop/features/models`。

## D61 · AI 会话列表：会话标题上手机 + 反问一键唤起 DSH（2026-11-03）

- 背景：AI 联动只有聚合四态和「会话数」，用户看不出是哪个会话在工作/完成，也没法在手机上处理反问；原 PRD 明确「只同步状态、不同步标题」。
- 决策：`status` 增加可选 `sessionList`（id/标题/状态/askKind/lastEventAt/completedAt，最多 50 条）；手机宠物页上方显示可收起会话列表（默认 1 条、展开 5 条滚动、新 asking 自动展开）；完成态保留到手动清除；新增 `focus.request` / `focus.result`，点 asking 会话让电脑 `open -a "DeepSeek Harness"` 切前台（未开则启动），只唤起不自动回答。清除只清手机本地状态记录（`sidekick-sessions.json` 只存 id/时间，7 天 TTL），有新事件自动重现。
- 原因：一眼分清多会话是刚需；标题是唯一能辨认任务的内容，但隐私代价可控（单行 ≤80 字符、不落盘/不写日志）；focus 只做窗口唤起，避免把「回答 AI」的复杂度和风险提前引入。
- 放弃：只显示匿名编号（无法辨认）；手机直接回答/审批（需要 ask 载荷、问答 UI、answer 注入，P1）；自动定位到具体会话（DSH 无稳定深链，做不到就降级为切前台）；把完整对话同步到手机（隐私边界）。
- 代价：新增唯一内容类外发字段（标题）；旧手机/旧桌面需容忍未知字段；focus 依赖 macOS `open -a`，其他平台只回 `unsupported_platform`；局域网 WS 无鉴权时同网段可触发唤起（低风险，随配对鉴权解决）。
- 规范：`protocol/README.md`、`docs/prd/hook/*`、`docs/engineering/dsh-hook.md`、`app/src/protocol/messages.ts`、`app/src/dsh-hook/sidekick-hook.mjs`、`app/src-tauri/src/dsh_hook.rs`、`app_focus.rs`、`app/src/mobile/features/sessions/`。

## D62 · 手机只做竖屏，删除双姿态；麦克风改宽矮胶囊（2026-11-03）

- 背景：横屏/支架/手持两套布局让宠物页与麦克风各维护一套尺寸，顶部会话列表出现后纵向空间更紧；用户明确表示手机只需竖屏。
- 决策：删除 `use-orientation` / `posture` / `SET_POSTURE` / 姿态设置与持久化字段；Android Activity 锁定 `screenOrientation="portrait"`；宠物页固定单套竖屏布局。麦克风从 96×96 圆形改为 56px 高、`min(86vw,360px)` 宽胶囊，录音/处理状态并入胶囊，去掉独立录音卡片；覆盖层仍在胶囊上方独立定位。
- 原因：竖屏可展示内容更多、逻辑更少；宽矮胶囊节省约 40px 纵向空间，给会话列表和宠物让位；录音状态不再额外弹卡片，按住时按钮不跳位。
- 放弃：保留横屏/平板布局；通过响应式断点兼容横屏；保留 docked/handheld 供未来使用（YAGNI，需要时按 D62 恢复）。
- 代价：横屏/平板用户看到的是竖屏舞台；旧存档的 `posture` 字段被忽略（不迁移、不报错）；Android 锁竖屏后不能旋转。
- 规范：`docs/standards/ux.md`、`docs/prd/pet/PRD.md`/`SPEC.md`/`ACCEPTANCE.md`/`INDEX.md`、`docs/product/scope.md`/`users.md`/`INDEX.md`/`metrics.md`、`scripts/patch-android-manifest.mjs`、`app/src/mobile/features/pet/*`、`app/src/mobile/features/mic/mic-button.tsx`、`AGENTS.md`。

## D63 · `release/` 固定文件名安装包提交到 main（2026-11-03）

- 背景：需要一个 `release/` 目录直接存放打包好的电脑端与手机端 App，不按版本号分子目录、每次打包覆盖同名文件，并推送到 `main`；目标是仓库里始终只有最新一份安装包。
- 决策：`release/` 只放两个固定文件名：`Sidekick-macOS.dmg`（`pnpm tauri build` 产出，未签名/未公证）与 `Sidekick-Android.apk`（release 构建 + `zipalign`/`apksigner`，本地 keystore 签名）；新增 `scripts/package-desktop.sh` / `package-android.sh` / `package-release.sh`，每次构建覆盖同名文件。这两个二进制随提交进 `main`，是「不提交构建产物」规则的唯一例外；Android 签名密钥放 `~/.sidekick/`（0600）不入库。实测 dmg ≈3.8MB、release APK ≈7MB。
- 原因：固定路径最省事，工作区永远只有一份；release 包体积小，单次推送约 +11MB，可接受。
- 放弃：版本号目录（会累积多份大文件）；提交 debug APK（约 250MB，超 GitHub 单文件 100MB 上限）；本轮先不用 GitHub Release / 独立分支（用户要求直接进 `main`，仓库变大再迁移）。
- 代价：Git 按提交保存二进制，**固定文件名不会减小历史体积**——每推一次仓库仍约 +11MB，历史持续增长；后续可迁 GitHub Release 或独立 release 分支（需改推送流程/force push）。
- 规范：`release/README.md`、`scripts/package-*.sh`、`AGENTS.md` §4/§5/§8/§9、`docs/standards/git.md` §2/§3、`docs/setup.md`。

## D64 · 归档会话不下发手机；旧钥匙串 Key 启动时自动迁移（2026-11-03）

- 背景：手机上「创建发布打包文件夹」早就归档了却突然出现在会话列表里——DSH 重启时 `sessions.list()` 会把归档会话也恢复出来，插件启动接管全部顶层会话（`lastEventAt` 被记为启动时刻），于是归档会话以「空闲·刚刚」混进 `sessionList`。另一条反馈是「明明配置过百炼 API Key，录音却提示云端没配置」：`asr.json` 是升级前写的，只有 `keyPresent`/`keyHint` 元数据，真正的 Key 还在旧钥匙串里，而 D61 改成只读 `asr.json` 后不会自动迁移。
- 决策：会话列表在桌面 Rust 桥过滤——读 `<DSH_HOME>/storages/workspace.json` 的 `global.archivedSessionIds`（2s 缓存，文件缺失/非法按空集合），从 `sessionList` 去掉归档会话，并按可见列表重算聚合态与 `sessions`（归档的 asking/working 不再让宠物卡在「等你决定/工作中」）。插件保持只上报原始列表，改过滤逻辑不需要重启 DSH。Key 迁移**不做**：曾尝试启动时读旧钥匙串自动迁移，但开发版重编译后签名变化，macOS 弹出系统登录密码框，用户明确拒绝（`asr_keychain.rs` 已回退为只删不读）；旧 Key 只在模型页重新粘贴一次，之后仍然只读写本地 `asr.json`。
- 原因：归档是 DSH 的本地状态，手机列表只是展示层，在桥里过滤能立刻生效且不扩大插件接口；`workspace.json` 是 DSH 自己的持久化文件，结构稳定、只读不写。Key 的问题根因是旧版把 Key 放钥匙串、新版只读本地 JSON；自动迁移的代价（系统密码弹窗）大于收益，重新粘贴一次更符合「只读本地文件」的承诺。
- 放弃：让插件过滤（要改插件并重启 DSH 才生效，且插件与本机存储耦合）；手机端保存归档黑名单（跨设备/多手机不一致，还要额外同步）；继续要求用户重新粘贴 Key（用户已经配置过，属于回归缺陷）；把 Key 存进 Keychain 或 Tauri store（D61 已决定不用）。
- 代价：桌面桥多依赖一个 DSH 内部文件路径（`DSH_HOME` 或 `$HOME/.dsh`）；DSH 改存储格式时过滤会失效（降级为列表多一条，不影响其它功能）。升级用户需要重新粘贴一次 Key；`asr.json` 里遗留的 `keyPresent`/`keyHint` 元数据只会被当作未配置，不会误导状态。
- 规范：`app/src-tauri/src/dsh_hook.rs`、`dsh_hook_install.rs`、`asr_cloud.rs`、`asr_keychain.rs`、`docs/engineering/dsh-hook.md` §5/§6/§9、`docs/engineering/asr-cloud-bailian.md`、`AGENTS.md` §8。

## D65 · 本机数据目录改为可见的 `~/.sidekick/`，旧目录一次性复制（2026-11-03）

- 背景：用户明确要求「本地为这个软件创建一个 `.sidekick` 文件夹存一些必要的设置之类的数据」，不希望配置/历史藏在 `~/Library/Application Support/Sidekick`；同时确认桌面端不应再出现任何钥匙串/系统密码弹窗。
- 决策：`app_paths::data_dir()` 在 macOS 返回 `~/.sidekick`；启动时若发现旧目录 `~/Library/Application Support/Sidekick` 且新目录没有迁移标记，则把 `asr.json` / `clipboard.json` / `asr_usage.json` 各复制一次到新目录（不删除旧文件、不覆盖新文件），写 `.migrated-from-app-support` 标记后不再重复；旧 `models/` 不迁移、不再读取。`SIDEKICK_DATA_DIR` 仍保留给测试与特殊部署。
- 原因：可见目录便于用户自己备份/检查/删除，符合「设置存本地 JSON」的承诺；一次性复制让升级用户无感，旧目录保留可回退；标记避免用户清空历史后被旧数据复活。
- 放弃：继续用 `~/Library/Application Support`（用户明确不喜欢）；直接删旧目录/移动文件（不可逆，升级/回退风险）；把安卓签名 keystore 一起挪走（打包脚本仍用 `~/.sidekick/android-release.jks`，保持不动）。
- 代价：数据目录从 macOS 惯例变成隐藏家目录；两份文件在迁移后同时存在（旧的不再更新）；`~/.sidekick/` 同时承载 keystore，文档要提醒别整目录删除。
- 规范：`app/src-tauri/src/app_paths.rs`、`docs/setup.md`、`docs/status.md`、`docs/engineering/asr-cloud-bailian.md`、`clipboard-manager.md`、`asr-model.md`、`AGENTS.md` §8。

## D68 · 结果卡片手动「回车 / 清空」：保留不自动发送，但不用放下手机（2026-11-04）

- 背景：语音输入把文字落进电脑光标处后，用户仍要放下手机、换键盘/鼠标去按回车发送或清空输入框；既然手机已经是电脑的外设，这个切换不合理。产品铁律是「绝不自动回车/发送」，所以不能改成自动发送。
- 决策：在「已输入」结果卡片里加两个用户主动点按的按钮：
  - 「回车」＝桌面合成 Return（keycode 36），一次点按一次；
  - 「清空」＝桌面合成 `⌘A`（keycode 0 + Command）+ 40ms + `Delete`（keycode 51），第一次点按只做二次确认（3 秒失效），第二次才发送；
  - 只在 `mic.result.outcome == "inserted"` 时出现，沿用卡片 10 秒收起；新增协议 `key.request` / `key.result`（增量，不改任何 `mic.*` 字段）；
  - 安全闸门：只作用于最近一次插入时记录的前台应用（owner + mic session），焦点变化/密码框/辅助功能未授权/非 macOS 一律拒绝并只回错误码；插入后 30 秒内有效、成功一次即作废、桌面 500ms 限频；
  - 不记录文本、应用名、按键序列；日志只有 action/outcome/布尔闸门。
- 原因：保留「不自动发送」的安全承诺，把「换设备」这一步变成一次点按；用最近插入目标 + 时效 + 一次性把误发风险压到最低；结果卡片是用户刚完成输入时唯一明确的上下文，比常驻按键栏更不容易误触。
- 放弃：自动回车/自动提交（违反铁律、不可控）；逐字退格本次字数（光标不在末尾会误删、CJK/emoji 计数不稳）；⌘Z 撤销（终端等 App 语义不一致，用户已选择「清空整个输入框」）；常驻键栏或不限时（会把按键发给任意当前前台窗口，风险最高）；把按键塞进 `mic.result`（语义混杂、旧客户端无法忽略单个字段带来的行为差异）。
- 代价：只支持 macOS 桌面；终端等非标准输入框的 `⌘A+Delete` 可能不生效或只选中，绝不因此回退成回车；按钮可用窗口只有卡片 10 秒；开发二进制重编译后辅助功能可能需重新勾选。
- 规范：`protocol/README.md`、`docs/engineering/protocol-audio.md` §3.8、`docs/engineering/audio-pipeline.md` §7.3、`docs/prd/mic/{PRD,SPEC,ACCEPTANCE,INDEX}.md`、`app/src-tauri/src/desktop_keys.rs`、`desktop_server.rs`、`desktop_mic.rs`、`mobile_client.rs`、`app/src/protocol/messages.ts`、`app/src/mobile/features/mic/*`、`app/src/desktop/features/mic-receiver/*`、`AGENTS.md`。

## D69 · 下线宠物触摸互动：点击/抚摸不再有任何反应（2026-11-04，取代 D30）

- 背景：用户反馈现在给手机宠物加点击效果太早，这个逻辑之前没考虑清楚；期望点击宠物时「没任何反应，就当没点过」，回到原本只做陪伴与 AI 状态展示的形态。
- 决策：整体删除手机宠物触摸互动，不只是点击——删除 `gestures.ts` 手势识别、`POKE`/`PET_START`/`PET_PROGRESS`/`PET_END` 事件、`interacting` 状态、`petting*`/`cooldownUntil` 运行时字段、触摸爱心与亲密度（`affinity`/`affinityDate`/`affinityGainedToday`）、`petting*`/`poke` 文案，以及设置页「无障碍互动」（摸摸它/戳一下）。宠物舞台不再挂 pointer 处理器；点击、长按、来回抚摸都不产生气泡/震动/爱心/姿态切换，也不写存档。保留命名完成时的爱心、AI 四态、麦克风反应、睡眠/06:00 醒来、变暗遮罩点击唤醒。存档 version 保持 1，新存档不写 `affinity*`，旧存档多余字段忽略。
- 原因：交互复杂度与验收成本高于当前阶段价值；未验证的手势阈值容易带来误触和无反馈感；当前重点是 AI 联动与麦克风，宠物先回到「会自己动、会回应 AI/录音」的纯陪伴形态。保留命名爱心是因为它属于命名庆祝流程，不是宠物点击。
- 放弃：只删点击、保留抚摸（用户已确认全部删除）；保留 dormant 代码待以后恢复（会留下死类型/死测试/文档歧义）；升存档版本或写迁移（旧字段可直接忽略，`version: 1` 不变）；继续保留设置页无障碍替代按钮（入口已无对应行为）。
- 代价：少了一个情感反馈入口；夜间睡眠不能再靠触摸唤醒，改为 06:00 `TICK` 自动醒/回前台重算；点击宠物不会重置自动变暗计时（变暗遮罩仍可点亮屏幕）；回退到旧版本时旧解析器会把缺失的 `affinity` 记为损坏并回退，但名字/精力/设置仍可恢复。
- 规范：`app/src/mobile/features/pet/{types,persistence,mood,state-machine,pet-store,pet-stage,pet-settings,sprite-state-map,ai-status,copy}.ts(x)`、`docs/prd/pet/{PRD,SPEC,ACCEPTANCE,INDEX}.md`、`docs/product/{principles,scope,users,metrics}.md`、`docs/standards/{ux,visual,engineering}.md`、`docs/engineering/{pet-runtime,quality,dsh-hook}.md`、`docs/prd/hook/{PRD,SPEC,ACCEPTANCE}.md`、`AGENTS.md` §2/§8/§10。

## D70 · 麦克风会话串行化 + 桌面权威取消 + 服务端看门狗（2026-11-04）

- 背景：用户真机连续点按/连按「按住说话」后，电脑端一直停在「正在听」，且电脑端没有任何中断入口。排查发现手机端 `startRecording` 只用渲染期 `busy/phase` 做守卫，`sendMicStart`/`getUserMedia` 期间没有 in-flight 保护，共享的 `sessionIdRef/heldRef/startSentRef` 会被并发的 start 互相覆盖；松手早于启动完成时 `onPointerUp` 也可能按旧 `phase` 判空，于是「手指已抬起但还在录」。最终手机 store 的 session 与桌面 `ActiveMic.session` 不一致，松手发出的 `mic.stop` 被 `session_mismatch` 拒绝，桌面 active 会话没人收尾；服务端没有看门狗，也没有人工取消路径。
- 决策：
  - 手机端手势与启动串行化：`startingRef` 保证一次只有一个 in-flight start；`lifecycleRef` token 让旧异步结果不得回写 store；`onPointerUp/onPointerMove` 以 ref 判定而非渲染期 phase；window 级 `pointerup/pointercancel` 兜底；松手/取消/后台/断连都会让启动中的会话发一次 `mic.stop(cancel)` 并清理本地采集。
  - 服务端：同一客户端重复 `mic.start` 以最新会话为准（旧会话 abort + `mic.state(cancelled)`），异端仍 `session_busy`；每个会话起 `maxMs + 3_000ms` 看门狗，到点若仍是该 session 的 active 就 abort 云端并广播 `mic.state(cancelled)` + `mic.cancel(reason=timeout)`；`mic.stop` 保持 owner+session 严格匹配，避免旧 stop 误杀新会话。
  - 协议新增 `mic.cancel`：桌面 UI 发请求（只带 `v/type/session/ts`），服务端校验后广播权威版本（带 `reason=desktop|timeout`）；手机收到后**不校验本地 session**，强制停采集并提示「电脑端已取消录音。」/「录音超时，已自动停止。」；旧手机忽略该类型但仍会收到 `mic.state(cancelled)`。
  - 桌面浮层「倾听中」右侧常显「取消录音」按钮；点击经本机回环 WS 发 `mic.cancel`，不转写、不插入、不写剪贴板；本机服务未连上时浮层内提示重试。
- 原因：根因是手机端并发会话 + 服务端没有权威收尾；只修手机仍会在旧版本/异常路径下卡住，只加看门狗又要等 60 秒且无法人工止损。三件事一起做：手机尽量不产生并发、服务端保证任何状态都能被清理、电脑端给用户一个立即中断的入口。
- 放弃：只加服务端看门狗（最坏要等 63 秒，用户仍无法主动取消）；只修手机端（旧 APK/异常路径仍会卡住，且电脑端没有控制权）；在手机端加独立取消按钮（与「按住说话」手势冲突，D62 已明确不设）；桌面用独立的系统级快捷键/托盘取消（本轮 P0 只做应用内浮层，always-on-top/全局快捷键 P1）；取消进入 `processing` 后的云端收尾（该阶段有 9 秒自身超时，本轮不扩展）。
- 代价：新增一个协议类型与两处解析；同一客户端重复 start 从 `session_busy` 改为替换，旧会话音频丢弃（异常客户端才会触发）；看门狗比手机 60 秒上限晚 3 秒，最坏多等 3 秒；`mic.cancel` 在局域网无鉴权 MVP 下任何已连接客户端都能发（与现有协议一致，配对鉴权后收紧）。
- 规范：`protocol/README.md`、`docs/engineering/protocol-audio.md`、`audio-pipeline.md`、`asr-cloud-bailian.md`、`docs/prd/mic/{PRD,SPEC,ACCEPTANCE,INDEX}.md`、`docs/standards/ux.md`、`app/src-tauri/src/desktop_server.rs`、`app/src/protocol/messages.ts`、`app/src/mobile/features/mic/{mic-button,mic-store,mic-copy}.ts(x)`、`app/src/desktop/features/mic-receiver/*`、`app/src/desktop/use-desktop-connection.ts`、`app/src/shared/lib/mic-status-copy.ts`、`AGENTS.md`。

## D71 · 视觉系统采用方向 B「深潜声呐」，双主题 + 宠物资产不重绘（2026-11-04）

- 背景：用户评价现有界面「太简约、有点丑」——暗色单主题、靛蓝主色、shadcn 默认令牌，桌面端像普通工具面板，手机端宠物页之外没有性格。design-lab 用三份自包含 HTML 提案（A 夜灯暖屋 / B 深潜声呐 / C 掌心贴纸）做双主题评审，用户选定方向 B，并要求浅色主题也是设计过的一套。
- 决策：
  - **采用方向 B「深潜声呐」作为唯一视觉系统**：`app/src/shared/styles/tokens.css` 重写为深海语义色板（hex、无 oklch/color-mix），两套手调主题——深色「深海自发光」（默认、第一主题）与浅色「海面雾光 + 海玻璃」（第二主题）；概念从「夜灯桌宠」改为「深海声呐」，删除「本期不做浅色」。
  - **主题运行时**：`app/index.html` `<head>` 内联防闪脚本读 `localStorage` 的 `sidekick:theme`（`system | light | dark`，非法/缺失默认 `dark`），在 CSS/React 之前写 `data-theme` + `.dark` + `color-scheme`；`shared/lib/theme.ts` 提供 `initTheme` / `useTheme` / `setThemePreference` / `applyTheme`，跟随 `matchMedia` 系统变化、监听 `storage` 同步多窗口；Sonner 用 `resolved` 跟随主题。`data-theme` 服务令牌、`.dark` 只服务 Tailwind `dark:` 变体，两者必须同步。
  - **宠物资产不重绘**：复用现有 OpenPets schema 2 图集与 `SpritePet`，不重绘/不染色/不新增鲸鱼；删除旧的 `--pet-body` / `--pet-belly` / `--pet-eye` / `--pet-cheek` CSS 颜色变量（本体颜色归图集）。宠物舞台在两套主题里都保持深海底色（`--pet-bg` 深 `#030e12` / 浅 `#082229`）；声呐环只是背景装饰，不加光晕（OLED，D58）。
  - **`--accent` 与 `--whale` 语义拆分**：`--accent` 保持 shadcn 的 hover/选中面语义（= `--wash` 薄荷薄层），鲸蓝单独新开 `--whale`，避免改 `--accent` 导致所有组件 hover 变蓝块。
  - **`--input` 加强**：`--border` 保持约 1.9:1 的 1px hairline（只做分隔，不承担文字/控件识别）；表单控件描边单独用 `--input`（浅 `#6f8f89` / 深 `#578893`；对实际输入框底 `--popover` 约 3.48 / 3.51，对卡片 3.34 / 4.10），满足 WCAG 1.4.11 而不把全站描边加粗；宠物舞台输入框用固定的 `--pet-input`（`#578893`）。
  - **清理 `design-lab/`**：评审结束后删除提案 HTML、对比首页、预览图与 QA 脚本，只保留正式规范（`docs/standards/visual.md`）与令牌文件；不再把评审稿当事实源。
  - **放弃方向 A（夜灯暖屋）与方向 C（掌心贴纸）**：不再保留备选主题或切换入口。
- 原因：B 的「深、清、准」最贴合产品定位（常驻仪器 + 掌心宠物），且用语义色（信号/鲸蓝/琥珀）而不是装饰表达状态；双主题是用户明确的白天/办公室诉求；宠物资产复用能一次改皮、零美术返工；令牌 hex 是 WebView 103 兼容底线。
- 放弃：只做深色（用户明确要浅色）；把深色直接反色当浅色（浅色需重新设计光源与表面）；为浅色主题重绘浅底鲸鱼/加描边（资产与授权成本高）；把鲸蓝写进 `--accent`（破坏 shadcn 语义）；把 `--border` 整体提到 3:1（仪器感变工程图）；继续用 `oklch`/`color-mix` 定义令牌（真机不支持）。
- 代价：两套主题每个新组件都要双主题验收，对比度与视觉层级维护成本约翻倍；浅色主题下宠物舞台仍是深色舷窗，页面与舞台有有意的明度断层；`design-lab/` 评审稿删除后不可恢复（只留结论与令牌）；以后改色值必须同时更新两套并重跑对比度检查。
- 规范：`app/index.html`、`app/src/shared/styles/{tokens.css,globals.css}`、`app/src/shared/lib/{theme.ts,local-storage.ts}`、`app/src/shared/ui/{theme-options.tsx,signal-dot.tsx,sonner.tsx}`、`app/src/desktop/features/settings/components/settings-sheet.tsx`、`app/src/mobile/features/pet/pet-settings.tsx`、`docs/standards/{visual,ux}.md`、`docs/frontend-architecture.md` §6、`docs/status.md`、`AGENTS.md` §2/§3/§8/§10。

## D72 · 补上 Android 16+ 的局域网访问权限（2026-11-04）

- 背景：真机换成荣耀 BKQ-AN10（Android 17 / SDK 37）后手机连不上电脑——宠物页一直「未连接」，聊天页显示「没找到电脑」，手动连接报「连接超时，确认电脑端已打开」。同一台手机在 shell 里 `curl http://<电脑IP>:47810/` 返回 200、WebSocket 升级拿到 101 并收到服务端推送，说明网络与服务端都正常；桌面端在 App 重启后也收不到任何 UDP 探测包。
- 根因：Android 16（API 36）起访问局域网设备需要 `android.permission.ACCESS_LOCAL_NETWORK`（dangerous 运行时权限），`targetSdk >= 36` 的应用默认被拒。`adb shell appops get dev.sidekick.app ACCESS_LOCAL_NETWORK` 返回 `Uid mode: ignore`，且 `rejectTime` 随每次连接尝试更新：系统把 App 的 UDP 广播与 TCP 连接一并拦掉，在 Rust 侧表现为 `CONNECT_TIMEOUT`（4 秒）超时，而 shell 进程（curl）不受该限制，因此极易误判成防火墙或企业网客户端隔离。
- 决策：`scripts/patch-android-manifest.mjs` 在声明麦克风权限与竖屏方向之外，追加声明 `android.permission.ACCESS_LOCAL_NETWORK`，并向 `MainActivity.kt` 注入 `requestLocalNetworkAccess()`——`SDK_INT >= 36` 且未授权时请求该权限，Android 15 及更早版本直接返回。同时修掉构建脚本里写死的 JDK / NDK 路径（分别改为 `java_home -v 21` 探测与取 SDK 下最新 NDK），并用 corepack 的 pnpm shim 兜住 `beforeBuildCommand` 触发的 `packageManager` 版本校验。
- 原因：这是系统新规导致的确定性失败，与网络环境无关；只依赖「手动输入地址」同样无效——手动连接也会被拦，必须声明并请求权限。
- 放弃：只声明不请求（dangerous 权限不请求等于拒绝）；下调 `targetSdk` 绕过（会放弃 Android 16+ 的其它必要行为）；用 `adb reverse` 把连接改到 localhost（依赖调试通道，只在排障时用于验证根因，不是产品形态）。
- 代价：Android 16+ 首次启动多一次系统权限弹窗，拒绝后局域网功能不可用且界面仍只提示「连接超时」；`gen/` 不入库，每次 `pnpm tauri android init` 后必须重新执行补丁脚本（构建脚本已自动调用）。
- 规范：`scripts/patch-android-manifest.mjs`、`scripts/build-android.sh`、`scripts/package-android.sh`、`AGENTS.md` §8、`docs/setup.md`。
- 验证（2026-11-04 真机，荣耀 BKQ-AN10 / Android 17）：装新包后首次启动弹出本地网络授权，允许后 `appops` 变为 `granted=true`；App 手动填 `IP:端口` 走真实局域网 IP 建立连接（服务端 `lsof` 可见 `30.166.162.215:47810->手机IP` 的 ESTABLISHED），不再是 4 秒超时；杀掉重启后 8 秒内用记住的地址自动重连成功。**但同一台手机在该办公网上仍然发不出 UDP 广播**（`47820` 监听器 0 包到达，与权限无关），所以自动发现依旧为 0 台、只能靠手动地址兜底——这两个问题是独立的，修权限不会让广播恢复。

## D73 · 企业网只放行单播：广播与组播发现均不可用（2026-11-04）

- 背景：D72 修好局域网权限后局域网 TCP 能连上了，但自动发现仍恒为 0 台。需要确认这到底是"App 没发出去"还是"网络把包丢了"，以及能否用 mDNS 替代 UDP 广播。
- 方法：用 NDK 交叉编译一个静态 ARM64 探针（直连内核 socket，绕开 toybox `nc` 没有 `SO_BROADCAST` 的限制），在手机上对五类目标各发一个 UDP 包，电脑侧同时绑定 `0.0.0.0:47830` 并加入 `224.0.0.251`/`224.0.0.1` 组播组接收；另外对比调用 `discover_servers` 前后手机 `/proc/net/snmp` 的 `Udp OutDatagrams`。
- 结论（华为/荣耀 Android 17 + `example-corp` 企业 WiFi）：
  - **手机侧五个包全部 `sent OK`**（内核全部接受），`OutDatagrams` 差值 **+3** 与代码里 `PROBE_SEND_OFFSETS_MS = [0,400,800]` 的三次探测严格对应——App 确实发了，不是没发；
  - **只有单播到达电脑**；网段广播 `30.166.191.255`、受限广播 `255.255.255.255`、组播 `224.0.0.251`(mDNS)、组播 `224.0.0.1`(all-hosts) 全部丢失；
  - 因此 **mDNS 不能作为替代方案**——它走组播，同样被丢。这条要写下来，否则下次还会有人第一时间想到 mDNS。
- 影响与可选路径：不依赖广播/组播的地址传递只有四条——扫码（桌面 `server_info` 已有二维码，手机扫码读出 `IP:端口`，不受任何网络策略影响，最可靠）、单播扫描同 /24（单播通，但行为接近端口扫描，可能触发企业 IDS/安全告警）、固定地址（需 IT 配静态 IP 或内网 DNS）、手动输入（现状，零成本但要知道 IP）。
- 决策：本轮**只记录结论、不改发现实现**。自动发现维持 UDP 广播（在家用路由器等正常网络仍有效），企业网场景继续靠手动输入地址兜底；扫码连接留待后续单独排期。
- 规范：`AGENTS.md` §8、`docs/status.md` 已知问题、`docs/setup.md` 故障排查、`docs/decisions.md` D72。

## D74 · 手机扫电脑二维码连接（兜底连接方式）（2026-11-04）

- 背景：D73 证实企业网只放行单播、广播与组播全丢，自动发现在这类网络必然恒为 0 台，用户只能手输 `IP:端口`。需要一条完全不依赖网络发现的连接路径。
- 决策：
  - **手机 App 内扫码**：新增全屏扫码页，用 `getUserMedia({video:{facingMode:"environment"}})` 开后置相机，`jsqr` 逐帧解码，扫到地址后直接走已有的 `connect_server`。
  - **桌面二维码内容不变**：仍是 `http://<ip>:<port>`（`server_info`）。手机浏览器扫码打开落地页下载 APK 的行为零变化，App 内扫码只是复用同一个码。
  - **解析只认 IPv4**：`parseScanPayload` 接受 http/https/ws/wss 与裸 `ip[:port]`，缺端口补 `47810`，忽略 path/query（为将来带配对 token 的二维码留余地）；域名一律拒绝，避免扫到任意二维码就去连外部地址。
  - **相机权限链**：manifest 声明 `android.permission.CAMERA`，Rust `on_permission_request` 对 `PermissionKind::Camera` 返回 Allow。**不改 MainActivity**——wry 的 `grantPermissionRequest` 在拿到 Allow 后会自己调 `activity.requestPermissions(CAMERA)` 弹系统授权。
  - **解码库选 `jsqr@1.4.0`**（Apache-2.0，约 135KB min / 43KB gzip，纯 JS），只在扫码页动态 `import()`。不用 `BarcodeDetector`：它在 Android 依赖 Google Play Services 的 ML Kit，设备缺 GMS 会静默失效。
- 原因：扫码本质是「把地址从电脑传到手机」，用二维码就绕开了整条网络发现链路，所以不受任何广播/组播策略影响，比单播扫描同 /24 更稳（后者行为接近端口扫描，可能触发企业 IDS）。选 App 内扫码而不是系统相机 + deep link，是因为后者要改二维码内容、破坏现有落地页用途，且各扫码工具对自定义 scheme 的支持不一致。
- 放弃：`BarcodeDetector`（GMS 依赖不可控）；系统相机 + `sidekick://` deep link（破坏落地页、行为不一致）；原生 Kotlin 扫码插件（成本高、收益不比纯前端多）；扫到域名也去连（安全面过大）。
- 代价：App 多一次相机权限授权（只在用户主动点扫码时才申请）；包体 +43KB gzip 且懒加载；相机预览的帧率与弱光识别率必须真机验收；后续配对鉴权若给二维码加 token，解析逻辑需扩展（当前已忽略 query，不会直接坏）。
- 规范：`app/src/mobile/features/connect/{scan-payload.ts,scan-camera.ts,components/scan-view.tsx}`、`connection-bar.tsx`、`app/src/mobile/{app.tsx,ui-store.ts}`、`app/src-tauri/src/lib.rs`、`scripts/patch-android-manifest.mjs`、`AGENTS.md`、`docs/setup.md`。
- 真机验收（2026-11-04，荣耀 BKQ-AN10 / Android 17）暴露并修掉三个问题：① **首次打开扫码页必失败**——`video` 首次挂载时还没完成布局（0×0），`play()` 被拒，界面报「相机打不开」，第二次打开才正常；改为先等元素拿到非零尺寸再 `play()`，失败等一帧重试，`getUserMedia` 遇 `NotReadableError`/`AbortError` 也短暂等待重试（权限被拒不重试，避免反复弹框）。② **扫码页按返回会连带关掉聊天页**（一路退到宠物页）——根页面原先依赖 `pushBackHandler` 栈消费，实测扫码页的 handler 没生效；改为根页面的返回处理直接读 `scanOpen` 状态优先关闭扫码页，不再依赖注册时序，`ScanView` 里那段重复 handler 删除，并补了 App 层回归测试。③ 构建脚本的 pnpm shim 原本用 `mktemp` 随机目录，被 gradle 的 configuration cache 记住后，脚本退出目录即删除，下次复用缓存就找不到 pnpm 直接构建失败；改为固定路径 `app/.pnpm-shim`（已 gitignore）。核心链路复验：首次打开即有画面、对准二维码自动连接、按返回回到聊天页。

## D75 · 桌面端启动提示辅助功能授权（2026-11-04）

- 背景：辅助功能没开时，自动粘贴会退化成「只复制」，结果卡片也不会出现「回车 / 清空」——但原因完全不可见。相关开关藏在「设置 → 辅助功能」卡片里，用户要先知道去那儿才不会以为是功能坏了。2026-11-04 真机（桌面 realsense）复现：用户已在系统设置里打开 Sidekick 的辅助功能开关，功能仍不生效。
- 决策：
  - **启动即提示**：新增 `AccessibilityHint`，桌面端启动时查 `accessibility_info()`，未授权就在内容区顶部常驻一条提示（`role="status"`，不是模态弹窗），带「去开启 / 稍后」。
  - **一键到开关页**：点「去开启」调 `accessibility_request()`（`application_is_trusted_with_prompt`），让系统把本程序登记进「辅助功能」列表并弹原生提示；用户确认后由 macOS 自己跳页。**不再自己拼 `x-apple.systempreferences:` URL 跳转**——实测旧格式落到「通用」页、新格式在 macOS 15 上无反应，系统自己跳才可靠。
  - **授权后自动收起**：监听 `window.focus` 重新查状态，切回窗口时已授权就不渲染，不需要重启 App。
  - **手机端同步指引**：`copiedAccessibility` 文案改成「已复制；电脑没开辅助功能，在电脑上点「去开启」就能自动输入。」，把用户引到电脑端的新入口。
- 原因：TCC 是系统安全边界，**没有任何公开 API 能编程授予辅助功能**（能绕过就是漏洞）。所以目标不是「自动授权」，而是把操作压到最少并让原因可见。
- 放弃：自拼 URL 深链（见上，不可靠）；自动点系统设置 UI（需要辅助功能权限，鸡生蛋）；`tccutil reset` 自动化（只能删不能授权）。
- 代价：常驻一条提示条；「稍后」只对本次会话生效，下次启动仍会提醒（未授权状态下提醒是合理的）。
- **已知限制（未解决）**：App 是 ad-hoc 签名（`Identifier=desktop-<hash>`、`TeamIdentifier=not set`），TCC 按 CDHash 记账，**每次重新打包桌面端旧授权就对新二进制失效**，表现为「系统设置里开关明明开着，功能仍然只复制」。排查确认：`codesign -dvv /Applications/Sidekick.app` 的 `CDHash` 与上次打包不同即是此因；`tccutil reset Accessibility dev.sidekick.app` 清掉旧条目后重新授权可以恢复。根治需要固定签名证书（让 TCC 按证书 + bundle id 记账而不是按内容哈希），或正式开发者签名 + 公证。
- 规范：`app/src/desktop/features/settings/components/accessibility-hint.tsx`、`app/src/desktop/app.tsx`、`app/src/shared/lib/mic-status-copy.ts`。

## D76 · 外观默认跟随系统 + 宠物舞台随主题（浅色海玻璃）（2026-11-04，取代 D71 中「默认深色」「舞台两套主题都深」两点）

- 背景：D71 定了双主题，但留了两个「深色优先」的取舍——外观默认值写死 `dark`，宠物舞台在两套主题里都用深海底色。用户随后明确要求「宠物页背景也跟随系统」：浅色主题下页面是海玻璃浅底、宠物页却是一整块深色舷窗，明度断层很突兀；首次启动也默认深色，白天/办公室用户第一眼看到的不是自己系统的主题。需要把默认值改成跟随系统，并让舞台跟着主题走。
- 决策：
  - **外观默认跟随系统**：`sidekick:theme` 缺失/非法一律按 `system` 处理（不再 `dark`）；首次启动、无存档时随系统亮暗；浅色/深色仍可手动强制；`app/index.html` 防闪脚本与 `shared/lib/theme.ts` 同步，localStorage 不可用（隐私模式等）时运行时静默回退深色。
  - **宠物舞台 `--pet-*` 随主题**：深色仍是深海自发光；浅色换成新的「海玻璃舞台」——`--pet-bg #dcebe7`、surface `#f7fcfa`/`#edf7f3`、wash `#cfe4de`、text `#0e2a2b`、muted `#3f5e5d`、border `#9dbab4`、input `#6f8f89`、primary `#095b51`/`#f7fdfb`、signal `#0a7764`、coral `#b34628`、ask `#8a5410`、success `#186b49`、danger `#9c3a2b`；新增 `--pet-coral-foreground`（深色 `#2b100c` / 浅色 `#fff8f6`）。声呐环与鲸鱼图集不变。
  - **始终深色的表面显式钉住**：新增 `.deep-sea-scope` 作用域，在任意主题下重新声明深色 `--pet-*`，并把浮层用到的壳层信号色（`--signal`/`--ring`/`--decide`/`--destructive`/`--abyss`）一并钉回深色值；桌面麦克风浮层（`mic-status-overlay`）套用它，避免浅色主题下出现「深底深字/深底深信号色」。`SignalDot` 的 `tone="stage"` 语义从「固定深色」改为「用 pet 令牌（随主题）」。
  - **取代 D71 的两点**：D71 中「深色（默认、第一主题）」与「宠物舞台在两套主题里都保持深海底色」作废，D71 其它结论（方向 B、令牌语义拆分、`--input` 加强、资产不重绘、hex 底线）继续有效；D71 原文保留不改。
- 原因：用户明确要宠物页背景跟随系统，深色舷窗是设计取舍而非硬约束；跟随系统也是「默认不打扰」的正确默认值——用户选过浅色/深色才强制，没选过就尊重系统。舞台跟随主题后，浅色主题从「深浅拼接」变成一套连续的浅海玻璃，视觉更完整。
- 放弃：只改默认值、舞台仍恒深（浅色下还是断崖式深色块，没解决用户诉求）；把「舞台恒深」做成设置开关（用户要的是跟随，不是再多一个开关）；为浅底重绘浅色鲸鱼或加描边（资产与授权成本，D71 红线）；给鲸鱼加 CSS `filter` 提亮/压暗（污染自发光资产、安卓 WebView 合成开销）；浅色舞台继续用大面积低亮度装饰（浅底上观感脏，且不省电）。
- 代价：鲸鱼资产不重绘、不加 CSS filter，浅色海玻璃舞台下白色围裙与亮部对比度偏低——实测约 26% 不透明像素对比度 <1.5，中位数约 3.5，轮廓仍可辨但细节掉；浅色舞台是大面积浅底，OLED 常驻宠物页的功耗会比深底高（D58 的深底省电前提只在深色主题成立）；`--pet-*` 从一套固定深色变成两套，以后改舞台色要双主题验收；`.deep-sea-scope` 是额外作用域，浮层内新增组件要记得它不跟页面主题走。
- 规范：`app/index.html`、`app/src/shared/lib/theme.ts`、`app/src/shared/styles/tokens.css`、`app/src/shared/ui/{theme-options.tsx,signal-dot.tsx}`、`app/src/desktop/features/settings/components/settings-sheet.tsx`、`app/src/desktop/features/mic-receiver/*`、`app/src/mobile/styles/deep-sea.module.css`、`app/src/mobile/features/pet/{pet-settings.tsx,name-prompt.tsx}`、`app/src/mobile/features/mic/*`、`docs/standards/{visual,ux}.md`、`docs/frontend-architecture.md` §6、`docs/status.md`、`AGENTS.md` §2/§8。

## D77 · 宠物交互收敛：去手机舞台声呐环、宠物不再响应麦克风、done 改循环（2026-11-04，取代 D69 中「保留麦克风反应」、D71/D76 中「手机舞台声呐环」）

- 背景：宠物页在 D71 视觉换皮时加了手机舞台背景声呐环，并保留了 D31 设计的麦克风联动（倾听/成功/失败短态）。实际使用中这两块都变成「有表达但价值不明确」的负担：录音反馈与麦克风 UI 自身的波形/计时/结果卡片重复，验收成本高；舞台环在宠物页常驻，用户反馈不需要。同时 AI completed 的 done 动画沿用 `once` + 末帧 1.5 秒定格，在 3 秒 completed 窗口里看起来像卡住。
- 决策：
  - **手机宠物舞台删除背景声呐环**：删除 `pet-stage.tsx` 的 sonar JSX 与 `pet.module.css` 的 sonar/关键帧/减少动效覆盖；桌面 `SignalDot` 的 `.sonar-dot-ring` 保留（D71 的信号装饰只在桌面状态点）。
  - **宠物不再响应麦克风**：删除 `PetEvent` 的 `MIC_START`/`MIC_SUCCESS`/`MIC_CANCEL`/`MIC_ERROR`、`PetPhase` 的 `listening`/`concerned`、`Mood` 的 `listening`/`proud`/`concerned`、`resumeMood`、`CopyId` 的 `mic_success`/`mic_error` 以及成功/失败触感与气泡；`mic-store` 不再 `petDispatch`，`pet-store` 的 `processEffects` 不再因 `listening` 屏蔽气泡。`PetPhase` 只剩 idle/celebrating/sleeping/away，`Mood` 只剩 content/happy/curious/sleepy。**保留**麦克风 UI 自身的 arming/listening/processing/delivered/cancelled/error 状态、波形/计时/结果卡片/上滑取消，以及 `micListening` 门禁（录音时静音 AI 音效/触感）。
  - **done 动画改循环**：`pet.json` 的 `done.loop.mode` 由 `once` 改为 `loop`，末帧 `duration` 1500→100；一轮 16×100ms=1.6 秒，completed 3 秒内约循环 1.875 轮，不再末帧定格。`advanceFrames` 的 `once` 能力保留给未来需要定格的状态（当前内置图集没有 once 状态）。
  - **顺带修复 `phaseUntil` 到点不结束**：`pet-store.ts` 新增 `schedulePhaseExpiry`，在 `phaseUntil` 到点（+16ms）补发一次 `TICK`。原先只靠宠物页 30 秒一次的兜底 TICK，命名庆祝（以及以前麦克风成功庆祝）会停在庆祝/末帧几十秒。
- 原因：用户希望宠物回到「纯陪伴 + AI 状态展示」，录音时不要抢麦克风 UI 的注意力；舞台环是装饰性元素，手机舞台不需要；done 循环让 3 秒完成态持续有动作，不再像卡帧。phaseUntil 修复让所有瞬态状态按设计时长结束，不依赖低频 tick。
- 放弃：只删成功/失败、保留倾听（用户要求完全不响应麦克风）；保留 sonar 但只在连接时显示（手机舞台仍常驻装饰，收益低）；done 改 once + 首尾拼接模拟循环（复杂且要改播放器）；用 CSS 动画模拟 done 循环（图集已支持 loop，没必要另起一套）。
- 代价：宠物对录音不再有任何情绪反馈，录音时画面更「冷」；旧文档/旧测试里的 `MIC_*` 契约作废，回退旧版本时这些事件本来也无生产事件源；`once` 能力当前没有内置状态使用，只作为未来扩展点保留。
- 规范：`app/src/mobile/features/pet/{types,state-machine,sprite-state-map,sprite-player,pet-store,pet-stage,pet.module.css,copy,persistence}.ts(x)`、`app/src/mobile/features/pet/assets/openpet/pet.json`、`app/src/mobile/features/mic/mic-store.ts`、`docs/prd/pet/{PRD,SPEC,ACCEPTANCE,INDEX}.md`、`docs/engineering/pet-runtime.md`、`docs/standards/{visual,ux}.md`、`docs/prd/mic/{PRD,SPEC}.md`、`docs/product/scope.md`、`docs/status.md`、`AGENTS.md` §2/§8/§10。

## D78 · 会话列表展示粗粒度工具类别（hook v3 / 双端白名单）（2026-11-04）

- 背景：手机会话列表的工作行原先只显示「工作中」，用户看不出 AI 当前在跑命令、读文件还是查资料。隐私铁律要求不读取/外发提示词、回复、工具参数、文件路径、模型名，所以不能上报工具名原文或参数；需要在不引入内容类字段的前提下给工作行一个「正在做什么」的粒度。
- 决策：
  - **插件本地归一**：`sidekick-hook.mjs` 新增 `SESSION_TOOLS` 白名单（`bash`/`read`/`edit`/`search`/`web`/`agent`/`plan`/`tool`）与 `toolActivityOf`：常见工具名先整名匹配、再按 token 兜底（如 `file_read`→`read`、`web_search`→`web`、`glob`/`grep`→`search`、`subagent`→`agent`、`todo_write`/`enter_plan_mode`→`plan`），未知工具统一落 `tool`，空工具名不记录；`PLUGIN_VERSION` 2→3。
  - **会话记录与广播**：`pendingTools`（callId→类别）跟踪进行中工具，`tool` 取最近开始的一个；`tool/result` 移除后回退到仍在跑的工具；`turn/start`、`turn/end`、`approval/asked`、`user/message` 清空。仅 `state=working` 上报 `tool`，asking/idle/completed 恒为 null；列表摘要 signature 含 `tool`，只换工具也会触发广播。
  - **Rust 桥第二道白名单**：`SessionTool` 枚举只接受白名单词，未知字符串折叠为通用 `tool`，**绝不把原始字符串透传给手机**；旧插件缺字段按 `None`（手机显示「正在思考」）；仅 working 保留。
  - **手机端**：`protocol/messages.ts` 新增 `SessionTool` 类型与 `isSessionTool` 白名单校验，未知/非 working 值归一为 `null`（不整条丢弃，保持向后兼容）；工作行显示小圆环 spinner + 「正在<动作>」（bash 运行命令 / read 阅读文件 / edit 修改文件 / search 搜索代码 / web 查资料 / agent 处理子任务 / plan 整理计划 / tool 使用工具；无 `tool` 显示「正在思考」），行尾保留「 · 相对时间」。
  - **隐私口径**：只同步状态、会话数、标题/时间与粗粒度工具类别；不读取/外发提示词、回复、工具参数、文件路径、模型名、工具名原文。
- 原因：用户需要「正在做什么」的可读信号；固定 8 值枚举既满足展示，又把外发面收窄成一个常量；双端白名单保证旧/异常插件也不会把任意字符串带到手机；工具类别属于元数据而非内容，与「只同步状态」的隐私承诺不冲突。
- 放弃：上报工具名原文（隐私红线，且会随 DSH 工具变化泄漏路径/参数意图）；上报工具参数摘要（内容类字段）；在手机端做工具名映射（仍需原文过网，且双端逻辑不一致）；把 tool 塞进 title（语义混杂，且标题有独立的 80 字符限制）。
- 代价：新增一个协议字段与两处白名单，改 `sessionList` 要同步 `protocol/README.md`、Rust 桥与手机解析三处；只有 8 个粗类别，无法区分具体工具；旧插件不报 `tool` 时工作行只能显示「正在思考」。
- 规范：`app/src/dsh-hook/sidekick-hook.mjs`、`app/src-tauri/src/dsh_hook.rs`、`app/src/protocol/messages.ts`、`app/src/mobile/features/sessions/{session-panel.tsx,session-store.ts}`、`app/src/dev/tauri-mock.ts`、`app/src/desktop/features/hook/components/hook-panel.tsx`、`protocol/README.md`、`docs/engineering/dsh-hook.md`、`docs/prd/hook/{PRD,SPEC,ACCEPTANCE,INDEX}.md`、`docs/standards/ux.md`、`docs/status.md`、`AGENTS.md`。

## D79 · 采用方向 A「指挥舱」重设计 + 删除首次命名 + 收敛调试入口 + 数据真实性边界（2026-11-05）

- 背景：用户对现状的判断是「不成体系」——桌面四角分散连接/手机/AI/服务状态，聊天被当成首页、配置藏在设置 Sheet，手机宠物页同时承担气泡/会话/连接/麦克风/设置/聊天六件事。2026-11-04 由 ixd-a / ixd-b 出两版高保真可点原型并完成 PM + 用户视角评审（`design-review/v2/`，只读依据，不随仓库迭代）。用户选定方向 A「指挥舱」。同一轮还要清掉首次命名下线后的文档残留，并明确「本轮只做壳与页面归属、不虚构能力」。
- 决策：
  - **采用方向 A「指挥舱」**：电脑是主控台、手机是遥控器 + 宠物。桌面一级 5 视图（总览 / 会话 / 内容 / 系统 / 设置），顶部 48 全局状态条（服务 · 手机 · AI 三段、可点即入口）、72 图标导航（⌘1–⌘5）、56 页头（标题 + 一句状态 + 最多一个主按钮）、内容区最大 880 居中；「系统」内固定 4 段（连接 / 语音 / 联动 / 消息），聊天降级为「系统 › 消息」；辅助功能提示条是外壳级（未授权时所有桌面页可见、可「知道了」关闭）；麦克风浮层全局（不抢焦点、不挡输入）。默认首页从聊天改为总览。
  - **手机壳改为 3 档 + 二级页**：顶部 44 状态条（左设置 / 中间连接状态可点 / 右消息）、底部 3 档（宠物 / 动态 / 更多）、麦克风胶囊 56 常驻不变位；二级页 asking / chat / offline / scan 全屏；返回层级固定为 settings→pet、stream→pet（根页再按走退出确认）、asking→stream、chat→pet、offline→上一页、scan→offline；录音中禁切页。宠物页只留气泡 + 宠物 + 「现在」一行 + 最近 1 条会话 + 首用清单卡，完整会话搬进「动态」。
  - **删除首次命名**：承接 2026-11-05 Phase 1 实现，宠物固定显示「小跟班」，`onboarded` 只表示是否已见过面；删除 `name` 存档字段、`NAME_SET`/`celebrating`/`happy`/`phaseUntil`/爱心/`setName`，旧存档 `name` 忽略不迁移。设置页分组重排为 01 反馈 / 02 外观 / 03 显示 / 04 重置宠物 / 05 关于。文档同步删除全部命名/庆祝描述（本决策之前的历史 D 条原文不重写）。
  - **收敛调试入口**：聊天（消息）只保留在「系统 › 消息」/手机消息页，不再占导航一级或默认首屏；连接排障唯一主入口是连接页（桌面系统 › 连接、手机连接页），聊天页只保留断连折叠块；AI 联动的「模拟一次状态」只在 DEV 可见；桌面删除 4 个平行 Tab 与 SettingsSheet，设置改为整页；手机设置从 sheet 改为整页「更多」。这些入口仍然可用，只是不再与主任务平级。
  - **数据真实性边界**：只展示现有协议能真实给出的数据——不造延迟、心跳、设备型号、提示词/回复；手机「最近发生」由已有 `conn`/`status`/`mic.result`/`focus.result` 派生，只存内存；桌面手机数用 `system` 消息新增的可选 `clients` 字段近似（`max(0, clients - 1)`，含网页预览，旧服务端不发送时显示「未知」）；「在 DSH 打开」复用手机已有的 `focus.request`（桌面本地 WS 发起，`open -a "DeepSeek Harness"`），不新增协议；会话页与动态页复用 `status.sessionList`（D78 的工具动作白名单照旧）。**本轮不做**：`asrConfigured` 字段、精确手机台数、活动流持久化、手机批准/拒绝 AI 提问（见范围外）。
  - **继续有效的旧决策**：D69（触摸互动下线）、D77（手机舞台无声呐环 / 宠物不响应麦克风 / done 循环）、D78（会话工具类别双端白名单）全部继续有效，不因重设计改变宠物行为与隐私口径。
- 原因：桌面的问题是「没有固定位置」，不是缺功能——A 让四个问题（服务在不在 / 手机连没连 / AI 在干什么 / 我下一步点哪）永远在同一个位置回答，状态即入口；手机的问题是「宠物页什么都干」，A 把任务相关的内容移到「动态」，宠物页退回主视觉 + 现在 + 最近一条。删除首次命名是因为名字既不是陪伴成立的前提，又带来弹层/存档/测试/文案一整套维护面；收敛调试入口是因为聊天、模拟状态、连接排障都属于低频且容易误导的能力。
- 放弃：方向 B「一条河」（时间线形态在事件变多时扩展性更好，但本轮用户选 A；B 的 AI 提问正文与手机剪贴板内容还踩了隐私红线）；跨端自适应（两端仍是独立固定布局）；用新协议字段补齐「语音是否配置」「精确手机台数」（P1，需要协议改动与旧客户端兼容验证）；桌面渲染宠物、手机剪贴板历史（违反平台矩阵与「手机是外设」）。
- 代价：聊天（消息）多一次点击；「系统」内 4 段让首次找 AI 联动多一层；总览在 960 最小窗下的密度需要验收；动态页承担「会话 + 最近发生」两种内容；用户可能把「会话」误当成第二个消息（若真混淆，后续可改名或并回总览）；手机首用清单后两步（百炼 Key / 辅助功能）只能在电脑完成，手机不显示完成状态。
- 规范：设计依据 `design-review/v2/version-a.notes.md`（只读，不作事实源）；产品规则 `docs/prd/shell/{INDEX,PRD,SPEC,ACCEPTANCE}.md`；交互规则 `docs/standards/ux.md`；前端结构 `docs/frontend-architecture.md`；进度 `docs/status.md`；实现落点 `app/src/desktop/**`、`app/src/mobile/**`、`app/src/shared/**`、`app/src/protocol/messages.ts`、`app/src-tauri/src/desktop_server.rs`；协议 `protocol/README.md`（`system.clients` 可选字段）。

## D80 · 手机端干净版两页壳：删动态页 / 去底栏 / 会话置顶 / 弹窗结果卡（2026-11-05，取代 D79 的手机壳部分）

- 背景：D79 的手机 3 档壳在真机/高保真复核中被用户连续否掉：底部 tab + 动态页让「宠物页什么都干、动态页又像第二个消息」；宠物页的首用清单、NowRow、最近 1 条、麦克风胶囊叠在一起，视觉「傻大粗」；结果卡用 14/400 两行正文 + 16/400 实心动作，既不像弹窗、脚又压过头。用户要求按 iOS 的「干净、一眼」重做：删掉动态页与底栏，会话置顶，麦克风居中，结果卡是明确的弹窗三段。
- 决策：
  - **手机只保留两页**：`pet`（根页）与 `settings`（更多，二级页）；删除 `stream` / 动态页与 `MobileTabBar`。`asking` / `chat` / `offline` / `scan` 仍是二级页。
  - **宠物页结构**：顶部 44 条（左 gear → settings / 中连接状态 → offline / 右 chat → chat）→ 会话卡（置顶，折叠 1 行、展开最多 5 行；状态图标 spinner/check/琥珀点；working 行浅薄荷 wash；每行 28×28 ×，二次确认；footer「还有 N 条 / 收起」）→ 鲸鱼（无底色、无品牌小字、230 / 展开 220、居中偏下）→ 居中 56 薄荷圆麦克风（距底 24）。删除首用清单 / NowRow / 最近 1 条 / 底部三档；首用清单内容迁到设置页顶部 banner。
  - **设置页**：从 gear 进，左上返回 + 17/400 inline 标题；分组白卡 16 圆角、0.5 hairline、无 01–06 编号/英文 eyebrow；首用 banner 在顶部；无底栏。
  - **结果卡**：v16 弹窗三段——grabber（36×4）+ header 40（20 check +「已输入」16/400 + 右侧时间 12/400 + 复制 icon）+ content 34（正文 13/400 单行省略）+ footer 40（「清空」15/400 tertiary +「↵ 回车」15/400 薄荷，44 热区，纯文字，二次确认）。错误态同结构；卡片白底、20 圆角、0.5 hairline、浮影 `0 12 32 -12 rgba(20,30,35,.18)`；总高约 125。
  - **视觉作用域**：新增 `app/src/mobile/styles/clean.css`，只挂手机入口 `.mobile-clean`；浅色 `#F7F8F8` 页 / `#FFF` 卡 / `#1C1C1E` 主文 / `#6C6C70` 次文 / `#E5E5EA` hairline / `#0A7764` 薄荷，深色一套对应值。桌面端不挂，不受影响。手机端字重 400（最多 500），不再用 21/600 气泡、28/34 大标题、mono 大写装饰。
- 原因：手机上用户「大致看一眼」，信息层级应靠位置/尺寸/留白，而不是字号与卡片堆叠；两页 + 顶栏三件套把「宠物 / 连接 / 会话 / 设置 / 消息」压到一屏，动态页的职责由宠物页会话卡承接；结果卡三段让「头 / 内容 / 脚」一眼可读，13 单行正文符合 glance 场景，15 文字动作比 16 实心按钮轻。
- 放弃：保留动态页但隐藏 tab（仍是两套会话 UI，维护面不降）；保留胶囊麦克风（用户要圆钮居中）；结果卡保留复制文案行（card 162px，脚重、盖宠物，改为 header 内 icon-only 复制）；全站改 tokens.css 换肤（会污染桌面，改为 mobile-scope 变量）。
- 代价：动态页的「最近发生」活动流暂时没有 UI（activity-store 保留，未删）；设置多一次点击；结果卡正文单行可能截断，完整文本已在电脑插入/可在复制中取；旧的 3 档测试与文档需同步；真机未回归。
- 验收：`pnpm typecheck` / `pnpm lint` / `pnpm test`（591 tests）/ `pnpm build` 全绿；浏览器 390×844、320×640、浅/深主题截图通过；桌面端无视觉变化。
- 规范：`app/src/mobile/{app.tsx,ui-store.ts,styles/clean.css}`、`app/src/mobile/features/{pet,sessions,settings,mic}/**`、`app/src/entries/mobile.tsx`、`app/src/mobile/shell/{pet-top-bar,page-header}.tsx`、`docs/design/mobile-ui-v16/`（已归档，过程素材清理）、`docs/prd/shell/{PRD,SPEC,ACCEPTANCE}.md`、`docs/frontend-architecture.md`、`docs/status.md`、`AGENTS.md`。

## D81 · 手机端改用 MiSans Normal + 收紧字号/行高（2026-11-05，取代 D80 中「全站 OPPO Sans / 400 字重」的字体部分）

- 背景：D80 的 v16 在真机（Realme RMX3370）上仍被用户评价「字有点傻、很笨重、像老年机」。用 CDP `CSS.getPlatformFontsForNode` 查实际渲染字体：Android WebView 把 `sans-serif` 解析为 **OPlusSans 3.1_GB18030（OPPO Sans Regular）**，不是 PingFang/Noto；OPPO Sans Regular 的字形更宽、笔画更厚，同样 15–16/400 会显笨重。仅把字重改成 300（OPPO Sans Light）会变「发虚」，不是解法；问题主要在 **字体家族 + 字号/行高**，不是手机坏。
- 决策：
  - **随包 MiSans Normal（400）**：`app/src/mobile/assets/fonts/MiSans-Normal.woff2`（3.9 MB，由官方 TTF 转 WOFF2），`clean.css` `@font-face` + `.mobile-clean` 首选 `MiSans`，系统字体作为缺字回退；桌面端不加载。
  - **字号**：会话卡标题 16→**15**；正文 13；结果卡正文 13/18、header 16、footer 15；设置页标题 17、卡片标题 16、说明 13。**字重统一 400**（不再用 300；MiSans Normal 已比 OPPO Regular 轻一档）。标题层级只靠字号/颜色，不用 500/600。
  - **行高**：设置页说明 `leading-relaxed` 1.625→**1.45**；会话卡标题 20 / 副行 17；结果卡正文 18；页面标题 17/22。目标是把「大而松」压成「小而紧」，不是一味缩小。
  - **字体说明**：MiSans 官方 FAQ 说明可免费商用、可嵌入软件，但需注明使用了 MiSans；`app/src/mobile/assets/fonts/README.md` 记录来源/许可；设置页「数据与关于」补一行字体说明（如需要）。
- 原因：真机实测 OPPO Sans 的字面宽度/笔画厚度是「老年机」感的主要来源；MiSans Normal 更紧凑、现代，15 号标题比 16 号更接近 iOS 的视觉密度；300 的 OPPO Sans Light 太虚，不建议。行高从 1.625 收到 1.45 让设置页说明不再松垮。
- 放弃：仅调 300 字重（发虚、仍保留 OPPO 字形）；仅缩小到 14（会伤可读性且字形仍宽）；用系统 `system-ui`/`Noto Sans CJK`（Android 实际仍落 OEM 字体，不可控）；把 PingFang 打包（Apple 字体授权不允许）。
- 代价：APK +3.9 MB；首次渲染有极短 `font-display: swap` 替换；MiSans 缺字时回退系统字体会混排；LICENSE 需随包/文档保留。
- 规范：`app/src/mobile/assets/fonts/MiSans-Normal.woff2`、`app/src/mobile/styles/clean.css`、`app/src/mobile/features/sessions/session-row.tsx`、`app/src/mobile/features/settings/more-page.tsx`。

## D82 · 新增 Token 用量看板：桌面第 6 导航「用量」+ 手机「设置 › 用量」（2026-11-06）

- 背景：用户希望按客户端 / 会话 / 模型查看 Token 消耗，参考 tokei 但不要菜单栏常驻。V1「声呐总览」设计稿评审通过；桌面指挥舱需要新增一个承载页，手机需要从设置进入只读页。
- 决策：
  - 桌面新增第 6 个一级页「用量」，顺序 总览 / 会话 / 内容 / **用量** / 系统 / 设置；⌘1–⌘3 不变，用量 ⌘4、系统 ⌘5、设置 ⌘6。D79「一级只有 5 项」的导航部分由本条取代，其余 D79 结论继续有效。
  - 用量页只读本机 `<DSH_HOME>/storages/cost-meter/ledger.json`；区间今天 / 7 天 / 30 天 / 180 天；分组为客户端 / 会话 / 模型（卡片内 Tab，默认会话）；默认页仍为总览。
  - 手机新增「设置 › 用量」二级页，返回回设置；录音中由 `ui-store.setView` 拦截；不新增手机一级入口或底部导航。
  - P0 不做：菜单栏/状态栏常驻、V2 预算与 5h 额度卡、V3 时间洞察、Claude Code / Codex 解析器、多设备同步、遥测。
- 原因：现有桌面「系统 › 语音」里的 ASR 用量只覆盖语音费用，不是 AI Token；用量需要一个稳定的一级位置，同时保持「设置管配置、用量看数据」的分工。手机是 glance 场景，放在设置二级页足够。
- 放弃：把用量塞进总览/系统 › 语音（与 ASR 费用混淆、信息密度过载）；手机新增底部 tab（D80 已收敛为两页）；菜单栏常驻（用户明确不要）。
- 代价：一级导航从 5 项变 6 项，⌘4/⌘5 含义变化，需要同步 shell PRD/SPEC/AC/测试与文档；手机上多一次点击。
- 规范：`app/src/desktop/{lib/desktop-nav.ts,shell/icon-rail.tsx,app.tsx,pages/usage-page.tsx,features/usage/**}`、`app/src/mobile/{ui-store.ts,app.tsx,features/usage/**,features/settings/more-page.tsx}`、`app/src/shared/lib/{tauri.ts,usage.ts}`、`app/src/protocol/messages.ts`、`app/src-tauri/src/{token_usage.rs,token_pricing.rs,desktop_server.rs,mobile_client.rs,lib.rs}`、`protocol/README.md`、`docs/prd/{shell,usage}/**`、`docs/engineering/token-usage-pricing.md`、`docs/prd/INDEX.md`、`docs/INDEX.md`、`docs/frontend-architecture.md`、`docs/status.md`、`AGENTS.md`。

## D83 · usage 快照允许模型 ID 上手机（2026-11-06，限定补充 D78）

- 背景：V1 手机页要展示「模型」分组，但 D78 规定 `status.sessionList` 不读取/外发模型名。需要在「用户要看的维度」与「隐私最小化」之间重新划线。
- 决策：
  - 新增的 `usage` 快照允许下发**模型 ID 与接入方**（如 `deepseek-v4.1-flash` / `OpenCode Go`）以及该模型的 token、花费、缓存命中、单价来源；这些是元数据，不是提示词/回复/路径/工具参数。
  - `status.sessionList` 的 D78 口径**保持不变**：仍不含模型名、提示词、回复、工具参数、文件路径、cwd、工具名原文。
  - 提供「在手机显示模型分组」开关（默认开）；关闭后 `usage.groups.models=[]` 且 `modelsHidden=true`，手机隐藏模型 Tab；桌面模型分组不受影响。
  - `usage` 不含会话正文、路径、cwd；会话标题仍按既有规则（单行 ≤80 字符）处理。
- 原因：模型维度是用户明确要的三种分组之一；只传模型 ID 与聚合用量，风险面远小于内容类字段，且手机已有会话标题。保留开关让隐私敏感用户可收窄。
- 放弃：手机只显示「模型 A/B/C」脱敏分组（失去可读性，无法对照价格）；把模型名塞进 `status`（会改变现有隐私承诺与旧客户端行为）。
- 代价：多一个协议字段与开关；D78 的隐私说明需要补充「usage 例外」，测试要覆盖开/关两种手机快照。
- 规范：`protocol/README.md`（usage 节）、`app/src/protocol/messages.ts`、`app/src-tauri/src/{token_usage.rs,desktop_server.rs,token_pricing.rs}`、`app/src/mobile/features/usage/**`、`app/src/desktop/features/usage/pricing-sheet.tsx`、`docs/prd/usage/PRD.md`、`docs/standards/ux.md`。

## D84 · 模型价格表：OpenRouter 公开目录 + DeepSeek 官方峰谷 + 本地覆盖 + 缺价估算（2026-11-06，新增 `reqwest` 运行时依赖）

- 背景：DSH 账本已有 `costCny` 实际记账，但用户要求「参考 tokei 有获取模型价格的能力」；且未来 Claude Code / Codex 接入后需要按价格表估算。tokei 的做法：内置 pricing.json（OpenRouter 目录）+ 本地覆盖 + 每日刷新 + 官方价核对 + 实际成本优先 + 失败保留上次 + 过期标灰。Sidekick 需要同等能力但不能把用量外发。
- 决策：
  - 价格来源与优先级：本地 overrides > DeepSeek 官方 CNY 峰谷（仅 `deepseek-official` 接入方）> OpenRouter 公开目录（USD/1M × FX）> 内置 seed。实际 `costCny` 永远优先于估算；缺价行不估算、显示「缺价」，估算标 `≈`。
  - 数据文件：seed `app/src-tauri/src/pricing_seed.json`（OpenRouter 快照，`include_str!`）；缓存 `~/.sidekick/token_pricing.json`（0600，原子写）；覆盖 `~/.sidekick/token_pricing_overrides.json`（模型价 + FX，支持 `"currency":"CNY"`）。刷新失败保留上次成功，绝不写空/零价。
  - 刷新：打开用量页且缓存 >24h 时后台刷新；手动刷新最短 60s；失败 1h 内不自动重试；stale = 超过 7 天。只 GET `https://openrouter.ai/api/v1/models`，10s 超时、响应 ≤8MB、最多 3 次重定向且最终 host 必须是 openrouter.ai，UA `Sidekick/0.1`；不携带任何用量/模型名。
  - 依赖：新增 `reqwest`（`default-features=false`，features `json`、`gzip`、`rustls-no-provider`），rustls provider 与 ASR 共用 `crate::tls::ensure_crypto_provider()`（ring）。这是运行时依赖，按依赖治理记录。
  - 估算：输入 / 输出 / 缓存读 / 缓存写分别按单价计；DeepSeek 官方峰时 = UTC 工作日 1–4、6–10，其余谷时；无时间戳按谷时。价格只用于对照与缺价估算，不重算历史实际成本。
- 原因：DSH 实际成本可信，价格表的价值在于透明单价、缺价兜底与未来多客户端；用公开目录 + 本地覆盖可以在不登录、不上传数据的前提下复刻 tokei 的核心能力。
- 放弃：抓取 OpenAI 官方页面（P1，当前无 OpenAI 账本）；把 tokei 的整个 pricing.json 直接当运行时文件（seed 需可更新且带来源元数据）；历史事件重算（DSH 已记账，收益低）；调用第三方付费价格 API。
- 代价：包体增加 seed（约 80KB）与 reqwest 编译/体积；价格目录可能滞后或与账单有汇率差，UI 必须标「以账单为准」；多一套缓存/覆盖文件需要维护。
- 规范：`app/src-tauri/src/token_pricing.rs`、`app/src-tauri/src/pricing_seed.json`、`app/src-tauri/src/tls.rs`、`app/src-tauri/Cargo.toml`、`scripts/update-pricing.mjs`、`app/src/desktop/features/usage/pricing-sheet.tsx`、`docs/engineering/token-usage-pricing.md`、`docs/dependency-policy.md`。

## D85 · 电脑端「简约 iOS」重做：4 个一级入口 + 216 侧栏 + iOS 分组列表（2026-11-06，取代 D79 的桌面 6 视图/D82 的桌面导航顺序；D82 手机用量页保留）

- 背景：D79「指挥舱 A」在桌面留下 48 全局状态条 + 72 图标导航 + 6 个一级视图 + 系统页 4 段 + 56 页头，壳本身的框比内容还多；状态分散在状态条、会话页、系统段三处，会话列表页又与总览重复。用户要求按 iOS 的「干净、一眼」重做电脑端（与 D80 手机端同一方向），只重排承载与入口、不改功能行为，手机端 D80/D81 规则不动。
- 决策：
  - **一级导航只剩 4 个**：概览 ⌘1 / 内容 ⌘2 / 用量 ⌘3 / 设置 ⌘4；默认首页仍是概览。侧栏固定 216：顶部 38 留给 mac 交通灯，下面 logo + 小跟班，再下面 3 个一级入口；设置固定在底部，最下面三行状态摘要（服务 / 手机 / AI）。
  - **删除**：48 全局状态条、72 图标导航、系统页 4 段、会话列表页。AI 在做什么只在「概览 › 当前会话」一行（标题 + 状态/动作 + 相对时间 + 卡尾「在 DSH 打开」）；手机连接、语音输入、AI 联动、自动输入、剪贴板、关于本机、消息通道全部收进「设置」。
  - **状态摘要替代状态条**：侧栏三行短值——服务（真实端口 / 未启动）、手机（N 台 / 未连接）、AI（空闲 / 工作中 / 等你决定 / 完成 / 未联动）；服务与手机行点按进「设置 › 手机连接」，AI 行点按进「设置 › AI 联动」。概览顶部另有一张同内容的三行列表（带 chevron），点击落点相同。
  - **设置是 iOS 式 push**：首页一张分组列表（外观 + 自动输入 / 功能：手机连接、语音输入、AI 联动、剪贴板 / 关于：关于本机、消息通道），每行右侧只有一个短值；点进去是二级页，标题上方一行「‹ 设置」返回，二级页没有第二个动作；不写 URL、不引路由。
  - **页面骨架 iOS 化**：大标题 30/700（`tracking -0.022em`，右侧最多两个动作）→ 分组列表（组标题 13/400 次级灰，白卡 12 圆角，行 44、hairline 分隔）；内容区顶部 24 拖动条、左右 32 边距、最大宽 720 居中、页内滚动；按钮 13/500 三档（实心薄荷 / 浅灰 / 薄荷文字）、开关 40×24、输入框 34 高浅灰无边框；一页最多一个实心按钮。
  - **窗口与拖动**：macOS `titleBarStyle: Overlay` + `hiddenTitle`，交通灯浮在侧栏顶部 38 区域内；侧栏顶部、内容区顶部 24、二级页返回行都是拖动区（`data-tauri-drag-region`），交互元素不放进拖动区作为唯一目标。
  - **视觉令牌收进桌面作用域**：新增 `app/src/desktop/styles/ios.css`，只挂在 `.desktop-ios`。浅色：页 `#F2F2F7` / 卡 `#FFFFFF` / 主文 `#1C1C1E` / 次级 `#8A8A8E` / hairline `#E3E3E8` / 薄荷 `#0A7764`；深色：页 `#000000` / 卡 `#1C1C1E` / 主文 `#F2F2F7` / 次级 `#98989D` / hairline `#38383A` / 薄荷 `#3FC4A0`。组件只用 `bg-background` / `bg-card` / `text-muted-foreground` / `border-border` / `bg-signal` 这类语义类，桌面不写死颜色、不新增颜色变量；手机 `.mobile-clean` 不受影响，桌面字体用 `-apple-system`、不随包字体。
  - **文案红线**：不写页面说明句、不复述标题含义、不放 mono 大写装饰、不写「暂无数据 / 这里可以看到…」；只有不可逆/危险操作、安全与隐私承诺、必须的输入提示（Key、地址格式）可以留一句解释；版本行写「0.1.0 · 简约 iOS」。
  - **取代关系**：D79 的桌面 6 视图、48 状态条、72 图标导航、系统页 4 段、桌面会话页与 56 页头规则由本条取代；D82 的桌面导航顺序与 ⌘ 编号被本条取代（用量 ⌘4→⌘3，新增设置 ⌘4；用量页与价格表本身保留）；**D82 的手机「设置 › 用量」保留不变**。D80/D81 的手机两页壳与 MiSans 规则完全不变；D78 的会话工具动作文案继续用于概览「当前会话」detail 与手机会话卡；D69/D77 宠物规则不变。
- 原因：iOS 分组列表是用户最熟的「设置 / 系统」心智——一行一个值，能点整行；壳越少，状态与入口越不容易分散。状态压成三行短值 + 概览一行当前会话后，「服务在不在 / 手机连没连 / AI 在干什么」仍然在同一位置回答，但不再需要一条跨页状态条和一个独立会话页。一级从 6 降到 4，把配置类入口全部收进设置，主任务（看状态 / 剪贴板 / 用量）保持在一级。大标题 + 720 单列让 1180 窗口不再出现空荡的两栏。
- 放弃：保留状态条与图标 rail 只换皮肤（框仍然多）；保留会话列表页（与概览当前会话重复，完整信息在 DSH）；设置继续做一级整页而非 push（iOS 的页面心智就是列表 → 二级页）；改 `tokens.css` 全局换肤（会污染手机，改为桌面作用域）；给桌面随包字体（`-apple-system` 已足够且不增包体）。
- 代价：一级入口 6→4，⌘ 编号变化（用量 ⌘3、设置 ⌘4），旧习惯要重新适应；桌面不再有完整会话列表，只能看概览里最高优先级的一条当前会话；连接、语音、联动多一次点击（概览 / 侧栏状态行 → 设置二级页）；用量页已随后续收口改为同一套 ListGroup / ListRow（2×2 汇总 + 分组列表 + 趋势 + 构成），不再有状态胶囊、页脚与 mono 大写装饰；辅助功能未授权提示从内容区顶部 40px 条改为内容区左下角浮出小卡片（不占布局、不抢焦点）。
- 规范：实现契约 `docs/engineering/desktop-ios-ui.md`；产品规则 `docs/prd/shell/{INDEX,PRD,SPEC,ACCEPTANCE}.md`；前端结构 `docs/frontend-architecture.md`；实现落点 `app/src/desktop/styles/ios.css`、`app/src/desktop/{app.tsx,shell/{sidebar,list,page-header,page-shell}.tsx,lib/desktop-nav.ts,pages/*}`、`app/src-tauri/tauri.conf.json`；手机端 `.mobile-clean` 不变。
- 验证：结构与视觉契约已落地（2026-11-06，代码完成）；桌面新壳的验收用例见 `docs/prd/shell/ACCEPTANCE.md`，待真机/交互回归。

## D86 · 电脑端第二次视觉升级：Liquid Glass · iOS 26 质感层（2026-11-06，取代 D85 的视觉/材质与布局数值；D85 的信息架构继续有效）

- 背景：D85 的「简约 iOS」把结构收干净了（4 入口、分组列表、设置 push），但用户实际使用后反馈「普普通通、没有 iOS 的灵动精致」——白卡 + 灰底 + 静态列表只是「像 iOS 的设置页」，缺少 iOS 26 的层级、材质与触感。查了 Apple HIG › Materials 与 Liquid Glass 的公开描述（hierarchy / harmony / consistency；玻璃只用于导航与控件层、内容层保持不透明、同心圆角、specular 高光、弹簧动效），决定在**不改信息架构与功能行为**的前提下，做一层「Liquid Glass」质感升级。
- 决策：
  - **三层结构**：内容层（画布 + 不透明白卡 / 行 / 图表）/ 玻璃控件层（侧栏、sticky 工具栏、动作组、分段轨道、次级按钮、辅助功能提示）/ 弹层（34% 黑 + blur 遮罩、20 圆角容器）。**内容卡永远不透明**；玻璃只出现在内容「之上」或「旁边」，不叠在白卡内。
  - **侧栏 216→224 玻璃导航层**：`blur(30px) saturate(180%)` + 顶部受光渐变；导航项 34 高、圆角 9、14/500；选中项白色滑块用 spring 在入口之间 morph（stiffness 520 / damping 40 / mass 0.8）；底部设置 + 三行状态摘要不变。
  - **sticky 玻璃工具栏**：页头拆成「工具栏 + 大标题」。未滚动时工具栏透明、只显示右侧动作组；滚动 > 6px 变玻璃胶囊（高 48 / 圆角 18），左侧淡入 **17/600** 紧凑标题，**34/600** 大标题随后滚走；二级页返回在工具栏左侧并 push 进入。
  - **列表升级**：白卡 16 圆角 + 双层阴影 + 顶部 0.5px 高光；行 52–54、行标题 15/400、说明 13/400、行值 15（mono 13、tabular）；分隔线 0.5px、左缩进 16（带图标块 60）。图标从薄荷线性升级成 iOS 设置同款 **30×30 / 圆角 10 彩色图标块**（7 个 iOS system color：服务绿 / 手机蓝 / AI teal / 外观紫 / 语音橙 / 剪贴板蓝 / 关于灰；不给 tone 时退化薄荷线性图标）。
  - **控件胶囊化**：按钮全部胶囊（36 / 30 / 26 三档、13–14/500），工具栏相邻动作并进一个玻璃动作组；输入 38/11、搜索胶囊 40、checkbox 18、select 34、分段控件 = 胶囊玻璃轨道 + 白色滑块 spring（stiffness 520 / damping 38 / mass 0.7）。
  - **质感细节**：同心圆角 18（工具栏）→ 16（卡）→ 10（图标块）/ 9（导航项）→ 胶囊；玻璃 / 卡 / 按钮 / 图标块顶部 0.5–1px specular 高光；固定一层 2.6% soft-light grain（`::after`，`pointer-events: none`）；画布加两层极淡 radial 环境光（薄荷 / 鲸蓝），让玻璃有可读色差。
  - **动效**：一级页 fade 320ms、设置二级页 push 340ms、侧栏滑块 / 分段滑块 spring、行 0.996 / 按钮 0.97 / checkbox 0.94 按压缩放、弹层 300ms + 遮罩 220ms blur 入场、用量数字 400ms 补间、柱阵 420ms / 20ms 错峰；只动 `transform` / `opacity` / 颜色，不做循环装饰。
  - **兜底**：`prefers-reduced-motion` 关入场 / 过渡 / 缩放（滑块 spring 退化为 `duration: 0`）；`prefers-reduced-transparency` 玻璃去掉 `backdrop-filter`、背景退回 `--card` 实底；弹层 portal 靠 `app.tsx` 把 `.desktop-ios` 同时挂到 `<html>` 才吃得到桌面令牌。
  - **作用域不变**：全部在 `app/src/desktop/styles/ios.css` 的 `.desktop-ios`；手机 `.mobile-clean` 完全不动。
  - **取代关系**：D85 的**视觉 / 材质 / 布局数值**（216 侧栏、30/700 大标题、720 内容宽、12 圆角卡、44 行、8 圆角按钮、扁平页头）由本条取代；D85 的**信息架构**（4 入口、设置 push、删会话页 / 状态条 / 图标 rail）、文案红线与作用域隔离继续有效。手机 D80/D81 规则不变。
- 原因：用户要的不是「能用的设置页」而是「iOS 的精致感」；iOS 26 的观感来自层级（内容从玻璃下滚过）、材质（半透明 + 模糊 + 饱和度 + 高光）与动效（弹簧、按压、连续性），不是把所有东西都加圆角。把玻璃限定在控制层，既保留层次感，又不牺牲长文本列表的可读性与 WebKit 渲染预算。
- 放弃：把玻璃铺到内容卡 / 整页（可读性与性能双输，且违反 HIG「glass 是导航与控件层」）；真实窗口 vibrancy / 透明窗口（Tauri 窗口材质与对比度风险大，收益只是透出桌面）；纯装饰动效（循环粒子 / 扫描线——用户要「灵动」不是「花哨」）；手机端也用玻璃（D80/D81 已定，且真机 WebView 103 的 blur 成本不可控）；给图标块扩一整套新色（只用 7 个 iOS system color，按语义分配，避免颜色值膨胀）。
- 代价：`backdrop-filter` 在 WebKit 上有合成成本，玻璃层数要克制（侧栏 + 工具栏 + 弹层），不要在滚动内容里叠 blur；玻璃对比度依赖画布环境光，未来改背景色要重新验收；必须长期维护 reduce-motion / reduced-transparency 两套兜底；动效只能靠截图 / 目检验终态，CI 不测中间帧；间距 / 圆角等数值可能继续微调，文档以「结构 + 规则 + 关键数值」为准。
- 规范：`app/src/desktop/styles/ios.css`、`app/src/desktop/app.tsx`（`:root.desktop-ios` + `<html>` 挂类）、`app/src/desktop/shell/{page-header,page-shell,sidebar,list,segmented-control}.tsx`、`app/src/desktop/pages/{overview,content,usage,settings}-page.tsx`、`app/src/desktop/features/settings/components/accessibility-hint.tsx`、`app/src/desktop/features/clipboard/components/clipboard-section.tsx`、`app/src/desktop/features/usage/animated-number.tsx`、`docs/engineering/desktop-ios-ui.md`、`docs/prd/shell/SPEC.md`、`docs/standards/{visual,ux}.md`、`docs/frontend-architecture.md`、`scripts/qa-desktop-ios.mjs`。
- 验证：代码完成（2026-11-06）；浏览器 QA `scripts/qa-desktop-ios.mjs` 输出 36 张截图（浅 / 深 × 1180 / 960 × 4 个一级页 + 设置二级页 + 弹层）并检查横向溢出 / console error；真机窗口（交通灯位置、拖动区、玻璃观感）与 reduce-motion / reduced-transparency 目检待补。

## D87 · 电脑端窗口级材质：macOS 透明窗口 + NSVisualEffectView（2026-11-06，补充 D86）

- 背景：D86 的玻璃是 CSS 自绘（blur 自己的环境光），没有「桌面/窗口后面的东西透进来」的真实材质，观感仍差 macOS 一档。用户看完 D86 后要求继续往「灵动精致」走，于是补一层系统材质。
- 决策：
  - 新增**平台专属** `app/src-tauri/tauri.macos.conf.json`：`app.macOSPrivateApi: true` + window `transparent: true` + `windowEffects: { effects: ["underWindowBackground"], state: "followsWindowActiveState" }`；**基础 `tauri.conf.json` 不动**，Android 不会跟着变透明。
  - 前端检测：`app/index.html` 的内联脚本在「真实 Tauri（`__TAURI_INTERNALS__.metadata` 存在）+ macOS UA + localStorage 未设 `sidekick:vibrancy=off`」时给 `<html>` 加 `.dsl-vibrancy`。浏览器 dev mock 没有 `metadata`，不触发，仍是 D86 的自绘玻璃。
  - CSS 分层：`.dsl-vibrancy` 下 `html`/`body`/根 div 透明；内容区 `.dsl-main` 自己铺不透明底色 + 环境光（保证文字对比度）；侧栏只留轻薄白色 tint（浅 0.3→0.07、深 0.1→0.02），去掉 `backdrop-filter`（原生材质已经在模糊）；`prefers-reduced-transparency: reduce` 时侧栏退回 `--sidebar` 实色。
  - 回退链：非 macOS / 浏览器 / 检测失败 / 手动关闭 → 无 `.dsl-vibrancy` → D86 自绘玻璃；窗口失焦时系统材质自动变浅（`followsWindowActiveState`）。
- 原因：要让侧栏「真的是玻璃」，材质层必须在 WebView 之后、窗口最底层；只有透明窗口 + NSVisualEffectView 能做到。只让侧栏透明、内容区不透明，能同时保住可读性和材质感。
- 放弃：整窗全透明（内容可读性崩、文字飘在桌面上）；用 CSS 模拟「桌面模糊」（没有真实桌面内容可模糊）；把透明配置写进基础 `tauri.conf.json`（Android 也会透明）；自绘一套假颗粒纹理冒充材质（D86 的 grain 只是点缀）。
- 代价：用了 macOS Private API（`macOSPrivateApi`），正式分发/签名前要回归；窗口合成成本略升；**无头环境验证不了真实材质**，必须人工 `pnpm tauri dev` 目检（透明侧栏、失焦变暗、深浅主题、缩放、拖动）。
- 规范：`app/src-tauri/tauri.macos.conf.json`、`app/index.html`、`app/src/desktop/app.tsx`（`.dsl-main`）、`app/src/desktop/styles/ios.css`（`.dsl-vibrancy` 段）、`scripts/qa-desktop-ios.mjs`（检测表达式 + CSS 契约校验）、`docs/engineering/desktop-ios-ui.md`。

## D88 · 电脑端菜单栏常驻：关窗隐藏 + Dock 图标隐藏 + 右键退出（2026-11-06，取代「关窗即退出」）

- 背景：用户要求「评估电脑端做一个后台常驻、显示到状态栏的功能」。评估中发现这不是装饰性需求——现状关窗即退出会把 HTTP 服务（47810+）、UDP 发现（47820）、DSH hook 回环桥（47815–47819）一起带走，用户关窗后手机连不上、AI 状态断更。菜单栏图标是把桌面端变成「常驻服务」的入口。
- 决策（用户明确选择 v1 形态）：
  - **只显示图标**：菜单栏不放文字/状态标题，v1 不做「等你回答」换图标；图标是 36×36 单色模板图（猫头剪影 + 眼睛镂空，`icon_as_template(true)` 自动适配浅/深菜单栏）。
  - **不保留 Dock 图标**：`ActivationPolicy::Accessory`，App 不出现在 Dock 与 Cmd+Tab，也没有 App 菜单（⌘Q 不可用）。
  - **不做设置开关**：默认就常驻，不加「关窗时隐藏」设置项，避免设置页与持久化成本。
  - **退出只在菜单栏**：左键图标显示/激活主窗口，**右键菜单**提供「显示主窗口 / 退出 Sidekick」；窗口关闭按钮 = 隐藏窗口（`CloseRequested` → `prevent_close` + `hide`）。
  - 回退：托盘创建失败时 `TRAY_READY=false`，关闭按钮退回「关窗即退出」，绝不让用户进入「无窗口、无图标、无退出入口」的死局。
- 实现：`app/src-tauri/src/tray.rs`（托盘/菜单/点击/`show_main_window`）、`lib.rs`（setup 设 Accessory、建托盘、首次把窗口叫前台；`on_window_event` 拦 `CloseRequested`；单实例回调复用 `show_main_window`）、`Cargo.toml` 仅在桌面目标开 `tauri` 的 `tray-icon` + `image-png` feature（Android 不带 tray 依赖）、`app/src-tauri/icons/tray.png`、`scripts/gen-tray-icon.py`（从 `brand/logo-favicon.svg` 几何重生成）。
- 原因：常驻后手机连接、AI 状态、剪贴板监听、语音/价格后台任务在窗口关掉后继续可用；菜单栏图标是 Accessory 应用唯一可见入口，所以必须先有它再隐藏 Dock。
- 放弃：保留 Dock + 只加托盘（用户明确不要 Dock）；菜单栏显示状态文字（占空间、v1 只放图标）；关窗时弹「仍在后台运行」提示（多余）；用彩色 logo 当托盘图标（模板图下变纯色块）；用 `LSUIElement` 写 Info.plist（Tauri 侧 `set_activation_policy` 即可，打包配置不用改）。
- 代价：没有 ⌘Q / Cmd+Tab / App 菜单，退出只能右键菜单；隐藏窗口的 WebView 仍占内存（约 100–200MB）；**无头环境截不到菜单栏与模板图反色，必须人工 `pnpm tauri dev` 目检**。
- 规范：`docs/engineering/desktop-tray.md`、`app/src-tauri/src/tray.rs`、`app/src-tauri/src/lib.rs`、`app/src-tauri/Cargo.toml`、`scripts/gen-tray-icon.py`、`AGENTS.md`（关窗行为与已知坑）。

## D89 · Q 弹动效：弹簧降到 ζ≈0.59（过冲 10%）+ 手机端补回弹（2026-11-06，调整 D86 的弹簧参数与 D80 的手机壳动效）

- 背景：用户提出「想要那种 Q 弹的动画」，并先问了现有动画到底有没有在用。实测现状：桌面 8 处 Motion 全在跑，但 damping 40/38 使 ζ≈0.98–1.0（几乎不回弹）；页面/弹层是单段缓出；按压只有单向缩放。手机端一处 Motion 都没有，结果卡硬切出现，麦克风钮的 `active:scale-*` 在 WebView 103 上根本不生效（Tailwind v4 编译成 `scale` 属性）。
- 决策（用户选择：两端都做、过冲 10%）：
  - 桌面只做**控件层**：新增 `desktop/lib/motion.ts` 的 `SPRING_SLIDE`（520 / 24 / 0.8，ζ≈0.59、过冲 10%）与 `SPRING_POP`（520 / 20 / 0.6，过冲 12%），侧栏滑块、分段滑块、剪贴板复制勾共用；按压改成「按下 90ms 快进 `--press-in`、松手 320ms back-out 回弹」，行 0.985 / 按钮 0.94 / checkbox 0.9 / 导航项 0.965；弹层 320ms 同曲线（过冲到约 1.03）。
  - 页面 fade / push **不加过冲**：730 宽内容列整体回弹会晕，转场只负责层级。
  - 手机不引 Motion（全量 72KB gzip，且 WebView 103 的 rAF 驱动有掉帧风险），在 `clean.css` 用 CSS back-out `cubic-bezier(0.34, 1.56, 0.64, 1)`：结果卡 300ms pop-in、会话行 260ms + 24ms 错峰、麦克风圆钮按下 0.92（写 `transform`，绕开不支持的 `scale` 属性）、开关滑块改 `transform` 320ms（原来用 `left`，硬切）。
  - 宠物本体不动：图集不重绘、不加 filter 是红线，Q 弹只做控件与容器层。
- 原因：Q 弹的物理量是阻尼比而不是时长——ζ 0.55–0.7 才有 8%–13% 的一次过冲；原参数 ζ≈1 是「稳」，只改时长只能变快慢、变不出回弹。
- 放弃：全站统一弹簧（页面转场也弹，晕）；手机引入 Motion（包体 + 兼容风险）；CSS `linear()` 造弹簧（WebView 113+ 才有，103 不支持）；给鲸鱼加 scale/squash（红线，且与帧动画叠加会显廉价）。
- 代价：回弹更抢注意力，频繁操作时可能觉得「多动」；桌面 `--spring-back` 是 CSS 曲线、Motion 是物理弹簧，两边只能对齐过冲量，手感不能完全一致。真机 / 真窗口手感必须人工目检，无头环境验证不了。
- 规范：`app/src/desktop/lib/motion.ts`（+ `motion.test.ts` 用 ζ/过冲公式守住区间）、`app/src/desktop/styles/ios.css`（`--spring-back` / `--press-in` / 按压 / 弹层 / reduce-motion）、`app/src/mobile/styles/clean.css`、`mic-button.tsx`、`session-row.tsx`、`toggle.tsx`、`docs/engineering/desktop-ios-ui.md` §6、`docs/prd/shell/{PRD,SPEC}.md`。

## D90 · 手机设置页字号/间距收敛：回到 15 号 + 加大留白（2026-11-06，调整 D80/D81 的实现值）

- 背景：用户在真机上看设置页，反馈「文字太大、跟老年机一样；文字之间留白不够；按钮/切换 tab 距离太近；整体没有留白美学」。
- 实测：代码里行标题是 `text-base`（16px）、行高 20（1.25），说明 13/17 且与标题只隔 1px、分段控件高 44 且段间隙 2px、卡片间距 14——远离 D80 写的 15 号，且密度偏大。
- 决策：行标题 16/20 → **15/21**；说明 13/17 → **13/19**，与标题间距 1 → **4**；段落说明 13/18 → **13/20**；单行卡片行高 48 → **56**、双行 52 → **60**；左右内边距 14 → **16**；卡片间距 14 → **20**；分段控件高 44 → **36**、段间隙 2 → **4**、轨道内边距 2 → **3**；行内分段不再固定 180px，改为按内容自适应展开（`fit`：跟随系统 72px / 浅色·深色 46px，选项内边距 10px，杜绝「跟随系统」贴边）；块内分段仍三等分铺满；标签与控件间距 10 → **16**；首用清单展开卡内边距/步骤间距同步放大。
- 原因：16px（1.25 行高）+ 1px 标题说明间距 + 44 高分段的组合是「老年机」感的主要来源；字号回到 15 并拉开留白后，同屏信息量不变、呼吸感明显。
- 放弃：全局缩字号（宠物页/结果卡不跟随）、用 500/600 字重做层级（仍是 400）。
- 代价：设置页整体高度约 +8%，一屏能看到的组数略少。
- 规范：`app/src/mobile/features/settings/more-page.tsx`（真机实测 15/21、gap 20、段高 36/gap 4）。

## D91 · 手机字体改用 HarmonyOS Sans SC（2026-11-06，取代 D81 的 MiSans 部分；D81 的字号/行高规则继续有效）

- 背景：D81 曾在 MiSans 与 HarmonyOS Sans 之间选了 MiSans；用户看过真机设置页后明确表示「我喜欢鸿蒙字体」。
- 决策：手机端随包 **HarmonyOS Sans SC Regular（400）原始 TTF，8.1 MB，未做任何改动**（不转 WOFF2、不 subset），`clean.css` `@font-face` + `.mobile-clean` 首选，系统字体做缺字回退；桌面不加载。删除 `MiSans-Normal.woff2`（−3.9 MB），APK 净增约 4 MB。
- 许可：《HarmonyOS Sans 字体许可协议》允许免费商用/嵌入/随软件分发，但要求注明使用、不得修改字体、不得单独再分发或销售——所以**不能像 MiSans 那样把 TTF 转成 WOFF2**；软件内注明在「设置 › 数据与关于」，来源与协议记在 `app/src/mobile/assets/fonts/README.md`。
- 原因：用户偏好；鸿蒙字体的字形更几何、字面比 MiSans 略窄，15/400 下「老年机」感更弱。
- 代价：字体 3.9 MB → 8.1 MB；冷启动首次字体加载约 430 ms（`font-display: swap`，先系统字体后替换），TTF 解析峰值内存略升。
- 规范：`app/src/mobile/assets/fonts/HarmonyOS_SansSC_Regular.ttf`、`app/src/mobile/assets/fonts/README.md`、`app/src/mobile/styles/clean.css`、`app/src/mobile/features/settings/more-page.tsx`（关于行）、`docs/prd/shell/SPEC.md`；真机 BKQ-AN10 用 CDP `CSS.getPlatformFontsForNode` 确认实际渲染为 `HarmonyOS Sans SC`。

## D92 · 首用清单 ③④ 改为桌面真实状态上报（2026-11-06，取代 D79/D80 的「手机不显示 ③④ 完成态」）

- 背景：用户反馈「电脑上明明配置了百炼 AK（API Key）、手机语音也能正常识别，但手机设置页的首用清单仍显示 ③ 百炼未完成、还差 2 步」。排查确认是产品规则而非识别故障：手机只能本地判断 ① 连接 / ② 麦克风（`micReady`），③ 百炼 Key / ④ 辅助功能固定写死 `done: false` +「在电脑上完成」，banner 永远「还差 2 步」；只要电脑配置过，显示就与事实矛盾。
- 决策：
  - 新增桌面 → 手机消息 `desktop.status`（v1）：`{ asrConfigured, asrHasKey, accessibilityTrusted, ts }`，**只有布尔 + 时间戳**，不含 Key、掩码、路径、提示词。`asrConfigured` = 已同意上传 + 已保存 Key + 地址/模型校验通过；`accessibilityTrusted` = macOS 辅助功能已授权（非 macOS 恒 false）。
  - 发送时机：新客户端连接时直发；手机发 `status.request` 时随 `status` 快照一起广播。手机在连接成功、回前台、打开设置页时各拉一次，所以电脑改配置后无需重装 App。
  - 手机首用清单 done 改为 `① + ② + ③ + ④` 的真实值：③④ 只在桌面明确上报 `true` 时显示「已完成」；false / 未知（旧桌面不发）仍显示「在电脑上完成」；全部完成时 banner 从「还差 N 步」变为「首用清单 · 已完成」。
  - ③ 的完成条件从「已保存 Key 且测试通过」改为「`asrConfigured = true`」：测试结果不落盘、无法跨重启复现，配置校验（同意 + Key + 地址/模型）才是可长期上报的真实状态。
- 原因：用户要的是「手机显示与电脑事实一致」。用真实状态上报既满足诉求，也保留原红线「不伪造完成态」——手机只渲染桌面明确上报的值，未知一律降级为「在电脑上完成」。
- 放弃：只改文案/不把 ③④ 计入步数（手机仍无法回答「到底配了没有」）；靠手机端「录音成功过一次」反推 ③（要等用户先录一次，且无法覆盖 ④；只作为旧桌面兜底也不如直接上报准确）；把整个 `asr.json` 配置或 Key 掩码发上手机（隐私红线，且手机不需要）。
- 代价：协议多一种消息（旧手机忽略、旧桌面不发，双向兼容）；辅助功能在 TCC 里变化后要等下一次快照才更新（不实时，接受）。
- 规范：`protocol/README.md`（desktop.status）、`app/src-tauri/src/desktop_server.rs`、`app/src/protocol/messages.ts`、`app/src/mobile/features/first-use/store.ts`、`app/src/mobile/app.tsx`、`app/src/mobile/features/settings/more-page.tsx`、`docs/prd/shell/{PRD,SPEC,ACCEPTANCE}.md`。

## D93 · 手机顶栏重排：连接状态收成信号塔图标 + 今日用量上顶栏（2026-11-06，调整 D80 顶栏三件套与 D82 的手机用量入口）

- 背景：用户在真机上觉得顶栏「已连接 · 局域网」字号大、占位多，连接状态并不是宠物页的主要信息；同时 Token 用量藏在「设置 › 用量」里太深，看今天花了多少要先点 gear 再点用量。
- 决策：
  - 顶栏从「gear / 连接状态 / chat」三件套改为四件套：左 gear + **连接状态信号塔图标**（lucide `RadioTower` 20，薄荷 `--signal`；连上只显示图标、不写文字，44 热区 → 连接页）；右侧 **今日用量数字**（13/400 tabular，今天花费 `¥x.xx` / 估算 `≈¥x.xx`；无快照 / 账本缺失 / 缺价退回 `Gauge` 图标，44 热区 → 用量页）+ chat。
  - 没连上时图标旁补最短状态词（连接中 / 重连中 / 重连 Ns / 未连接）；**完整固定文案**（已连接 · 局域网、还没连上电脑、N 秒后重连…）保留在 `aria-label` 与连接页，读屏可达、状态词表不丢。
  - 用量入口从「设置 › 用量」上移为顶栏数字；设置页删除该分组（不保留双入口）；用量页返回从「回设置」改为「回宠物」，Android 返回键同步 `usage → pet`。
  - `usage-store` 新增独立 `today` 快照与静默 `requestToday()`：连上、回前台各拉一次 `usage.request(today)`，与用量页当前区间互不影响；请求失败 / 超时只保持图标态，不弹错、不显示假数字。
- 原因：连接状态是「不出事就不用看」的信息，图标 + 颜色（薄荷 / 中性灰）足够；Token 花费是用户高频想瞄一眼的数字，放在宠物页顶栏一眼可见，点一下就是完整看板。
- 放弃：连接状态只换小字不换图标（仍占横向空间、仍不是主信息）；顶栏只放用量图标不显示数字（看不出「今天花了多少」，还要多点一次）；设置页保留用量入口（两个入口冗余，且用户明确说「太深」）；用量数字放宠物舞台 / 会话卡（会被鲸鱼和会话卡挤，且不随页面常驻）。
- 代价：顶栏从 3 个热区变 4 个，320 宽下右侧更满（实测用量数字最宽约 92px 截断，390/320 均无横向溢出）；「已连接」不再有可见文字，色弱用户只能靠图标形状 + `aria-label`（连接页仍有完整文字），可接受；用量数字只代表「今天」且不实时刷新（连接 / 回前台各一次）。
- 规范：`app/src/mobile/shell/pet-top-bar.tsx`、`app/src/mobile/features/connect/connection-view.ts`（`shortLabel`）、`app/src/mobile/features/usage/{usage-store,usage-page}.ts(x)`、`app/src/mobile/app.tsx`、`app/src/mobile/features/settings/more-page.tsx`、`app/src/mobile/ui-store.ts`、`docs/prd/shell/{PRD,SPEC,ACCEPTANCE,INDEX}.md`、`docs/prd/usage/*`、`docs/standards/{ux,visual}.md`、`AGENTS.md`。

## D94 · 语音提升为一级页 + 关键词列表（2026-11-06，取代 D85 的「4 个一级入口」与「语音在设置」部分）

- 背景：用户反馈语音配置埋在「设置 › 语音输入」二级页太深，要求挪到左侧 tab 栏并重新设计，让功能更显现；同时想输入领域关键词提升识别率。官方即时热词 `parameters.vocabulary` 最多 2000 个，普通词权重官方推荐 4。
- 决策：
  - 一级导航改为 **5 个：概览 ⌘1 / 语音 ⌘2 / 内容 ⌘3 / 用量 ⌘4 / 设置 ⌘5**，设置仍固定在侧栏底部；语音未配置时导航项右侧一颗 6px 琥珀点。
  - 语音根页只做枢纽：未配置玻璃提示卡（可选）+ 百炼状态（模型 · 语言）、关键词计数（`N / 2000`）、今天/近 7 天用量；**配置表单不占首屏**。配置、关键词、语音用量分别用 `PageShell transition="push"` 进二级页（返回「‹ 语音」）。
  - 关键词是**单一扁平列表**：页面一行一个词，点「加一行」增加一行、点「保存」写入 `bailian.vocabulary`；不做分组/启停/权重/导入导出。所有关键词统一按即时热词权重 `4` 发送；最多 2000 个；含非 ASCII 字符 ≤15 字、纯 ASCII 按空格 ≤7 段。
  - 存储仍在 `~/.sidekick/asr.json`（0600）的 `bailian.vocabulary`，version 仍为 1；2026-11-06 中间版本写下的 `bailian.dictionaries` 只在读取时平铺进 `vocabulary`，随后丢弃。
  - 新增命令 `asr_keywords_save` 只替换关键词，不触碰同意状态、API Key 与其他识别参数；空列表时 `run-task` 不带 `vocabulary`。
  - 设置首页删除「语音输入」行，`SettingsSection` 去掉 `voice`；原 `ModelsSection` 删除，`CloudAsrForm` 与 `UsageStatsPanel` 直接挂在语音二级页。
- 原因：语音是本产品核心动作，状态/关键词/费用应当一级可见；用户明确要「一行一个词 + 加号加行」的简单表单，不需要词典分组。
- 放弃：多词典分组/启停/权重 UI（用户明确不要，后端也不保留）；预编译热词表 `vocabulary_id`（单机没必要）；`input.context` 上下文增强（计输入 token，后置）；按前台应用自动切换关键词（后续做）。
- 代价：⌘2/⌘3 从「内容/用量」迁移到「语音/内容」，一次性刷新文档与测试；5 个一级页比 4 个更满；2000 词会增大 run-task 首包，需实测会话启动延迟；`language_hints` 只含 `zh` 时英文关键词可能被官方过滤（文档提示，不做自动改语言）。
- 规范：`app/src/desktop/{lib/desktop-nav.ts,pages/voice-page.tsx,shell/sidebar.tsx,pages/settings-page.tsx}`、`app/src/desktop/features/models/{keywords.ts,keywords-page.tsx,cloud-asr-form.tsx,usage-stats.tsx,cloud-asr-store.ts}`、`app/src-tauri/src/{asr_config.rs,bailian_asr.rs,asr_cloud.rs,lib.rs}`、`app/src/shared/lib/tauri.ts`、`app/src/dev/tauri-mock.ts`、`scripts/qa-desktop-ios.mjs`、`docs/engineering/{desktop-ios-ui.md,asr-model.md,asr-cloud-bailian.md}`、`docs/prd/mic/*`、`docs/prd/shell/*`。

## D95 · 手机会话清除改为「左滑露出清除按钮」：移除 ×、去掉 asking 二次确认（2026-11-06，取代 D80 的「每行右侧 ×」）

- 背景：用户在真机上觉得会话行右侧 28×28 的 × 又小又贴行主区域，非 asking 行点一次就直接清除，误触成本高；想要 iOS/微信式「左滑 → 露出删除按钮 → 点按钮清除」。
- 决策：
  - **移除视觉 ×**；行内容左滑 72px，露出右侧 72×52 的红色「清除」按钮（`bg-destructive`），点按钮才清除。一次只开一行；点行外、展开/收起列表、该行消失（含自动隐藏）时自动收起；行展开时点行内容先收起、不触发 asking 跳转。
  - **去掉 asking 行的「再点一次」二次确认**：左滑 + 点按钮已经是两步，`session-store` 的 `pendingClearId` / 3 秒确认定时器一并删除。
  - 手势自己写（`use-swipe-row.ts`），不引第三方库：Pointer Events + `transform: translate3d`，拖动期间直接改 DOM style、不走 setState；水平位移超过 8px 才 `setPointerCapture`，避免 Chrome 把 click 重定向到捕获元素；位移 > 8px 后吞掉本次 click；松手按「最终位移 ≥ 40% 或快速左滑」吸附；`prefers-reduced-motion` 时去掉过渡。
  - 清除按钮常驻 DOM 且可聚焦（`aria-label="清除会话 {标题}"`），TalkBack/键盘聚焦时自动展开，作为滑动手势的无障碍兜底；文案用「清除」不是「删除」（只清手机端状态，新事件会再出现）。
- 原因：滑动 + 点按钮比单点 × 更不容易误触，72×52 也补上了 × 28×28 低于 44px 热区的问题；行尾更干净。
- 放弃：`react-swipeable-list`（MIT、ESM 约 7.3KB gzip，但 2024-10 后未更新、单维护者，且 `import PropTypes from "prop-types"` 却没声明依赖，项目里也没有 prop-types）；`react-swipeable` / `@use-gesture/react`（只做手势识别，位移/开合/点击抑制仍要自己写）；Motion（D89 已明确手机不引，72KB gzip + WebView 103 rAF 风险）；CSS scroll-snap（开合状态与点击抑制更难控）；全滑直接删除（没有撤销，危险）；保留 × 作为兜底（视觉重复，且与「左滑」两条路径）。
- 代价：可发现性变差（本次不做首次提示，后续可补）；TalkBack 左右滑是读屏导航手势，只能靠聚焦兜底；Android 10+ 从屏幕右边缘向内滑 = 返回，行最右侧起手可能被系统抢（真机验证，必要时再评估原生 `setSystemGestureExclusionRects`，本次不做）。
- 规范：`app/src/mobile/features/sessions/{use-swipe-row.ts,session-row.tsx,session-feed.tsx,session-store.ts}`、`app/src/mobile/features/pet/pet-page.tsx`、`app/src/mobile/styles/clean.css`、`app/src/shared/lib/sessions.ts`、相关测试、`docs/prd/hook/{PRD,SPEC,ACCEPTANCE}.md`、`docs/prd/shell/{PRD,SPEC,ACCEPTANCE}.md`、`docs/design/mobile-ui-v16/README.md`、`AGENTS.md`。

## D96 · 已完成会话 2 小时无新事件自动隐藏（2026-11-06）

- 背景：用户要求「已经完成的会话，如果 2 个小时没有操作，就自动清除掉」——完成的会话不必一直占着宠物页会话卡。
- 决策：
  - 只对 `display === "completed"` 的会话生效；从 `completedAt`（缺失时回退 `lastEventAt`）起算，`now - completedAt >= 2h` 即隐藏（正好 2 小时算超时）；working / asking / idle 永不被自动隐藏。
  - **按快照派生过滤，不写 `cleared` 标记、不落盘、不弹提示、不触感**：`visibleSessions` 增加可选参数 `{ now, autoClearCompletedAfterMs }`，手机宠物页传 2 小时；桌面调用不传，保持「完成态一直保留到手动清除」的旧行为。
  - 刷新：`useSessionClock` 每 60 秒更新 `now`，回前台（`visibilitychange`）立即刷新；宠物页挂载时立即计算，所以最多延迟 1 分钟感知到期。重启/断连后按快照重新计算，不依赖内存计时。
  - 有新事件（状态变 working/asking，或 completedAt 更新）后自然重新出现；再次完成从新的 `completedAt` 重新计时。
- 原因：不落盘避免 `sidekick-sessions.json` 的 7 天标记 TTL、持久化写入与重启后不一致；派生规则可重复计算、无副作用；只影响手机列表，不改变电脑端会话或宠物 AI 聚合态。
- 放弃：写清除标记（TTL/落盘副作用、还要处理自动清除提示）；桌面桥过滤（会影响桌面概览）；为每个会话排精确 `setTimeout`（后台节流、快照更新时重排，复杂度不值）；做成设置项（用户明确要固定 2 小时，先固定）。
- 代价：最多 60 秒延迟；只隐藏手机列表，电脑端仍保留该会话；后台定时器被节流时靠回前台刷新兜底。
- 规范：`app/src/shared/lib/sessions.ts`、`app/src/mobile/features/sessions/{session-store.ts,use-session-clock.ts}`、`app/src/mobile/features/pet/pet-page.tsx`、`app/src/shared/lib/sessions.test.ts`、`app/src/mobile/features/pet/pet-page.test.tsx`、`docs/prd/hook/{PRD,SPEC,ACCEPTANCE}.md`、`docs/prd/shell/{PRD,SPEC,ACCEPTANCE}.md`、`AGENTS.md`。

## D97 · 电脑端「用量」页重做：深潜仪表 / 花费剖面（2026-11-06，取代 D82/D85 的 2×2 卡片与 730 单列用量页）

- 背景：用户明确说电脑端用量页「太丑」，希望 Token 消耗这一块有视觉设计；先出 HTML 视觉稿确认「深潜仪表」方向（宽幅、花费当主角、花费剖面曲线、Token 光谱、带占比条的账本），确认后落地。用量页是 D85 之后第一个从 iOS 分组列表里独立出来的**宽幅数据页**。
- 决策：
  - 页面骨架：`PageShell` 新增 `size="wide"`（`max-w-[956px]`，1180 窗内左右 28 后约 900 内容）与 `tone="usage"`（滚动容器铺深海/海玻璃画布，`html.dsl-vibrancy` 下退透明）；`PageHeader` 新增 `compact`（不渲染 34/600 大标题，工具栏 17/600 标题常显，保留 `sr-only h1`）。
  - 内容：花费 hero（58px 等宽数字 + `≈` + 环比 + 区间日期）→ 花费剖面（当前区间 `days`、y 轴取整刻度、日均虚线、峰值标注、今天呼吸点/末段虚线、单日柱 + 昨日基准、悬停气泡、sr-only 每日表）→ Token 光谱（五桶、最大余数百分比、缓存读薄荷 c1）+ 分组账本（行内按金额降序、占比小柱、价格行贴底）→ 价格表 Sheet（行为不变）。
  - 去掉：2×2 汇总卡、胶囊分段、固定近 30 天柱阵、五行 Token 构成列表、页脚/说明句；区间与分组改成下划线 tab（`aria-pressed`）。
  - 令牌/样式：新增 `app/src/desktop/styles/usage.css`（`.dsl-usage` 作用域，浅/深 `--usage-*`、`.dsl-num` 等宽数字、画布、图表/账本/状态；宽 1080 断点下 hero 换行、下半区单列）；`app.tsx` 在 `ios.css` 之后引入；**不改 `tokens.css`，不把用量页颜色塞回 ios.css**。
  - 共享纯函数：`app/src/shared/lib/usage-chart.ts`（刻度/路径/日期/环比/构成百分比/占比/排序），桌面与手机共用；`TOKEN_PART_COLORS` 不再用于新页面（缓存读固定 c1）。
  - Dev mock 改成按区间生成连续日 + 自洽 `previous` + 五桶，浏览器验收与截图才有可信曲线。
  - 明确不做：视觉稿里的主题切换按钮（正式主题仍走设置/系统）、视觉稿的 4 项导航（现为 D94 的 5 项）、图表库、协议/Rust/后端改动。
- 原因：花费是用户看用量时的第一问题，2×2 卡片把花费、Token、会话、命中率平权，反而没有主角；线性剖面 + 取整刻度 + 今日/单日处理能把「这个月/这周的形状」讲清楚；无卡片和等宽数字让数据页和 iOS 设置页拉开层次，同时保留壳层玻璃与侧栏，不破坏 D85/D86。
- 放弃：保留 730 单列只换卡片样式（数据密度不够，视觉稿的核心是宽幅剖面）；用 ECharts/Recharts（新依赖 + 体积/主题适配成本，且只需要一条线）；继续 div 柱阵（30/180 天的柱宽与今日点表达不了形状）；保留胶囊分段（与“仪表”气质不符，且同页两组 tab 需要统一）；把 delta/坐标轴/占比条继续列为禁止（用户已确认视觉稿）。
- 代价：用量页是 730 单列的**明确例外**，与契约 v3 记录；后端 Top 8 仍按 Token 选取，前端只在返回行内按金额排序并标「按花费」（后续要改后端另立决策，会影响手机）；等宽数字依赖系统 SF Mono/Menlo 回退；SVG 图表需要自管 a11y、reduced-motion 与 jsdom 不可断言的几何。
- 规范：`app/src/desktop/{styles/usage.css,pages/usage-page.tsx,shell/page-shell.tsx,shell/page-header.tsx,app.tsx}`、`app/src/desktop/features/usage/{usage-tabs,usage-hero,spend-profile,token-composition,group-ledger}.tsx`、`app/src/shared/lib/usage-chart.ts`、`app/src/dev/tauri-mock.ts`、`app/src/desktop/pages/usage-page.test.tsx`、`app/src/shared/lib/usage-chart.test.ts`、`scripts/qa-desktop-ios.mjs`、`docs/prd/usage/{SPEC,ACCEPTANCE,PRD}.md`、`docs/engineering/desktop-ios-ui.md`、`docs/design/usage-dashboard-v2/`、`AGENTS.md`。

## D98 · 手机端「用量」页重做：紧凑仪表 / 可拖动花费剖面（2026-11-06，取代 D80 用量页的卡片堆叠与固定 14 天柱阵）

- 背景：桌面用量页重做后，用户问「手机端是不是也要重新设计一下」。结论是**要，但只重做「用量」页**：手机壳（宠物页/设置/顶栏）刚经 D80/D91/D93/D95/D96 打磨并在真机验证，重做整机是 churn；真正对不上的是用量页——Token 当主角、固定 14 天柱、缓存读蓝色、卡片堆叠，与桌面的数据语言分裂。
- 决策：
  - 页面骨架：页头沿用 `PageHeader`（返回宠物 + 「用量」+ 副行），正文**无白卡**、hairline 分区；区间与分组改成下划线 tab（区间 44 高、分组 36 视觉 / 44 命中）；320–430 宽、竖屏单布局。
  - 内容：花费 hero（40–42 等宽 + 环比 + Token/会话/缓存三读数）→ 当前区间花费剖面（150 高、无 y 轴、峰标 ≤31 点、今天点/末段虚线、单日柱 + 昨日基准、触摸拖动气泡）→ 8px Token 光谱 + 5 行（缓存读薄荷 `--mu-c1`）→ 按花费排序的账本（行底 3px 占比条）→ 只读价格行 → 隐私一行。
  - 交互：`touch-action: pan-y`；水平位移 >8px 才捕获指针；原地轻点也出气泡；松手 1.2s 收起；不 preventDefault 纵向滚动；拖动后吞掉一次 click。
  - 样式：新增 `app/src/mobile/styles/usage.css`（`.mobile-usage` 作用域，浅/深 `--mu-*` 令牌），`entries/mobile.tsx` 在 `clean.css` 后引入；**不改 `clean.css`**（当时有未提交的麦克风改动，避免混写）。
  - 共享：图表坐标/路径/日期/环比/百分比/排序复用 `app/src/shared/lib/usage-chart.ts`；手机不引 Motion（WebView 103 与体积考虑），描线用 CSS `pathLength` + `useReducedMotion` 退化。
  - Dev mock：`send_usage_request` 也认 `?usage=empty`，手机账本缺失态可在浏览器截图；不再只有单测覆盖。
  - 明确不做：重做宠物页/设置/顶栏；手机价格面板与刷新；把手机强行套成桌面 900 宽布局；循环呼吸动画（OLED，D58/D89）。
- 原因：用量是用户打开手机看数据的核心场景，花费应该当主角；当前区间剖面比固定 14 天更能回答「这周/这个月怎么样」；无卡片 + 等宽数字 + 薄荷光谱与桌面同源，但保留手机的 44dp、触摸、纵向滚动与 WebView 103 约束。
- 放弃：整机重做（风险/收益倒挂）；保留卡片 + 只换配色（数据密度不够）；保留 Token hero（与桌面相反）；加 y 轴（390 宽太挤，峰标 + 日均 + 气泡已够）；真呼吸循环（手机红线不做循环动画，改静态柔光 halo）；引 Motion（D89 已定手机不引）；改 `clean.css`（在途改动冲突）。
- 代价：手机用量页是「无卡片」的页面级例外，与其它页的卡片语言不同；无 y 轴导致绝对值只能靠读数/气泡；后端 Top 8 仍按 Token 选取；真机（Realme WebView 103 / Honor）尚未走查，需补；切区间沿用 store 语义会短暂出现「正在读账本…」。
- 规范：`app/src/mobile/features/usage/{usage-page.tsx,spend-profile.tsx,usage-page.test.tsx}`、`app/src/mobile/styles/usage.css`、`app/src/entries/mobile.tsx`、`app/src/dev/tauri-mock.ts`、`docs/prd/usage/{SPEC,ACCEPTANCE,PRD}.md`、`docs/design/usage-dashboard-v2/`、`AGENTS.md`。

## D99 · App 图标与品牌标记换成「随身卡」（2026-11-06，取代猫头 logo / 爪印方向与 D88 的猫头托盘图）

- 背景：用户要重做 App 图标，先后否掉紫色底、带脸角色 IP、以爪印为起点，并把判据说明白——**图标要让人认得出它管的是什么东西**，光有情绪没有所指不行。随后用户自己给出卡片方向：手机本身像一张卡，这张卡同时有工卡、录音卡、备忘录三重读法，正好对上产品的汇报 / 语音输入 / 剪贴板三件事。过程稿留在 `brand/icon-drafts/card-round/`（定稿批 + `wallpaper-test.py` 真实壁纸评审表 + `build-check.py` 落盘产物核对表，已 gitignore、不入库）；更早的爪印、角色、灰底概念批与徽章批评审完即清理。
- 决策：
  - **标记是「一张随身卡」**：贴顶边的穿透挂孔（工卡）+ 左上斜切一角（SIM / 录音卡的机械感）+ 右下**一颗琥珀灯**（REC / 待命 / 为你亮着）；卡身歪 3.5°（正的像证件，歪的像随身物）；底色深青 `#0F3A3E`，灯是画面里唯一的高彩度元素。
  - **母版双轨**：App 图标母版用位图 `brand/appicon.png`（1024 满幅、无透明通道、不烤圆角，遮罩交给系统）；小尺寸（favicon 16–32、侧栏 22、托盘 36 单色）用矢量几何派生，保持锐利。两份同源，唯一事实源是 `scripts/gen-brand-mark.py`。
  - **三条图标规则**（本轮踩出来的，后续每个新图标都适用）：差异必须长在**轮廓**上，不能长在内部细节里（内部细节在 40px 第一批死掉）；底色必须和壁纸**抢边界**，选中深值带彩度，禁止中性对比底；**玻璃不能当图标材质**（玻璃靠极小明度差，而 40px 只吃明度差）。
  - **Android 自适应图标修正**：`pnpm tauri icon` 把 `ic_launcher_background` 默认写成 `#FFFFFF`，而母版是满幅深青底，圆遮罩外圈会露出一圈白。改为背景层 `#0F3A3E` + 前景层只画卡身（挂孔镂空露出背景色、灯实心）并缩到 60% 安全区；由 `scripts/gen-brand-mark.py` 在 `pnpm tauri icon` **之后**重写五档 `ic_launcher_foreground.png`。
  - **托盘图标**从猫头剪影换成随身卡剪影（卡身实心 + 挂孔与灯镂空），生成入口迁到 `scripts/gen-brand-mark.py`，旧 `scripts/gen-tray-icon.py`（画猫头）已删除。
  - **暂不动**：`brand/logo-horizontal*.svg` 文字标（内部仍嵌猫头）与 `brand/logo-icon.svg` / `logo-favicon.svg` / `logo-appicon.svg` 旧矢量源，等文字标一起重做时再处理；`brand/icon-drafts/` 是本地过程稿，不作为事实源。
- 原因：卡片是唯一同时满足「有具体所指（手机就是那张卡）+ 有情绪（一颗为你亮着的灯）+ 轮廓级差异（斜角与挂孔在 40px 仍然成立）」的方向；爪印是痕迹、没有主体，角色头像被否，抽象形状没有所指，都不成立。琥珀灯承担情绪，是因为整张图只有它高彩度，视线第一个落点就是它——像夜里留的灯，而不是未读红点。
- 放弃：爪印路线（`paw-v2`、`card-round` 之前的六版概念全部无所指，40px 实测只有最普通的那版能认）；带脸角色（用户否）；紫色底（用户否）；玻璃卡（40px 糊）；「两枚爪印/一叠卡」等多主体（40px 混成一团）；把矢量当 App 图标母版（位图才是用户批准的那张图，矢量只服务小尺寸）。
- 代价：位图母版在 16–32px 会比矢量软（macOS Dock/Finder 小尺寸与 `.ico` 已可辨认，但不是极限锐利）；`gen/android` 不入库，每次 `pnpm tauri android init` + `pnpm tauri icon` 后必须重跑 `python3 scripts/gen-brand-mark.py`，否则自适应图标白边回归；「随身卡」在 iOS 着色模式下会塌成一块剪影，斜角与挂孔能保住识别，但灯的暖色信息会丢；真机主屏与 macOS 菜单栏观感尚未目检。
- 规范：`brand/appicon.png`、`brand/logo-mark.svg`、`brand/logo-mark-flat.svg`、`scripts/gen-brand-mark.py`、`app/public/{favicon,logo-icon}.svg`、`app/src-tauri/icons/**`、`app/src-tauri/icons/tray.png`、`app/src-tauri/gen/android/app/src/main/res/{values/ic_launcher_background.xml,mipmap-*/ic_launcher_foreground.png}`、`docs/engineering/desktop-tray.md`、`README.md`、`AGENTS.md`、`brand/icon-drafts/`。

## D100 · 语音录音/结果 UI 重做：深石墨胶囊 + 共用白卡 + 卡外动作圆钮（2026-11-06，取代 D80 的珊瑚胶囊/三段结果卡）

- 背景：用户对语音输入的两段体验连续提了三轮意见：① 录音胶囊的珊瑚色 + 红色渐变太重，要求参考微信/QQ/WhatsApp/Telegram；② 渐变与按钮交界有横线、按钮被融掉；③ 结果卡「已输入」字大、底部太高、复制和“刚刚”多余，清空/回车不应塞在卡里。最终确认：录音胶囊用深石墨 + 柔和向上阴影，取消提示放胶囊上方；结果卡只留「百炼 + 右侧小字状态 + 2 行正文」，清空/回车放麦克风左右两个浅灰圆钮；松手时胶囊收缩、卡片下滑、动作圆错峰淡入。
- 决策：
  - **录音态**：胶囊 `#2C2C2E` + `inset 0 1px 0 rgba(255,255,255,.06)` + `0 -18px 38px rgba(44,44,46,.18)` + `0 8px 18px -12px rgba(0,0,0,.42)`；内部只留脉冲点/计时/波形；取消提示为胶囊上方 12px 文字（距容器底 100px），进入取消区变珊瑚色；80/32 阈值不变，胶囊不再变色。
  - **实时卡/结果卡共用白卡**：同一张卡、同一位置（距容器底 170 → 110），卡头左侧「百炼」徽标、右侧 9px 状态（实时「识别中」+ 呼吸点；结果「已输入/已复制/没成功」），正文 11.5px / 最多 2 行；去掉 grabber、复制、时间、卡内底部动作区；卡宽 `min(86vw,380px)`、18 圆角。
  - **动作圆钮**：插入成功时麦克风左右各一个 56px 浅灰 `#F2F2F7` 圆钮（左清空、右回车，深色图标/文字，回车绿），仅 `inserted` 出现；复制/失败不出现；清空仍两次确认，第二次前变珊瑚色「再点一次」。
  - **过渡**：胶囊宽度 260→56（约 300ms）、结果卡 170→110（280ms）、动作圆错峰淡入（120/160ms）；用 CSS transition（width/background/bottom/opacity/transform），不引动画库；`prefers-reduced-motion` 直接切结果态。
  - **测试/文档**：`mic-button.test.tsx` 改为验证白卡结构、2 行正文、无复制/时间/卡内动作、卡外圆钮；`pet-page.test.tsx` 移除 `overlayBottomClassName`；mic/shell PRD/SPEC/AC 同步。
- 原因：用户明确否掉大红色、横线、融掉按钮、卡内大字号/复制/时间；深石墨 + 柔光与深色动作圆同一材质语言，白卡只承载文字，动作回到拇指可及的底部；三圆一行让“长胶囊收缩成圆”的过渡连续，不会突然换一套控件。
- 放弃：珊瑚胶囊/红色渐变（用户否，太重）；v5 单层渐变把胶囊融掉（用户否，按钮消失）；把清空/回车放卡内（用户否，抢文字、底部太高）；复制按钮/“刚刚”/grabber（用户否，多余）；动作圆放麦克风正上方（过渡不如三圆一行顺）。
- 代价：结果卡不再有复制入口（依赖系统长按/剪贴板历史），时间信息移除；卡外圆钮占左右空间，极窄屏（<320）需回归；深色主题下浅灰圆钮比页面亮，视觉重量仍在可接受范围；真机（Realme WebView 103）尚未安装验收。
- 规范：`app/src/mobile/features/mic/mic-button.tsx`、`mic-copy.ts`、`mic-button.test.tsx`、`app/src/mobile/features/pet/pet-page.tsx`、`pet-page.test.tsx`、`app/src/mobile/styles/clean.css`、`docs/prd/mic/{SPEC,PRD,ACCEPTANCE}.md`、`docs/prd/shell/{SPEC,ACCEPTANCE}.md`、`docs/status.md`、`AGENTS.md`。

## D101 · 语音收回「设置 › 语音输入」单页 + 桌面一级回到 4 个入口（2026-11-06，取代 D94 的导航部分）

- 背景：用户觉得电脑端语音部分没必要单独占一个一级页，也不该再往下设二级页；语音是配置类内容，和概览 / 内容 / 用量这类主任务不是一个层级。D94 把语音提升为一级后，一级入口从 4 个变 5 个、⌘2–⌘5 全部前移，却没有降低任何点击深度（原来「设置 › 语音输入」就已经是 2 次点击，语音根页看配置仍要再 push 一次），只换来更挤的导航和一轮文档 / 测试漂移。
- 决策：
  - 桌面一级回到 **4 个：概览 ⌘1 / 内容 ⌘2 / 用量 ⌘3 / 设置 ⌘4**；224 侧栏上半只有概览 / 内容 / 用量 3 项，设置固定在底部；三行状态摘要（服务 / 手机 / AI）不变。
  - 语音收回 **「设置 › 语音输入」单个 push 二级页**：页内纵向三段 = 百炼配置（原「连接与识别」`CloudAsrForm`）+ 关键词列表（原独立关键词页，改为可嵌入面板 `KeywordsPanel`）+ 语音用量（`UsageStatsPanel`），**页内不再 push**；页头只有「‹ 设置」返回。
  - 设置首页「功能」组顺序：手机连接 / **语音输入** / AI 联动 / 剪贴板；语音行 meta 已配置显示「已配置」，未配置显示「未配置」+ 一颗琥珀点（未配置信号从侧栏导航项挪到设置行）。
  - 旧「语音」一级页与「连接与识别 / 关键词 / 语音用量」三个二级页删除；`DesktopView` 去掉 `voice`、`VoicePane` 删除，`SettingsSection` 新增 `voice`；`?view=voice` 与 `?view=models` 作为调试别名都落到「设置 › 语音输入」。
  - 保留 D94 的能力：关键词仍是单一列表（一行一个词、加号加行、保存、不做分组 / 权重，最多 2000 个、统一权重 4）、`asr_keywords_save` 只写 `bailian.vocabulary`、未配置信号、2 次点击可达（设置 → 语音输入）。
- 原因：配置类不与主任务平级——壳的目标是「主任务 ≤1 次操作、配置与排障收进设置二级页」，语音属于配置与低频维护；D94 提升一级并没有减少可达次数，反而让 5 个入口挤在 224 侧栏、⌘ 编号二次迁移。收回后设置首页仍 ≤2 次可达，未配置信号仍在设置行可见。
- 放弃：保留 5 入口但把语音根页平铺（导航仍多一项，根页信息与设置列表重复）；语音留在设置里但仍带 3 个 push 子页（用户明确不要二级页，内部再 push 层次过深）；把关键词并进百炼配置表单（关键词是用户内容，需要独立保存与逐行校验）；删掉语音用量统计（费用仍需可见）。
- 代价：⌘2–⌘4 第二次迁移（D94 刚把 内容 / 用量 前移过一轮），需一次性刷新测试、QA 脚本与文档；设置首页多一行，960×640 下开始出现滚动（设置页本就是列表，可接受）；语音页要滚动才能看全三段（配置 / 关键词 / 用量），不再有「根页摘要」；`?pane=` 调试参数失效。
- 规范：`app/src/desktop/{lib/desktop-nav.ts,app.tsx,shell/sidebar.tsx,pages/settings-page.tsx}`、`app/src/desktop/features/models/{voice-settings.tsx,keywords-panel.tsx,cloud-asr-form.tsx,usage-stats.tsx}`、`app/src/desktop/pages/{voice-page.tsx,voice-page.test.tsx}`（删除）、`app/src/desktop/{app.test.tsx,pages/settings-page.test.tsx,features/models/voice-settings.test.tsx}`、`scripts/qa-desktop-ios.mjs`、`docs/prd/shell/*`、`docs/prd/mic/*`、`docs/prd/usage/*`、`docs/standards/ux.md`、`docs/engineering/{desktop-ios-ui,asr-model,asr-cloud-bailian,audio-pipeline,protocol-audio,quality}.md`、`docs/{INDEX,status,frontend-architecture,setup}.md`、`AGENTS.md`。


## D102 · 用量页默认「今天 / 模型」、分组排行改按金额、桌面账本字号下调一档（2026-11-07，取代 D97/D98 的默认 7 天/会话与「后端按 Token 选 Top 8」）

- 背景：用户明确要求两端默认「今天」、三个分组 tab 默认「模型」、排行按金额从大到小；电脑端表格文字太挤，要求文字小一号并注意行高。
- 决策：
  - 桌面 `usage-store` 默认 `range="today"`、`group="model"`；手机 `usage-store` 默认 `range="today"`，页面分组默认 `model`（`modelsHidden` 时自动回落会话）。
  - 后端 `build_groups` / `aggregate_groups` 的会话、模型、客户端排序从 Token 改为**金额降序**，同额再按 Token；Top 8 与「其他」因此按金额选取。前端仍按金额排序兜底（防止旧桌面/异常数据）。
  - 桌面账本字号整体下调一档：行标题 13.5→12.5（行高 16）、副行 11→10.5（行高 13）、Token/金额 11.5→10.5、表头 10.5→10、「按花费」11→10.5；行高 34→35，`min-height` 272→280，补偿缩字后的呼吸感。
  - 同步测试：桌面/手机 store 默认值断言、手机分组默认模型断言、Rust `groups_rank_by_cost_not_tokens`（高金额低 Token 的行必须排在前面）。
- 原因：默认「今天」回答「现在花了多少」，默认「模型」回答「钱花在哪个模型」；按金额排行与用户看花费的视角一致；缩字 + 行高补偿让账本从「挤」变成可扫读。
- 代价：凌晨的「今天」可能只有很少金额（单日柱已做刻度/昨日文字化处理，不再压扁）；「其他」的语义从 Token 尾部变为金额尾部；桌面账本 8 行高度 +8px，1180 首屏仍完整（QA 复核）。
- 规范：`app/src/desktop/features/usage/usage-store.ts`、`app/src/desktop/styles/usage.css`、`app/src/mobile/features/usage/{usage-store.ts,usage-page.tsx}`、`app/src-tauri/src/token_usage.rs`、`app/src/desktop/pages/usage-page.test.tsx`、`app/src/mobile/features/usage/{usage-page.test.tsx,usage-store.test.ts}`、`docs/prd/usage/{PRD,SPEC,ACCEPTANCE}.md`、`docs/engineering/token-usage-pricing.md`、`docs/design/usage-dashboard-v2/README.md`、`AGENTS.md`。


## D103 · 用量会话行标题从 DSH 会话缓存回填（2026-11-07，补充 D102 的会话排行）

- 背景：用户指出电脑端用量页「会话」分组里有些行显示的是会话 id（如「会话 35ebc56e」），问能否用会话名称。检查账本：最近 8 天 108 个会话里 21 个没有 `title`，今天 5 个会话全部没有；但 DSH 会话缓存里有对应标题。
- 决策：会话标签优先账本 `sessions[].title`；缺失时只读 `<DSH_HOME>/storages/session_projcache/sessions/<id>.json` 的 `record.rows.title.val` 回填（≤80 字符、单行、去控制字符）；只回填进入 Top 8 的会话行；缓存也没有才显示「会话 + 8 位短 id」。
- 隐私边界：只读 `title` 字段，不读 `titleInput`、消息、工具调用；不写 DSH、不上传；日志仍不记录标题。会话 id 只允许字母数字/`-`/`_`，防目录穿越。
- 代价：DSH 缓存路径/结构变化时回填失效，自动退回短 id；每次统计最多读 8 个小 JSON（≤2MB 上限）。
- 规范：`app/src-tauri/src/token_usage.rs`（`session_cache_dir` / `cached_session_title` / `build_groups` 回填）、Rust 测试 `session_rows_backfill_title_from_dsh_cache`、`docs/engineering/token-usage-pricing.md`、`docs/prd/usage/{PRD,SPEC,ACCEPTANCE}.md`、`docs/design/usage-dashboard-v2/README.md`、`AGENTS.md`。

## D104 · 语音升为第 4 个一级入口（放在用量下）+ 设置回到 4 个入口（2026-11-07，取代 D101 的导航部分）

- 背景：D101 把语音收回「设置 › 语音输入」后，用户实际用起来觉得语音（配置 / 关键词 / 费用）是高频维护面，放在设置里不够顺手，明确要求「拿出来，就放在用量下面」。
- 决策：
  - 一级导航改为 **5 个：概览 ⌘1 / 内容 ⌘2 / 用量 ⌘3 / 语音 ⌘4 / 设置 ⌘5**；侧栏 224 上半 4 个入口（概览 / 内容 / 用量 / 语音），设置固定底部；三行状态摘要不变；⌘1–⌘5 全部有效。
  - 语音 = **单个一级页面**（`VoicePage`，fade 进入、页头 34/600「语音」）：页内纵向三段 = 百炼配置 `CloudAsrForm` / 关键词 `KeywordsPanel` / 语音用量 `UsageStatsPanel`，**内部不再 push**（沿用 D101 的单页结论）；侧栏「语音」项未配置时右侧 6px 琥珀点。
  - 设置删除「语音输入」行与 `SettingsSection = voice`；设置首页「功能」组回到 手机连接 / AI 联动 / 剪贴板；设置首页仍不承载配置表单。
  - `?view=voice` / `?view=models` 调试别名落到一级「语音」页；`?view=settings&section=voice` 不再有效。
- 原因：语音是高频维护面（配置、关键词、费用），固定在一级且位置紧跟「用量」，符合用户「看完用量顺手看语音」的路径；单页形态保留 D101 去掉「二级页套二级页」的收益。
- 放弃：留在设置（用户明确要求拿出来）；恢复 D94 的「根页摘要 + 三个 push 二级页」（D101 已确认一页看完、不再 push）；换别的顺序（用户指定在用量后）。
- 代价：⌘ 编号第三次调整（内容/用量为 ⌘2/⌘3、语音 ⌘4、设置 ⌘5），需一次性刷新测试、QA 脚本与文档；设置首页少一行；侧栏从 3 个入口回到 4 个，密度回到 D94 水平。
- 规范：`app/src/desktop/{lib/desktop-nav.ts,app.tsx,shell/sidebar.tsx,pages/settings-page.tsx,pages/voice-page.tsx,features/models/voice-settings.tsx}`、`app/src/desktop/{app.test.tsx,pages/voice-page.test.tsx,features/models/voice-settings.test.tsx}`、`scripts/qa-desktop-ios.mjs`、`docs/prd/shell/*`、`docs/prd/mic/*`、`docs/prd/usage/*`、`docs/standards/ux.md`、`docs/engineering/{desktop-ios-ui,asr-model,asr-cloud-bailian,audio-pipeline,protocol-audio,quality,INDEX}.md`、`docs/{INDEX,status,frontend-architecture,setup}.md`、`docs/product/{scope,INDEX}.md`、`docs/prd/INDEX.md`、`AGENTS.md`。

## D105 · 修复语音用量记账：usage 从 result-generated 兜底（2026-11-07，补充 D82–D84 的用量统计）

- 背景：用户反馈「今天语音输入了好几条，语音用量一直是 0」。排查发现 `qwen-audio-3.1-asr-flash-streaming` 的 `task-finished` 实测只返回 `payload.output={}`，usage 实际出现在**部分 `result-generated.payload.usage`**（累计值）；旧实现只在 `task-finished` 解析 usage，于是有识别结果、也有计费，但本地账本一条都不记。直连百炼 WS 的探针复现：7.4s 真人语音会话的 `task-finished` 同样为空 payload，其中一帧 `result-generated` 带 `{duration:7, input_tokens:93, output_tokens:21, total_tokens:114}`。
- 决策：`bailian_asr` 在解析每条服务端事件时累计最近一次 usage（`result-generated` 也要读，且必须在任何 early return 之前）；`task-finished` 自带 usage 优先、为空时用快照兜底。`CloudTranscript.usage` 因此对两种服务端行为都成立。
- 价格与口径核对：该模型官方价（北京输入 ¥6 / 输出 ¥4.5 每百万 Token，新加坡 ¥6.781 / ¥5.104）与 `asr_pricing.rs` 一致；`cost_micros` 微元换算与历史账本一致（如 368×6 + 46×4.5 = 2415 微元）；音频 Token 官方按「音频秒数 × 12.5」折算，服务端 usage 直接给 input/output tokens，无需本地折算。
- 代价：今天之前漏记的会话无法精确补回（服务端 usage 未落盘），只能按日志音频帧数近似回填；修复从下一次会话起生效，需要重启桌面端。
- 规范：`app/src-tauri/src/bailian_asr.rs`、`app/src-tauri/src/asr_usage.rs`、`docs/engineering/{asr-model,asr-cloud-bailian}.md`、`AGENTS.md`。

## D108 · 菜单栏左键改为 Token 用量小看板（2026-11-07，取代 D88 的「左键显示主窗口」与 usage PRD 的「不做菜单栏」非目标）

- 背景：用户明确要求「点状态栏（菜单栏图标）→ 从屏幕上方弹一个不要太大的小框看板，显示 Token 用量」。此前 D82–D84 的 usage PRD 把「菜单栏 / 状态栏入口」写成非目标（用户当时不要），现在改口；要的是**点击弹出的小看板**，不是菜单栏常驻数字/徽标。
- 决策：
  - 新增独立的 `usage-panel` 第二窗口（348×420 逻辑像素，可见卡片 320×392 + 四周 14 透明留白），启动时预创建并隐藏；`transparent` 只用于圆角/阴影，卡片不透明（D86 内容层不透明）。
  - 托盘左键从「显示主窗口」改为 `usage_panel::toggle`：可见则收起，否则按 `TrayIconEvent::Click.rect` 贴图标下方 6pt 居中显示，再按图标所在显示器左右 8pt 夹取；主窗口改走右键菜单「显示主窗口」或面板底部「打开用量页」（Rust 显示主窗口后发 `sidekick-navigate`，主窗口切到「用量」页）。
  - 收起：再点图标 / 点其它 App（`Focused(false)`）/ Esc（`hide_usage_panel`）/ Cmd+W（`CloseRequested` → prevent + hide，不销毁）；窗口留着下次秒开。创建/显示失败回退 `show_main_window`，左键绝不「点了没反应」；托盘没建起来就不预创建面板。
  - 面板只读、复用现有 `token_usage_stats` 与 `useUsageStore`：今天/7 天两个区间、花费 + 环比、Token/会话/缓存命中、近 7 天迷你柱（固定取 `daysForRange(days,"7d")`，今天高亮）、Top 3 模型（按金额）、底部「打开用量页」。账本缺失/缺价/无记账沿用现有口径（一句结论、`—`、不造假），不新增协议、不写账本、不发遥测。
  - 新增 `capabilities/panel.json`（`usage-panel` 窗口 `core:default`）、`entries/panel.tsx` + `desktop/panel/usage-panel.tsx` + `desktop/styles/panel.css`、`shared/lib/tauri.ts` 的 `hideUsagePanel` / `openUsagePage` / `subscribeNavigate`；`main.tsx` 在 `?window=panel` 时先于 `app_role` 挂面板（dev mock 同名入口用于浏览器 QA）。
  - 顺带修复：`Cargo.toml` 的 `tauri` 依赖必须保留 `macos-private-api`（`tauri.macos.conf.json › macOSPrivateApi: true` 的硬前提，透明窗口/材质依赖它；删掉后 `tauri-build` 的 feature allowlist 检查会让 `cargo test` 直接失败）。
- 原因：菜单栏是电脑端常驻入口，左键是用户唯一会点的位置；小看板解决「扫一眼今天花了多少」，比打开主窗口再切页少两次操作。独立小窗不加载桌面壳（不连 WS、不初始化导航），比复用主窗口更轻。
- 放弃：`tauri-plugin-positioner`（只省几十行定位数学，多一个依赖，违反 dependency-policy）；`tauri-nspanel` / 自写 NSPanel（更接近原生 popover、不抢焦点，但引插件或扩 ObjC surface，v1 不做）；always-on-top 常驻悬浮窗（不是用户要的形态，且遮挡桌面）；菜单栏常驻数字（用户明确不要）。
- 代价：普通 `NSWindow` 显示时会激活 App（抢焦点），失焦收起是启发式；别的 App 全屏 Space 时面板可能不覆盖该 Space；菜单栏区域无法自动截图，观感必须人工目检；多一个常驻隐藏 WebView（几十 MB）换「点开即出」；预创建/定位逻辑新增约 300 行 Rust（含 6 个定位单测）。
- 验证：`cargo test` 184 passed（含 `usage_panel` 6 个定位单测）、`pnpm typecheck / lint / 692→698 tests / build`、`check-boundaries`、`check-docs` 全绿；浏览器 QA 58 张截图（含面板 4 张：浅/深 × 正常/空态），面板卡片实测 320×392、无横向溢出/console error。菜单栏点击/收起/位置、多屏、Cmd+W、打开用量页仍待人工 `pnpm tauri dev` 目检（清单见 `docs/engineering/desktop-usage-panel.md` §6）。
- 编号说明：并行中的手机端改动已占用 D106/D107，本条按时间顺序记 D108；D106/D107 由对应改动自行补记。
- 规范：`app/src-tauri/src/{usage_panel.rs,tray.rs,lib.rs}`、`app/src-tauri/capabilities/panel.json`、`app/src-tauri/Cargo.toml`、`app/src/{main.tsx,entries/panel.tsx,shared/lib/tauri.ts,desktop/app.tsx,desktop/panel/usage-panel.tsx,desktop/styles/panel.css,dev/tauri-mock.ts}`、`app/src/desktop/panel/usage-panel.test.tsx`、`scripts/qa-desktop-ios.mjs`、`docs/engineering/desktop-usage-panel.md`、`docs/engineering/{desktop-tray,token-usage-pricing,INDEX}.md`、`docs/prd/usage/{PRD,SPEC,ACCEPTANCE,INDEX}.md`、`docs/{status.md,INDEX.md}`、`AGENTS.md`。

## D109 · 菜单栏看板分组区加「客户端 / 会话 / 模型」tab + 占比条加粗（2026-11-07，补充 D108）

- 背景：D108 的小看板只展示「模型」一组；用户看过后要求「模型下面也加上那三个 tab」，并指出行底占比条现在 2px 太细、看不出是百分比。
- 决策：
  - 面板分组区改为与用量页一致的三档下划线 tab：**客户端 / 会话 / 模型**，默认「模型」（沿用 `useUsageStore.group`，切 tab 只换列表、不重新读账本）；每组仍只展示按金额 Top 3，右侧标「花费」。
  - 占比条从 2px 细线改为 **4px 圆角底轨 + 填充**：底轨 `--panel-divider`，填充主色 75% 不透明度，宽度按**整组**金额占比（不是 Top 3 归一），组内无数据时显示一行「这个区间没有数据」。
- 原因：三档 tab 让「钱花在哪个客户端 / 会话 / 模型」在看板上一次可达；底轨 + 4px 让百分比和组内总量都有参照，不再像一条装饰线。
- 代价：分组区多一行 tab（高度不变，原「模型 / 花费」表头位替换）；会话/客户端名称过长会省略号截断（title 保留全名）。
- 验证：`usage-panel.test.tsx` 7 例（新增「切三个分组换列表」）；`pnpm typecheck / lint / test / build` 全绿；浏览器 QA 面板 4 张截图更新（暗/浅主题下三 tab + 4px 占比条清晰可见，卡片仍 320×392、无溢出/console error）。
- 规范：`app/src/desktop/panel/usage-panel.tsx`、`app/src/desktop/styles/panel.css`、`app/src/desktop/panel/usage-panel.test.tsx`、`docs/prd/usage/{SPEC,PRD,INDEX,ACCEPTANCE}.md`、`docs/engineering/{desktop-usage-panel,token-usage-pricing,INDEX}.md`、`docs/status.md`、`AGENTS.md`。

## D110 · 动效图标统一到 shared/ui/motion（2026-11-07，承接 D107 会话卡 / D100 语音结果卡）

- 背景：用户评审了 10 个加载/提示动效试样，反馈「都要有呼吸和弹性的感觉」「有些环不要太细，要胖一点、慵懒一点」；选定方向后要求「这些图标统一存放、注意目录结构」，并清理试样 HTML 与生成文件。
- 决策：新增 `app/src/shared/ui/motion/`（`index.tsx` + `motion.css` + `motion.test.tsx`），只放 5 个基础动效件：`LoadingOrbit`（轨道弧，通用加载）、`LoadingDots`（三点波）、`HintCheck`（`draw` 描线 / `pop` 弹起）、`HintAsk`（琥珀涟漪）、`HintError`（珊瑚画叉）。规则：
  - 颜色只吃 `currentColor`——调用方用 `text-signal` / `text-decide` / `text-destructive` 决定色相，组件不写死薄荷/琥珀/珊瑚；
  - 尺寸只走 `size`（px，默认 20）：SVG 用 width/height，点/涟漪用 font-size + em，避免各页面各写一套；
  - 默认 `aria-hidden`（纯装饰），需要语义时传 `label` 变成 `role="img"`；
  - 全部尊重 `prefers-reduced-motion`（冻结在可读的静态帧，不闪不跳）。
  - 动效语言：环类加粗（描线 2.4→3.2/3.4、呼吸环 0.075em、涟漪 0.085em）、时长放慢 20–40%，用带过冲的 cubic-bezier 取代匀速，所有循环都留“一口气”的呼吸相位。
- 接入范围（手机）：会话行 working → `LoadingOrbit`、completed → `HintCheck draw`、asking → `HintAsk`、pendingFocus → `LoadingOrbit 14`；麦克风处理中 → `LoadingOrbit`；连接页「连接中」两处 → `LoadingOrbit`。桌面暂未替换，同一套组件可直接复用。
- 清理：试样台 `artifacts/loading-lab/`（HTML + GIF + PNG 帧）与 `/tmp` 临时脚本全部删除，不入库、不提交；动效只以组件 + 一个 CSS 文件的形式统一存放。
- 验证：706 tests（新增 motion 8 例；会话行/麦克风断言改用 `sk-orbit` / `sk-ask` 新类名）、tsc / lint / build / check-docs / check-boundaries 全绿；真机 Realme 安装走查。
- 规范：`app/src/shared/ui/motion/{index.tsx,motion.css,motion.test.tsx}`、`app/src/mobile/features/sessions/{session-row.tsx,session-row.test.tsx}`、`app/src/mobile/features/mic/{mic-button.tsx,mic-button.test.tsx}`、`app/src/mobile/features/connect/offline-page.tsx`、`docs/prd/shell/SPEC.md`、`docs/status.md`、`AGENTS.md`。

## D111 · 菜单栏看板留白加高 + 近 7 天柱悬停气泡（2026-11-07，补充 D108/D109）

- 背景：用户看过 D108/D109 的看板后反馈两点——分组 tab 下每行「离得太近、字的上下行高也不够，没有留白的呼吸感」；近 7 天柱图「鼠标一上去应该能显示东西」。
- 决策：
  - 卡片从 **320×392 加高到 320×432**（窗口 348×420 → **348×460**，仍贴图标下方 6pt、水平居中，位置算法不变）：分组行 26→32 高、行间 gap 5、名称 12/17 行高、Token 10.5、金额 12；tab 间距 12→16、分组区上边距 14→18；读数上边距 10→12、柱区 40→42；底部「打开用量页」用 `margin-top: auto` 贴底，多出的高度落在分组区与按钮之间。行 hover 给淡底反馈。
  - 近 7 天迷你柱加悬停：鼠标在柱区移动按横向比例命中一根柱子，命中柱 `opacity: 1` 加亮，柱区顶部弹「日期 · 金额」气泡（今天显示「今天」），移出即消失；气泡 `pointer-events: none`，不会打断 mousemove。
- 原因：小窗信息密度高，26px 行距 + 11.5 字号读起来挤；加高 40px 换呼吸感，仍属于「小看板」尺寸。柱图原本只有静态高度，悬停能把日期与金额一次读出来，避免再去打开用量页。
- 代价：窗口高 40px（约 +10%）；气泡在首/末柱会略微贴边（卡片 overflow 裁切，实测不挡信息）。
- 验证：`usage-panel.test.tsx` 8 例（新增悬停气泡「11-06 · ¥29.84」+ 移出消失）；QA 60 张截图（新增 2 张悬停，CDP 真实鼠标移动，能看到柱子加亮与气泡），卡片实测 320×432、`scrollHeight <= clientHeight` 无裁切、无溢出/console error；`pnpm typecheck / lint / test / build`、`cargo test`（184）、`check-docs`、`check-boundaries` 全绿；桌面端已重启，`[panel] 已创建隐藏窗口 348×460`，真实点击验证「显示 → 348×460 窗口 → 再点收起」。
- 规范：`app/src-tauri/src/usage_panel.rs`（CARD_H）、`app/src/desktop/panel/usage-panel.tsx`、`app/src/desktop/styles/panel.css`、`app/src/desktop/panel/usage-panel.test.tsx`、`scripts/qa-desktop-ios.mjs`、`docs/prd/usage/{SPEC,PRD,INDEX,ACCEPTANCE}.md`、`docs/engineering/{desktop-usage-panel,desktop-tray,INDEX}.md`、`docs/status.md`、`AGENTS.md`。

## D112 · 菜单栏归属随窗口状态切换：显示窗口切 Regular、关窗回 Accessory（2026-11-07，修 D88 副作用）

- 问题：D88 用 `ActivationPolicy::Accessory` 让 Sidekick 藏在菜单栏，代价是 macOS 不允许 Accessory 应用有菜单栏——主窗口开着时左上角还是上一个普通 App（DeepSeek Harness / Qoder）的菜单，⌘Q、编辑菜单、窗口菜单都不属于 Sidekick，观感像「这不是当前软件」。
- 决定：按窗口状态动态切激活策略，不做常驻 Dock、也不改成永远 Regular：
  - 主窗口显示（`tray::show_main_window`：托盘右键「显示主窗口」/ 看板「打开用量页」/ 单实例二次启动 / 启动时）→ `ActivationPolicy::Regular`，Dock 图标、菜单栏（Tauri 默认菜单：关于/文件/编辑/显示/窗口/帮助）、Cmd+Tab 一起回来，⌘Q 也可用；
  - 关窗隐藏（`CloseRequested` → `prevent_close` + `hide`）→ 切回 `Accessory`，Dock 图标消失、菜单栏交还前台 App，保留 D88「关窗不退出、只剩菜单栏图标」。
- 新增 `app/src-tauri/src/activation.rs`（`window_shown` / `window_hidden`，失败只打日志不阻断），调用点只有 `tray.rs` 与 `lib.rs` 两处；菜单用 Tauri 的 macOS 默认菜单，不另建（中文菜单后续可再定制）。
- 代价：窗口开着时 Dock 会出现 Sidekick 图标、Cmd+Tab 也出现（普通 App 手感，接受）；⌘Q 在窗口开着时能退出（关窗后仍只能走菜单栏右键「退出 Sidekick」）。调试用裸二进制时 App 菜单名显示 `desktop`，打包后是 `Sidekick`。
- 验证（AX + Swift 合成事件）：窗口显示时 `NSRunningApplication.activationPolicy = regular`、系统菜单栏 = `Apple / desktop / File / Edit / View / Window / Help`、Dock 有 desktop；点关闭按钮后 `policy = accessory`、Dock 无 desktop、菜单栏回到前台 App、`lsof -nP -iTCP:47810` 仍在监听；再次二次启动实例 → 回到 regular + 菜单栏接管。
- 规范：`app/src-tauri/src/activation.rs`、`tray.rs`、`lib.rs`、`docs/engineering/desktop-tray.md`、`AGENTS.md`（D88 行 + §8 坑）。

## D113 · macOS 菜单栏中文化（2026-11-07，替换 Tauri 默认英文菜单）

- 问题：D112 让主窗口显示时接管菜单栏，但接管到的是 Tauri 默认英文菜单（File / Edit / View / Window / Help），中文产品里显得突兀。
- 决定：新增 `app/src-tauri/src/menu.rs`，setup 里 `app.set_menu(...)` 重建同结构中文菜单，行为不变：
  - Sidekick：关于 Sidekick / 服务 / 隐藏 Sidekick / 隐藏其他 / 全部显示 / 退出 Sidekick（⌘Q）
  - 文件：关闭窗口（⌘W）
  - 编辑：撤销（⌘Z）/ 重做（⇧⌘Z）/ 剪切（⌘X）/ 复制（⌘C）/ 粘贴（⌘V）/ 全选（⌘A）——WebView 输入框依赖这组预置项
  - 显示：切换全屏（⌃⌘F）
  - 窗口：最小化（⌘M）/ 缩放 / 前置全部窗口
- 实现要点：全部用 `PredefinedMenuItem`（快捷键由系统按键盘布局给出，不手写 key equivalent）；`AboutMetadata.name = Sidekick`；只在 macOS 编译，安装失败只打日志、保留默认菜单，不阻断启动。
- 已知限制：第一项「应用菜单」的标题由系统按应用名显示（调试裸二进制 `desktop`、打包后 `Sidekick`），自定义菜单改不了；要在菜单栏显示「小跟班」得改 bundle 名（productName），会连带改 .app / Dock / Cmd+Tab 的名称，本次未做。
- 验证：启动日志出现 `[menu] 已安装中文菜单`；AX 读 process 菜单栏 = `Apple / desktop / 文件 / 编辑 / 显示 / 窗口`；`cargo build` 干净（仅原有 `system_message` dead_code 警告）。
- 规范：`app/src-tauri/src/menu.rs`、`lib.rs`（setup 安装）、`docs/engineering/desktop-tray.md`、`AGENTS.md`。

## D114 · App 名只用英文 Sidekick，界面不再出现「小跟班」（2026-11-07，取代 D1 的中文名部分）

- 背景：用户确认产品没有中文名，应用就叫 Sidekick；D1 的「中文名列小跟班」不再作为 App 名使用。
- 改动（中文菜单本身保留 D113 的中文化，只把名字换成英文）：
  - `menu.rs`：应用菜单标 Sidekick，子项 关于 Sidekick / 隐藏 Sidekick / 退出 Sidekick；`AboutMetadata.name = Sidekick`
  - `app/src/desktop/shell/sidebar.tsx`：侧栏 logo 旁名称 小跟班 → Sidekick
  - `app/src-tauri/src/tray.rs`：托盘悬停提示 → `Sidekick · 点按查看用量`
  - 菜单栏第一项标题仍由系统按应用名显示（调试裸二进制 `desktop`、打包后 `Sidekick`）
- 未动：手机宠物角色名（`PET_DISPLAY_NAME = "小跟班"`、首见气泡「你来了。我是小跟班。」）——它是宠物角色名，不是 App 名；是否一并改需产品确认。
- 历史：D1 的中文命名按「历史 D 条原文不重写」保留；App 名以本条为准。
- 验证：重启后 AX 读应用菜单 = `关于 Sidekick / 服务 / 隐藏 Sidekick / 隐藏其他 / 全部显示 / 退出 Sidekick`；窗口截图侧栏显示 `Sidekick`；`cargo build` / `pnpm build` 干净。
- 规范：`app/src-tauri/src/menu.rs`、`tray.rs`、`app/src/desktop/shell/sidebar.tsx`、`docs/engineering/desktop-tray.md`、`AGENTS.md`。

## D116 · 看板卡片上移 + 阴影改为向外延伸（2026-11-07，补充 D108–D111）

- 背景：D111 的阴影 `0 18px 44px` 远大于 14pt 透明留白，被窗口边界裁断成「卡片外一圈灰框」，用户误以为是第二层背景色；同时觉得卡片位置偏下。
- 决策：
  - 卡片上移：`GAP` 6 → 0（卡片顶边贴 `TrayIconEvent::Click.rect` 的底边，视觉约在菜单栏下 8pt）。
  - 透明留白从「四周 14」改为非对称：左右 20 / 上 8 / 下 28（窗口 348×460 → 360×468）；顶部刻意保持窗口顶边在菜单栏底线（30pt），否则透明窗口会盖住托盘图标下半区、再点图标关不掉面板。
  - 阴影改为 `0 8px 18px rgba(15,45,38,.16) + 0 2px 6px rgba(15,45,38,.06)`，落在留白内向外自然淡出；窗口层不铺任何底色或阴影，阴影只属于卡片。
- 原因：去掉「贴边灰框」的观感，同时保留轻微浮起；卡片与菜单栏之间更紧凑。
- 代价：窗口宽 +12pt、高 +8pt（都不可见）；顶部留白只有 8pt，上侧阴影较弱（阴影本来就朝下）。
- 验证：`cargo test` 184（定位单测的 x/y 期望已按新窗口宽度/留白更新）；QA 60 张截图（视口 360×468，卡片仍 320×432、不裁切）；真实桌面截图 + 像素采样确认卡片外只剩柔和阴影、没有灰框。
- 规范：`app/src-tauri/src/usage_panel.rs`、`app/src/desktop/styles/panel.css`、`scripts/qa-desktop-ios.mjs`、`docs/prd/usage/{SPEC,PRD,INDEX,ACCEPTANCE}.md`、`docs/engineering/{desktop-usage-panel,desktop-tray,INDEX}.md`、`docs/status.md`、`AGENTS.md`。

## D117 · 电脑端顶部滚动边缘铺满整页（2026-11-07）

- 背景：用户反馈「向下滑动时顶部出现渐变白条，而且没充满整个页面、只在中间一段，看着很奇怪」。实测 1180 窗口：内容列 674 + 两侧 28 = 730，渐隐层只有 730 宽，两侧各留 141 直边，所以像一条贴在中间的白色带子。
- 决策：滚动边缘（scroll edge）与玻璃工具栏的背板改为**横跨整个滚动视口**（main 区宽度），玻璃胶囊仍对齐 730 内容列。实现方式：`PageShell` 用 `ResizeObserver` 量出内容列到视口两侧的留白，写成 CSS 变量 `--dsl-bleed`；`.dsl-topbar-wrap` 用 `margin-inline: calc(-1 * var(--dsl-bleed))` + 等量 `padding-inline` 铺满。**不用**「滚动容器的兄弟绝对定位层」：内容列有 `dsl-page-in` 的 `transform` 动画会形成层叠上下文，渐隐层会被压到内容下面（实测整层效果消失、胶囊也被白色背板吞掉）。
- 放弃：直接删掉渐隐层（只剩玻璃胶囊）——宽度问题解决，但内容会从工具栏上方的 8px 缝隙裸奔；让内容列变宽——违背 730 单列契约（D85）。
- 代价：`PageShell` 多一个 `ResizeObserver`（窗口 resize / 列宽变化时重算一次），首帧 `--dsl-bleed: 0`。
- 验证：浏览器 CDP 量 `.dsl-topbar-wrap` 宽度 = 956（=滚动视口）、胶囊仍 674；浅/深 × 1180/960 截图顶部渐隐层左右到边、无直边、无横向溢出；`tsc` / `biome` / 707 tests 全绿。
- 规范：`app/src/desktop/shell/page-shell.tsx`、`app/src/desktop/styles/ios.css`、`docs/engineering/desktop-ios-ui.md`、`AGENTS.md`。

## D120 · 菜单栏看板卡片区铺原生磨砂（真玻璃，NSVisualEffectView）（2026-11-08，补充 D108/D116）

- 背景：用户问「HTML/CSS 能不能做毛玻璃 / iOS 那种玻璃」。研究结论：`backdrop-filter` 的采样上界是**文档根元素**（backdrop root），透明窗口背后没有可采样像素，所以纯 CSS 永远糊不到桌面；`-webkit-backdrop-filter` 只是同一实现的前缀别名，`filter: blur()` 糊的是元素自己。macOS 上唯一正解是窗口级系统材质——主窗口早在 D87 就用 `windowEffects: underWindowBackground`，只是看板窗口没接。
- 决策：给 `usage-panel` 的**卡片区**（320×432、圆角 18）单独垫一块 `NSVisualEffectView`（`Popover` 材质 / `BehindWindow` / `Active` / layer 圆角 18），垫在 WebView 之下；**不铺整窗**。
- 为什么只铺卡片区：原生材质铺的是 `contentView.bounds()`，整窗铺会把左右 20 / 上 8 / 下 28 的透明留白也变成一圈磨砂（与 D116 修掉的「卡片外一圈别的颜色」是同一类观感问题），卡片阴影还会叠在模糊壁纸上发灰发脏。
- 配套契约：新增 `panel_glass_ready` 命令把「是不是真铺上了」告诉前端；只有返回 `true` 时才由 `html[data-panel-glass="on"]` 把卡片底色换成薄 tint（浅 `rgba(255,255,255,.3)` / 深 `rgba(28,28,30,.38)`），否则保持 D116 的不透明实色卡。回退开关 `SIDEKICK_UI_VIBRANCY=off`；AppKit 调用失败只打 `[panel] 玻璃底衬失败` 日志并静默降级，绝不阻断弹面板。
- 不在 CSS 里加 `backdrop-filter`：透明窗口里没有可采样像素，视觉零收益、GPU 白付；此外 `prefers-reduced-transparency` 在 WKWebView 上根本不匹配（Safari 全版本不支持），玻璃的降级只能走原生开关。
- 代价：macOS 目标显式声明 `objc2` / `objc2-app-kit` / `objc2-quartz-core`（版本与 tauri 的传递依赖一致 0.6.5 / 0.3.2 / 0.3.2，**不新增 crate**），Android 目标 `cfg` 隔离不受影响；圆角只能落在 layer 上（`NSVisualEffectView` 没有公开的 `cornerRadius`），靠 `setCornerRadius + masksToBounds` 裁掉直角。
- 验证：日志 `[panel] 卡片区玻璃已就位（NSVisualEffectView · popover · 圆角 18）`；同屏同位置 A/B 实测（tint 压到 0.04）——`SIDEKICK_UI_VIBRANCY=off` 时卡片里能看清背后正文（区块 stdev 69.6），开启后正文被糊成均匀磨砂（stdev 48.2、无文字残留）；卡片实测 320×432、18px 圆角无直角玻璃外露；`cargo test` 184 / 708 前端 tests / tsc / lint / `check-docs` / `check-boundaries` 全绿。
- 调整（同日晚，用户反馈「看不出来太大的区别」）：确认不是没生效，而是**浅色背景下密集磨砂与不透明卡几乎同观感**。据此把默认材质换成 macOS 26 的 **`NSGlassEffectView`（`liquidGlassRegular`）**——背景颜色真正透进来、带边缘高光，最接近「iOS 26 玻璃」；低版本或类不存在时自动退回经典磨砂 `popover`。同时把材质做成可切档：`SIDEKICK_GLASS_MATERIAL=liquidGlass|liquidGlassClear|popover|underWindowBackground|sidebar|menu|contentBackground`（`liquidGlassClear` 实测在数据卡上小字对比不足，不建议）。QA 预览同步增强：`SIDEKICK_PANEL_PREVIEW="x,y"`（逻辑像素）可把面板放到任意位置对着深色/彩色背景截图，且预览期间不因失焦自动收起（截图脚本点不回来）。
- 规范：`app/src-tauri/src/panel_glass.rs`、`app/src-tauri/src/usage_panel.rs`（`CARD_RADIUS` + `panel_glass_ready`）、`app/src-tauri/src/lib.rs`（预览改为不弹主窗口）、`app/src/desktop/styles/panel.css`、`app/src/desktop/panel/usage-panel.tsx`、`app/src/shared/lib/tauri.ts`、`app/src/dev/tauri-mock.ts`、`docs/engineering/desktop-usage-panel.md`、`docs/status.md`、`AGENTS.md`。
