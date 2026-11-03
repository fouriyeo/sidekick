# AGENTS.md — Sidekick 项目上下文

> 面向 AI 编码代理：读完这一份就能接手。细节在 `docs/`，协议在 `protocol/`。
> 最后更新：2026-11-04

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
- ✅ **宠物 P0 代码已完成**（2026-10-31；2026-11-02 改为帧动画图集；2026-11-04 下线触摸互动）：OpenPets schema 2 图集（WebP 764KB + poster）+ 状态候选链 + 解码/降级；状态机/plugin-store 存档、单竖屏布局、命名/设置、宠物主界面 + 聊天入口不变；触摸互动（点击/长按/抚摸、爱心、亲密度、interacting、设置页无障碍互动）已删除，点击宠物无任何反应；真机 60fps 与存档跨重启待补，扩展状态行（睡眠/倾听）待美术。
- ✅ **麦克风（百炼云端唯一）**（2026-11-02）：手机 WebView 流式 PCM16 → `mic.*` + `SK01` 二进制帧 → 桌面直连百炼 WS（run-task/finish-task、二进制 PCM）→ `mic.partial` 50ms 流式回显 → `arboard` 写剪贴板 + `core-graphics` 合成 Cmd+V；未授权/窗口变化/密码框只复制。本机 whisper/模型下载已下线，失败直接报错、不回退。
- ✅ **结果卡片手动「回车 / 清空」**（2026-11-04）：语音输入成功后，「已输入」卡片出现两个按钮——「回车」合成 Return，「清空」合成 `⌘A`+`Delete`（两次确认）；新增 `key.request`/`key.result` 协议，只作用于最近一次插入的目标窗口（30 秒时效、成功即作废、500ms 限频、密码框/未授权/非 macOS 拒绝），仍**不自动发送**。
- ✅ **模型页 + 用量统计**（2026-11-02）：桌面主导航新增「模型」（AI 联动之后），上半部分配置百炼（完整地址/本地 `asr.json` 0600 保存 API Key/模型/语言/场景/热词/同意/测试/保存/清除 Key；无业务空间 ID 字段），下半部分区间切换（今天/近 7 天/近 1 个月/近 1 年；今天无明细、7/30 按天、1 年按月）+ 金额/Token/会话/时长（人民币微元，北京/新加坡价格估算）；`asr_usage.json` 0600、按天、最多 400 天；`asr_usage_stats()` 返回 365 天 `days`。
- ✅ **桌面剪贴板 P1**（2026-10-31，2026-11-01 补语音入库与上限展示）：文本历史、搜索、复制、置顶、删除、清空、暂停；隐藏类型过滤；语音转写以 `voice` 入库；最多 100 条；本地 `0600` JSON。
- 🚧 **AI 联动（DSH hook）开发中**（2026-11-02；2026-11-03 加会话列表）：桌面「AI 联动」页 + 本地 `sidekick-hook.mjs` 注入 DSH profile + Rust 回环桥 + `status` 协议（含 `sessionList`）+ 手机四态动作/三音效 + 宠物页会话列表/本地清除/反问一键唤起 DSH；产品规则 `docs/prd/hook/`，技术方案 `docs/engineering/dsh-hook.md`；首次开启需重启 DSH 一次，之后热开关。
- ❌ 尚未开始：手机回答 AI 提问、文本消息、Claude Code / Qoder 接入、配对鉴权、正式签名包、iOS。

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
- 前端重构目标栈（脚手架已就绪，旧 UI 未迁移）：React 19 + Tailwind v4 + shadcn/ui（Base UI, base-nova）+ Motion；宠物为帧动画图集（OpenPets schema 2），见 `docs/frontend-architecture.md`。

### 桌面端接口

| 方式 | 路径/名称 | 说明 |
| --- | --- | --- |
| HTTP GET | `/` | 手机落地页（含「下载 App」按钮 + 网页聊天预览） |
| HTTP GET | `/download/apk` | 直接下载 debug APK（读取 `gen/android/.../app-universal-debug.apk`，未构建时返回 404） |
| WS | `/ws` | 消息通道 |
| UDP | `47820` | 发现响应器：收 `sidekick.discover` 探测，单播回主机名 + 真实端口 |
| Tauri 命令 | `server_info` | 等就绪后返回 `{ip, port, url, discoveryPort}`，前端展示地址/发现状态/二维码 |
| Tauri 命令 | `asr_cloud_status` / `asr_cloud_save` / `asr_cloud_test` / `asr_cloud_clear` | 百炼配置/状态/测试/清除；Key 存本地 `asr.json`（0600），状态只返回 `hasKey`/`keyMasked`，不读 Keychain |
| Tauri 命令 | `asr_usage_stats` / `asr_usage_clear` | 今天/7/30/365 汇总 + 最近 365 天 `days`；清空只重置本地统计 |

### 手机端接口

| 方式 | 名称 | 说明 |
| --- | --- | --- |
| Tauri 命令 | `app_role` | 返回 `mobile` |
| Tauri 命令 | `discover_servers` | 无参；UDP 广播发现同网段电脑，返回 `{name, ip, port, addr}[]`（异常返回空数组） |
| Tauri 命令 | `connect_server({addr})` | 连接 `ws://<addr>/ws`；`addr` 可只写 `IP:端口`（缺省 47810）；重复调用先断开旧连接，4s 超时 |
| Tauri 命令 | `send_chat({text})` | 发送 `{"type":"chat","from":"phone",...}` |
| Tauri 命令 | `send_focus_request({source,sessionId,requestId})` | 发送 `focus.request`；结果走 `chat` 事件里的 `focus.result` |
| Tauri 命令 | `send_key_request({action,session,requestId})` | 发送 `key.request`（`enter`/`clear`）；结果走 `chat` 事件里的 `key.result`，只允许用户主动点按 |
| Tauri 命令 | `set_keep_screen_on({enabled})` | 宠物页前台屏幕常亮：Android JNI 加/清 `FLAG_KEEP_SCREEN_ON`；iOS 暂为空实现 |
| Tauri 事件 | `conn` / `chat` | `conn: {online, url}`；`chat: <JSON 字符串>`（含 status/sessionList/focus.result/mic.*/chat） |

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
│  ├─ src-tauri/src/desktop_keys.rs # 结果卡片手动 Enter/⌘A+Delete（安全闸门/目标注册表）
│  ├─ src-tauri/src/discovery.rs  # UDP 局域网发现（探测/回包/响应器/扫描）
│  ├─ src-tauri/mobile/index.html # 手机浏览器落地页（含下载按钮）
│  ├─ src-tauri/tauri.conf.json   # 产品名 Sidekick / identifier dev.sidekick.app
│  └─ src-tauri/gen/    # tauri android init 生成（已 gitignore，需重新生成）
├─ brand/               # logo 源文件（SVG 图标 / 横版 / App 图标 / favicon）
├─ release/             # 打包好的安装包（固定文件名，每次覆盖，不建版本号目录）
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
- 打包 release 安装包：`scripts/package-release.sh`（或 `package-desktop.sh` / `package-android.sh`）
  - 桌面：`pnpm tauri build` → 覆盖 `release/Sidekick-macOS.dmg`（未签名）
  - 安卓：release 构建 → `zipalign` + `apksigner`（本地密钥）→ 覆盖 `release/Sidekick-Android.apk`
  - 固定文件名、不建版本号目录；不要提交 debug APK（约 250MB，超 GitHub 100MB 上限）
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
- **debug APK 很大**（约 120–240MB，含未剥离调试符号），属正常；release 需签名，体积预计 10–20MB。`release/` 只放 release 包：debug 包超过 GitHub 单文件 100MB 上限，推不上去。
- **release/ 固定产物**：`scripts/package-release.sh` 生成 `release/Sidekick-macOS.dmg`（未签名）与 `release/Sidekick-Android.apk`（release + 本地 keystore 签名，首次运行自动生成 `~/.sidekick/android-release.jks`）；文件名固定、每次覆盖，不要改成带版本号。Git 会为每次提交保留二进制历史副本，固定文件名只让工作区保持一份（仓库历史仍随每次推送增长）。
- **`gen/` 不入库**：`app/src-tauri/gen/` 已 gitignore；克隆后必须先 `pnpm tauri android init` 再构建。
- **macOS 防火墙**：第一次接受局域网连接会弹「允许传入网络连接」，必须允许，否则手机连不上。
- **手机与电脑需同一局域网**；开发机 IP 会变，一般不用手填（自动发现），发现失败时再手动输入桌面窗口显示的地址。
- **自动发现的三个前提**：同一网段、路由器不拦广播/无 AP 隔离、macOS 防火墙允许 Sidekick 传入（TCP 服务端口 + UDP 47820）。
- **端口被占用是正常的**：`47810` 被占会自动顺延到 `47811`…，桌面日志与窗口地址显示真实端口；手机发现回包也带真实端口。
- **桌面端单实例（防多开）**：`tauri-plugin-single-instance` 在 `Builder` 最先注册，第二个进程只把已有窗口叫到前台然后退出（D60）。多开的代价很隐蔽：后启动实例会把 `~/.dsh/sidekick/config.json` 的 `endpoint` 改成它的回环端口（47816），它退出后 DSH hook 的上报全部打空，剩下那个实例的桥永远 idle；而手机发现只认持有 UDP 47820 的先启动实例，于是「AI 在工作、宠物是 idle」。状态不更新时先查 `lsof -nP -iTCP:47815-47819`、config.json 的 endpoint 是否指向活着的进程（`curl -s -o /dev/null -w '%{http_code}' -X POST <endpoint>`）。
- **重复连接**：手机端 `connect_server` 已串行化（先 abort 旧连接 + generation 守卫），自动连接与手动点击并发不会互相覆盖状态。
- **自动重连**：`connection-store` 用模块级单一定时器，退避 1s→2s→4s→8s→16s→30s（上限 30s），每次重试先静默 UDP 重新发现（覆盖端口回退/IP 变化），发现 0 台退回上次地址，多台回上次那台、无地址则停止；手动连接/重新搜索会取消排期并清零退避；`document.hidden` 暂停、回前台立即重试。电脑恢复最晚一个退避周期（≤30s）连上。
- **无心跳**：协议没有 ping/pong；进程退出/网络断开靠 FIN/RST 立刻发现（实测约 0.5s），电脑睡眠/路由器静默丢包可能长时间仍显示「已连接」，需心跳方案补齐。
- **在线人数会跳动**：广播的「当前 N 个」是瞬时连接数，测试脚本/网页预览会造成数字变化，不是 bug。
- **WebView 103 兼容**：真机 Realme 的 Android System WebView 为 103，不支持 `oklch`/`dvh`/`color-mix`；颜色用 `tokens.css` 的 hex/rgb fallback，`h-dvh` 由 `globals.css` 未分层 `100vh` 覆盖。改颜色/全屏高度时先在真机验证。**也不支持 CSS `translate` 属性**：Tailwind v4 的 `translate-x/y-*` 工具类编译成 `translate: var(--tw-translate-x) …`，在真机上会被忽略（元素整体偏半个自身宽度）。居中/位移不要用 `left-1/2 -translate-x-1/2`，改用 `inset-x-0` + flex `items-center`，或 `left-0 right-0 mx-auto`；dialog/sheet/tooltip 里仍有 translate 类，属已知待修项。
- **Android 返回键**：不注册 `back-button` 监听时系统默认直接 finish（退出 App）。现在 App 启动即注册一次 `subscribeBackButton`（`shared/lib/tauri.ts`）；设置页/聊天页通过 `mobile/system-back.ts` 返回栈消费，根页面走「再按一次退出」（第一次提示、2 秒内第二次调 `exitApp()`，需要 `core:app:allow-exit` 权限，已在 `capabilities/default.json`）。**新增全屏页面时记得 `pushBackHandler`，否则该页按返回会被根页面当成退出确认**。浏览器 `?role=mobile` 用 Esc 模拟返回键（dev mock）。
- **屏幕常亮**：走 Android 原生窗口标志（`app/src-tauri/src/keep_awake.rs`，`WebviewWindow::with_webview` + `jni_handle().exec`），不用 `navigator.wakeLock`（WebView 上可用性/权限前提不确定）；`jni` 只加在 Android 目标并**锁 0.21**（必须与 `tauri-runtime-wry` 一致，否则 `JniHandle::exec` 闭包类型不匹配）。窗口标志只在窗口可见时生效，所以聊天页/后台由 JS 显式释放；无需 `WAKE_LOCK` 权限。JNI 失败只打 `[keep-awake]` 日志，静默降级为系统默认熄屏。常亮有上限：`useKeepAwake(active, maxDurationMs)` 到点释放，回前台重新计时（`keepAwakeHours` 默认 2，0 = 不限）。
- **触感（震动）**：WebView 默认长按会由系统发 `LONG_PRESS` 震动（看起来像「点了但没反应」，实际每一下都震）；启动时调 `disable_webview_haptics` → `WebView.setHapticFeedbackEnabled(false)` 关掉它。App 自己的触感走 `haptic(style)` 命令 → `decorView.performHapticFeedback`（light/medium/success/error，API<30 时 CONFIRM/REJECT 降级），**不需要 VIBRATE 权限**；`navigator.vibrate` 因 APK 未声明 VIBRATE 会被 Chromium 忽略（只当浏览器兜底），所以不要再指望它。系统「触摸振动」关闭时 App 静默不震。宠物页靠 `user-select:none` + `-webkit-touch-callout:none` + `contextmenu` 阻止选中/复制，聊天文本和输入框不受影响。
- **变暗/常亮时长**：`dimMinutes`（默认 5，1–60）与 `keepAwakeHours`（默认 2，0 = 不限）在 `persistence.ts` 归一化；改默认值要同步迁移测试与 `docs/prd/pet/SPEC.md` §7。
- **手机只支持竖屏**：`use-orientation` / `posture` / `SET_POSTURE` 已删除；`scripts/patch-android-manifest.mjs` 给 `MainActivity` 写 `android:screenOrientation="portrait"`。旧存档里的 `posture` 字段被忽略。浏览器 dev 也按竖屏单布局渲染，不写 `landscape:` 断点。
- **麦克风权限**：Android 需 `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`（由 `scripts/patch-android-manifest.mjs` 写入 gen manifest）；Tauri 移动端需 `on_permission_request` 允许 `Microphone`。WebView 103 的 `ScriptProcessor` buffer 必须是 2 的幂（已用 2048）。
- **百炼云端 ASR（唯一）**：本机 whisper 已下线；`whisper-rs`/cmake/libclang 不再是构建前提。未同意/地址或模型无效/无 Key 时 `mic.start` 直接回 `mic.error(cloud_not_configured|cloud_key_unavailable)`，不建会话、不回退。`asr.json`（0600，含明文 `apiKey` 与派生 `keyPresent`/`keyHint`）。**整个链路不再读写 Keychain**，所以开页/测试/录音都不弹系统密码；升级后旧钥匙串 Key 不自动迁移，需在模型页重新粘贴一次。代价是明文 Key 只靠 0600 权限保护，不要分享/提交该文件。地址必须完整 URL；业务空间直接粘贴并把 `{WorkspaceId}` 换成真实 ID，未替换报“请填写完整服务地址…”，不再发 `X-DashScope-WorkSpace`。`task-started` 前只缓存音频，之后二进制 PCM 转发；`mic.partial` 50ms 节流、`rev` 只增、整体替换、只回显不落字；最终只插入一次。
- **rustls 必须显式 ring provider**：`tokio-tungstenite` 用 rustls 0.23，进程必须先 `rustls::crypto::ring::default_provider().install_default()`；`Cargo.toml` 必须保留 `rustls`（`default-features=false`，features `ring`/`std`/`tls12`）。删 `reqwest` 后曾因没有 CryptoProvider 在 TLS 握手 panic，被误报成 `cloud_network`（2026-11-02，D59）。改 TLS/依赖后跑 `cargo tree -e features -i rustls` 确认 `ring` 还在。
- **用量统计**：`asr_usage.json`（0600，原子写，最多 400 天）只存每日汇总，不存文本/Key/音频；按本机时区切天；每次 `task-finished` 有 usage 就记账（插入失败/空结果也计费）；`asr_usage_stats()` 返回今天/7/30/365 汇总 + 最近 365 天 `days`（今天起倒序、缺失为 0）；模型页区间切换，今天无明细、7/30 按天、1 年按自然月。金额人民币微元，北京 ¥6/¥4.5、新加坡 ¥6.781/¥5.104 每百万 Token，自定义地址按北京估算；`priceNote` 明示估算，以百炼账单为准。清空统计只重置该文件的每日汇总，不影响配置/Key。
- **本地 Key 存储**：API Key 只存 `asr.json`（0600），不再使用 Keychain；`asr_keychain.rs` 仅保留「清除时顺手删除旧条目」。旧版本钥匙串条目不会自动读取/迁移，模型页会提示重新粘贴。
- **旧 models 目录**：`~/Library/Application Support/Sidekick/models/` 可能还在磁盘上，但不参与运行，可手动删除；不要把它当作可用模型来源。
- **自动粘贴 TCC**：`core-graphics` 合成 Cmd+V 需要 macOS 辅助功能勾选当前程序；开发二进制每次重编译可能被当成新程序，需要重新勾选（设置页有请求权限/重新检测）。不勾选只复制。
- **麦克风录音 UI 锚点**：竖屏底部居中的 56px 高宽胶囊容器只能包含按钮本身；录音/处理状态在胶囊内，实时文本/结果卡片放在独立绝对定位层（`inset-x-0 bottom-[68px] mx-auto w-[min(86vw,380px)]`、`pointer-events-none`），否则会把 flex 容器撑宽、按钮被挤偏，看起来「按住后跳走」。居中要用 `inset-x-0` + flex `items-center` / `left-0 right-0 mx-auto`，**不要用 `left-1/2 -translate-x-1/2`**（WebView 103 不支持 CSS translate，会偏右半宽）。取消只保留上滑手势（≥48dp，滑回 <24dp 继续），**不要再加左下取消按钮**：按住说话时去点它必须先松手，而松手就已经结束录音，按钮自相矛盾。
- **剪贴板**：`NSPasteboard` 每 500ms 检查 changeCount；`org.nspasteboard.ConcealedType/TransientType/GeneratedType` 与密码管理器类型不记录；Sidekick 自身写入通过 `skip_next` 防重复；语音转写经 `write_text_and_record` 以 `kind = "voice"` 入库（暂停记录时仍写系统剪贴板、但不入历史）；最多 100 条（置顶优先淘汰）；文件 `~/Library/Application Support/Sidekick/clipboard.json` 权限 600。
- **宠物背景不要加光晕**：OLED 像素自发光，光晕/大面积亮色渐变直接耗电；宠物舞台只用 `--pet-bg` 纯深色背景（2026-11-02 移除 `--pet-glow`，D58），装饰只做小面积低亮度。
- **宠物图集（OpenPets schema 2）**：资产在 `app/src/mobile/features/pet/assets/openpet/`（webp 764KB + poster 14KB + pet.json）；一列一帧、单状态 ≤32 帧、兼容 16；播放器 rAF 按 `frames[].duration` 推进，done 播一次并在末帧定格；后台/覆盖层暂停，减少动效冻结第 0 帧；manifest 非法/解码失败/尺寸不匹配 → poster 兜底。新增状态行只需图集加行 + manifest 登记（可选改 `sprite-state-map.ts` 候选链），渲染器不用动。单帧 256 在 ~500px 舞台 2 倍放大会偏软，解码约 16.8MB；**`.petSlot` 在 max-width 卡住时会变竖长（360×800 屏上是 272×440 CSS），播放器必须按 min(宽,高) 取方形格子 + `overflow:hidden` 居中，否则会露出图集相邻行（看起来像两只宠物）**；资产来自 DeepSeek 鲸鱼（zip 无 LICENSE），发版前确认授权。
- **宠物触摸互动已下线**（2026-11-04，D69）：点击、长按、来回抚摸宠物都不产生任何反应，不再有 `POKE`/`PET_*`/`interacting`/手势识别/亲密度/触摸爱心；不要再加 pointer 手势或 `interacting` 状态。命名完成时的爱心、AI 四态、麦克风反应、睡眠/变暗保留。变暗遮罩的点击唤醒是屏幕行为，不是宠物互动。
- **AI 联动（DSH hook）**：不装第三方插件；`app/src/dsh-hook/sidekick-hook.mjs` 由 Rust `include_str!` 打进桌面端并写到 `~/.dsh/profiles/<profile>/plugins/`，patch 用 `# >>> sidekick-hook` 标记块插入；首次必须重启 DSH 一次（profile patch 启动时加载），之后开关只改 `~/.dsh/sidekick/config.json` 热生效。改脚本后要重新编译桌面端，否则嵌入的还是旧版本。回环端口 `47815–47819`，只绑 `127.0.0.1`，Bearer token；状态只发 `state/sessions/ts/resume/sessionList`（id、标题、状态、askKind、lastEventAt、completedAt），**不要加提示词/回复/工具参数/路径/cwd/模型名**。标题是唯一内容类外发字段：单行 ≤80 字符、不写日志、不落盘；`sessionList` 最多 50 条，旧客户端忽略。多 profile 已安装时 UI 锁定选择器，切换要先移除联动。
- **手机会话列表**：`sessionList` 随 `status` 广播（最多 50 条，标题 ≤80 字符）；手机 `session-store` 用本地清除标记过滤（`lastEventAt <= cleared.through` 隐藏），标记存 `sidekick-sessions.json` 只含 id/at/through（7 天 TTL、最多 200 条），有新事件自动解除。首次快照/重连不自动展开，只有新的 asking 会话才展开；完成态保留到清除或下一轮。点 asking 会话发 `focus.request`，桌面 `app_focus.rs` 只做 `open -a "DeepSeek Harness"`（1.5s 限频，错误只回错误码），**不接受手机传来的应用路径**。改 `sessionList` 字段要同步 `protocol/README.md`、Rust 桥与手机解析三处。
- **麦克风胶囊**：单竖屏布局下麦克风是 56px 高、`min(86vw,360px)` 宽胶囊；录音/处理状态在胶囊内，实时文本/结果卡片在胶囊上方独立绝对定位（`bottom-[68px]`），出现/消失不推动按钮。不要再加左下取消按钮，取消只保留上滑手势；不要用 `left-1/2 -translate-x-1/2` 居中（WebView 103 不支持 CSS translate）。
- **结果卡片手动按键**：`key.request` 只接受「最近一次 `mic.result(inserted)`」的目标（owner+mic session），30 秒过期、成功一次即作废、桌面 500ms 限频；按键前重新核对前台应用、密码框、辅助功能，任一不符只回错误码、不按键。「清空」是 `⌘A`+`Delete`（两次确认），不是 ⌘Z；终端等非标准输入框可能不生效，**绝不能因此回退成回车**。日志不打文本/应用名/按键序列；结果卡片只在 `outcome=inserted` 时显示按钮。
- **shadcn 不要混 base**：当前固定 `base-nova`（Base UI）；组件从 registry 复制，不要再引 Radix 版本；类名合并用 `cn`，不要再装 clsx/tailwind-merge。

## 9. 协作约定

- 用户是中文母语：沟通用中文、直白、先基础后细节；环境配置由 AI 直接代劳，但破坏性操作（删库、重置、卸载）先问。
- 改动跨端时同步更新 `protocol/README.md` 与相关 docs；重大决策追加到 `docs/decisions.md`。
- 文档遵循 `docs/standards/documentation.md`：先改“唯一归属”文档，再同步索引；不要一次读完整棵文档树。
- 平台边界：`mobile` 不 import `desktop`，`desktop` 不 import `mobile`，`shared` 不 import 两者；详见 `docs/standards/engineering.md`。
- 前端改动遵循 `docs/frontend-architecture.md`；新增/升级依赖遵循 `docs/dependency-policy.md`，新增运行时依赖追加到 `docs/decisions.md`。
- 不提交构建产物（`app/dist`、`node_modules`、`src-tauri/target`、`gen/`、APK、`.venv`）；**唯一例外**是 `release/` 下两个固定命名的安装包（`Sidekick-macOS.dmg`、`Sidekick-Android.apk`），它们是要分发/直接下载的成品，每次打包覆盖同名文件、不建版本号目录。
- **Git**：提交信息**用中文**（`type(scope): 中文摘要` + 中文正文，type/scope 保留英文）；push 前跑完 `typecheck/lint/test/build`、手机端真机验证、文档检查；`force push`/改仓库可见性等不可逆操作先确认；完整规则见 [docs/standards/git.md](docs/standards/git.md)。GitHub 推送已配置（gh 登录 fouriyeo，已 `gh auth setup-git`）。

## 10. 下一步路线（按优先级）

> 前置：Phase 1 平台分目录与连接/聊天迁移已完成（2026-10-31）；手机自动发现电脑已落地；宠物 P0 代码完成（帧动画图集；触摸互动已下线；真机与扩展状态行待补）；麦克风 P0 与桌面剪贴板 P1 代码完成，真机/辅助功能待回归。

1. ✅ 前端平台分目录 + 连接/聊天迁移（已完成 2026-10-31）。
2. 情绪宠物 P0：代码已完成（帧动画图集 + poster 降级、单竖屏布局、plugin-store 存档）；真机 60fps/存档跨重启、扩展状态行（睡眠/倾听）待补。
3. ✅ 外设麦克风（百炼云端唯一）：二进制协议、云端流式、`mic.partial`、手机 UI、桌面浮层已完成；结果卡片手动回车/清空已完成（2026-11-04）；下一步 macOS 辅助功能自动粘贴与真机 60 秒/断连/密码框/按键焦点矩阵。
4. ✅ 模型页 + 用量统计：百炼配置（无业务空间 ID）、本地 Key 元数据、区间切换（今天/7/30/365，1 年按月）、清空统计已完成（2026-11-02）；下一步真实账号/本地 Key 迁移/金额对账与真机验收。
5. ✅ 桌面剪贴板 P1：文本历史、搜索、置顶、隐私过滤、本地持久化已完成；语音转写以 `voice` 入库、100 条上限在 UI 可见（2026-11-01）。
6. 🚧 AI 联动（DSH hook）：本地脚本注入 + 桌面回环桥 + 手机四态动作/三音效 + 会话列表/清除/反问唤起；代码开发中，待真机/隐私验收（2026-11-03）。
7. 手机回答 AI 提问（answer 回传 + hook 结果注入）、文本消息、Claude Code / Qoder 接入。
8. 配对鉴权 + 正式签名/公证/开机自启（`release/` 固定产物与打包脚本已完成 2026-11-03，仍是本地密钥/未签名）。
9. 蓝牙通道：评估 Tauri 移动端 BLE（需自写 Kotlin 插件）或 Python sidecar；见 `docs/ble-notes.md`。
10. iOS 目标（Tauri mobile 初始化 + 后台限制评估）。
11. P2：系统级虚拟麦克风、云同步/多语言。
