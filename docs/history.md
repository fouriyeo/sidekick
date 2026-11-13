# 变更历史

> 2026-10-31 → 2026-11-13 的变更记录，按日期排序；每条保留主题、决策编号（D）、结论/影响与验证证据，细节见 [decisions.md](./decisions.md)，当前快照见 [status.md](./status.md)。
> 编号只作文档索引：原 `status.md`「时间线」1–44 条 + 末尾错位追加的 45–63 条合并重排为 1–64（重复编号「46」的两条按不同主题分别保留）。

## 变更时间线

1. **2026-10-31 · 立项与命名** — 命名「小跟班 / Sidekick」，创建仓库 `fouriyeo/sidekick`（2026-11-08 起公开）。
2. **2026-10-31 · 环境与安卓工程** — 装 Rust、JDK 21、Android cmdline-tools/SDK/NDK，配好 Tauri 安卓工程。
3. **2026-10-31 · 蓝牙预研** — Python `bless` 验证 Mac 可作 BLE 外设；后暂停，主线转局域网（见 [ble-notes.md](./ble-notes.md)）。
4. **2026-10-31 · 局域网 MVP 实现** — 桌面 axum HTTP/WS 服务 + 二维码 UI；安卓 App 用 Rust WS 客户端 + 手机 UI。
5. **2026-10-31 · 首版黑屏修复** — CSS 类名冲突把 `<body>` 隐藏；删旧 DOM/styles 重新出包安装。
6. **2026-10-31 · 双向收发真机验证** — 手机 App ↔ 桌面端双向消息通过（Realme RMX3370 / Android 13，无线 adb）。
7. **2026-10-31 · 工程清理** — 清模板残留与未用插件；包管理器 npm → pnpm（`pnpm-lock.yaml` 入库）。
8. **2026-10-31 · 前端重构脚手架** — React 19 + Tailwind v4 + shadcn/ui（Base UI, base-nova）+ Motion + Zustand；Biome/Vitest/别名就位，旧 UI 未迁移；证据：`pnpm test` 2 个冒烟用例。
9. **2026-10-31 · 文档树与 PRD 落地** — `docs/INDEX.md` + product/standards/prd/engineering 四分支；宠物与麦克风 PRD/SPEC/ACC；子智能体与 Skill；`scripts/check-docs.mjs`。
10. **2026-10-31 · 前端 Phase 1** — React 双 entry（`entries/desktop|mobile`）、连接/聊天 1:1 迁移、`protocol/messages.ts`、`shared/lib/tauri.ts`；删旧 `main.ts`/`styles.css`；证据：40 tests + tsc/lint/build、`check-boundaries`，Realme 真机双向收发通过。
11. **2026-10-31 · 宠物 P0 代码** — 状态机/手势/精力亲密度/确定性存档/静态舞台/双姿态/命名/设置 + 宠物主界面与聊天入口；证据：84 tests、debug APK、`check-boundaries`，无头 Chrome 视觉验证通过。
12. **2026-10-31 · 宠物姿态随屏幕方向** — `useOrientation`（matchMedia + resize/orientationchange），横屏 docked / 竖屏 handheld，设置可手动覆盖；真机旋转验证通过（2026-11-03 起锁竖屏，方向能力已删）。
13. **2026-10-31 · 手机自动发现电脑** — UDP 广播探测（固定 47820）+ 桌面单播回主机名/真实端口；服务端口改候选 47810–47814、8848 回退；启动即自动连接、桌面二维码改按需展开；证据：logcat「发现 1 台 → 连接」、占 47810 后回退 47811 真机通过。
14. **2026-10-31 · 麦克风 spike** — WebView `getUserMedia` + PCM16 → 手机 Rust → 桌面 whisper.cpp 本机转写 → `arboard` 写剪贴板；证据：真机 5 秒长按（约 143KB WAV）与合成中文 WAV 转写通过（本机转写 2026-11-02 已下线）。
15. **2026-10-31 · 麦克风 P0 后端** — 二进制 PCM16（`mic.*` + `SK01` 帧）、服务端单会话缓冲、whisper-rs 预热转写、CGEvent 自动粘贴（未授权复制）、手机波形/上滑取消/结果卡；证据：Python WS 客户端 3.9 秒中文返回 `mic.result(copied, accessibility_off)`，预热后转写 0.2–0.3s。
16. **2026-10-31 · 桌面设置页 + 剪贴板历史** — 语音模型下载/选择/删除/预热、辅助功能授权卡片、语音状态浮层；剪贴板文本历史/搜索/置顶/隐藏内容过滤/`0600` 持久化；证据：复制后 1 秒内落盘、Concealed 类型不记录（模型部分 2026-11-02 移除）。
17. **2026-11-01 · 断连自动重连** — 退避 1s→2s→4s→8s→16s→30s，每次先静默 UDP 重新发现再连；多台回上次那台、无地址停止；切后台暂停、回前台立即重试；聊天页常显倒计时 + 立即重连/重新搜索；证据：杀桌面后真机按退避重试、桌面恢复与端口回退 47811 均自动连上，重连 UI 147 tests。
18. **2026-11-01 · 宠物页屏幕常亮** — 设置「显示 → 屏幕常亮」真开关（默认开）；`set_keep_screen_on` 用 JNI 加/清 `FLAG_KEEP_SCREEN_ON`，仅宠物页前台生效；旧存档 `"never"` 归一化为开；证据：`dumpsys window` 含 KEEP_SCREEN_ON 且切页释放，159 tests。
19. **2026-11-01 · 手持录音 UI 修复** — 录音条/结果卡/临时提示移入独立绝对定位覆盖层，右下 96dp 麦克风按住后不再被撑宽居中；证据：无头 Chrome + Realme CDP 实测按钮中心偏差 0px。
20. **2026-11-01 · 语音转写结果入库** — `write_text_and_record` 写系统剪贴板后以 `kind="voice"` 记入历史（暂停记录只写剪贴板、不入历史）；剪贴板 UI 显示 `N / 100 条` 并给语音条目加标签；证据：`record_item` 单测（去重保置顶/100 条裁剪）、164 tests / 24 Rust。
21. **2026-11-01 · 手持语音交互调整** — 去掉矛盾的左下 X 取消按钮（按住时点它必须先松手，松手即已结束），取消只保留上滑；语音按钮改底部居中、录音条/卡片在其上方；取消提示「已取消，没有发送。」
22. **2026-11-01 · WebView 103 居中偏移修复** — Tailwind v4 的 `translate` 工具类输出 CSS `translate` 属性，WebView 103 忽略导致按钮偏右 48px；改 `inset-x-0 + flex` / `mx-auto`；证据：真机 CDP 复验中心偏差 0px。
23. **2026-11-02 · 触感接管 + 可配时长** — 关 WebView 默认长按震动（`setHapticFeedbackEnabled(false)`），App 用 `performHapticFeedback` 发轻/中/成功/失败（不申请 VIBRATE）；麦克风按下中震、宠物页禁长按选中；自动变暗默认 5 分钟、常亮上限默认 2 小时可调；证据：真机 logcat 无默认长按震动、waveform 45ms，174 tests。
24. **2026-11-02 · AI 联动（DSH hook）开发** — `docs/prd/hook` 落地；桌面「AI 联动」页 + 本地脚本注入 + Rust 回环桥 + `status` 协议 + 手机四态动作/三音效；首次开启需重启 DSH 一次、之后热开关；证据：291 tests / 36 files、Rust 71、脚本 32 通过（真实 DSH 加载待验）。
25. **2026-11-02 · 百炼云端唯一** — 下线本机 whisper（`asr_models.rs`、`whisper-rs`、cmake/libclang 前提、模型管理命令）；`AsrSettings` 只留 `{version, consentCloud, apiKey, keyPresent, keyHint, bailian}`，旧字段忽略；未配置/未同意/无 Key 直接 `mic.error`、不回退；协议移除 `engine/model/fallback`。
26. **2026-11-02 · 语音配置页 + 用量统计** — 桌面导航加「语音」；百炼只填完整 URL + Key/模型/语言/场景/热词/同意/测试/保存/清除（Key 存 `asr.json` 0600，不读 Keychain）；用量区间切换（今天/7/30/365，今天无明细、1 年按月）、`asr_usage.json` 0600 最多 400 天、北京/新加坡价估算。
27. **2026-11-03 · AI 会话列表 + 竖屏单布局** — `status` 增 `sessionList`（最多 50 条），DSH 插件维护标题/状态/完成时间；手机宠物页上方会话列表（收起 1 / 展开 5 / asking 自动展开 / 本地清除）；点 asking 发 `focus.request` 唤起 DSH（1.5s 限频）；删方向/双姿态、Android 锁竖屏；麦克风改 56px 胶囊。
28. **2026-11-03 · 固定文件名安装包（D63，已被 D125 撤销）** — `release/Sidekick-macOS.dmg`（3.8MB，未签名）+ `release/Sidekick-Android.apk`（7MB，release 构建 + 本地 keystore 签名，`apksigner verify` 通过）；新增 `scripts/package-{desktop,android,release}.sh`，每次覆盖同名文件、不建版本目录（D125 起产物不入库，改 GitHub Releases 分发）。
29. **2026-11-04 · 结果卡片手动「回车 / 清空」（D68）** — 新增 `key.request`/`key.result` 与 `desktop_keys.rs` 安全闸门（目标窗口=插入时前台应用、密码框/未授权/非 macOS 拒绝、30s 时效、成功作废、500ms 限频）；清空两次确认；仍绝不自动回车/发送。
30. **2026-11-04 · 下线宠物触摸互动（D69）** — 删手势识别、点击/抚摸、爱心、亲密度、`interacting` 与设置「无障碍互动」；点宠物无任何反应；保留命名爱心、AI 四态、睡眠/06:00 醒来、自动变暗；存档 version 1 不变。
31. **2026-11-04 · 麦克风会话稳定性 + 电脑端中断（D70）** — 手机启动串行化（`startingRef`/token/pointerup 兜底）；服务端同端重复 start 取最新、`maxMs+3s` 看门狗、`mic.stop` 严格 owner+session；新增 `mic.cancel`，桌面浮层「取消录音」1 秒内两端 idle、不转写不插入；超时提示「录音超时，已自动停止。」。
32. **2026-11-04 · 视觉系统方向 B「深潜声呐」+ 双主题（D71）** — `tokens.css` 重写深海语义色板（全 hex，默认深色）；主题运行时（`sidekick:theme` system/light/dark、防闪内联脚本、`shared/lib/theme.ts`、`data-theme`+`.dark` 双写、Sonner 跟随）+ 设置「外观」；桌面/手机换皮、宠物图集不重绘；`design-lab/` 评审稿删除。
33. **2026-11-04 · Android 16+ 局域网权限（D72）** — `targetSdk ≥ 36` 需运行时 `ACCESS_LOCAL_NETWORK`，缺它时广播与 TCP 全被拦（`appops` 显示 ignore、shell `curl` 却能通）；manifest 声明 + `MainActivity.kt` 请求；证据：授权后局域网直连成功、重启 8 秒内重连（该办公网仍抑制广播，自动发现 0 台）。
34. **2026-11-04 · 手机扫电脑二维码连接（D74）** — 企业网只放行单播时的兜底；桌面二维码内容不变；手机 `getUserMedia` + `jsqr` 逐帧解码（懒加载 43KB gzip），只认 IPv4、忽略 path/query；相机权限由 wry 自动弹系统授权；真机修掉扫码页首开失败与返回键层级。
35. **2026-11-04 · 外观默认跟随系统 + 宠物舞台随主题（D76，取代 D71 两点）** — `sidekick:theme` 缺失/非法一律 `system`；`--pet-*` 随主题，浅色「海玻璃舞台」（`--pet-bg #dcebe7` 等）+ `--pet-coral-foreground`；始终深色的桌面麦克风浮层用 `.deep-sea-scope` 钉住；鲸鱼不加 filter。
36. **2026-11-04 · 宠物交互收敛 + 会话行工具类别（D77/D78）** — 删手机舞台声呐环、宠物不再响应麦克风（去 `MIC_*` 事件/姿态/心情/音效）、done 改 loop（1.6s/轮）；修 `phaseUntil` 到点补 TICK；hook v3 + 双端白名单只同步粗粒度工具类别（bash/read/edit/search/web/agent/plan/tool），不读提示词/回复/参数/路径。
37. **2026-11-05 · 首次命名/改名下线** — 删 `name-prompt`/宠物爱心/`NAME_SET`/`celebrating`/`happy`/`phaseUntil`/`setName`；存档 version 1 保留、旧 `name` 忽略；宠物固定「小跟班」、首见文案改「你来了。我是小跟班。」；设置页删名字表单并重排 01 反馈 / 02 外观 / 03 显示 / 04 重置宠物 / 05 关于。
38. **2026-11-05 · 指挥舱 A 重设计（D79；桌面已被 D85–D87 取代）** — 桌面 5 视图 + 48 全局状态条 + 72 图标导航 + 56 页头 + 全局麦克风浮层，聊天降级为「系统 › 消息」；共享状态/会话/活动底座与 `system.clients`；手机部分由 D80 取代；状态词表（连接 7 / AI 4 / 麦克风 9）继续有效。
39. **2026-11-05 · 手机干净版两页壳（D80）** — 只留宠物（根）/ 设置（二级），删动态页与底部 tab；宠物页 = 顶栏 → 会话卡（折叠 1 / 展开 5 / working wash / × 二次确认）→ 无底色鲸鱼（230）→ 居中 56 薄荷麦克风；结果卡三段弹窗；新增 `.mobile-clean` 作用域令牌；证据：591 tests / 72 files，真机 Realme 基础页通过、390/320 浅深截图通过。
40. **2026-11-05 · 手机字体收敛（D81）** — CDP 确认 WebView 把 `sans-serif` 解析成 OPPO Sans；真机对比后选 MiSans Normal 400（3.9MB WOFF2），标题 16→15、设置说明行高 1.625→1.45（2026-11-06 又换 HarmonyOS Sans SC，见 43 条）。
41. **2026-11-06 · Token 用量看板 V1（D82–D84）** — 桌面「用量」+ 手机用量页；只读 `~/.dsh/storages/cost-meter/ledger.json`，按客户端/会话/模型分组；`usage.request`/`usage` 协议带 `data` 包装（不含提示词/路径/cwd）；价格 seed + 本地缓存 + overrides + DeepSeek 峰谷，实际 `costCny` 优先；证据：602 tests / 74 files、Rust 161、真实账本 7 天直算一致（¥128.93 / 2,174,514,477 tokens）。
42. **2026-11-06 · 电脑端菜单栏常驻（D88）** — 关窗 = 隐藏窗口（`prevent_close`+`hide`），HTTP/UDP 发现/hook 桥/剪贴板监听继续跑；Accessory 隐藏 Dock；36×36 单色模板托盘图标，右键「显示主窗口 / 退出 Sidekick」是唯一退出入口；托盘失败退回「关窗即退出」；证据：47810/47820/47815 同时监听、`ApplicationType="UIElement"`、592 tests。
43. **2026-11-06 · 手机设置页排版 + 鸿蒙字体（D90/D91）** — 行标题 15/21、说明 13/19、卡片行高 56/60、间距 20、分段 36；字体换随包 HarmonyOS Sans SC Regular（8.1MB TTF，许可禁转 WOFF2），删 MiSans；证据：Honor BKQ-AN10（Android 17 / WebView 156）CDP 确认实际渲染，冷启动字体加载约 430ms。
44. **2026-11-06 · 首用清单 ③④ 真实状态（D92）** — 新增 `desktop.status`（`asrConfigured`/`asrHasKey`/`accessibilityTrusted`/`ts`，只含布尔+时间戳）；桌面在连接与 `status.request` 时下发；手机连接/回前台/开设置页刷新，③④ 为 true 才显示「已完成」，旧桌面仍显示「在电脑上完成」。
45. **2026-11-06 · 手机顶栏 v17（D93）** — 连接状态收成信号塔图标（连上只显示图标、未连上补短词），右侧今日用量数字（13/400 tabular，点开用量页），设置页删用量入口；`usage-store` 加独立 `today` 快照；证据：618 tests、390/320 浅深 QA 无溢出。
46. **2026-11-06 · 语音录音/结果 UI 重做（D100）** — 录音胶囊深石墨 `#2C2C2E` + 向上阴影，取消提示移胶囊上方；实时卡/结果卡共用白卡（距底 170→110），去掉 grabber/复制/时间/卡内动作；清空/回车改麦克风左右两个 56px 圆钮、仅 `inserted` 出现；证据：672 tests，debug APK 构建成功。
47. **2026-11-06 · App 图标与品牌标记换「随身卡」（D99）** — 歪 3.5° 奶油卡 + 穿透挂孔 + 斜切一角 + 琥珀灯，深青底 `#0F3A3E`；App 图标走位图 `brand/appicon.png`，小尺寸走 `scripts/gen-brand-mark.py` 矢量派生；重生成全平台图标并修 Android 自适应白边；三条图标规则（差异只在轮廓、底色抢边界、玻璃不当材质）；Dock/菜单栏/真机主屏待目检。
48. **2026-11-06 · 语音收回「设置 › 语音输入」单页（D101，导航部分已被 D104 取代）** — 当时桌面一级回到 概览 ⌘1 / 内容 ⌘2 / 用量 ⌘3 / 设置 ⌘4；设置新增语音单页（百炼配置 + 关键词 + 用量三段、内部不 push）；删旧语音一级页与 3 个二级页；关键词单列表 2000 上限/权重 4、`asr_keywords_save` 保留。
49. **2026-11-07 · 语音升为第 4 个一级入口（D104，取代 D101 导航）** — 桌面 5 项：概览 ⌘1 / 内容 ⌘2 / 用量 ⌘3 / 语音 ⌘4 / 设置 ⌘5；语音单页三段不 push，未配置时侧栏 6px 琥珀点；设置删「语音输入」行；`?view=voice`/`?view=models` 落语音页。
50. **2026-11-07 · 语音用量记账修复（D105）** — 百炼 `task-finished` 只回 `payload.output={}`，usage 实际在部分 `result-generated.payload.usage`；改为逐事件累计、task-finished 自带优先、为空用快照兜底；证据：12 个 bailian 测试全绿，价格 ¥6/¥4.5（北京）与账本自洽（368×6+46×4.5=2415 微元）。
51. **2026-11-07 · 手机会话卡改浮层（D107）** — 会话卡绝对定位浮在宠物舞台上（top 8 / 左右 16），展开只加 `max-height` 124→324（260ms），鲸鱼固定 230 零位移；字号收一档（标题 13/18、行高 50）；完成态自动展开 + 薄荷对勾 + 1.4s 脉冲，可点发 `focus.request`；证据：692 tests、390/360/320 浅深宠物坐标零位移。
52. **2026-11-07 · 菜单栏 Token 用量小看板（D108，取代 D88「左键显示主窗口」）** — 独立 `usage-panel` 预创建隐藏窗口，左键贴图标下方弹 320×392 只读卡片；点外部/Esc/Cmd+W 收起不销毁；「打开用量页」显示主窗口并发 `sidekick-navigate`；只读复用 `token_usage_stats`、不新增协议；证据：Rust 184（含 6 个定位单测）、698 tests、58 张 QA 截图。
53. **2026-11-07 · 看板分组 tab + 占比条加粗（D109，补 D108）** — 分组区改「客户端/会话/模型」三档下划线 tab（默认模型、切 tab 不重读账本），每组按金额 Top 3；占比条 2px→4px 圆角底轨 + 填充 75%，组内无数据给空文案；证据：`usage-panel.test` 7 例、QA 面板 4 张更新。
54. **2026-11-07 · 动效图标统一到 `shared/ui/motion`（D110）** — 5 个基础件 `LoadingOrbit`/`LoadingDots`/`HintCheck`/`HintAsk`/`HintError`：只吃 currentColor、尺寸走 size、默认 aria-hidden、尊重减少动效；环加粗放慢；手机接入会话行/麦克风/连接页；证据：706 tests，试样台删除。
55. **2026-11-07 · 看板留白 + 近 7 天柱悬停（D111，补 D108/D109）** — 卡片 320×392→320×432（窗口 360×468），分组行 26→32、行间 gap 5、tab 间距 16；迷你柱加鼠标命中高亮 +「日期 · 金额」气泡；证据：60 张 QA、`usage-panel.test` 8 例。
56. **2026-11-07 · 看板卡片上移 + 阴影外扩（D116，补 D108–D111）** — `GAP` 6→0，透明留白改左右 20 / 上 8 / 下 28，阴影 `0 8px 18px` + `0 2px 6px` 落在留白内；窗口层不铺底色/阴影；证据：Rust 184、QA 60 张（卡片 320×432 不裁切）。
57. **2026-11-07 · 语音备忘录需求定稿（D115，未写代码）** — 只做 AI 处理管道（语音 → 分段 ASR → LLM 出标题/类型/摘要/待办），不做完整 AI 会话；手机主设备、录音默认保留、只做局域网同步；产出 `docs/prd/memo/*` + `docs/engineering/memo-pipeline.md`；实现前先做锁屏录音存活与手机直连百炼 TLS 两个 spike。
58. **2026-11-08 · 语音备忘录范围调整（D118，调整 D115）** — 锁屏/后台录音、发热/耗电与成本估算移 P2 暂缓；MVP 改 WebView `getUserMedia` + PCM 分片（仅前台/亮屏）、音频先存 WAV（约 115MB/h）；验收 M-02 改前台限制、M-02b 标 P1。
59. **2026-11-08 · 「内容」改名「剪贴板」+ 设置收回剪贴板页（D119）** — ⌘2 页改名（视图 id 仍 `content`，`?view=content`/`?view=clipboard` 双别名）；删「设置 › 剪贴板」二级页、设置首页该行与 `SettingsSection` 的 `clipboard`；剪贴板页开关组加「设置」组标题；证据：708 tests、58 张 QA 无溢出。
60. **2026-11-08 · 剪贴板「最多保留」可配（D121，补 D44）** — 默认 100、范围 10–200（`clamp_max_items`），存 `~/.sidekick/clipboard.json › maxItems`（旧文件缺字段回落 100）；剪贴板页「设置」组加「最多保留」iOS 分段 20/50/100/200；`clipboard_set_max_items` 夹取后即时按置顶优先裁剪、原子落盘并广播；证据：Rust 188、709 tests。
61. **2026-11-08 · 语音备忘录 S1+S2（D122，实现 D115/D118）** — 手机：前台录音 1 秒分片直写 WAV（崩溃可恢复）、rusqlite、5 分钟分段百炼 WS 转写、qwen-plus 结构化、单飞管道与重试、全屏备忘录页；Key 由电脑 6 位一次性码配对下发（MVP 存 App 私有文件 0600，Keystore 列 P1）；桌面：`memo.*` 路由 + SK02 分块、`sidekick.db` 只读镜像（sha256 校验后 committed）、语音页「配对手机」；证据：Rust 201、前端 724 tests / 84 files、debug APK 299MB。
62. **2026-11-08 · 看板卡片区铺原生磨砂「真玻璃」（D120，补 D108/D116）** — `backdrop-filter` 采不到透明窗口背后像素，改 `panel_glass.rs` 只给 320×432 卡片区（圆角 18）垫 `NSGlassEffectView`（低版本退 `NSVisualEffectView`），不铺整窗；`panel_glass_ready` 为 true 才把卡片换薄 tint；`SIDEKICK_UI_VIBRANCY=off` 回退；二次收紧去掉描边/投影并裁掉玻璃外溢柔光；证据：Rust 184、708 tests、A/B 区块 stdev 69.6→48.2。
63. **2026-11-08 · 桌面备忘录独立一级页（D123）** — 桌面一级从 5 变 6：概览 ⌘1 / 剪贴板 ⌘2 / 备忘录 ⌘3 / 用量 ⌘4 / 语音 ⌘5 / 设置 ⌘6；剪贴板恢复单一职责、删分段与 `topSlot`；新增 `memo-page.tsx`（只读镜像，桌面不编辑不删除）；旧 `?view=content&tab=memo` 重定向 `?view=memo`；证据：731 tests / 86 files、QA 66 张截图。
64. **2026-11-08 · 备忘录交互改版 v0.3（D124）** — 手机底部固定录音条（64、距底 24+safe-area）+ C 双模（按住 ≥400ms 松手存；轻点 ≤400ms 锁定再点结束；上滑 80dp 取消）；周/月双视角日历（周条 44×52 可横滑、月网格 42 格 44×44、录音中全锁）；补首录隐私 Sheet、`memoBusyNow()` guard、取消二次确认、触感、`aria-live`、详情复制全文；桌面改宽幅两栏（`PageShell size="wide"` 956）；日期语义抽 `shared/lib/calendar.ts`；证据：761 tests / 89 files、`scripts/qa-memo.mjs` 14 用例、debug APK 314MB。

65. **2026-11-08 · 仓库开源（D127）** — 仓库由私有转公开，源码 MIT；`LICENSE` / `NOTICE.md`（宠物图集例外、HarmonyOS Sans 字体协议全文）/ `.github`（贡献、安全、issue 模板、PR 模板、CI）/ 中文开源版 README（4 张 dev-mock 截图）；历史里真名、个人/公司邮箱、本机路径、公司 WiFi 名用 `git-filter-repo` 替换后 force push。证据：`check-docs` 通过、CI 首跑、公开后匿名 clone 通过。
65. **2026-11-09 · 英语角（生词本）双端落地（D128/D129）** — 桌面第 7 个一级页「英语角 ⌘7」+ 手机全屏页（顶栏原消息位）；Rust `word` 模块（SQLite 词库、百炼 `qwen3.8-flash` 解释/造句、JSON 修复兜底、日用量 `word_usage.json`、字段级双向同步 `word.*`）；桌面/手机各自本地库，配对后局域网合并；Key 复用桌面 `asr.json` 与手机备忘录配对下发；证据：Rust 231 tests、前端 838 tests / 100 files、`pnpm typecheck/lint/build`、`qa-desktop-ios.mjs` 72 张截图无溢出、Android debug APK 构建通过；真机（Android 13 / ColorOS）双向同步已验证（桌面 → 手机快照、手机离线新增 dirty → 联网补推、ack 清 dirty）；账单对账待补。
66. **2026-11-10 · 英语角语音朗读（D130）** — 接入 qwen-audio-3.1-tts-plus：单词 0.85 语速、例句自然语速、`language_hints:["en"]` + 指令控制；音频按 `sha256(model|voice|rate|text)` 缓存到 `word_audio/`，重复播放 0 请求 0 费用；桌面失败回退 macOS `say`；用量新增语音合成次数/字符/估算费用。证据：真机（Android 13）单词与例句合成成功（mp3 24kHz）、二次播放缓存命中（文件数/计费不变）、按字符记账正确；Rust 235 tests、前端 105 files / 872 tests、桌面 QA 72 截图无溢出。

67. **2026-11-13 · 玩法模块方案 + K歌/扩音调研（D131）** — 新增 `docs/prd/playground/`：非主功能小功能候选池（入口、Gate 0、生命周期、候选表）；K歌/人声扩音完成产品/UX/架构三方评审与可行性调研：蓝牙音响 + 手机麦（E）最可行、手机喇叭 + 耳机麦（A）最难、电脑放伴奏 + 手机无线麦（D）最稳；结论是**暂不开发**，先用现成扩音 App 试听感；证据：`docs/prd/playground/INDEX.md`、`karaoke.md`、`node scripts/check-docs.mjs` 通过。

68. **2026-11-13 · 桌面快捷键遥控手机录音（D132/D133）** — 桌面新增全局快捷键：默认关闭、默认单键「按一下右 Command」，可自由改左/右 Command、Control、Shift、Option 或任意单键，也可录制组合键（组合键可切按住式）；Rust 新增 `hotkey`（NSEvent 全局+本地旁听、不吞键、单键按一下判定 + 剔除 ⌘C 类误触、Esc 取消、`~/.sidekick/hotkey.json`）、`mic_remote`（单手机路由、2s ack 超时、多手机拒绝）、`mic_hud`（always-on-top 非激活窗口、2.5s 自动收起）；协议新增 `mic.remote` / `mic.remote.ack` / `mic.remote.status`；手机端新增「电脑遥控录音」开关（更多 › 麦克风，默认开）与 `AudioBlockedError → audio_blocked` 明确失败；语音页新增「键盘快捷键」卡。证据：Rust 新增 11 条单测（hotkey 判定 10 + remote 1）、前端 894 tests / 109 files、`pnpm typecheck/lint/build`、`cargo check --tests`、`check-docs`/`check-boundaries`；真机与真窗口验收待补。

69. **2026-11-13 · AI 音效开工音按会话触发 + 完成态时钟容差（D134）** — 手机端 `pet-store` 比对 `status.sessionList` 里处于 working 的会话 id：任一会话新开工就响开工音（5 秒限流、首份快照只建基线不补响），解决多会话并行时聚合状态长期 working、发消息不响的问题；`ai-status` 给 completed 的迟到估算加 5 秒时钟容差（本机手机比 Mac 快约 2.1 秒），避免完成音被误判过期。证据：pet/ai-status 139 tests 通过、`pnpm typecheck` 通过；真机验收待补。

70. **2026-11-13 · 菜单栏看板间隙收到 4pt + 钉住（D135）** — 把原来兼任「窗口上举量」和「卡片间距」的 8pt 顶部留白拆成 `WINDOW_LIFT = 8`（窗口位置公式不动，托盘图标点击区零影响）与 `PAD_TOP = 4`（卡片视觉间隙 8→4pt），窗口 360×468→360×464，玻璃底衬矩形与 `.dsl-panel` 顶部留白同步；面板 header 新增 pin：钉住后只豁免失焦收起（点其它 App / 桌面仍挂最上层），Esc / 再点图标 / Cmd+W 照收，收起不取消钉住、重启重置。证据：Rust 251 tests（`usage_panel` 9 例，含钉住往返与失焦闸门）、前端 113 files / 937 tests（面板 12 例）、`pnpm typecheck/lint/build`、`check-docs`/`check-boundaries`；真窗口间隙与钉住目检待补。


71. **2026-11-14 · 宠物换装 BoopFace + 12 个动作（D136/D137）** — 手机宠物从 OpenPets 图集（`sprite-*` + 760KB WebP）换成 `boopface@0.8.0` 原生 Web Component，固定皮肤 201「冰透蓝」、圆度 50、按压/拖天线/视线跟随全关；新增动作总线（`pet-action.ts` 优先级纯函数 + `pet-reaction.ts` 瞬态反应 + `pet-reaction-wiring.ts` 边沿触发），动作从 4 态扩到 12 个：录音中 `input`、转写中 `inspect`、上屏 `affirm`、失败 `failure`、断连 `failure`、重连 `affirm`（首连不算）、新会话 `surprise`、回来问候 `love`；等待态用 `waiting-wave`（`waiting-spin` 会重叠成独眼、`waiting-wrap` 会空白脸）。**推翻 D77 的「麦克风不产生宠物事件」视觉部分**，保留录音静音音效/触感与「触摸无互动」。授权侧同时清掉 D127 唯一无 LICENSE 的图集资产，NOTICE 改为 BoopFace 声明（代码 MIT、形象不转让）。证据：前端 113 files / 931 tests、`pnpm typecheck/lint/build`、构建产物无 WebP 图集；真机（RMX3370 / Android 13 / WebView 103）working 态 rAF 60fps、`data-pet-action` 四态正确、深浅主题通过；30 分钟 soak 与动作逐项触发待补。


72. **2026-11-13 · 菜单栏看板顶部指引尖（D138）** — 卡片顶部加 16×8 三角指向托盘图标：窗口位置公式不动，顶部留白 4→10（尖 8 + 顶缝 2），尖顶离菜单栏 2pt；尖的横向位置每次定位按「图标中心 − 卡片左边」重算（夹 28–292），写进 CSS 变量并同步重建原生蒙版；玻璃态把圆角裁剪换成「圆角矩形 + 三角」的 `CAShapeLayer` 蒙版（尖与卡片同一块材质），实色态阴影从 `box-shadow` 换成外壳 `filter: drop-shadow()`（投影跟着轮廓走）；新增 `SIDEKICK_PANEL_ARROW=off` 应急开关。证据：Rust 252 tests（`usage_panel` 10 例含尖锚点夹取）、前端 113 files / 939 tests（面板 14 例）、`pnpm typecheck/lint/build`、QA 72 张截图（360×470，卡片 320×432 不裁切）；真窗口用 `SIDEKICK_PANEL_PREVIEW` 截图验证：尖端与卡片是同一块玻璃、贴边夹取时尖跟着图标走、`SIDEKICK_PANEL_ARROW=off` 时玻璃被蒙版裁回卡片矩形（卡上方无磨砂带）。

## 验证记录（原「已验证」小节，未进时间线的项）

- **2026-10-31 · 早期 MVP 端到端** — 手机浏览器扫码打开桌面 `http://<IP>:<端口>/`；桌面窗口显示地址/二维码、展开出现 160px 二维码；`/download/apk` 返回带正确 content-type 与文件名的 APK；安卓 App 安装启动、双向消息与气泡方向通过（Realme RMX3370 / Android 13）。
- **2026-11-06 · 电脑端「简约 iOS」重做（D85，结构/导航已被 D104/D119/D123 迭代）** — 4 个一级页 + 216 侧栏 + iOS 分组列表 + 设置 push；证据：588 tests / 71 files、`scripts/qa-desktop-ios.mjs` 36 张截图无溢出/无 console error；真实窗口交通灯/拖动区待人工目检。
- **2026-11-06 · Liquid Glass 质感层（D86）** — 224 玻璃侧栏 / sticky 玻璃工具栏 / 胶囊控件 / spring / grain，玻璃只做控件层，`prefers-reduced-motion` 与 `prefers-reduced-transparency` 双退化；证据：592 tests / 72 files、44 张截图 + CDP 实测（数字补间、按压缩放、弹层 token）。
- **2026-11-06 · 窗口级材质（D87）** — 透明窗口 + `NSVisualEffectView`（`macOSPrivateApi`），`.dsl-vibrancy` + `sidekick:vibrancy=off` 回退；证据：`pnpm tauri dev` 启动成功、46 张截图 vibrancy 段通过；真实窗口材质观感待人工目检。
- **2026-11-06 · 语音一级页 + 关键词（D94，导航部分已被 D101/D104 取代）** — 根页三组摘要 + push 二级页，关键词单列表 2000 上限/权重 4；证据：644 tests / 77 files、Rust 174、桌面 QA 全页截图无溢出；真实百炼 Key 下 2000 词首包延迟待验。
