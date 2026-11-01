# AGENTS.md — Sidekick 项目上下文

> 面向 AI 编码代理：读完这一份就能接手。细节在 `docs/`，协议在 `protocol/`。
> 最后更新：2026-11-02

## 1. 项目是什么

- 名称：小跟班 · Sidekick
- 一句话：把手机变成电脑的「外设 + AI 宠物」——电脑把 AI/任务状态推给手机，用户在手机上收通知、回答 AI 的提问、发快捷指令、语音输入。
- 仓库：https://github.com/fouriyeo/sidekick （私有，owner 项目维护者 / fouriyeo）
- 本地路径：`/Users/dev/code/sidekick`
- 平台目标：Android 优先，iOS 后续；电脑端先 macOS。

## 2. 当前状态（务必先看）

- ✅ **局域网 MVP 已验证**（2026-10-31）：Tauri 桌面端（服务端）+ Tauri 安卓 App（客户端）双向收发消息成功。
- ✅ **手机自动发现电脑已落地**（2026-10-31）：UDP 广播探测（固定 47820）+ 桌面单播回主机名/真实端口；服务端口候选 `47810`–`47814`、`8848` 自动回退；手机启动即自动连接，桌面大二维码改为按需展开；真机（Realme）端到端与端口回退已验。
- ✅ **断连自动重连**（2026-11-01）：断连/启动未连上/手动连接失败后按 1s→30s 退避重试，每次先静默重新发现再连；切后台暂停、回前台立即重试；聊天页常显重连状态与「立即重连 / 重新搜索」。真机验证：杀桌面后自动重试，桌面恢复/端口回退到 47811 都能自动连上。
- ✅ **宠物页屏幕常亮**（2026-11-01）：设置页「显示 → 屏幕常亮」真开关（默认开）；手机 Rust `set_keep_screen_on` 用 JNI 调 Android `FLAG_KEEP_SCREEN_ON`，只在宠物页前台（含设置弹层）生效，聊天/后台释放；旧存档 `"never"` 归一化为开。iOS 暂为空实现。
- ✅ **触感接管 + 可配时长**（2026-11-02）：启动时关闭 WebView 默认长按震动（`setHapticFeedbackEnabled(false)`），App 用原生 `performHapticFeedback` 发轻/中/成功/失败触感（**不申请 VIBRATE 权限**，跟随系统触感）；麦克风按下即中震；宠物页禁长按选中/复制；自动变暗默认 5 分钟、屏幕常亮最长默认 2 小时，设置页可调。
- ✅ 安卓 App 可构建、可安装到真机（测试机 Realme RMX3370 / Android 13）；首版「黑屏」问题已修复（见第 8 节）。
- ✅ **前端 Phase 1 已完成**（2026-10-31）：React 19 + Tailwind v4 + shadcn/ui（Base UI, base-nova）双 entry；`entries/desktop.tsx` / `entries/mobile.tsx`、`desktop/**`、`mobile/**`、`protocol/messages.ts`、`shared/lib/tauri.ts` 已落地；连接/聊天 1:1 迁移，旧 `main.ts` / `styles.css` 已删除；桌面浏览器与安卓真机双向收发通过。
- 产品规范与两份 PRD 已落地（2026-10-31）：`docs/product`、`docs/standards`、`docs/prd`、`docs/engineering`；文档采用树形 + 懒加载，入口 `docs/INDEX.md`。
- ✅ 品牌 logo 与全平台图标已落地（2026-10-31）：源文件在 `brand/`，Web favicon 与 Tauri 桌面/Android/iOS 图标已替换。
- ⏸ 蓝牙通道：预研过，Mac 可用 Python `bless` 当 BLE 外设广播（见 `docs/ble-notes.md`），但**主线暂定为局域网**，蓝牙延后。
- ✅ **宠物 P0 代码已完成**（2026-10-31）：静态 SVG + CSS 呼吸、状态机/手势/plugin-store 存档、方向自动双姿态（手动覆盖）、命名/设置、宠物主界面 + 聊天入口；84 个前端测试通过，浏览器视觉/交互已验证。Rive 资产、真机 60fps 与存档跨重启待补。
- ✅ **麦克风 P0 已实现**（2026-10-31）：手机 WebView 流式 PCM16 → 正式二进制协议（`mic.*` + `SK01`）→ 桌面按会话内存缓冲 → whisper-rs 内存转写（启动 prewarm）→ `arboard` 写剪贴板 + `core-graphics` 合成 Cmd+V；未授权/窗口变化/密码框只复制；手机含上滑取消、波形、计时、权限说明、结果卡片；桌面设置页管理模型与自动输入权限。真机/辅助功能实测待补。
- ✅ **桌面剪贴板 P1**（2026-10-31，2026-11-01 补语音入库与上限展示）：文本历史、搜索、复制、置顶、删除、清空、暂停；隐藏类型过滤；语音转写以 `voice` 入库；最多 100 条；本地 `0600` JSON。
- ❌ 尚未开始：Claude Code / Qoder hook 接入、配对鉴权、正式签名包、iOS。

## 2.5 文档导航（懒加载）

- 唯一入口 `docs/INDEX.md`；先读它，再按任务选 **1 个**分支；最多读 2 篇叶子，不要整棵读完。
- 分支：产品方向 `docs/product/`、规范 `docs/standards/`、PRD `docs/prd/`、技术方案 `docs/engineering/`。
- 现有基础文档仍是事实源：`docs/architecture.md`、`docs/frontend-architecture.md`、`docs/dependency-policy.md`、`protocol/README.md`。
- 新文档必须带 frontmatter；改完跑 `node scripts/check-docs.mjs`。
- 项目子智能体在 `.qoder/agents/`；项目 Skill 在 `.qoder/skills/`（`sidekick-docs`、`sidekick-feature`）。

## 3. 技术栈与架构速览

- 单仓库、双产物：Tauri 2 桌面端 + 安卓端共用 `app/`，但构建出两个独立软件；Rust 用 `cfg(desktop/mobile)` 隔离，桌面服务代码不进手机包。
- 前端按平台分目录：`src/desktop`、`src/mobile`、`src/shared`、`src/protocol`；桌面与手机各自固定布局，**不做跨端自适应**。详见 `docs/standards/engineering.md`。
- 桌面端：Tauri（Rust）+ Vite/TypeScript；Rust 里跑 axum HTTP/WebSocket 服务，端口候选 **47810**–`47814`、`8848`（默认 47810，被占用自动顺延，真实端口由 `server_info` 与发现回包告知）；UDP 发现端口固定 **47820**。
- 手机端：Tauri Android App（Rust 核心 + WebView UI）；Rust 侧用 tokio-tungstenite 主动连电脑，前端通过 Tauri 命令/事件与 Rust 通信。
- 角色判定：Rust `app_role` 命令按 `cfg!(target_os = "android" | "ios")` 返回 `mobile` / `desktop`；`src/main.tsx` 据此动态 import 并挂载 `entries/desktop.tsx` / `entries/mobile.tsx`。
- 协议：WebSocket 文本帧 JSON；服务端把消息广播给所有已连接客户端。定义见 `protocol/README.md`。
- 数据流：手机 App →(ws)→ 桌面服务 → 广播 → 桌面 UI / 其他客户端。
- 前端重构目标栈（脚手架已就绪，旧 UI 未迁移）：React 19 + Tailwind v4 + shadcn/ui（Base UI, base-nova）+ Motion + Rive；见 `docs/frontend-architecture.md`。

### 桌面端接口

| 方式 | 路径/名称 | 说明 |
| --- | --- | --- |
| HTTP GET | `/` | 手机落地页（含「下载 App」按钮 + 网页聊天预览） |
| HTTP GET | `/download/apk` | 直接下载 debug APK（读取 `gen/android/.../app-universal-debug.apk`，未构建时返回 404） |
| WS | `/ws` | 消息通道 |
| UDP | `47820` | 发现响应器：收 `sidekick.discover` 探测，单播回主机名 + 真实端口 |
| Tauri 命令 | `server_info` | 等就绪后返回 `{ip, port, url, discoveryPort}`，前端展示地址/发现状态/二维码 |

### 手机端接口

| 方式 | 名称 | 说明 |
| --- | --- | --- |
| Tauri 命令 | `app_role` | 返回 `mobile` |
| Tauri 命令 | `discover_servers` | 无参；UDP 广播发现同网段电脑，返回 `{name, ip, port, addr}[]`（异常返回空数组） |
| Tauri 命令 | `connect_server({addr})` | 连接 `ws://<addr>/ws`；`addr` 可只写 `IP:端口`（缺省 47810）；重复调用先断开旧连接，4s 超时 |
| Tauri 命令 | `send_chat({text})` | 发送 `{"type":"chat","from":"phone",...}` |
| Tauri 命令 | `set_keep_screen_on({enabled})` | 宠物页前台屏幕常亮：Android JNI 加/清 `FLAG_KEEP_SCREEN_ON`；iOS 暂为空实现 |
| Tauri 事件 | `conn` / `chat` | `conn: {online, url}`；`chat: <JSON 字符串>` |

## 4. 目录结构

```
sidekick/
├─ AGENTS.md            # ← 本文件（最高优先级上下文）
├─ README.md            # 人类入口
├─ .qoder/
│  ├─ agents/           # 项目子智能体（docs-router / prd-reviewer / pet-designer / audio-engineer / protocol-guardian）
│  └─ skills/           # 项目 Skill（sidekick-docs / sidekick-feature）
├─ app/                 # Tauri 项目（桌面 + 安卓共用，构建两个产物）
│  ├─ index.html
│  ├─ src/main.tsx      # createRoot + app_role 动态 import entry
│  ├─ src/entries/      # desktop.tsx / mobile.tsx
│  ├─ src/desktop/      # 桌面平台：features/connect、features/chat
│  ├─ src/mobile/       # 手机平台：features/connect、features/chat
│  ├─ src/protocol/     # messages.ts（chat/system/ServerInfo/ConnEvent）+ discovery.ts（发现结果）
│  ├─ src/shared/       # ui / lib（tauri.ts）/ styles
│  ├─ src/dev/          # 仅开发环境 Tauri mock（浏览器验证）
│  ├─ src-tauri/src/lib.rs        # 桌面 axum 服务 + 手机 WS 客户端（cfg 分流；动态端口/连接串行化）
│  ├─ src-tauri/src/discovery.rs  # UDP 局域网发现（探测/回包/响应器/扫描）
│  ├─ src-tauri/mobile/index.html # 手机浏览器落地页（含下载按钮）
│  ├─ src-tauri/tauri.conf.json   # 产品名 Sidekick / identifier dev.sidekick.app
│  └─ src-tauri/gen/    # tauri android init 生成（已 gitignore，需重新生成）
├─ brand/               # logo 源文件（SVG 图标 / 横版 / App 图标 / favicon）
├─ protocol/README.md   # 事件协议 v0
├─ docs/
│  ├─ INDEX.md          # 文档树入口（懒加载）
│  ├─ product/          # 产品原则、用户、范围、指标
│  ├─ standards/        # 文档/产品/交互/视觉/工程规范
│  ├─ prd/              # 宠物、麦克风 PRD / SPEC / ACCEPTANCE
│  ├─ engineering/      # 音频链路、协议提案、宠物运行时、测试
│  └─ architecture.md … # 现有基础文档
└─ scripts/             # 安卓构建与安装、文档检查
```

前端结构已落地：`src/entries` + `src/desktop` + `src/mobile` + `src/shared` + `src/protocol`，禁止跨平台 import；详见 `docs/standards/engineering.md`。

## 5. 常用命令

前提：`cd sidekick/app && pnpm install`。

- 桌面开发：`pnpm tauri dev`（窗口出现即服务已启动；日志可见 `[server] listening on http://0.0.0.0:47810` 与 `[discovery] UDP 响应器已启动`）
- 生成安卓工程（首次/清理后）：`pnpm tauri android init`（需要 `ANDROID_HOME` / `NDK_HOME` / `JAVA_HOME`，见 `docs/setup.md`）
- 构建 debug APK：`scripts/build-android.sh`
  - 等价于：`pnpm tauri android build --debug --target aarch64 --apk`
  - 产物：`app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
- 安装并启动：`scripts/install-android.sh`（`adb install -r` + `am start`）
- 日志：桌面端看 `tauri dev` 终端；安卓端 `adb logcat`
- 前端质量：`pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm format`（Biome + Vitest；覆盖 entries/desktop/mobile/shared/protocol/test/dev）
- 重生成全平台图标：`pnpm tauri icon ../brand/logo-appicon.svg`（在 `app/` 内运行；会同步 Android mipmap，`gen/` 清空后需先 `pnpm tauri android init`）
- 文档检查：`node scripts/check-docs.mjs`（在仓库根目录运行）
- 平台边界检查：`node scripts/check-boundaries.mjs`（迁移出 `src/mobile` / `src/desktop` 后自动生效）

### 项目子智能体

| 代理 | 什么时候用 |
| --- | --- |
| `sidekick-docs-router` | 查规范/PRD/方案，按树懒加载，不批量读 |
| `sidekick-prd-reviewer` | 写完/改完 PRD，按 10 项质量门评审 |
| `sidekick-pet-designer` | 宠物体验/视觉/动效评审 |
| `sidekick-audio-engineer` | 麦克风采集/传输/转写/输入方案与排障 |
| `sidekick-protocol-guardian` | 改协议/消息类型后检查文档与实现一致 |

> 新建/修改 `.qoder/agents` 或 `.qoder/skills` 后，需要刷新或重启 Qoder 才会被识别。

## 6. 环境（macOS arm64）

- Rust 1.93（brew `rust`，含 rustup；Rust 安卓目标已安装）
- Node 24 + pnpm 11（`packageManager` 已锁定 pnpm@11.22）；Tauri CLI 在 `app/` 的 devDependencies
- JDK 21：`/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`
- Android SDK：`~/Library/Android/sdk`（cmdline-tools 由 brew cask 安装）
- NDK `27.2.12479018`；compileSdk 37（SDK 包名是 `platforms;android-37.0`）
- 已安装：`rust`、`openjdk@21`、`android-commandlinetools`、`cargo-ndk`、`gh`、`pnpm`
- 详细安装步骤 / 环境变量 / 无线调试流程：`docs/setup.md`

## 7. 验证「改完没坏」的最短路径

1. 桌面端 `pnpm tauri dev`，确认日志出现 `[server] listening on http://0.0.0.0:47810` 与 `[discovery] UDP 响应器已启动`；
2. `scripts/build-android.sh && scripts/install-android.sh`，手机上打开 App；
3. App 启动后自动发现并连接（logcat 见 `[discovery] 扫描结束，发现 N 台电脑` → `[mobile] connected to ws://…`），状态变「已连接」；发现失败再展开「手动输入地址」兜底；
4. 双向发消息，桌面日志应出现 `[ws] recv: {...}`；
5. 无头验证（推荐 AI 用）：见 `docs/setup.md`「WebView 远程调试」，用 CDP 调 Tauri 命令并用 `adb exec-out screencap -p` 截图确认。

## 8. 已知坑（踩过的都在这）

- **不要给 body 加平台状态类**：桌面/手机是两个独立 entry，各自固定布局；历史上 `.mobile { display:none }` 命中 `<body class="mobile">` 导致整页黑屏，已删除旧 DOM/styles。
- **StrictMode 订阅**：Tauri `listen` 是异步的；`shared/lib/tauri.ts` 的 `subscribe*` 已处理 pending/cleanup，组件 effect 必须调用返回的同步退订函数，不要每次渲染重新 listen。
- **广播回显**：桌面/手机发送后都不要本地追加，等服务端广播回显；按 `from` 判断 me/them，避免重复消息。
- **dev mock**：浏览器验证用 `http://localhost:1420/?role=mobile`；`src/dev/tauri-mock.ts` 只在 `import.meta.env.DEV` 生效，生产构建不包含。
- **无线调试两个端口不同**：配对弹窗里的是「配对端口」，无线调试主页的是「连接端口」；`adb pair` 用前者、`adb connect` 用后者。配对码离开弹窗即失效。
- **adb 出现重复设备**：mDNS 与 IP 两条 transport 同时存在会报 `more than one device/emulator`；`adb disconnect <mDNS 服务名>` 只留 IP 连接。
- **compileSdk 37**：SDK 包名是 `platforms;android-37.0`，不是 `android-37`。
- **debug APK 很大**（约 120–240MB，含未剥离调试符号），属正常；release 需签名，体积预计 10–20MB。
- **`gen/` 不入库**：`app/src-tauri/gen/` 已 gitignore；克隆后必须先 `pnpm tauri android init` 再构建。
- **macOS 防火墙**：第一次接受局域网连接会弹「允许传入网络连接」，必须允许，否则手机连不上。
- **手机与电脑需同一局域网**；开发机 IP 会变，一般不用手填（自动发现），发现失败时再手动输入桌面窗口显示的地址。
- **自动发现的三个前提**：同一网段、路由器不拦广播/无 AP 隔离、macOS 防火墙允许 Sidekick 传入（TCP 服务端口 + UDP 47820）。
- **端口被占用是正常的**：`47810` 被占会自动顺延到 `47811`…，桌面日志与窗口地址显示真实端口；手机发现回包也带真实端口。
- **同机多实例**：只有一个实例能绑 UDP 47820，只有先启动的实例会被自动发现。
- **重复连接**：手机端 `connect_server` 已串行化（先 abort 旧连接 + generation 守卫），自动连接与手动点击并发不会互相覆盖状态。
- **自动重连**：`connection-store` 用模块级单一定时器，退避 1s→2s→4s→8s→16s→30s（上限 30s），每次重试先静默 UDP 重新发现（覆盖端口回退/IP 变化），发现 0 台退回上次地址，多台回上次那台、无地址则停止；手动连接/重新搜索会取消排期并清零退避；`document.hidden` 暂停、回前台立即重试。电脑恢复最晚一个退避周期（≤30s）连上。
- **无心跳**：协议没有 ping/pong；进程退出/网络断开靠 FIN/RST 立刻发现（实测约 0.5s），电脑睡眠/路由器静默丢包可能长时间仍显示「已连接」，需心跳方案补齐。
- **在线人数会跳动**：广播的「当前 N 个」是瞬时连接数，测试脚本/网页预览会造成数字变化，不是 bug。
- **WebView 103 兼容**：真机 Realme 的 Android System WebView 为 103，不支持 `oklch`/`dvh`/`color-mix`；颜色用 `tokens.css` 的 hex/rgb fallback，`h-dvh` 由 `globals.css` 未分层 `100vh` 覆盖。改颜色/全屏高度时先在真机验证。**也不支持 CSS `translate` 属性**：Tailwind v4 的 `translate-x/y-*` 工具类编译成 `translate: var(--tw-translate-x) …`，在真机上会被忽略（元素整体偏半个自身宽度）。居中/位移不要用 `left-1/2 -translate-x-1/2`，改用 `inset-x-0` + flex `items-center`，或 `left-0 right-0 mx-auto`；dialog/sheet/tooltip 里仍有 translate 类，属已知待修项。
- **Android 返回键**：不注册 `back-button` 监听时系统默认直接 finish（退出 App）。现在 App 启动即注册一次 `subscribeBackButton`（`shared/lib/tauri.ts`）；设置页/聊天页通过 `mobile/system-back.ts` 返回栈消费，根页面走「再按一次退出」（第一次提示、2 秒内第二次调 `exitApp()`，需要 `core:app:allow-exit` 权限，已在 `capabilities/default.json`）。**新增全屏页面时记得 `pushBackHandler`，否则该页按返回会被根页面当成退出确认**。浏览器 `?role=mobile` 用 Esc 模拟返回键（dev mock）。
- **屏幕常亮**：走 Android 原生窗口标志（`app/src-tauri/src/keep_awake.rs`，`WebviewWindow::with_webview` + `jni_handle().exec`），不用 `navigator.wakeLock`（WebView 上可用性/权限前提不确定）；`jni` 只加在 Android 目标并**锁 0.21**（必须与 `tauri-runtime-wry` 一致，否则 `JniHandle::exec` 闭包类型不匹配）。窗口标志只在窗口可见时生效，所以聊天页/后台由 JS 显式释放；无需 `WAKE_LOCK` 权限。JNI 失败只打 `[keep-awake]` 日志，静默降级为系统默认熄屏。常亮有上限：`useKeepAwake(active, maxDurationMs)` 到点释放，回前台重新计时（`keepAwakeHours` 默认 2，0 = 不限）。
- **触感（震动）**：WebView 默认长按会由系统发 `LONG_PRESS` 震动（看起来像「点了但没反应」，实际每一下都震）；启动时调 `disable_webview_haptics` → `WebView.setHapticFeedbackEnabled(false)` 关掉它。App 自己的触感走 `haptic(style)` 命令 → `decorView.performHapticFeedback`（light/medium/success/error，API<30 时 CONFIRM/REJECT 降级），**不需要 VIBRATE 权限**；`navigator.vibrate` 因 APK 未声明 VIBRATE 会被 Chromium 忽略（只当浏览器兜底），所以不要再指望它。系统「触摸振动」关闭时 App 静默不震。宠物页靠 `user-select:none` + `-webkit-touch-callout:none` + `contextmenu` 阻止选中/复制，聊天文本和输入框不受影响。
- **变暗/常亮时长**：`dimMinutes`（默认 5，1–60）与 `keepAwakeHours`（默认 2，0 = 不限）在 `persistence.ts` 归一化；改默认值要同步迁移测试与 `docs/prd/pet/SPEC.md` §7。
- **方向自动姿态**：`use-orientation.ts` 用 `matchMedia("(orientation: portrait)")` + resize/orientationchange；横屏 docked、竖屏 handheld，设置手动覆盖只持续到下次旋转。
- **麦克风权限**：Android 需 `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`（由 `scripts/patch-android-manifest.mjs` 写入 gen manifest）；Tauri 移动端需 `on_permission_request` 允许 `Microphone`。WebView 103 的 `ScriptProcessor` buffer 必须是 2 的幂（已用 2048）。
- **麦克风 P0**：`whisper-rs` 构建需 cmake + libclang（`LIBCLANG_PATH=/Library/Developer/CommandLineTools/usr/lib`）；模型目录 `~/Library/Application Support/Sidekick/models`，启动会 prewarm，首次手动加载可能 5–6 秒；音频只在内存，不再有临时 WAV。
- **自动粘贴 TCC**：`core-graphics` 合成 Cmd+V 需要 macOS 辅助功能勾选当前程序；开发二进制每次重编译可能被当成新程序，需要重新勾选（设置页有请求权限/重新检测）。不勾选只复制。
- **麦克风录音 UI 锚点**：手持模式底部居中的 96dp 按钮容器只能包含按钮本身；录音条/结果卡片/临时提示必须放在独立绝对定位层（`left-0 right-0 mx-auto w-[min(82vw,360px)] bottom-[104px]`、`pointer-events-none`），否则会把 flex 容器撑宽、按钮被挤偏，看起来「按住后跳走」。居中要用 `inset-x-0` + flex `items-center` / `left-0 right-0 mx-auto`，**不要用 `left-1/2 -translate-x-1/2`**（WebView 103 不支持 CSS translate，会偏右半宽）。取消只保留上滑手势（≥48dp，滑回 <24dp 继续），**不要再加左下取消按钮**：按住说话时去点它必须先松手，而松手就已经结束录音，按钮自相矛盾。
- **剪贴板**：`NSPasteboard` 每 500ms 检查 changeCount；`org.nspasteboard.ConcealedType/TransientType/GeneratedType` 与密码管理器类型不记录；Sidekick 自身写入通过 `skip_next` 防重复；语音转写经 `write_text_and_record` 以 `kind = "voice"` 入库（暂停记录时仍写系统剪贴板、但不入历史）；最多 100 条（置顶优先淘汰）；文件 `~/Library/Application Support/Sidekick/clipboard.json` 权限 600。
- **shadcn 不要混 base**：当前固定 `base-nova`（Base UI）；组件从 registry 复制，不要再引 Radix 版本；类名合并用 `cn`，不要再装 clsx/tailwind-merge。

## 9. 协作约定

- 用户是中文母语：沟通用中文、直白、先基础后细节；环境配置由 AI 直接代劳，但破坏性操作（删库、重置、卸载）先问。
- 改动跨端时同步更新 `protocol/README.md` 与相关 docs；重大决策追加到 `docs/decisions.md`。
- 文档遵循 `docs/standards/documentation.md`：先改“唯一归属”文档，再同步索引；不要一次读完整棵文档树。
- 平台边界：`mobile` 不 import `desktop`，`desktop` 不 import `mobile`，`shared` 不 import 两者；详见 `docs/standards/engineering.md`。
- 前端改动遵循 `docs/frontend-architecture.md`；新增/升级依赖遵循 `docs/dependency-policy.md`，新增运行时依赖追加到 `docs/decisions.md`。
- 不提交构建产物（`app/dist`、`node_modules`、`src-tauri/target`、`gen/`、APK、`.venv`）。
- GitHub 推送已配置（gh 登录 fouriyeo，已 `gh auth setup-git`）。共享/不可逆操作（force push、改仓库可见性）先确认。

## 10. 下一步路线（按优先级）

> 前置：Phase 1 平台分目录与连接/聊天迁移已完成（2026-10-31）；手机自动发现电脑已落地；宠物 P0 代码完成（真机/Rive 待补）；麦克风 P0 与桌面剪贴板 P1 代码完成，真机/辅助功能待回归。

1. ✅ 前端平台分目录 + 连接/聊天迁移（已完成 2026-10-31）。
2. 情绪宠物 P0：代码已完成（静态 SVG 降级、方向自动双姿态（手动覆盖）、plugin-store 存档）；真机 60fps/存档跨重启与 Rive 资产待补。
3. ✅ 外设麦克风 P0：二进制协议、内存 ASR、模型管理、手机 UI、桌面设置/浮层已完成；下一步勾选 macOS 辅助功能验证自动粘贴，并补真机 60 秒/断连/密码框矩阵。
4. ✅ 桌面剪贴板 P1：文本历史、搜索、置顶、隐私过滤、本地持久化已完成；语音转写以 `voice` 入库、100 条上限在 UI 可见（2026-11-01）。
5. 接入 Claude Code hooks：`notify` / `ask` 事件推手机，手机回答回传并作为 hook 结果（协议扩展 status / ask / notify / input）。
6. 配对鉴权 + release 签名/桌面打包/开机自启。
7. 蓝牙通道：评估 Tauri 移动端 BLE（需自写 Kotlin 插件）或 Python sidecar；见 `docs/ble-notes.md`。
8. iOS 目标（Tauri mobile 初始化 + 后台限制评估）。
9. P2：系统级虚拟麦克风、云同步/多语言。
