# AGENTS.md — Sidekick 项目上下文

> 面向 AI 编码代理：读完这一份就能接手。细节在 `docs/`，协议在 `protocol/`。
> 最后更新：2026-10-31

## 1. 项目是什么

- 名称：小跟班 · Sidekick
- 一句话：把手机变成电脑的「外设 + AI 宠物」——电脑把 AI/任务状态推给手机，用户在手机上收通知、回答 AI 的提问、发快捷指令、语音输入。
- 仓库：https://github.com/fouriyeo/sidekick （私有，owner 项目维护者 / fouriyeo）
- 本地路径：`/Users/dev/code/sidekick`
- 平台目标：Android 优先，iOS 后续；电脑端先 macOS。

## 2. 当前状态（务必先看）

- ✅ **局域网 MVP 已验证**（2026-10-31）：Tauri 桌面端（服务端）+ Tauri 安卓 App（客户端）双向收发消息成功。
- ✅ 安卓 App 可构建、可安装到真机（测试机 Realme RMX3370 / Android 13）；首版「黑屏」问题已修复（见第 8 节）。
- 前端重构脚手架已就绪（2026-10-31）：React 19 + Tailwind v4 + shadcn/ui（Base UI, base-nova）+ Motion + Rive；依赖、Vite/TS、Biome、Vitest 已配置，**旧 UI 尚未迁移**；规范见 `docs/frontend-architecture.md`，依赖治理见 `docs/dependency-policy.md`。
- 产品规范与两份 PRD 已落地（2026-10-31）：`docs/product`、`docs/standards`、`docs/prd`、`docs/engineering`；文档采用树形 + 懒加载，入口 `docs/INDEX.md`。
- ⏸ 蓝牙通道：预研过，Mac 可用 Python `bless` 当 BLE 外设广播（见 `docs/ble-notes.md`），但**主线暂定为局域网**，蓝牙延后。
- ❌ 尚未开始：宠物与麦克风实现、Claude Code / Qoder hook 接入、配对鉴权、正式签名包、iOS。

## 2.5 文档导航（懒加载）

- 唯一入口 `docs/INDEX.md`；先读它，再按任务选 **1 个**分支；最多读 2 篇叶子，不要整棵读完。
- 分支：产品方向 `docs/product/`、规范 `docs/standards/`、PRD `docs/prd/`、技术方案 `docs/engineering/`。
- 现有基础文档仍是事实源：`docs/architecture.md`、`docs/frontend-architecture.md`、`docs/dependency-policy.md`、`protocol/README.md`。
- 新文档必须带 frontmatter；改完跑 `node scripts/check-docs.mjs`。
- 项目子智能体在 `.qoder/agents/`；项目 Skill 在 `.qoder/skills/`（`sidekick-docs`、`sidekick-feature`）。

## 3. 技术栈与架构速览

- 单仓库、双产物：Tauri 2 桌面端 + 安卓端共用 `app/`，但构建出两个独立软件；Rust 用 `cfg(desktop/mobile)` 隔离，桌面服务代码不进手机包。
- 前端按平台分目录：`src/desktop`、`src/mobile`、`src/shared`、`src/protocol`；桌面与手机各自固定布局，**不做跨端自适应**。详见 `docs/standards/engineering.md`。
- 桌面端：Tauri（Rust）+ Vite/TypeScript；Rust 里跑 axum HTTP/WebSocket 服务，端口 **8848**。
- 手机端：Tauri Android App（Rust 核心 + WebView UI）；Rust 侧用 tokio-tungstenite 主动连电脑，前端通过 Tauri 命令/事件与 Rust 通信。
- 角色判定：Rust `app_role` 命令按 `cfg!(target_os = "android" | "ios")` 返回 `mobile` / `desktop`；前端据此挂载对应 entry（目标：`entries/desktop.tsx` / `entries/mobile.tsx`，当前仍是 `main.ts` 分支）。
- 协议：WebSocket 文本帧 JSON；服务端把消息广播给所有已连接客户端。定义见 `protocol/README.md`。
- 数据流：手机 App →(ws)→ 桌面服务 → 广播 → 桌面 UI / 其他客户端。
- 前端重构目标栈（脚手架已就绪，旧 UI 未迁移）：React 19 + Tailwind v4 + shadcn/ui（Base UI, base-nova）+ Motion + Rive；见 `docs/frontend-architecture.md`。

### 桌面端接口

| 方式 | 路径/名称 | 说明 |
| --- | --- | --- |
| HTTP GET | `/` | 手机落地页（含「下载 App」按钮 + 网页聊天预览） |
| HTTP GET | `/download/apk` | 直接下载 debug APK（读取 `gen/android/.../app-universal-debug.apk`，未构建时返回 404） |
| WS | `/ws` | 消息通道 |
| Tauri 命令 | `server_info` | 返回 `{ip, port, url}`，前端用于展示地址与二维码 |

### 手机端接口

| 方式 | 名称 | 说明 |
| --- | --- | --- |
| Tauri 命令 | `app_role` | 返回 `mobile` |
| Tauri 命令 | `connect_server({addr})` | 连接 `ws://<addr>/ws`；`addr` 可只写 `IP:端口`（缺省 8848） |
| Tauri 命令 | `send_chat({text})` | 发送 `{"type":"chat","from":"phone",...}` |
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
│  ├─ src/main.ts       # 当前角色分流入口（迁移前）
│  ├─ src/shared/       # 已就绪的共享组件/样式/工具
│  ├─ src-tauri/src/lib.rs        # 桌面 axum 服务 + 手机 WS 客户端（cfg 分流）
│  ├─ src-tauri/mobile/index.html # 手机浏览器落地页（含下载按钮）
│  ├─ src-tauri/tauri.conf.json   # 产品名 Sidekick / identifier dev.sidekick.app
│  └─ src-tauri/gen/    # tauri android init 生成（已 gitignore，需重新生成）
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

目标前端结构：`src/entries` + `src/desktop` + `src/mobile` + `src/shared` + `src/protocol`，禁止跨平台 import；详见 `docs/standards/engineering.md`。迁移完成前当前入口仍是 `src/main.ts`。

## 5. 常用命令

前提：`cd sidekick/app && pnpm install`。

- 桌面开发：`pnpm tauri dev`（窗口出现即服务已启动；日志可见 `[server] listening on http://0.0.0.0:8848`）
- 生成安卓工程（首次/清理后）：`pnpm tauri android init`（需要 `ANDROID_HOME` / `NDK_HOME` / `JAVA_HOME`，见 `docs/setup.md`）
- 构建 debug APK：`scripts/build-android.sh`
  - 等价于：`pnpm tauri android build --debug --target aarch64 --apk`
  - 产物：`app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`
- 安装并启动：`scripts/install-android.sh`（`adb install -r` + `am start`）
- 日志：桌面端看 `tauri dev` 终端；安卓端 `adb logcat`
- 前端质量：`pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm format`（Biome + Vitest；当前只覆盖新脚手架目录，旧 `src/main.ts` 暂不在 lint 范围）
- 文档检查：`node scripts/check-docs.mjs`（在仓库根目录运行）
- 平台边界检查：`node scripts/check-boundaries.mjs`（迁移出 `src/mobile` / `src/desktop` 后自动生效）

### 项目子智能体

| 代理 | 什么时候用 |
| --- | --- |
| `sidekick-docs-router` | 查规范/PRD/方案，按树懒加载，不批量读 |
| `sidekick-prd-reviewer` | 写完/改完 PRD，按 10 项质量门评审 |
| `sidekick-pet-designer` | 宠物体验/视觉/动效/横屏评审 |
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

1. 桌面端 `pnpm tauri dev`，确认日志出现 `[server] listening`；
2. `scripts/build-android.sh && scripts/install-android.sh`，手机上打开 App；
3. 在 App 输入 `电脑IP:8848` 并连接，状态变「已连接」；
4. 双向发消息，桌面日志应出现 `[ws] recv: {...}`；
5. 无头验证（推荐 AI 用）：见 `docs/setup.md`「WebView 远程调试」，用 CDP 调 Tauri 命令并用 `adb exec-out screencap -p` 截图确认。

## 8. 已知坑（踩过的都在这）

- **CSS 类名冲突导致黑屏**：`.mobile { display:none }` 会命中 `<body class="mobile">`，整页不可见。手机样式必须限定到 `#mobile-view`（或加前缀），不要用裸 `.mobile` 选择器。
- **无线调试两个端口不同**：配对弹窗里的是「配对端口」，无线调试主页的是「连接端口」；`adb pair` 用前者、`adb connect` 用后者。配对码离开弹窗即失效。
- **adb 出现重复设备**：mDNS 与 IP 两条 transport 同时存在会报 `more than one device/emulator`；`adb disconnect <mDNS 服务名>` 只留 IP 连接。
- **compileSdk 37**：SDK 包名是 `platforms;android-37.0`，不是 `android-37`。
- **debug APK 很大**（约 120–240MB，含未剥离调试符号），属正常；release 需签名，体积预计 10–20MB。
- **`gen/` 不入库**：`app/src-tauri/gen/` 已 gitignore；克隆后必须先 `pnpm tauri android init` 再构建。
- **macOS 防火墙**：第一次接受局域网连接会弹「允许传入网络连接」，必须允许，否则手机连不上。
- **手机与电脑需同一局域网**；开发机 IP 会变，App 里填的地址要跟着改。
- **在线人数会跳动**：广播的「当前 N 个」是瞬时连接数，测试脚本/网页预览会造成数字变化，不是 bug。
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

> 前置：先按 `docs/standards/engineering.md` 完成平台分目录与前端迁移；宠物/麦克风的 PRD 已就绪，但实现未开始。

1. 前端平台分目录 + 连接/聊天迁移：`src/entries`、`src/desktop`、`src/mobile`、`src/shared`、`src/protocol`；对应 `docs/frontend-architecture.md` 的 Phase 1。
2. 情绪宠物 P0：按 `docs/prd/pet/` 实现；真机 60fps、零焦虑、横屏双姿态。
3. 外设麦克风 P0：先做 spike（Android 采集、本机 ASR、macOS 文本输入），再按 `docs/prd/mic/` 实现；只输入、不发送。
4. 接入 Claude Code hooks：`notify` / `ask` 事件推手机，手机回答回传并作为 hook 结果（协议扩展 status / ask / notify / input）。
5. 配对鉴权 + release 签名/桌面打包/开机自启。
6. 蓝牙通道：评估 Tauri 移动端 BLE（需自写 Kotlin 插件）或 Python sidecar；见 `docs/ble-notes.md`。
7. iOS 目标（Tauri mobile 初始化 + 后台限制评估）。
8. P2：系统级虚拟麦克风、云同步/多语言。
