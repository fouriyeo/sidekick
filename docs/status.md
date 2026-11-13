# 项目状态

最后更新：2026-11-09

> 当前快照（能跑什么 / 待验收 / 技术债 / 下一步）。逐日变更见 [history.md](./history.md)，关键取舍见 [decisions.md](./decisions.md)，回归测试见 [engineering/quality.md](./engineering/quality.md#8)。

## 1. 现在能跑什么

| 能力 | 状态 | 入口文档 |
| --- | --- | --- |
| 局域网连接：桌面 axum WS 服务 + 手机主动连；UDP 发现 47820，服务端口 47810–47814 / 8848 回退 | ✅ 真机已验证（含端口回退） | [architecture.md](./architecture.md) · [engineering/lan-discovery.md](./engineering/lan-discovery.md) |
| 断连自动重连：1s→30s 退避 + 每次静默重新发现，切后台暂停、回前台重试 | ✅ 真机已验证 | [engineering/lan-discovery.md](./engineering/lan-discovery.md) |
| 桌面壳：6 个一级页 概览 ⌘1 / 剪贴板 ⌘2 / 备忘录 ⌘3 / 用量 ⌘4 / 语音 ⌘5 / 设置 ⌘6 + 224 玻璃侧栏 + sticky 玻璃工具栏 + push 式设置 | ✅ 代码完成、浏览器 QA 通过（真窗口目检待） | [prd/shell/INDEX.md](./prd/shell/INDEX.md) · [engineering/desktop-ios-ui.md](./engineering/desktop-ios-ui.md) |
| 手机壳：宠物页（顶栏 / 会话卡浮层 / 宠物 / 麦克风）+ 设置二级页 + 聊天/连接/回答页 + 备忘录全屏页；竖屏单布局 | ✅ 代码完成（真机走查待补） | [prd/shell/INDEX.md](./prd/shell/INDEX.md) · [frontend-architecture.md](./frontend-architecture.md) |
| 语音输入：百炼云端流式 ASR（唯一）→ 写剪贴板 + 合成 Cmd+V；结果卡手动「回车 / 清空」 | ✅ 真机验证（完整矩阵待补） | [prd/mic/INDEX.md](./prd/mic/INDEX.md) · [engineering/asr-cloud-bailian.md](./engineering/asr-cloud-bailian.md) |
| 键盘遥控录音：桌面全局快捷键（双击右 Control 等）→ 手机开始/结束 → 结果插入前台应用；未连接弹顶部提示、Esc 取消 | 🚧 代码完成（真机/真窗口/冲突矩阵待验收） | [prd/mic/INDEX.md](./prd/mic/INDEX.md) · [engineering/protocol-audio.md](./engineering/protocol-audio.md) |
| 语音备忘录：手机前台录音 → 分段转写 → LLM 归类 → 本地 rusqlite；电脑只读镜像 + 6 位码配对 | ✅ 代码完成（真机验收待） |
| 英语角（生词本）：记录 → 百炼 qwen3.8-flash 解释 → 词库造句；桌面 ⌘7 + 手机全屏页 + 局域网双向同步 | ✅ 代码完成（浏览器 QA 通过；真机双向同步已验证；账单对账待补） |
| 英语角语音朗读：qwen-audio-3.1-tts-plus（单词/例句/造句句）→ 本地 mp3 缓存 → 双端播放；桌面失败回退系统 `say` | ✅ 真机验证（首次 1–2s、缓存命中 0 请求、按字符记账） | [prd/english-corner/INDEX.md](./prd/english-corner/INDEX.md) · [engineering/english-corner.md](./engineering/english-corner.md#55-语音合成qwen-audio-31-tts-plus) | [prd/english-corner/INDEX.md](./prd/english-corner/INDEX.md) · [engineering/english-corner.md](./engineering/english-corner.md) | [prd/memo/INDEX.md](./prd/memo/INDEX.md) · [engineering/memo-pipeline.md](./engineering/memo-pipeline.md) |
| Token 用量看板：桌面「用量」页 + 手机顶栏数字/用量页 + 菜单栏小看板 | ✅ 代码完成（对账/真机待） | [prd/usage/INDEX.md](./prd/usage/INDEX.md) · [engineering/token-usage-pricing.md](./engineering/token-usage-pricing.md) |
| 菜单栏常驻：关窗 = 隐藏窗口，HTTP / UDP / hook 继续跑；左键弹出用量小看板（原生玻璃卡片，可钉住） | ✅ 代码完成（人工目检待） | [engineering/desktop-tray.md](./engineering/desktop-tray.md) · [engineering/desktop-usage-panel.md](./engineering/desktop-usage-panel.md) |
| 剪贴板历史：搜索 / 置顶 / 隐私过滤 / 暂停，最多保留 10–200 可配 | ✅ 真机已验证 | [engineering/clipboard-manager.md](./engineering/clipboard-manager.md) |
| AI 联动（DSH hook v3）：会话状态与粗粒度工具类别推手机、一键唤起 DSH | 🚧 代码完成（真机/隐私验收待） | [prd/hook/INDEX.md](./prd/hook/INDEX.md) · [engineering/dsh-hook.md](./engineering/dsh-hook.md) |
| 宠物：BoopFace 皮肤 201 + 12 个动作（四态 + 录音/连接/会话/问候）+ 状态机/存档 + 屏幕常亮 + 触感 | 🚧 代码完成（真机首轮通过，30 分钟 soak 与动作逐项待补） | [prd/pet/INDEX.md](./prd/pet/INDEX.md) · [engineering/pet-runtime.md](./engineering/pet-runtime.md) |
| 发布打包：固定文件名 dmg + 本地密钥签名 APK；`release/` 不入库（D125），分发走 GitHub Releases | ✅ 脚本可用（正式签名/公证未做） | [release/README.md](../release/README.md) · [decisions.md](./decisions.md)（D63/D125） |

## 2. 待验收（真机 / 目检 / 回归）

- **备忘录真机**：录音 → 转写 → 配对 → 镜像同步全链路；C 手势阈值（400/600/80/32）、TalkBack、手势条遮挡、320×720 月视角。
- **桌面真窗口目检**：交通灯位置、拖动区、滚动玻璃与紧凑标题过渡、窗口级 vibrancy、深浅主题、1180/960 两档。
- **菜单栏与看板**：左键弹出位置（顶部 16×8 指引尖、尖顶距菜单栏 2pt，D138）与收起（点外部 / Esc / Cmd+W）、钉住后失焦不收起（D135）、尖在贴边时是否指回图标、玻璃态尖端磨砂与卡片是否同一块材质、多屏不越界、D120 玻璃深色观感与 `SIDEKICK_UI_VIBRANCY=off` 回退。
- **键盘遥控录音**：真机端到端（开始/结束/6 类失败/Esc 取消/多手机拒绝）、HUD 在其它 App 前台与全屏 Space 的可见性、不抢焦点（插入仍 same_app）、快捷键与 IDE/输入法冲突、现有手机按住流程回归。
- **语音**：真实百炼账号下 60 秒 / 断连 / 密码框矩阵、辅助功能实测、2000 词首包延迟；回车/清空在终端等非标准输入框与焦点切换矩阵。
- **AI 联动**：真实 DSH 重启与插件加载、四态动作与三音效、杀 DSH 15s 内静态、隐私抓包审计（无工具名原文/参数/路径）。
- **用量看板**：真实账本对账、价格联网 / 断网 / 覆盖文件、空/损坏账本、手机模型分组开关。
- **宠物**：30 分钟 soak（掉帧/发热）、320 宽真机、存档跨重启、TalkBack；12 个动作的真机逐项触发见 PET-AC-52–65。
- **英语角**：真机配对→双向同步→断网重试→删除传播；桌面 1180/960 深浅目检；模型对账单。
- 浏览器已覆盖：`scripts/qa-desktop-ios.mjs`、`scripts/qa-memo.mjs` 无横向溢出 / console error；真机仍待走查。

## 3. 已知问题 / 技术债

> 坑与硬约束的完整说明在 [engineering/pitfalls.md](./engineering/pitfalls.md)，这里只记状态级债务。

| 项 | 说明 |
| --- | --- |
| 无鉴权 / 无加密 | 同网段任何人可连 WS；仅限可信网络（配对与鉴权 P1） |
| 无心跳（半开连接） | 进程退出/断网靠 FIN/RST 立刻发现（约 0.5s）；电脑睡眠或路由器静默丢包时可能长时间仍显示「已连接」 |
| 消息不落库 | 广播不持久化，重启清空；发送方也收自己的回显（按 `from` 区分） |
| 企业网只放行单播（D73） | 广播/组播全丢，mDNS 同样不可用；自动发现恒 0 台，只能手动地址或扫码兜底 |
| Android 16+ 局域网权限（D72） | 缺 `ACCESS_LOCAL_NETWORK` 时发现 0 台 / 连接超时，但 shell `curl` 能通，别误判成防火墙 |
| WebView 103 兼容 | 不支持 `oklch`/`dvh`/`color-mix`/CSS `translate`；`dialog`/`sheet`/`tooltip` 仍用 translate 类，真机居中待修 |
| 麦克风云端唯一 | 断网/限流/额度不足直接失败，无本机回退；Key 明文存 `asr.json`（0600）；语音金额按公开价估算、未对账账单 |
| 辅助功能依赖 | 自动粘贴与「回车 / 清空」依赖 macOS TCC 授权，重编译后可能需重勾选；密码框/窗口变化只复制 |
| AI 联动首次需重启 DSH | profile patch 只在 DSH 启动时加载，之后开关热生效 |
| AI 联动边界 | 只认显式提问/审批（`ask_user_question` / `exit_plan_mode` / `approval` / `blocked`），模型普通回复不算；P0 只聚合顶层会话，子代理可能提前完成 |
| 备忘录 MVP 偏差 | Key 存 App 私有文件（0600，Keystore 列 P1）；手机固定官方端点；锁屏/后台录音与 AAC 压缩暂缓；WAV 约 115MB/h |
| 手机台数为近似 | 「N 台设备」来自 `system.clients - 1`，无角色握手、不显示设备名 |
| 剪贴板限制 | 仅桌面运行时记录、无全局快捷键、仅文本；图片/文件/富文本不支持 |
| 宠物动作未接满 18 个 | angry/refuse/random 等没有触发源，等真实事件再接（D137 §3.4） |
| 端口候选回退 | 47810–47814、8848 全被占用时服务启动失败（`server_info` 报错） |
| 桌面端仍开发模式 | 未开机自启；正式签名/公证待做（分发已改 GitHub Releases，D125） |
| 包名遗留 / withGlobalTauri | npm/Cargo 包名仍是 `desktop`；`tauri.conf.json` 的 `withGlobalTauri` 仍为 `true`，收紧时需回归 IPC/事件/QR |
| `gen/` 不入库 | 克隆后先 `pnpm tauri android init`，补丁脚本要重跑 |

## 4. 下一步

### P0（收口本轮）

- 备忘录真机验收：录音 / 转写 / 配对 / 镜像同步 + C 手势、TalkBack、320×720。
- AI 联动真机与隐私验收；桌面真窗口与菜单栏人工目检（含 D120 面板玻璃）。
- 用量账本对账与价格降级路径；语音 60s / 断连 / 密码框 / 辅助功能矩阵。
- 英语角：真机双向同步已验（桌面 → 手机快照、手机离线新增 → 联网补推）；剩余：删除传播与断网重试的 UI 级走查、桌面 1180/960 深浅目检、模型账单对账。

### P1

- 手机回答 AI 提问（answer 回传 + hook 结果注入）、文本消息。
- 键盘遥控录音（D132/D133）：代码已完成，补真机与真窗口验收矩阵；裸修饰键若被发现还需要「输入监控」授权，补授权引导。
- 配对与鉴权（首次扫码配对、长期密钥、信道加密）；精确手机台数（角色握手）。
- 备忘录：Keystore、锁屏/后台录音、AAC 压缩、cursor/心跳；宠物扩展状态行。

### P2

- Claude Code / Qoder 接入；iOS；蓝牙通道；正式签名与公证。

## 5. 回归清单

每次提交/发版跑 [engineering/quality.md §8](./engineering/quality.md#8)；发版门见同文件 §10，隐私与安全审计见 §11。
