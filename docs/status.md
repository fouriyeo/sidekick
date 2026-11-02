# 项目状态

最后更新：2026-11-02

## 时间线（2026-10-31）

1. 命名「小跟班 / Sidekick」，创建私有仓库 `fouriyeo/sidekick`；
2. 安装 Rust、JDK 21、Android cmdline-tools、SDK/NDK，配置 Tauri 安卓工程；
3. 蓝牙预研：Python `bless` 验证 Mac 可作 BLE 外设（后暂停，主线转局域网）；
4. 实现桌面端（axum HTTP/WS 服务 + 二维码 UI）与安卓 App（Rust WS 客户端 + 手机 UI）；
5. 修复首版黑屏（CSS 类名冲突把 `<body>` 隐藏），重新出包并安装；
6. 真机验证通过：手机 App ↔ 桌面端双向收发消息；
7. 清理模板残留与未使用插件，前端包管理器从 npm 迁移到 pnpm（`pnpm-lock.yaml` 入库）。
8. 安装前端重构依赖与脚手架：React 19、Tailwind v4、shadcn/ui（Base UI, base-nova）、Motion、Rive、Zustand；Vite/TS 别名、Biome、Vitest 已配置；旧 UI 尚未迁移。
9. 落地产品规范与两份 PRD：树形文档（`docs/INDEX.md` + product/standards/prd/engineering）、宠物与麦克风 PRD/SPEC/ACCEPTANCE、项目子智能体与 Skill、`scripts/check-docs.mjs`（2026-10-31）。
10. 完成前端 Phase 1：React 双 entry（`main.tsx` + `entries/desktop|mobile`）、`desktop`/`mobile` 连接/聊天 1:1 迁移、`protocol/messages.ts`、`shared/lib/tauri.ts`；删除旧 `main.ts`/`styles.css`；桌面浏览器与 Realme 真机双向收发通过（2026-10-31）。
11. 宠物 P0 代码落地：文档预检（麦克风延后/plugin-store）、Tauri plugin-store 2.5.0、状态机/手势/精力亲密度/确定性存档、静态 SVG 舞台、双姿态、命名/设置、宠物主界面 + 聊天入口；84 个前端测试通过，浏览器/无头 Chrome 视觉验证（2026-10-31）。
12. 宠物姿态改为按屏幕方向自动切换：新增 `useOrientation`（matchMedia + resize/orientationchange），横屏 docked、竖屏 handheld；设置手动覆盖到下次旋转；真机旋转验证通过（2026-10-31）。
13. 手机自动发现电脑：UDP 广播探测（固定 47820）+ 桌面单播回「主机名 + 真实端口」；服务端口改候选 `47810`–`47814`、`8848` 自动回退；手机启动即自动连接，桌面二维码改为按需展开（2026-10-31）。
14. 麦克风 spike：WebView `getUserMedia` + PCM16 采集、手机 Rust 走 JSON `voice.*`、桌面 whisper.cpp 本机转写、`arboard` 写剪贴板；真机 5 秒长按和桌面转写已验证（2026-10-31；本机转写已于 2026-11-02 下线）。
15. 麦克风 P0：二进制 PCM16 协议（`mic.start/ready/stop/result/state/error` + `SK01` 帧）、服务端单会话缓冲、whisper-rs 内存转写与启动 prewarm、直接 CGEvent 自动粘贴（未授权复制）、手机波形/上滑取消/权限说明/结果卡片（2026-10-31；whisper 部分已于 2026-11-02 下线）。
16. 桌面设置页：语音模型下载/选择/删除/预热、辅助功能授权卡片；应用内语音状态浮层；桌面剪贴板历史（文本、搜索、置顶、隐藏内容过滤、`0600` 持久化）（2026-10-31；模型部分已于 2026-11-02 移除）。
17. 手机断连自动重连：退避 1s→2s→4s→8s→16s→30s，每次重试先静默 UDP 重新发现（覆盖 IP/端口变化），再连唯一电脑/退回上次地址；多台电脑回上次那台、无地址时停止；切后台暂停、回前台立即重试；聊天页常显「N 秒后自动重连」+「立即重连」+「重新搜索」（2026-11-01）。
18. 宠物页屏幕常亮：设置页「显示 → 屏幕常亮」变成真开关（默认开）；手机 Rust 新增 `set_keep_screen_on` 命令，用 JNI 调 Android `FLAG_KEEP_SCREEN_ON`，只在宠物页前台（含设置弹层）生效，聊天/后台释放；旧存档 `"never"` 归一化为开（2026-11-01）。
19. 手持模式录音 UI 第一轮修复：把录音条/结果卡片/临时提示移入独立绝对定位覆盖层，右下 96dp 麦克风按钮按住后不再被撑宽居中（2026-11-01）。
20. 语音转写结果入库：桌面 `write_text_and_record` 在写系统剪贴板（自动粘贴/降级复制）后，以 `kind = "voice"` 记入剪贴板历史；暂停记录时仍写系统剪贴板但不入历史。剪贴板 UI 显示「N / 100 条」并说明 100 条淘汰规则，语音条目带「语音」标签（2026-11-01）。
21. 按用户真机反馈调整手持语音交互：去掉矛盾的左下 X 取消按钮（按住说话时点它必须先松手，而松手就已经结束），取消只保留上滑；语音按钮由右下改为底部居中，录音条/结果卡片/提示在按钮上方居中；上滑取消后提示「已取消，没有发送。」（2026-11-01）。
22. 修复真机 WebView 103 居中偏移：Tailwind v4 的 `translate` 工具类输出 CSS `translate` 属性，WebView 103 不支持，导致底部居中按钮整体偏右 48px；把麦克风按钮/覆盖层、再按一次退出提示、宠物保存失败提示改为 `inset-x-0 + flex` 或 `left-0 right-0 mx-auto`。真机 CDP 复验按钮中心偏差 0px（2026-11-01）。
23. 触感接管 + 可配时长：关闭 WebView 默认长按震动（`setHapticFeedbackEnabled(false)`），App 用原生 `performHapticFeedback` 发轻/中/成功/失败触感（不申请 VIBRATE）；麦克风按下即中震；宠物页禁长按选中/复制；自动变暗默认 5 分钟、屏幕常亮最长默认 2 小时，均可在设置页调整（2026-11-02）。
24. AI 联动（DSH hook）开发：产品/体验/验收文档落地（`docs/prd/hook`）；桌面「AI 联动」页、本地 DSH 脚本注入、Rust 回环桥、`status` 协议、手机四态动作与三音效；首次开启需重启 DSH 一次，之后热开关（2026-11-02，开发中）。
25. 百炼云端唯一（2026-11-02）：下线本机 whisper（`asr_models.rs`、`whisper-rs`、cmake/libclang 前提、模型下载/选择/删除命令、`models_dir`）；`AsrSettings` 只剩 `{version, consentCloud, bailian}`，旧 `engine/fallbackToLocal` 忽略；未配置/未同意/无 Key 直接 `mic.error`，不再回退本机；协议移除 `engine/model/fallback`，保留 `usage`。
26. 模型页 + 用量统计（2026-11-02，更新）：桌面主导航新增「模型」（聊天/剪贴板/AI 联动之后），设置 Sheet 只留自动输入权限与剪贴板；百炼配置只填完整服务地址（无业务空间 ID 字段/不传 `X-DashScope-WorkSpace`，占位符未替换会报错）+ Key/模型/语言/场景/热词/同意/测试/保存/清除 Key；用量改为区间切换（今天无明细/7 天/30 天按天/1 年按月），后端返回最近 365 天 `days`；`asr_usage.json`（0600、按本机时区、最多 400 天、原子写、每次 task-finished 有 usage 就记账）；北京/新加坡价格估算。Keychain 只在保存/清除 Key、测试、录音时读，开页用 `keyPresent`/`keyHint` 不弹密码。

## 已验证（有实际证据）

- 手机浏览器扫码可打开电脑 `http://<电脑IP>:<端口>/`（局域网 HTTP 通；当时固定 8848，现已改为 `47810` 起候选回退）；
- 桌面窗口显示地址/二维码；`/download/apk` 返回 APK（content-type、文件名正确）；
- 安卓 App 安装启动显示手机界面（「Sidekick 手机端」、地址输入、发送框）；
- 手机 App 连接桌面：状态变「已连接」；
- 手机 → 电脑：桌面日志出现 `[ws] recv: {"from":"phone",...}`；
- 电脑 → 手机：手机界面出现对应消息（气泡方向已按角色修正）；
- 测试设备：Realme RMX3370（Android 13），无线 adb；桌面 macOS arm64；
- 前端脚手架：`pnpm typecheck`、`pnpm lint`、`pnpm test`（2 个冒烟测试）、`pnpm build` 通过；Tailwind v4 + shadcn 主题可编译。
- 前端 Phase 1：`pnpm typecheck` / `pnpm lint` / `pnpm test`（40 tests）/ `pnpm build` 全绿；安卓 debug APK 构建成功；`node scripts/check-boundaries.mjs` 通过。
- 桌面 UI（浏览器复用 Vite + 真实服务，当时 8848）连接/收发、手机 UI（浏览器 mock）连接/收发、Realme 真机 App ↔ 桌面双向消息与气泡方向通过；手机端只加载 mobile chunk，`qrcode` 只在 desktop chunk。
- 宠物 P0 文档预检：`node scripts/check-docs.mjs` 通过；PRD/SPEC/AC/UX/pet-runtime 已按“手动姿态、快速连戳 P1、麦克风延后、plugin-store”收口。
- 宠物 P0 代码：`pnpm typecheck` / `pnpm lint` / `pnpm test`（84 tests）/ `pnpm build` 全绿；Android debug APK 构建成功；`check-boundaries` 通过。
- 宠物浏览器验证：首启命名、设置页、手动支架/手持、减少动效、聊天入口/返回正常；无头 Chrome 1280×720 截图确认静态宠物舞台与设置页。
- Realme（WebView 103）已安装并启动；竖屏宠物舞台、设置页、改名 + 手持后杀进程重启恢复均通过；`sidekick-pet.json` 已写入应用私有目录。
- 方向自动姿态已在 Realme 上验证：竖屏 handheld、横屏 docked，旋转后 320ms 内切换；设置手动覆盖可用。
- **自动发现端到端已验证（2026-10-31）**：Realme 打开 App 后 logcat 出现 `[discovery] 扫描结束，发现 1 台电脑` → `[mobile] connecting to ws://<电脑IP>:47810/ws` → 已连接；聊天页显示「设备名 + 地址 + 已连接」，发消息桌面日志出现 `[ws] recv` 且手机收到回显。
- **端口回退已验证（2026-10-31）**：先占用 47810，桌面日志显示 `端口 47810 绑定失败…尝试下一个候选端口` 后监听 47811；手机发现回包携带 `port=47811` 并自动连上。
- **桌面面板已改版验证（2026-10-31）**：真实服务 + 浏览器 `?role=desktop` 通过 CDP 检查，默认无 canvas（无大二维码），地址显示真实端口，展开后出现 160px 二维码。
- 自动化测试：`pnpm typecheck/lint/test/build` 全绿（103 前端用例）；`cargo test` 10 passed；`check-boundaries`、`check-docs` 通过。
- 麦克风 spike：真机 5 秒长按生成约 143KB WAV，桌面收到并 whisper 转写；合成中文 WAV 得到 20 字文本；剪贴板 UTF-8 正确；自动粘贴因辅助功能权限返回 copied。
- 麦克风 P0 后端：Python WS 客户端按正式二进制协议发送 3.9 秒中文，服务端返回 `mic.result(copied, accessibility_off)`；whisper-rs base 在模型预热后延迟约 0.2–0.3s；剪贴板 UTF-8 内容正确。
- 剪贴板：复制文本后 `~/Library/Application Support/Sidekick/clipboard.json` 在 1 秒内出现，权限 `600`；带 `org.nspasteboard.ConcealedType` 的内容未记录；语音转写从 2026-11-01 起经 `write_text_and_record` 以 `kind=voice` 入库（此前版本不入库）。
- 前端质量：`pnpm typecheck` / `pnpm lint` / `pnpm test`（128 tests）/ `pnpm build` 通过；`cargo test --lib` 20 tests 通过。
- **断连自动重连已验证（2026-11-01，Realme 真机）**：22:47:54 杀掉桌面进程，手机 22:47:54.504 检测到 `[mobile] 连接已断开`；随后按退避自动重试（发现 0 台 → 退回上次地址 → 连接被拒），重试时间点 22:47:57 / 22:48:00.6 / 22:48:06.3 / 22:48:15.9 / 22:48:33.5（每次 = 退避 + 1.5s 扫描窗口）；桌面 22:49:05 恢复后下一轮自动发现 1 台并 `[mobile] connected`，无需任何手动操作。
- **端口变化自动重连已验证（2026-11-01，Realme 真机）**：占住 47810 后桌面回退到 47811，手机断连自动重试时发现回包 `port=47811` 并 `[mobile] connected to ws://…:47811/ws`；聊天页显示「已连接」与新端口。
- **重连 UI 已验证（2026-11-01）**：断连瞬间聊天页显示「未连接 / 正在自动重连（第 1 次）…」+「重新搜索」，连上后恢复正常；前端 147 个用例（含 fake timers 的退避/暂停/立即重连/多台不自动选）全绿。
- **宠物页屏幕常亮已验证（2026-11-01，Realme 真机 / Android 13）**：安装后打开 App 停在宠物页，`adb shell dumpsys window windows` 的窗口 `fl=` 含 `KEEP_SCREEN_ON`（默认开；设备上旧存档的 `"never"` 已迁移为 `true`）；点「打开聊天」后标志消失、返回宠物恢复；打开设置页时保持常亮；设置里关掉「屏幕常亮」标志消失、重开恢复；`sidekick-pet.json` 持久化为 `keepAwake: true`，logcat 无 `[keep-awake]` 错误。前端 159 用例全绿（含 `use-keep-awake` 3 例）。
- **手持模式录音 UI 已验证（2026-11-01，无头 Chrome CDP + Realme 真机 / WebView 103）**：393×852 无头 Chrome：空闲按钮 96×96、中心 x=196.5=视口中心、距底 24，录音条中心 196.5、宽 322.3、按钮上方 8px，上滑 60px 进入「松手取消」珊瑚态，松手回 idle 并提示「已取消，没有发送。」。Realme 真机（360×800，CDP `Input.dispatchTouchEvent`）：按钮 rect left 132/right 228（中心 180=视口中心，偏差 0px）、96×96、距底 24px，DOM 无「取消录音」按钮；按住后中心不变、录音条中心 180、与按钮 gap 8px；上滑 60px 按钮文案「松手取消」+ `bg-pet-coral`；松手回 idle 并出现「已取消，没有发送。」。852×393 docked：空闲胶囊中心 426、底边距 16，按住后容器 520 仍居中、录音条在胶囊内。
- **触感/变暗/常亮真机已验证（2026-11-02，Realme RMX3370 / Android 13）**：装上 debug APK 后 `dumpsys window` 宠物页含 `KEEP_SCREEN_ON`、切聊天页消失、返回恢复；长按聊天文本仍选中（`getSelection` 有 Range）但 logcat **无** `VibratorManagerService` 震动（证明 WebView 默认长按触感已关闭）；长按宠物页图标/空白无震动、无选中（`user-select:none`）；点宠物触发 App 触感（logcat waveform 45ms）。把存档 `dimMinutes` 改成 1 后重启，约 60s 出现 30% 黑色遮罩（`getComputedStyle(opacity)=0.3`），点一下恢复；旧存档自动补上 `dimMinutes: 5`、`keepAwakeHours: 2`；logcat 无 `[haptics]`/`[keep-awake]` 报错。
- **触感/时长可配已通过质量门（2026-11-02）**：`haptic` / `disable_webview_haptics`（`app/src-tauri/src/haptics.rs`，decorView `performHapticFeedback` + WebView `setHapticFeedbackEnabled(false)`）通过 `cargo check --target aarch64-linux-android`；前端 `haptics.ts` 收敛为唯一入口、麦克风按下中震、宠物页禁用长按选中；`dimMinutes`（默认 5）与 `keepAwakeHours`（默认 2，0 = 不限）落地并含旧存档迁移；`useKeepAwake(active, maxDurationMs)` 到点释放。`pnpm typecheck / lint / test（174 tests / 28 files）` 全绿；真机触感/变暗/常亮到点待验收。
- **语音入库 + 100 条上限已验证（2026-11-01）**：Rust `record_item` 单测覆盖 voice kind、同文本去重保置顶、100 条裁剪保置顶；剪贴板 UI 显示 `N / 100 条` 并给语音条目加 Mic 图标与「语音」标签；`cargo test --lib` 24 passed，`pnpm typecheck / lint / test（164 tests / 27 files）/ build` 全绿。`write_text_and_record` 的「暂停记录仍写系统剪贴板、不入历史」由代码路径与单测语义保证。
- **AI 联动代码质量门（2026-11-02）**：`pnpm typecheck / lint / test（291 tests / 36 files）/ build` 全绿；`cargo test --lib` 71 passed（新增 dsh_hook 23 + install 24）；脚本 `node --check` + `vitest run src/dsh-hook` 32 passed；`node scripts/check-docs.mjs` 0 warning、`check-boundaries` 通过。浏览器 mock DOM 核对四态 `data-ai-state`、文案、asking 6s 降速、completed 3s 回 idle、桌面 AI 联动页首次/已连接态。**未做真实 DSH 插件加载/重启**，也未写真实 `~/.dsh`；需要在用户方便时重启 DSH 验收。
- **未验证**：macOS 辅助功能勾选后的实际 Cmd+V 粘贴、密码框/窗口切换完整矩阵、真机 60 秒与断连、真机语音转写进入剪贴板历史的端到端（本机 mock/单测已覆盖）、dialog/sheet/tooltip 在 WebView 103 的居中表现（仍用 translate 类）、横屏 16:9/20:9 安全区、3 分钟 60fps、TalkBack、Rive 资产、AI 联动真实 DSH 重启/插件加载与 Realme 四态 60fps/音效/真机 3 米识别、百炼真实账号/Keychain 授权/真机流式/60s、开页不弹 Keychain、用量区间切换/跨天/金额对账、Windows/Linux Keychain。

## 已知问题 / 技术债

| 项 | 说明 |
| --- | --- |
| 无鉴权/加密 | 同网段任何人可连 WS；仅限可信网络 |
| 无心跳（半开连接） | 断连靠 FIN/RST 立刻发现（实测约 0.5s）；电脑睡眠、路由器静默丢包时可能长时间仍显示「已连接」，直到写失败或 TCP keepalive 生效；WS 心跳待做 |
| 自动重连的后台限制 | App 切后台暂停重连（回前台立即重试）；进程被系统杀掉后需重新打开 App 才会再连 |
| 无持久化 | 消息不落库，重启即清空 |
| 消息回显 | 广播会把发送者自己的消息也回传（当前 UI 按 `from` 显示） |
| 包体大 | debug APK 约 120–240MB（含调试符号），未做 release 签名 |
| 包名遗留 | `app` 的 npm/Cargo 包名仍为 `desktop`（历史原因，产品名已是 Sidekick） |
| withGlobalTauri | `tauri.conf.json` 仍为 `true`；Phase 4 收紧为 `false` 时需回归 IPC/事件/QR |
| 麦克风（云端唯一） | 已实现；自动粘贴依赖 macOS 辅助功能，需要用户手动勾选一次；开发二进制重编译后可能需重勾选 |
| 云端麦克风未完成项 | 真机 60 秒/断连、密码框/窗口切换完整矩阵、辅助功能实测、真实百炼账号/Keychain 授权、用量统计跨天/金额对账 |
| 百炼云端未真机验收 | 403 已单独映射 `cloud_forbidden`、保存失败已回滚 Key；真实账号/Keychain 授权/流式 partial/60s 仍待验；默认旧域名是否支持该模型需用真实 Key 验证 |
| 云端依赖公网/额度 | 断网/限流/额度不足直接失败（无本机回退）；音频仅在用户显式同意后上传 |
| 旧 models 目录 | `~/Library/Application Support/Sidekick/models/` 可能仍有旧文件，不参与运行，可手动删除 |
| 用量为估算 | 金额按北京/新加坡公开价估算，未对账百炼账单；`priceNote` 已说明 |
| Keychain dev 授权 | 开发版重编译可能弹一次 macOS 钥匙串授权；打开模型页不读 Keychain（`keyPresent`/`keyHint`），只有测试/录音才读；Windows/Linux 仍为报错占位 |
| 手持取消只支持上滑 | 按住说话是单指连续手势，不设「取消」按钮；TalkBack/VoiceOver 的取消动作（无障碍替代）P1 补 |
| 宠物真机/性能未验证 | 无线 adb 断连；存档跨重启、横/竖屏安全区、3 分钟 60fps、掉电待真机回归 |
| AI 联动未真机验证 | 本地 DSH 脚本注入、首次重启、四态动作、三音效、杀 DSH/重连待真机回归；P0 只聚合顶层会话，子代理可能提前完成 |
| AI 联动首次需重启 DSH | profile patch 在启动时加载；desktop profile 默认无 HMR；之后开关只改配置热生效 |
| AI 联动自由文本提问 | 只认显式提问/审批（ask_user_question/exit_plan_mode/approval/blocked）；模型在回复末尾问一句不算 |
| Rive 未接入 | 当前静态 SVG + CSS 呼吸；`.riv` 资产与输入映射待补 |
| 触感依赖系统设置 | App 主动触感走 `performHapticFeedback`，系统「触摸振动」关闭时不震（尊重用户设置，非 bug）；`navigator.vibrate` 因 APK 未声明 `VIBRATE` 被 WebView 忽略，只作浏览器兜底；iOS 暂无触感 |
| WebView 默认长按触感 | 已在启动时用 `setHapticFeedbackEnabled(false)` 关闭；若未来需要「长按复制消息」，只恢复功能、不要恢复系统触感 |
| WebView 103 兼容 | 真机 WebView 103 不支持 oklch/dvh/color-mix；已加 hex/rgb + 100vh 回退。也不支持 CSS `translate` 属性（Tailwind v4 的 translate 工具类）：麦克风居中、退出提示、宠物保存提示已改用 `inset-x-0`/`mx-auto`；dialog/sheet/tooltip 仍有 translate 类，真机居中待修 |
| 剪贴板历史 | 仅在桌面应用运行时记录；无全局快捷键；图片/文件/富文本不支持 |
| 端口候选回退 | 47810–47814、8848 依次尝试；全部占用时服务启动失败（server_info 报错） |
| 发现依赖 UDP 广播 | 路由器禁止广播/AP 隔离时发现失败，需手动输入地址或扫码 |
| 同机多实例 | 只有一个实例能绑 UDP 47820，仅先启动者可被自动发现 |
| 舞台/聊天提示的「连接」按钮 | 仍保留：自动重连期间不可用，但用户可「立即重连」或「重新搜索」手动干预 |
| gen 不入库 | 克隆后需 `pnpm tauri android init` |
| 桌面端为开发模式 | 目前用 `tauri dev` 运行，未打包/未做开机自启 |

## 下一步（按优先级）

- [x] **前端平台分目录 + 迁移**：按 [standards/engineering.md](./standards/engineering.md) 落 `src/entries` / `src/desktop` / `src/mobile` / `src/shared` / `src/protocol`；对应 `frontend-architecture.md` 的 Phase 1。
- [x] **情绪宠物 P0**：代码完成（状态机/手势/plugin-store/静态舞台/手动双姿态/设置）；真机 60fps、存档跨重启与 Rive 资产待补。
- [ ] **宠物真机回归（剩余）**：横屏 16:9/20:9 安全区、3 分钟 60fps、TalkBack、Rive 资产；竖屏/设置/存档已通过（2026-10-31）。
- [x] **外设麦克风 spike**：WebView 采集、whisper.cpp 本机转写、剪贴板/粘贴降级已跑通。
- [x] **外设麦克风 P0 代码**：二进制协议、内存 ASR、模型管理、手机 UI、桌面设置/浮层；待真机与辅助功能实测。
- [x] **桌面剪贴板 P1**：文本历史、搜索、置顶、隐私过滤、本地持久化。
- [x] **断连自动重连**：退避重试 + 静默重新发现 + 前后台暂停/恢复；聊天页常显重连状态与手动入口（2026-11-01）。
- [ ] **麦克风收尾**：勾选 macOS 辅助功能后验证自动粘贴；真机 60 秒/断连/密码框矩阵；模型准确率测试集。
- [ ] **AI 联动（DSH hook）**：桌面 AI 联动页 + 本地脚本注入 + 手机四态/三音效；代码开发中，待真机/隐私验收（2026-11-02）。
- [ ] **AI 联动后续**：手机回答 AI 提问（answer 回传 + hook 结果注入）、文本消息、Claude Code / Qoder 接入。
- [ ] **Release 打包**：Android 签名 APK（预计 10–20MB）+ 桌面 .app/.dmg。
- [ ] **蓝牙通道**：Tauri 移动端 BLE 插件（Kotlin）或 Python sidecar，见 `ble-notes.md`。
- [ ] **配对与鉴权**：首次扫码配对、长期密钥、信道加密。
- [ ] **iOS**：Tauri mobile 初始化，评估后台限制。

## 验收清单（每次改动的回归测试）

- [ ] `pnpm tauri dev` 正常启动，日志有 `[server] listening on http://0.0.0.0:47810` 与 `[discovery] UDP 响应器已启动`
- [ ] `scripts/build-android.sh` 成功产出 APK
- [ ] `scripts/install-android.sh` 安装并启动
- [ ] 手机打开 App 自动发现电脑并连接（无需输入地址/扫码）
- [ ] 占用 47810 后桌面服务回退到 47811，手机仍能自动发现并连接
- [ ] 杀掉桌面进程后手机自动按 1s→30s 退避重试；桌面恢复后无需操作自动连上
- [ ] 断连时聊天页显示「N 秒后自动重连」，「立即重连」「重新搜索」可用
- [ ] 桌面面板默认无大二维码，展开「用手机浏览器打开 / 安装 App」后出现二维码
- [ ] 手机发消息 → 桌面日志 `[ws] recv`
- [ ] 桌面发消息 → 手机收到，气泡在左侧
- [ ] 手机发消息 → 手机气泡在右侧
- [ ] 宠物横屏 16:9/20:9、支架/手持与 3 分钟 60fps（竖屏/设置/存档已通过）
- [ ] 宠物杀进程重启后名字/设置/存档恢复
- [ ] 宠物 3 分钟 60fps、无 >50ms 长任务
- [ ] 麦克风：权限拒绝/辅助功能未开/窗口切换/密码框/上滑取消的降级路径
- [ ] AI 联动：桌面安装/重启/连接；四态动作远看可区分；三音效默认关/录音静音；杀 DSH 15s 内静态；隐私审计通过
