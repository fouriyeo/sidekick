# 项目状态

最后更新：2026-11-01

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
14. 麦克风 spike：WebView `getUserMedia` + PCM16 采集、手机 Rust 走 JSON `voice.*`、桌面 whisper.cpp 本机转写、`arboard` 写剪贴板；真机 5 秒长按和桌面转写已验证（2026-10-31）。
15. 麦克风 P0：二进制 PCM16 协议（`mic.start/ready/stop/result/state/error` + `SK01` 帧）、服务端单会话缓冲、whisper-rs 内存转写与启动 prewarm、直接 CGEvent 自动粘贴（未授权复制）、手机波形/上滑取消/权限说明/结果卡片（2026-10-31）。
16. 桌面设置页：语音模型下载/选择/删除/预热、辅助功能授权卡片；应用内语音状态浮层；桌面剪贴板历史（文本、搜索、置顶、隐藏内容过滤、`0600` 持久化）（2026-10-31）。
17. 手机断连自动重连：退避 1s→2s→4s→8s→16s→30s，每次重试先静默 UDP 重新发现（覆盖 IP/端口变化），再连唯一电脑/退回上次地址；多台电脑回上次那台、无地址时停止；切后台暂停、回前台立即重试；聊天页常显「N 秒后自动重连」+「立即重连」+「重新搜索」（2026-11-01）。
18. 宠物页屏幕常亮：设置页「显示 → 屏幕常亮」变成真开关（默认开）；手机 Rust 新增 `set_keep_screen_on` 命令，用 JNI 调 Android `FLAG_KEEP_SCREEN_ON`，只在宠物页前台（含设置弹层）生效，聊天/后台释放；旧存档 `"never"` 归一化为开（2026-11-01）。

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
- 剪贴板：复制文本后 `~/Library/Application Support/Sidekick/clipboard.json` 在 1 秒内出现，权限 `600`；带 `org.nspasteboard.ConcealedType` 的内容未记录；Sidekick 自身转写未入库。
- 前端质量：`pnpm typecheck` / `pnpm lint` / `pnpm test`（128 tests）/ `pnpm build` 通过；`cargo test --lib` 20 tests 通过。
- **断连自动重连已验证（2026-11-01，Realme 真机）**：22:47:54 杀掉桌面进程，手机 22:47:54.504 检测到 `[mobile] 连接已断开`；随后按退避自动重试（发现 0 台 → 退回上次地址 → 连接被拒），重试时间点 22:47:57 / 22:48:00.6 / 22:48:06.3 / 22:48:15.9 / 22:48:33.5（每次 = 退避 + 1.5s 扫描窗口）；桌面 22:49:05 恢复后下一轮自动发现 1 台并 `[mobile] connected`，无需任何手动操作。
- **端口变化自动重连已验证（2026-11-01，Realme 真机）**：占住 47810 后桌面回退到 47811，手机断连自动重试时发现回包 `port=47811` 并 `[mobile] connected to ws://…:47811/ws`；聊天页显示「已连接」与新端口。
- **重连 UI 已验证（2026-11-01）**：断连瞬间聊天页显示「未连接 / 正在自动重连（第 1 次）…」+「重新搜索」，连上后恢复正常；前端 147 个用例（含 fake timers 的退避/暂停/立即重连/多台不自动选）全绿。
- **未验证**：macOS 辅助功能勾选后的实际 Cmd+V 粘贴、密码框/窗口切换完整矩阵、真机 60 秒与断连、模型下载真实网络、横屏 16:9/20:9 安全区、3 分钟 60fps、TalkBack、Rive 资产。

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
| 麦克风 P0 | 已实现；自动粘贴依赖 macOS 辅助功能，需要用户手动勾选一次；开发二进制重编译后可能需重勾选 |
| 麦克风未完成项 | 真机 60 秒/断连、密码框/窗口切换完整矩阵、辅助功能实测、模型准确率测试集待补 |
| 宠物真机/性能未验证 | 无线 adb 断连；存档跨重启、横/竖屏安全区、3 分钟 60fps、掉电待真机回归 |
| Rive 未接入 | 当前静态 SVG + CSS 呼吸；`.riv` 资产与输入映射待补 |
| WebView 103 兼容 | 真机 WebView 103 不支持 oklch/dvh/color-mix；已加 hex/rgb + 100vh 回退，建议后续升级 WebView |
| 麦克风 spike 偏离 | 已解决：JSON base64 WAV/临时 WAV 已替换为二进制 PCM16 + whisper-rs 内存转写；自动粘贴改为直接 CGEvent |
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
- [ ] **Claude Code / Qoder hook 接入**：桌面侧监听 `notify` / `ask` 事件 → 推手机；手机回复经 `answer` 回传，桌面作为 hook 结果/输入注入。
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
