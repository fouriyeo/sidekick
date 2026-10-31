# 项目状态

最后更新：2026-10-31

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

## 已验证（有实际证据）

- 手机浏览器扫码可打开电脑 `http://<IP>:8848/`（局域网 HTTP 通）；
- 桌面窗口显示地址/二维码；`/download/apk` 返回 APK（content-type、文件名正确）；
- 安卓 App 安装启动显示手机界面（「Sidekick 手机端」、地址输入、发送框）；
- 手机 App 连接桌面：状态变「已连接」；
- 手机 → 电脑：桌面日志出现 `[ws] recv: {"from":"phone",...}`；
- 电脑 → 手机：手机界面出现对应消息（气泡方向已按角色修正）；
- 测试设备：Realme RMX3370（Android 13），无线 adb；桌面 macOS arm64；
- 前端脚手架：`pnpm typecheck`、`pnpm lint`、`pnpm test`（2 个冒烟测试）、`pnpm build` 通过；Tailwind v4 + shadcn 主题可编译。
- 前端 Phase 1：`pnpm typecheck` / `pnpm lint` / `pnpm test`（40 tests）/ `pnpm build` 全绿；安卓 debug APK 构建成功；`node scripts/check-boundaries.mjs` 通过。
- 桌面 UI（浏览器复用 Vite + 真实 8848 服务）连接/收发、手机 UI（浏览器 mock）连接/收发、Realme 真机 App ↔ 桌面双向消息与气泡方向通过；手机端只加载 mobile chunk，`qrcode` 只在 desktop chunk。

## 已知问题 / 技术债

| 项 | 说明 |
| --- | --- |
| 无鉴权/加密 | 同网段任何人可连 WS；仅限可信网络 |
| 无自动重连 | 手机断线后需重新点连接（桌面 UI 有简单重连） |
| 无持久化 | 消息不落库，重启即清空 |
| 消息回显 | 广播会把发送者自己的消息也回传（当前 UI 按 `from` 显示） |
| 包体大 | debug APK 约 120–240MB（含调试符号），未做 release 签名 |
| 包名遗留 | `app` 的 npm/Cargo 包名仍为 `desktop`（历史原因，产品名已是 Sidekick） |
| withGlobalTauri | `tauri.conf.json` 仍为 `true`；Phase 4 收紧为 `false` 时需回归 IPC/事件/QR |
| 宠物/麦克风未实现 | PRD/SPEC/AC 已就绪；麦克风需先 spike（Android 采集、本机 ASR、macOS 输入） |
| 端口固定 | 8848 被占用时服务启动失败（仅打印错误） |
| gen 不入库 | 克隆后需 `pnpm tauri android init` |
| 桌面端为开发模式 | 目前用 `tauri dev` 运行，未打包/未做开机自启 |

## 下一步（按优先级）

- [x] **前端平台分目录 + 迁移**：按 [standards/engineering.md](./standards/engineering.md) 落 `src/entries` / `src/desktop` / `src/mobile` / `src/shared` / `src/protocol`；对应 `frontend-architecture.md` 的 Phase 1。
- [ ] **情绪宠物 P0**：按 [prd/pet/INDEX.md](./prd/pet/INDEX.md) 实现；真机 60fps、零焦虑、横屏双姿态。
- [ ] **外设麦克风 P0**：先按 [engineering/audio-pipeline.md](./engineering/audio-pipeline.md) 做 spike，再按 [prd/mic/INDEX.md](./prd/mic/INDEX.md) 实现；只输入、不发送。
- [ ] **Claude Code / Qoder hook 接入**：桌面侧监听 `notify` / `ask` 事件 → 推手机；手机回复经 `answer` 回传，桌面作为 hook 结果/输入注入。
- [ ] **Release 打包**：Android 签名 APK（预计 10–20MB）+ 桌面 .app/.dmg。
- [ ] **蓝牙通道**：Tauri 移动端 BLE 插件（Kotlin）或 Python sidecar，见 `ble-notes.md`。
- [ ] **配对与鉴权**：首次扫码配对、长期密钥、信道加密。
- [ ] **iOS**：Tauri mobile 初始化，评估后台限制。

## 验收清单（每次改动的回归测试）

- [ ] `pnpm tauri dev` 正常启动，日志有 `[server] listening on http://0.0.0.0:8848`
- [ ] `scripts/build-android.sh` 成功产出 APK
- [ ] `scripts/install-android.sh` 安装并启动
- [ ] 手机连接 `IP:8848` 后状态为「已连接」
- [ ] 手机发消息 → 桌面日志 `[ws] recv`
- [ ] 桌面发消息 → 手机收到，气泡在左侧
- [ ] 手机发消息 → 手机气泡在右侧
