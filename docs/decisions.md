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
- 放弃：继续自绘 SVG 猫与参数化生成图集（`brand/pet-character/` 保留为存档）；Rive 运行时与 `.riv` 资产；把四态写死在渲染器里。
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
