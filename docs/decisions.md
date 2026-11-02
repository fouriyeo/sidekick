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
