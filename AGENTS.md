# AGENTS.md — Sidekick 项目上下文

> 面向 AI 编码代理：读完这一份就能接手。细节在 `docs/`，协议在 `protocol/`。
> 最后更新：2026-11-06

## 1. 项目是什么

- 名称：小跟班 · Sidekick
- 一句话：把手机变成电脑的「外设 + AI 宠物」——电脑把 AI/任务状态推给手机，用户在手机上收通知、回答 AI 的提问、发快捷指令、语音输入。
- 仓库：https://github.com/fouriyeo/sidekick （私有，owner 项目维护者 / fouriyeo）
- 本地路径：`/Users/dev/code/sidekick`
- 平台目标：Android 优先，iOS 后续；电脑端先 macOS。

## 2. 当前状态（务必先看）

- ✅ **局域网 MVP 已验证**（2026-10-31）：Tauri 桌面端（服务端）+ Tauri 安卓 App（客户端）双向收发消息成功。
- ✅ **手机自动发现电脑已落地**（2026-10-31）：UDP 广播探测（固定 47820）+ 桌面单播回主机名/真实端口；服务端口候选 `47810`–`47814`、`8848` 自动回退；手机启动即自动连接，桌面大二维码改为按需展开；真机（Realme）端到端与端口回退已验。
- ✅ **断连自动重连**（2026-11-01）：断连/启动未连上/手动连接失败后按 1s→30s 退避重试，每次先静默重新发现再连；切后台暂停、回前台立即重试；消息页保留断连折叠块（倒计时 + 立即重连 / 重新搜索 + 手动地址 / 扫码文字入口），连接页是排障主入口（D79）。真机验证：杀桌面后自动重试，桌面恢复/端口回退到 47811 都能自动连上。
- ✅ **宠物页屏幕常亮**（2026-11-01）：设置页「显示 → 屏幕常亮」真开关（默认开）；手机 Rust `set_keep_screen_on` 用 JNI 调 Android `FLAG_KEEP_SCREEN_ON`，只在宠物页前台（含设置页打开时的既有规则）生效，非宠物页/后台释放；旧存档 `"never"` 归一化为开。iOS 暂为空实现。
- ✅ **触感接管 + 可配时长**（2026-11-02）：启动时关闭 WebView 默认长按震动（`setHapticFeedbackEnabled(false)`），App 用原生 `performHapticFeedback` 发轻/中/成功/失败触感（**不申请 VIBRATE 权限**，跟随系统触感）；麦克风按下即中震；宠物页禁长按选中/复制；自动变暗默认 5 分钟、屏幕常亮最长默认 2 小时，设置页可调。
- ✅ 安卓 App 可构建、可安装到真机（测试机 Realme RMX3370 / Android 13）；首版「黑屏」问题已修复（见第 8 节）。
- ✅ **前端 Phase 1 已完成**（2026-10-31）：React 19 + Tailwind v4 + shadcn/ui（Base UI, base-nova）双 entry；`entries/desktop.tsx` / `entries/mobile.tsx`、`desktop/**`、`mobile/**`、`protocol/messages.ts`、`shared/lib/tauri.ts` 已落地；连接/聊天 1:1 迁移，旧 `main.ts` / `styles.css` 已删除；桌面浏览器与安卓真机双向收发通过。
- ✅ **视觉系统方向 B「深潜声呐」+ 双主题**（2026-11-04，D71）：`tokens.css` 重写为深海语义色板（全 hex）；深色「深海自发光」默认 + 浅色「海面雾光/海玻璃」两套手调主题；`sidekick:theme`（system/light/dark）、`index.html` 防闪脚本、`shared/lib/theme.ts`、`data-theme` + `.dark` 双写、Sonner 跟随；桌面/手机换皮与设置页「外观」三选一；宠物复用 OpenPets 图集不重绘、舞台两主题都深；`design-lab/` 评审稿按 D71 收口删除（不再作为事实源）。
- ✅ **外观默认跟随系统 + 宠物舞台随主题**（2026-11-04，D76，supersede D71 的「默认深色」「舞台两套主题都深」）：`sidekick:theme` 缺失/非法一律 `system`，首次启动/无存档随系统亮暗，localStorage 不可用时静默回退深色；`--pet-*` 随主题——深色深海自发光，浅色换成「海玻璃舞台」（`--pet-bg #dcebe7`、surface `#f7fcfa`/`#edf7f3`、text `#0e2a2b`）+ 新增 `--pet-coral-foreground`；始终深色的桌面麦克风浮层用 `.deep-sea-scope` 钉住深色 pet 令牌；鲸鱼图集不重绘、不加 filter，浅底对比度偏低是接受的代价。
- ✅ **指挥舱 A 双端壳**（2026-11-05，D79，代码完成待真机）：桌面改为「总览 / 会话 / 内容 / 系统 / 设置」5 视图 + 顶部 48 全局状态条（服务 / 手机 / AI 三段可点）+ 72 图标导航（⌘1–⌘5）+ 56 页头；辅助功能提示条外壳级、麦克风浮层全局；聊天降级为「系统 › 消息」，系统页内 4 段（连接 / 语音 / 联动 / 消息）；960 单列（`lg:` 1024）/ 1180 两列。**手机部分已被 D80 取代**：不再有底部 3 档与动态页。状态语言统一（连接 7 态 / AI 4 态 / 麦克风 9 态；会话对象「已完成」、AI 聚合「完成」；D78 工作行 spinner + 「正在<动作>」/「正在思考」）。桌面手机数用 `system.clients - 1` 近似；旧 4 个平行 Tab、SettingsSheet、SessionPanel、ConnectionBar 已删除；产品规则 `docs/prd/shell/`，结构 `docs/frontend-architecture.md`；D80 后 591 tests / tsc / lint / build 全绿，真机待回归。
- ✅ **手机干净版两页壳**（2026-11-05，D80，代码完成待真机）：手机只留「宠物（根）/ 设置（二级）」两页，删除动态页与底部 tab；宠物页 = 顶栏（gear / 连接状态 / chat）→ 会话卡（折叠 1 行、展开 5 行、working wash、× 二次确认）→ 无底色鲸鱼（230 / 展开 220）→ 居中 56 薄荷圆麦克风（距底 24）；设置从 gear 进、左上返回、17/400 inline 标题、首用清单 banner、无底栏；说完话结果卡为弹窗三段（grabber + header 16「已输入」/ 12 时间 + content 13 单行 + footer 15「清空 / ↵ 回车」纯文字，44 热区，清空二次确认），总高约 125。新增 `.mobile-clean` 作用域令牌（`app/src/mobile/styles/clean.css`），只影响手机；桌面端不变。**字体改用随包 MiSans Normal 400（3.9MB WOFF2，免费商用需注明）**，会话标题 15，设置说明行高 1.45；旧 `stream` / `tab-bar` / `now-row` / 动态页组件已删除；activity-store 已删除。591 tests / tsc / lint / build 全绿；真机 Realme RMX3370 已验证宠物页 / 会话展开 / 设置页 / 返回键 / 深色 / MiSans 字体，待补录音禁切页、结果卡清空二次确认、320 宽。
- ✅ **Token 用量看板 V1**（2026-11-06，D82–D84，代码完成待验收）：桌面第 6 导航「用量」（⌘4；系统 ⌘5、设置 ⌘6）+ 手机「设置 › 用量」；只读本机 `~/.dsh/storages/cost-meter/ledger.json`，按客户端/会话/模型分组；`usage.request`/`usage` 协议带 `data` 包装（不含提示词/路径/cwd），模型 ID 按 D83 开关上手机；模型价格参考 tokei：seed + `~/.sidekick/token_pricing.json` 缓存 + overrides + DeepSeek 官方峰谷，实际 `costCny` 优先、缺价才估算（标 ≈）；新增 `reqwest`（rustls-no-provider，provider 在 `tls.rs`）。
- 产品规范与两份 PRD 已落地（2026-10-31）：`docs/product`、`docs/standards`、`docs/prd`、`docs/engineering`；文档采用树形 + 懒加载，入口 `docs/INDEX.md`。
- ✅ 品牌 logo 与全平台图标已落地（2026-10-31）：源文件在 `brand/`，Web favicon 与 Tauri 桌面/Android/iOS 图标已替换。
- ⏸ 蓝牙通道：预研过，Mac 可用 Python `bless` 当 BLE 外设广播（见 `docs/ble-notes.md`），但**主线暂定为局域网**，蓝牙延后。
- ✅ **宠物 P0 代码已完成**（2026-10-31；2026-11-02 改为帧动画图集；2026-11-04 下线触摸互动、去舞台声呐环、宠物不再响应麦克风、done 改循环；2026-11-05 首次命名/改名下线）：OpenPets schema 2 图集（WebP 764KB + poster）+ 状态候选链 + 解码/降级；状态机/plugin-store 存档、单竖屏布局、设置（2026-11-05 移到手机「更多」整页）、宠物主界面 + 消息入口；宠物固定显示「小跟班」，首次 BOOT 气泡「你来了。我是小跟班。」，`onboarded` 只表示是否已见过面；触摸互动（点击/长按/抚摸、爱心、亲密度、interacting、设置页无障碍互动）已删除，点击宠物无任何反应；`PetPhase` 只剩 idle/sleeping/away，`Mood` 只剩 content/curious/sleepy，麦克风不再产生宠物事件（仅 `micListening` 门禁在录音时静音 AI 音效/触感）；舞台无背景声呐环；done 循环（一轮 1.6s，3 秒 completed 约 1.875 轮，无末帧定格）；真机 60fps 与存档跨重启待补，扩展状态行（睡眠）待美术。
- ✅ **麦克风（百炼云端唯一）**（2026-11-02）：手机 WebView 流式 PCM16 → `mic.*` + `SK01` 二进制帧 → 桌面直连百炼 WS（run-task/finish-task、二进制 PCM）→ `mic.partial` 50ms 流式回显 → `arboard` 写剪贴板 + `core-graphics` 合成 Cmd+V；未授权/窗口变化/密码框只复制。本机 whisper/模型下载已下线，失败直接报错、不回退。
- ✅ **结果卡片手动「回车 / 清空」**（2026-11-04）：语音输入成功后，「已输入」卡片出现两个按钮——「回车」合成 Return，「清空」合成 `⌘A`+`Delete`（两次确认）；新增 `key.request`/`key.result` 协议，只作用于最近一次插入的目标窗口（30 秒时效、成功即作废、500ms 限频、密码框/未授权/非 macOS 拒绝），仍**不自动发送**。
- ✅ **模型页 + 用量统计**（2026-11-02）：桌面「系统 › 语音」（2026-11-05 前为独立导航「模型」），上半部分配置百炼（完整地址/本地 `asr.json` 0600 保存 API Key/模型/语言/场景/热词/同意/测试/保存/清除 Key；无业务空间 ID 字段），下半部分区间切换（今天/近 7 天/近 1 个月/近 1 年；今天无明细、7/30 按天、1 年按月）+ 金额/Token/会话/时长（人民币微元，北京/新加坡价格估算）；`asr_usage.json` 0600、按天、最多 400 天；`asr_usage_stats()` 返回 365 天 `days`。
- ✅ **桌面剪贴板 P1**（2026-10-31，2026-11-01 补语音入库与上限展示）：文本历史、搜索、复制、置顶、删除、清空、暂停；隐藏类型过滤；语音转写以 `voice` 入库；最多 100 条；本地 `0600` JSON；唯一归属是桌面「内容」页（D79）。
- 🚧 **AI 联动（DSH hook）代码完成，待真机/隐私验收**（2026-11-02；2026-11-03 加会话列表；2026-11-04 会话行加粗粒度工具动作、插件 v3）：桌面「系统 › 联动」页 + 本地 `sidekick-hook.mjs` 注入 DSH profile + Rust 回环桥 + `status` 协议（含 `sessionList`）+ 手机四态动作/三音效 + 手机宠物页会话卡（标题/状态/当前工具动作/清除/反问一键唤起 DSH）；产品规则 `docs/prd/hook/`，技术方案 `docs/engineering/dsh-hook.md`；首次开启需重启 DSH 一次，之后热开关。
- ❌ 尚未开始：手机回答 AI 提问、文本消息、Claude Code / Qoder 接入、配对鉴权、正式签名包、iOS。

## 2.5 文档导航（懒加载）

- 唯一入口 `docs/INDEX.md`；先读它，再按任务选 **1 个**分支；最多读 2 篇叶子，不要整棵读完。
- 分支：产品方向 `docs/product/`、规范 `docs/standards/`、PRD `docs/prd/`（含 `shell/` 应用外壳：导航 / 状态词 / 首用清单）、技术方案 `docs/engineering/`、设计归档 `docs/design/`（只留 INDEX + README，过程素材不入库）。
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
- 前端重构目标栈（Phase 1 已落地）：React 19 + Tailwind v4 + shadcn/ui（Base UI, base-nova）+ Motion；宠物为帧动画图集（OpenPets schema 2）；视觉为「深海声呐」双主题，颜色/圆角/字体只看 `app/src/shared/styles/tokens.css`，主题运行时在 `shared/lib/theme.ts`，见 `docs/frontend-architecture.md` §6。

### 桌面端接口

| 方式 | 路径/名称 | 说明 |
| --- | --- | --- |
| HTTP GET | `/` | 手机落地页（含「下载 App」按钮 + 网页聊天预览） |
| HTTP GET | `/download/apk` | 下发手机安装包：优先仓库 `release/Sidekick-Android.apk`（release 签名），其次编译期嵌入的同一份（`build.rs` 打进桌面二进制），最后回退 debug 构建产物；带 `Content-Length`，文件名 `Sidekick-Android.apk`，全缺时 HTML 404 |
| WS | `/ws` | 消息通道 |
| UDP | `47820` | 发现响应器：收 `sidekick.discover` 探测，单播回主机名 + 真实端口 |
| Tauri 命令 | `server_info` | 等就绪后返回 `{ip, port, url, discoveryPort}`，前端展示地址/发现状态/二维码 |
| Tauri 命令 | `asr_cloud_status` / `asr_cloud_save` / `asr_cloud_test` / `asr_cloud_clear` | 百炼配置/状态/测试/清除；Key 存本地 `asr.json`（0600），状态只返回 `hasKey`/`keyMasked`，不读 Keychain |
| Tauri 命令 | `asr_usage_stats` / `asr_usage_clear` | 今天/7/30/365 汇总 + 最近 365 天 `days`；清空只重置本地统计 |
| Tauri 命令 | `token_usage_stats` / `token_pricing_status` / `token_pricing_refresh` / `token_pricing_set_auto` / `token_pricing_set_mobile_models` | Token 用量聚合与模型价格表；只读 DSH ledger，价格只 GET 公开目录 |

### 手机端接口

| 方式 | 名称 | 说明 |
| --- | --- | --- |
| Tauri 命令 | `app_role` | 返回 `mobile` |
| Tauri 命令 | `discover_servers` | 无参；UDP 广播发现同网段电脑，返回 `{name, ip, port, addr}[]`（异常返回空数组） |
| Tauri 命令 | `connect_server({addr})` | 连接 `ws://<addr>/ws`；`addr` 可只写 `IP:端口`（缺省 47810）；重复调用先断开旧连接，4s 超时 |
| Tauri 命令 | `send_chat({text})` | 发送 `{"type":"chat","from":"phone",...}` |
| Tauri 命令 | `send_focus_request({source,sessionId,requestId})` | 发送 `focus.request`；结果走 `chat` 事件里的 `focus.result` |
| Tauri 命令 | `send_key_request({action,session,requestId})` | 发送 `key.request`（`enter`/`clear`）；结果走 `chat` 事件里的 `key.result`，只允许用户主动点按 |
| Tauri 命令 | `send_usage_request({range})` | 请求一次 `usage` 快照（today/7d/30d/180d）；结果走 `chat` 事件的 `usage` 消息 |
| Tauri 命令 | `set_keep_screen_on({enabled})` | 宠物页前台屏幕常亮：Android JNI 加/清 `FLAG_KEEP_SCREEN_ON`；iOS 暂为空实现 |
| Tauri 事件 | `conn` / `chat` | `conn: {online, url}`；`chat: <JSON 字符串>`（含 status/sessionList/focus.result/mic.*/chat） |

扫码连接不是独立的 Tauri 命令：手机连接页「扫码连接」→ `getUserMedia` + `jsqr` 解出桌面二维码里的 `http://ip:端口` → 复用 `connect_server`。桌面二维码内容不变，浏览器扫码打开落地页的行为也不变（D74）。

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
│  ├─ src/desktop/      # 桌面平台：shell/（状态条/导航/页头）、pages/（总览/会话/内容/系统/设置）、features/（各段 Section）
│  ├─ src/mobile/       # 手机平台：shell/（顶部条/页头）、features/（pet/asking/chat/connect/settings/first-use/sessions/mic）
│  ├─ src/protocol/     # messages.ts（chat/system/ServerInfo/ConnEvent + clients）+ discovery.ts（发现结果）
│  ├─ src/shared/       # ui（signal-bars/status-chip 等）/ lib（tauri、status、sessions、activity）/ styles
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
│  ├─ prd/              # 宠物、麦克风、AI 联动、应用外壳（shell）PRD / SPEC / ACCEPTANCE
│  ├─ engineering/      # 音频链路、协议提案、宠物运行时、测试
│  └─ architecture.md … # 现有基础文档
└─ scripts/             # 安卓构建与安装、文档检查
```

前端结构已落地：`src/entries` + `src/desktop` + `src/mobile` + `src/shared` + `src/protocol`，禁止跨平台 import；桌面壳在 `desktop/shell` + `desktop/pages`，手机壳在 `mobile/shell`；视图切换只走组件状态 / `ui-store`，不写 URL、不加全局 `body` 状态类。详见 `docs/standards/engineering.md`。

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
- **直接跑 debug 二进制会白屏**：`cargo build`（不加 `tauri/custom-protocol`）产出的 debug 程序是 dev 模式，启动时加载 `http://localhost:1420`，没有 Vite dev server 就白屏（2026-11-03 踩过）。要独立运行用 `scripts/run-desktop.sh`（先 `pnpm build`，再 `cargo build --features tauri/custom-protocol`），日常改前端用 `pnpm tauri dev`；两者不要混。
- **macOS 防火墙**：第一次接受局域网连接会弹「允许传入网络连接」，必须允许，否则手机连不上。
- **手机与电脑需同一局域网**；开发机 IP 会变，一般不用手填（自动发现），发现失败时再手动输入桌面窗口显示的地址。
- **自动发现的三个前提**：同一网段、路由器不拦广播/无 AP 隔离、macOS 防火墙允许 Sidekick 传入（TCP 服务端口 + UDP 47820）。
- **端口被占用是正常的**：`47810` 被占会自动顺延到 `47811`…，桌面日志与窗口地址显示真实端口；手机发现回包也带真实端口。
- **关窗即退出**：Tauri 默认关闭最后一个窗口就结束进程，HTTP（47810+）与 UDP 发现（47820）一起停。手机此时的表现是「发现 0 台电脑」→「connecting to ws://<旧地址>」→「Connection refused」，约 31s 重试一次；不是自动发现坏了，先把桌面窗口重新打开。没有菜单栏驻留模式。
- **桌面 IP 不写死**：`server_info` 每次按网卡实时选 IPv4（`desktop_server::pick_lan_ip`：en* 优先，跳过 utun/bridge/awdl/anpi 等虚拟接口，防 VPN 地址进二维码）；手机连接地址来自 UDP **源 IP** + 发现回包里的真实端口，换网段/换 IP 不需要改代码。
- **手动输入在连接页**：手机顶部连接状态 → 连接页 →「手动输入地址」；扫码是连接页的主按钮。发现失败的空状态卡片里也有入口。桌面窗口显示的 `IP:端口` 即要填的地址（自动发现失败时才需要）。
- **桌面端单实例（防多开）**：`tauri-plugin-single-instance` 在 `Builder` 最先注册，第二个进程只把已有窗口叫到前台然后退出（D60）。多开的代价很隐蔽：后启动实例会把 `~/.dsh/sidekick/config.json` 的 `endpoint` 改成它的回环端口（47816），它退出后 DSH hook 的上报全部打空，剩下那个实例的桥永远 idle；而手机发现只认持有 UDP 47820 的先启动实例，于是「AI 在工作、宠物是 idle」。状态不更新时先查 `lsof -nP -iTCP:47815-47819`、config.json 的 endpoint 是否指向活着的进程（`curl -s -o /dev/null -w '%{http_code}' -X POST <endpoint>`）。
- **重复连接**：手机端 `connect_server` 已串行化（先 abort 旧连接 + generation 守卫），自动连接与手动点击并发不会互相覆盖状态。
- **自动重连**：`connection-store` 用模块级单一定时器，退避 1s→2s→4s→8s→16s→30s（上限 30s），每次重试先静默 UDP 重新发现（覆盖端口回退/IP 变化），发现 0 台退回上次地址，多台回上次那台、无地址则停止；手动连接/重新搜索会取消排期并清零退避；`document.hidden` 暂停、回前台立即重试。电脑恢复最晚一个退避周期（≤30s）连上。
- **无心跳**：协议没有 ping/pong；进程退出/网络断开靠 FIN/RST 立刻发现（实测约 0.5s），电脑睡眠/路由器静默丢包可能长时间仍显示「已连接」，需心跳方案补齐。
- **在线人数会跳动**：广播的「当前 N 个」是瞬时连接数，测试脚本/网页预览会造成数字变化，不是 bug。
- **WebView 103 兼容**：真机 Realme 的 Android System WebView 为 103，不支持 `oklch`/`dvh`/`color-mix`；颜色用 `tokens.css` 的 hex（**不要用 `oklch`/`color-mix` 定义最终令牌**，D71），`h-dvh` 由 `globals.css` 未分层 `100vh` 覆盖。改颜色/全屏高度时先在真机验证。**也不支持 CSS `translate` 属性**：Tailwind v4 的 `translate-x/y-*` 工具类编译成 `translate: var(--tw-translate-x) …`，在真机上会被忽略（元素整体偏半个自身宽度）。居中/位移不要用 `left-1/2 -translate-x-1/2`，改用 `inset-x-0` + flex `items-center`，或 `left-0 right-0 mx-auto`；dialog/sheet/tooltip 里仍有 translate 类，属已知待修项。
- **主题防闪**：`app/index.html` `<head>` 里的内联脚本必须保留且在最前——它在 CSS/React 之前读 `localStorage["sidekick:theme"]`（`system|light|dark`，缺失/非法一律 `system` 跟随系统），写 `<html>` 的 `data-theme` + `.dark` + `color-scheme`；localStorage 被禁用时静默回退深色。移到 React 或删掉会首屏闪一下错误主题；key 不能改（`shared/lib/theme.ts` 的 `THEME_STORAGE_KEY` 同值）。
- **主题双写**：令牌看 `data-theme`，Tailwind `dark:` 变体看 `.dark` class；`shared/lib/theme.ts` 的 `applyTheme` 已同时处理，不要只改其中一个或手写 `document.documentElement.className`。系统主题跟随 `matchMedia`、多窗口同步靠 `storage` 事件；Sonner 用 `useTheme().resolved`，不要写死 dark。
- **默认窗口 1180×760**（min 960×640）：桌面按这个基准设计分栏与间距；改窗口/左栏宽度时同步检查 960 宽不溢出、1180 宽不空。
- **舞台随主题（浅色海玻璃，D76）**：`--pet-*` 随 `data-theme` 切换——深色是深海自发光（`--pet-bg #030e12`），浅色是「海玻璃舞台」浅底（`--pet-bg #dcebe7`、surface `#f7fcfa`/`#edf7f3`、text `#0e2a2b`/`#3f5e5d`、border `#9dbab4`），新增 `--pet-coral-foreground`。**始终深色的表面**（桌面麦克风浮层）用 `.deep-sea-scope` 重新钉住深色 pet 令牌与浮层用到的壳层信号色（`--signal`/`--ring`/`--decide`/`--destructive`/`--abyss`），不要直接套页面主题；`SignalDot` 的 `tone="stage"` 只是「用 pet 令牌」，不再等于「固定深色」。鲸鱼图集不重绘、不加 CSS `filter`：浅色舞台下白色围裙/亮部对比度偏低（实测约 26% 不透明像素对比度 <1.5、中位数约 3.5）是明确接受的代价，不要靠重绘图集、光晕或描边 filter「修」。
- **Android 返回键**：不注册 `back-button` 监听时系统默认直接 finish（退出 App）。现在 App 启动即注册一次 `subscribeBackButton`（`shared/lib/tauri.ts`）；「更多」页通过 `mobile/system-back.ts` 返回栈消费，其它二级页由 `MobileApp` 按视图层级处理，根页面走「再按一次退出」（第一次提示、2 秒内第二次调 `exitApp()`，需要 `core:app:allow-exit` 权限，已在 `capabilities/default.json`）。**新增全屏页面时记得 `pushBackHandler`，否则该页按返回会被根页面当成退出确认**。浏览器 `?role=mobile` 用 Esc 模拟返回键（dev mock）。
- **屏幕常亮**：走 Android 原生窗口标志（`app/src-tauri/src/keep_awake.rs`，`WebviewWindow::with_webview` + `jni_handle().exec`），不用 `navigator.wakeLock`（WebView 上可用性/权限前提不确定）；`jni` 只加在 Android 目标并**锁 0.21**（必须与 `tauri-runtime-wry` 一致，否则 `JniHandle::exec` 闭包类型不匹配）。窗口标志只在窗口可见时生效，所以非宠物页/后台由 JS 显式释放；无需 `WAKE_LOCK` 权限。JNI 失败只打 `[keep-awake]` 日志，静默降级为系统默认熄屏。常亮有上限：`useKeepAwake(active, maxDurationMs)` 到点释放，回前台重新计时（`keepAwakeHours` 默认 2，0 = 不限）。
- **触感（震动）**：WebView 默认长按会由系统发 `LONG_PRESS` 震动（看起来像「点了但没反应」，实际每一下都震）；启动时调 `disable_webview_haptics` → `WebView.setHapticFeedbackEnabled(false)` 关掉它。App 自己的触感走 `haptic(style)` 命令 → `decorView.performHapticFeedback`（light/medium/success/error，API<30 时 CONFIRM/REJECT 降级），**不需要 VIBRATE 权限**；`navigator.vibrate` 因 APK 未声明 VIBRATE 会被 Chromium 忽略（只当浏览器兜底），所以不要再指望它。系统「触摸振动」关闭时 App 静默不震。宠物页靠 `user-select:none` + `-webkit-touch-callout:none` + `contextmenu` 阻止选中/复制，聊天文本和输入框不受影响。
- **变暗/常亮时长**：`dimMinutes`（默认 5，1–60）与 `keepAwakeHours`（默认 2，0 = 不限）在 `persistence.ts` 归一化；改默认值要同步迁移测试与 `docs/prd/pet/SPEC.md` §7。
- **手机只支持竖屏**：`use-orientation` / `posture` / `SET_POSTURE` 已删除；`scripts/patch-android-manifest.mjs` 给 `MainActivity` 写 `android:screenOrientation="portrait"`。旧存档里的 `posture` 字段被忽略。浏览器 dev 也按竖屏单布局渲染，不写 `landscape:` 断点。
- **麦克风权限**：Android 需 `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`（由 `scripts/patch-android-manifest.mjs` 写入 gen manifest）；Tauri 移动端需 `on_permission_request` 允许 `Microphone`。WebView 103 的 `ScriptProcessor` buffer 必须是 2 的幂（已用 2048）。
- **扫码要用相机（D74）**：manifest 声明 `CAMERA` 后，只需在 `lib.rs` 的 `on_permission_request` 里让 `PermissionKind::Camera` 返回 `Allow`，**不用改 MainActivity**——wry 的 `grantPermissionRequest` 拿到 Allow 会自己调 `activity.requestPermissions(CAMERA)` 弹系统授权。解码用 `jsqr`（动态 import，43KB gzip），**不要换 `BarcodeDetector`**：它在 Android 依赖 GMS 的 ML Kit，缺 GMS 静默失效。扫码解析只认 IPv4 与 http/https/ws/wss，忽略 path/query（给未来配对 token 留余地）；全屏扫码页要 `pushBackHandler`，否则按返回会被根页面当成退出确认。
- **Android 16+ 局域网权限**：`targetSdk` 37 下访问局域网要 `ACCESS_LOCAL_NETWORK`（dangerous 运行时权限），系统默认拒绝。缺它时自动发现恒为 0 台、手动连电脑报「连接超时」（Rust 侧 `CONNECT_TIMEOUT` 4s），**但同一台手机 shell 里 `curl` 能连通**——不要据此误判成防火墙或企业网隔离。补丁脚本已在 manifest 声明并在 `MainActivity.kt` 请求（仅 `SDK_INT >= 36`）；`gen/` 不入库，每次 `pnpm tauri android init` 后必须重跑。排查：`adb shell appops get dev.sidekick.app ACCESS_LOCAL_NETWORK`，出现 `Uid mode: ignore` 即被拒；`adb reverse tcp:47810 tcp:47810` 后连 `127.0.0.1:47810` 能通，正好反证是该权限而非网络。
- **权限修好后自动发现仍可能失败（独立问题，D73）**：`example-corp` 这类企业 WiFi **只放行单播**，广播和组播全丢。2026-11-04 用原生探针（NDK 编译的静态 ARM64 程序，绕开 toybox `nc` 没有 `SO_BROADCAST` 的限制）实测：五类包手机侧全部 `sent OK`、`Udp OutDatagrams` 差值 +3 与三次探测严格对应，但电脑只收到单播——网段广播、受限广播、组播 `224.0.0.251`(mDNS)、`224.0.0.1`(all-hosts) 全丢。**所以 mDNS 也不能作为替代方案**，它走组播同样被丢；不要一遇到广播不通就想到 mDNS。排查两层要分开：先看 `appops` 权限（TCP 与广播都被它拦），再单独验广播（`python3` 监听 `0.0.0.0:47820` 后重启 App，或看 `OutDatagrams` 差值与实际到达是否对得上）。广播不通时只能手动输入地址（App 会记住并自动重连，实测 8 秒内），或改用不依赖发现的扫码；单播扫描同 /24 能做但接近端口扫描，在企业网可能触发安全告警。
- **百炼云端 ASR（唯一）**：本机 whisper 已下线；`whisper-rs`/cmake/libclang 不再是构建前提。未同意/地址或模型无效/无 Key 时 `mic.start` 直接回 `mic.error(cloud_not_configured|cloud_key_unavailable)`，不建会话、不回退。`asr.json`（0600，含明文 `apiKey` 与派生 `keyPresent`/`keyHint`）。`asr.json` 在 `~/.sidekick/asr.json`。**整个链路不再读写 Keychain**，所以开页/测试/录音都不弹系统密码；升级前存在旧钥匙串里的 Key 不会自动迁移，需在模型页重新粘贴一次（2026-11-03 试过自动迁移：开发版重编译后签名变化，读旧条目会弹系统登录密码，已回退）。代价是明文 Key 只靠 0600 权限保护，不要分享/提交该文件。地址必须完整 URL；业务空间直接粘贴并把 `{WorkspaceId}` 换成真实 ID，未替换报“请填写完整服务地址…”，不再发 `X-DashScope-WorkSpace`。`task-started` 前只缓存音频，之后二进制 PCM 转发；`mic.partial` 50ms 节流、`rev` 只增、整体替换、只回显不落字；最终只插入一次。
- **rustls 必须显式 ring provider**：`tokio-tungstenite` 用 rustls 0.23，进程必须先 `rustls::crypto::ring::default_provider().install_default()`；`Cargo.toml` 必须保留 `rustls`（`default-features=false`，features `ring`/`std`/`tls12`）。删 `reqwest` 后曾因没有 CryptoProvider 在 TLS 握手 panic，被误报成 `cloud_network`（2026-11-02，D59）。改 TLS/依赖后跑 `cargo tree -e features -i rustls` 确认 `ring` 还在。
- **用量统计**：`asr_usage.json`（0600，原子写，最多 400 天）只存每日汇总，不存文本/Key/音频；按本机时区切天；每次 `task-finished` 有 usage 就记账（插入失败/空结果也计费）；`asr_usage_stats()` 返回今天/7/30/365 汇总 + 最近 365 天 `days`（今天起倒序、缺失为 0）；模型页区间切换，今天无明细、7/30 按天、1 年按自然月。金额人民币微元，北京 ¥6/¥4.5、新加坡 ¥6.781/¥5.104 每百万 Token，自定义地址按北京估算；`priceNote` 明示估算，以百炼账单为准。清空统计只重置该文件的每日汇总，不影响配置/Key。
- **本地 Key 存储**：API Key 只存 `~/.sidekick/asr.json`（0600），不再使用 Keychain；`asr_keychain.rs` 只保留「清除时顺手删除旧条目」，**不要为自动迁移加读取逻辑**（开发版每次重编译签名都会变，读旧条目会弹 macOS 登录密码）。`asr.json` 里只有 `keyPresent`/`keyHint` 而没有 `apiKey` 是升级前的老文件，`normalize()` 会把它当作未配置，不会再出现「显示已保存但录音说没配置」；恢复办法只有模型页重新粘贴。
- **本机数据目录**：`~/.sidekick/`（`asr.json` / `asr_usage.json` / `clipboard.json`，均 0600）+ 迁移标记 `.migrated-from-app-support`。首次启动会把旧 `~/Library/Application Support/Sidekick/` 里的同名 JSON 复制一次过来（旧文件保留、不覆盖新文件、只复制一次；用户删掉历史后不会被旧目录复活）；`SIDEKICK_DATA_DIR` 仍可覆盖给测试用。`~/.sidekick/` 同时放着安卓 release 签名的 `android-release.jks`，别混删。
- **旧 models 目录**：`~/Library/Application Support/Sidekick/models/` 可能还在磁盘上，但不迁移、不参与运行，可手动删除；不要把它当作可用模型来源。
- **自动粘贴 TCC（D75）**：`core-graphics` 合成 Cmd+V 需要 macOS 辅助功能勾选当前程序；不勾选时 `outcome=copied`、结果卡片也不出现「回车 / 清空」。桌面端现在**启动即提示**（`AccessibilityHint` 常驻内容区顶部，带「去开启」，`window.focus` 回来自动收起）。「去开启」走 `accessibility_request()` 弹系统原生提示——**不要自己拼 `x-apple.systempreferences:` URL**，实测旧格式落「通用」页、新格式在 macOS 15 上无反应。**TCC 不能编程授权**，别指望自动勾上。另注意：App 是 ad-hoc 签名，TCC 按 CDHash 记账，**每次重新打包桌面端旧授权就失效**（系统设置里开关看着是开的但无效）；`codesign -dvv` 对比 CDHash 即可确认，`tccutil reset Accessibility dev.sidekick.app` 删旧条目后重新授权能恢复，根治要固定签名证书。
- **麦克风录音 UI 锚点**：竖屏底部居中的 56px 高宽胶囊容器只能包含按钮本身；录音/处理状态在胶囊内，实时文本/结果卡片放在独立绝对定位层（`inset-x-0 bottom-[68px] mx-auto w-[min(86vw,380px)]`、`pointer-events-none`），否则会把 flex 容器撑宽、按钮被挤偏，看起来「按住后跳走」。居中要用 `inset-x-0` + flex `items-center` / `left-0 right-0 mx-auto`，**不要用 `left-1/2 -translate-x-1/2`**（WebView 103 不支持 CSS translate，会偏右半宽）。取消只保留上滑手势（≥48dp，滑回 <24dp 继续），**不要再加左下取消按钮**：按住说话时去点它必须先松手，而松手就已经结束录音，按钮自相矛盾。
- **剪贴板**：`NSPasteboard` 每 500ms 检查 changeCount；`org.nspasteboard.ConcealedType/TransientType/GeneratedType` 与密码管理器类型不记录；Sidekick 自身写入通过 `skip_next` 防重复；语音转写经 `write_text_and_record` 以 `kind = "voice"` 入库（暂停记录时仍写系统剪贴板、但不入历史）；最多 100 条（置顶优先淘汰）；文件 `~/.sidekick/clipboard.json` 权限 600（旧目录同名文件首次启动自动复制）。
- **宠物背景不要加光晕**：OLED 像素自发光，光晕/大面积亮色渐变直接耗电；宠物舞台只用 `--pet-bg` 单一纯色底（深色深海深底 / 浅色海玻璃，D76），深色主题下不叠光晕/大面积亮色，装饰只做小面积低亮度（2026-11-02 移除 `--pet-glow`，D58）。
- **宠物图集（OpenPets schema 2）**：资产在 `app/src/mobile/features/pet/assets/openpet/`（webp 764KB + poster 14KB + pet.json）；一列一帧、单状态 ≤32 帧、兼容 16；播放器 rAF 按 `frames[].duration` 推进，done 用 `loop` 循环（一轮 16×100ms=1.6s，3 秒 completed 内约 1.875 轮，**不再末帧定格**）；后台/覆盖层暂停，减少动效冻结第 0 帧；manifest 非法/解码失败/尺寸不匹配 → poster 兜底。新增状态行只需图集加行 + manifest 登记（可选改 `sprite-state-map.ts` 候选链），渲染器不用动。单帧 256 在 ~500px 舞台 2 倍放大会偏软，解码约 16.8MB；**`.petSlot` 在 max-width 卡住时会变竖长（360×800 屏上是 272×440 CSS），播放器必须按 min(宽,高) 取方形格子 + `overflow:hidden` 居中，否则会露出图集相邻行（看起来像两只宠物）**；资产来自 DeepSeek 鲸鱼（zip 无 LICENSE），发版前确认授权。
- **宠物资产红线（D71，不可越界）**：复用现有 OpenPets 图集 + `SpritePet`，**不重绘、不染色、不新增鲸鱼**；本体颜色归图集，`tokens.css` 已删除 `--pet-body`/`--pet-belly`/`--pet-eye`/`--pet-cheek`，不要再给鲸鱼加 CSS fill/filter。**手机舞台已无背景声呐环（D77）**，不要再加回来；桌面 `SignalDot` 的 `.sonar-dot-ring` 保留，不加光晕（OLED，D58）。
- **宠物触摸互动已下线**（2026-11-04，D69）：点击、长按、来回抚摸宠物都不产生任何反应，不再有 `POKE`/`PET_*`/`interacting`/手势识别/亲密度/触摸爱心；不要再加 pointer 手势或 `interacting` 状态。AI 四态、睡眠/变暗保留；**麦克风反应已下线（D77）**——录音时宠物姿态/气泡/触感不变，只保留 `micListening` 门禁静音 AI 音效/触感。变暗遮罩的点击唤醒是屏幕行为，不是宠物互动。
- **宠物首次命名/改名已下线**（2026-11-05）：宠物固定显示「小跟班」，`first_meet` 文案是「你来了。我是小跟班。」；不要再加命名弹层、输入框、`NAME_SET`/`celebrating`/`happy`/爱心/`phaseUntil`/`schedulePhaseExpiry`/`setName`，也不要再给 `PetSaveV1` 加 `name`。`onboarded` 保留为「是否已见过面」，首次 BOOT 置 true；旧存档的 `name` 字段忽略、不迁移（version 仍 1，其他字段照常恢复）。手机「更多」页分组固定为 01 连接 / 02 外观 / 03 反馈 / 04 显示 / 05 数据与关于（含重置宠物）/ 06 消息通道，重置确认文案「要重置宠物吗？」。
- **AI 联动（DSH hook）**：不装第三方插件；`app/src/dsh-hook/sidekick-hook.mjs` 由 Rust `include_str!` 打进桌面端并写到 `~/.dsh/profiles/<profile>/plugins/`，patch 用 `# >>> sidekick-hook` 标记块插入；首次必须重启 DSH 一次（profile patch 启动时加载），之后开关只改 `~/.dsh/sidekick/config.json` 热生效。改脚本后要重新编译桌面端，否则嵌入的还是旧版本。插件协议版本 `PLUGIN_VERSION = 3`（v2 加 `sessionList`，v3 加会话当前工具类别），桌面「系统 › 联动」页的「插件 v3」由 hello 上报动态渲染，不用改页面代码。回环端口 `47815–47819`，只绑 `127.0.0.1`，Bearer token；状态只发 `state/sessions/ts/resume/sessionList`（id、标题、状态、askKind、lastEventAt、completedAt、粗粒度工具类别 `tool`），**不要加提示词/回复/工具参数/路径/cwd/模型名/工具名原文**。`tool` 是插件本地归一后的固定枚举（bash/read/edit/search/web/agent/plan/tool），未知工具落 `tool`；Rust 桥 `SessionTool` 做第二道白名单、未知值折叠为通用 `tool`，不保留原文。标题是内容类外发字段：单行 ≤80 字符、不写日志、不落盘；`sessionList` 最多 50 条，旧客户端忽略（旧插件不报 `tool`，手机显示「正在思考」）。多 profile 已安装时 UI 锁定选择器，切换要先移除联动。
- **用量看板**：只读 `$DSH_HOME/storages/cost-meter/ledger.json`（180 天、日粒度、costCny 实际记账）；金额人民币微元，总 Token 五个桶相加，缓存命中 = cacheRead/(input+cacheRead+cacheWrite)；缺 `costCny` 才按价格表估算并标 `≈`，未知模型不编造；百炼 ASR 费用不并入。`usage` 消息带 `data` 包装，不含提示词/路径/cwd；模型 ID 默认上手机（D83），关闭「在手机显示模型分组」后 `groups.models=[] + modelsHidden=true`。价格表 seed 由 `scripts/update-pricing.mjs` 更新，缓存/覆盖在 `~/.sidekick/`；刷新失败保留上次成功，禁止写零价。
- **手机会话列表**：`sessionList` 随 `status` 广播（最多 50 条，标题 ≤80 字符，`tool` 仅 working 有值）；手机 `session-store` 用本地清除标记过滤（`lastEventAt <= cleared.through` 隐藏），标记存 `sidekick-sessions.json` 只含 id/at/through（7 天 TTL、最多 200 条），有新事件自动解除。会话卡在宠物页置顶：折叠 1 行 / 展开最多 5 行，标题 + 状态/相对时间 + ×（asking 二次确认）；不再有动态页。工作中行显示 spinner + 「正在<动作>」（运行命令/阅读文件/修改文件/搜索代码/查资料/处理子任务/整理计划/使用工具；无 `tool` 或未知值「正在思考」），行尾保留相对时间。点 asking 会话发 `focus.request`，桌面 `app_focus.rs` 只做 `open -a "DeepSeek Harness"`（1.5s 限频，错误只回错误码），**不接受手机传来的应用路径**。**已归档会话不下发**：桌面桥读 `$DSH_HOME/storages/workspace.json` 的 `global.archivedSessionIds`（2s 缓存，文件缺失/异常按空）过滤列表，并按可见列表重算聚合态与 `sessions`，避免归档的 asking 让宠物一直停在「等你决定」；插件仍上报原始列表，旧桥忽略。改 `sessionList` 字段要同步 `protocol/README.md`、Rust 桥与手机解析三处。
- **麦克风圆钮/胶囊**：单竖屏布局下空闲态是 56px 薄荷圆钮居中、距底 24；录音/处理时展开为 `min(90vw,420px)` 胶囊；实时文本/结果卡片在按钮上方独立绝对定位（`bottom-[68px]`），出现/消失不推动按钮。不要再加左下取消按钮，取消只保留上滑手势；不要用 `left-1/2 -translate-x-1/2` 居中（WebView 103 不支持 CSS translate）。
- **结果卡片手动按键**：`key.request` 只接受「最近一次 `mic.result(inserted)`」的目标（owner+mic session），30 秒过期、成功一次即作废、桌面 500ms 限频；按键前重新核对前台应用、密码框、辅助功能，任一不符只回错误码、不按键。「清空」是 `⌘A`+`Delete`（两次确认），不是 ⌘Z；终端等非标准输入框可能不生效，**绝不能因此回退成回车**。日志不打文本/应用名/按键序列；结果卡片只在 `outcome=inserted` 时显示按钮。
- **麦克风会话/中断（2026-11-04，D70）**：手机 `mic-button` 的手势结束必须看 ref（`heldRef`/`pointerIdRef`）而不是渲染期 `phase`；一次只允许一个 in-flight start（`startingRef` + `lifecycleRef` token），否则 `sessionIdRef`/`startSentRef` 会被并发 start 覆盖，出现「手指已抬起但电脑端一直正在听」。服务端同端重复 `mic.start` 以最新会话为准、异端仍 `session_busy`；`mic.stop` 必须 owner+session 匹配；每个会话 `maxMs+3s` 看门狗；新增 `mic.cancel`（桌面 UI 请求 → 服务端广播 `reason=desktop|timeout`），手机收到后**不校验本地 session** 强制停本地采集。桌面浮层「倾听中」右侧有「取消录音」。改 `mic.cancel` 要同步 `protocol/README.md`、`protocol-audio.md`、Rust `handle_mic_cancel` 与双端解析。
- **shadcn 不要混 base**：当前固定 `base-nova`（Base UI）；组件从 registry 复制，不要再引 Radix 版本；类名合并用 `cn`，不要再装 clsx/tailwind-merge。
- **`--accent` 与 `--whale` 分开（D71）**：`--accent` 是 shadcn 的 hover/选中面（语义 = `--wash` 薄荷薄层）；鲸蓝用新令牌 `--whale`。不要改 `--accent` 当品牌次色，否则所有 shadcn 组件 hover 会变蓝块。
- **声呐环只做装饰且可暂停**：只剩桌面状态点 `.sonar-dot-ring` 5.6s（手机舞台背景环已删除，D77）；只动 `transform`/`opacity`，细描边、不发光、不叠 `filter`；`prefers-reduced-motion` 冻结；`useMotionPause` 在后台/窗口失焦写 `<html data-motion-paused>` 暂停。常驻窗口不要再加更多循环动画，也不要恢复手机舞台环。
- **指挥舱壳体**：视图切换是组件状态（桌面 `route.view` / 手机 `ui-store.view`），不写 URL、不引路由、不给 `<body>` 加状态类；⌘1–⌘6 在输入框 / 下拉 / contentEditable 里不劫持。
- **手机字体（D81）**：Android WebView 把 `sans-serif` 解析成 OEM 的 **OPlusSans 3.1（OPPO Sans Regular）**，字形比 PingFang 宽、笔画厚，15–16/400 会显「老年机」；**不要只靠 300 字重**（会发虚）。手机端随包 `app/src/mobile/assets/fonts/MiSans-Normal.woff2`（MiSans Normal 400，3.9MB，免费商用），`clean.css` `@font-face` + `.mobile-clean` 首选；系统字体做缺字回退。标题 15，正文 13，设置说明行高 1.45；全手机 400（`!important` 防合成粗体），桌面不加载。字体许可说明在 assets/README 与设置「数据与关于」。
- **手机返回层级与录音**：settings / chat / asking → pet、offline → 上一页、scan → offline；新增全屏页必须接入返回处理，否则按返回会被根页面当成退出确认；没有底部 tab，录音中所有换页入口由 `ui-store.setView` 拦截，不弹「录音中 · 松手后再切页」（那是旧 3 档文案）。
- **首用清单 / 设备数 / focus**：手机只本地判定「连接 + 麦克风（`micReady`）」，百炼与辅助功能只能标「在电脑上完成」，不得伪造完成；桌面「已连接 · N 台设备」= `system.clients - 1`（含本机窗口与网页预览），不显示设备名；浏览器 mock 无本地 WS，「在 DSH 打开」只能在 `pnpm tauri dev` / 真机验证。

## 9. 协作约定

- 用户是中文母语：沟通用中文、直白、先基础后细节；环境配置由 AI 直接代劳，但破坏性操作（删库、重置、卸载）先问。
- 改动跨端时同步更新 `protocol/README.md` 与相关 docs；重大决策追加到 `docs/decisions.md`。
- 文档遵循 `docs/standards/documentation.md`：先改“唯一归属”文档，再同步索引；不要一次读完整棵文档树。
- 平台边界：`mobile` 不 import `desktop`，`desktop` 不 import `mobile`，`shared` 不 import 两者；详见 `docs/standards/engineering.md`。
- 前端改动遵循 `docs/frontend-architecture.md`；新增/升级依赖遵循 `docs/dependency-policy.md`，新增运行时依赖追加到 `docs/decisions.md`。
- 不提交构建产物（`app/dist`、`node_modules`、`src-tauri/target`、`gen/`、APK、`.venv`）；**唯一例外**是 `release/` 下两个固定命名的安装包（`Sidekick-macOS.dmg`、`Sidekick-Android.apk`），它们是要分发/直接下载的成品，每次打包覆盖同名文件、不建版本号目录。
- **Git**：提交信息**用中文**（`type(scope): 中文摘要` + 中文正文，type/scope 保留英文）；push 前跑完 `typecheck/lint/test/build`、手机端真机验证、文档检查；`force push`/改仓库可见性等不可逆操作先确认；完整规则见 [docs/standards/git.md](docs/standards/git.md)。GitHub 推送已配置（gh 登录 fouriyeo，已 `gh auth setup-git`）。

## 10. 下一步路线（按优先级）

> 前置：Phase 1 平台分目录与连接/聊天迁移已完成（2026-10-31）；手机自动发现电脑已落地；宠物 P0 代码完成（帧动画图集；触摸互动已下线；真机与扩展状态行待补）；麦克风 P0 与桌面剪贴板 P1 代码完成，真机/辅助功能待回归；手机 D80 两页壳代码完成并完成基础真机验证（2026-11-05）。

1. ✅ 前端平台分目录 + 连接/聊天迁移（已完成 2026-10-31）。
2. 情绪宠物 P0：代码已完成（帧动画图集 + poster 降级、单竖屏布局、plugin-store 存档）；真机 60fps/存档跨重启、扩展状态行（睡眠）待补；触摸互动、麦克风联动与首次命名均已下线（D69/D77/2026-11-05）。
3. ✅ 外设麦克风（百炼云端唯一）：二进制协议、云端流式、`mic.partial`、手机 UI、桌面浮层已完成；结果卡片手动回车/清空已完成（2026-11-04）；下一步 macOS 辅助功能自动粘贴与真机 60 秒/断连/密码框/按键焦点矩阵。
4. ✅ 模型页 + 用量统计：百炼配置（无业务空间 ID）、本地 Key 元数据、区间切换（今天/7/30/365，1 年按月）、清空统计已完成（2026-11-02）；下一步真实账号/本地 Key 迁移/金额对账与真机验收。
5. ✅ 桌面剪贴板 P1：文本历史、搜索、置顶、隐私过滤、本地持久化已完成；语音转写以 `voice` 入库、100 条上限在 UI 可见（2026-11-01）。
6. ✅ 手机干净版两页壳（2026-11-05，D80；取代 D79 的手机 3 档）：宠物页（顶栏 / 会话卡 / 鲸鱼 / 居中圆麦克风）+ 设置二级页，删动态页与底栏；结果卡弹窗三段；代码完成、591 tests 全绿；下一步真机回归（返回键 / 录音禁切页 / 双主题 / 320 宽 / 结果卡清空二次确认）。
7. 🚧 AI 联动（DSH hook）：本地脚本注入 + 桌面回环桥 + 手机四态动作/三音效 + 会话列表/清除/反问唤起 + 会话行工具动作（插件 v3）；代码完成，待真机/隐私验收（2026-11-04）。
8. 手机回答 AI 提问（answer 回传 + hook 结果注入）、文本消息、Claude Code / Qoder 接入。
9. 配对鉴权 + 正式签名/公证/开机自启（`release/` 固定产物与打包脚本已完成 2026-11-03，仍是本地密钥/未签名）。
10. 蓝牙通道：评估 Tauri 移动端 BLE（需自写 Kotlin 插件）或 Python sidecar；见 `docs/ble-notes.md`。
11. iOS 目标（Tauri mobile 初始化 + 后台限制评估）。
12. P2：系统级虚拟麦克风、云同步/多语言。
13. 视觉系统双主题回归（2026-11-04，D71/D76）：逐页检查深/浅两套主题的对比度与层级、浅色海玻璃舞台与页面的衔接、深色浮层 `.deep-sea-scope` 不被浅色主题漂白、桌面状态点声呐环在 reduced-motion/后台失焦下的暂停；之后每个新组件都要双主题验收。
