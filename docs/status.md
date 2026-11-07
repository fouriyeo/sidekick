# 项目状态

最后更新：2026-11-07

## 时间线（2026-10-31）

1. 命名「小跟班 / Sidekick」，创建私有仓库 `fouriyeo/sidekick`；
2. 安装 Rust、JDK 21、Android cmdline-tools、SDK/NDK，配置 Tauri 安卓工程；
3. 蓝牙预研：Python `bless` 验证 Mac 可作 BLE 外设（后暂停，主线转局域网）；
4. 实现桌面端（axum HTTP/WS 服务 + 二维码 UI）与安卓 App（Rust WS 客户端 + 手机 UI）；
5. 修复首版黑屏（CSS 类名冲突把 `<body>` 隐藏），重新出包并安装；
6. 真机验证通过：手机 App ↔ 桌面端双向收发消息；
7. 清理模板残留与未使用插件，前端包管理器从 npm 迁移到 pnpm（`pnpm-lock.yaml` 入库）。
8. 安装前端重构依赖与脚手架：React 19、Tailwind v4、shadcn/ui（Base UI, base-nova）、Motion、Zustand；Vite/TS 别名、Biome、Vitest 已配置；旧 UI 尚未迁移。
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
25. 百炼云端唯一（2026-11-02）：下线本机 whisper（`asr_models.rs`、`whisper-rs`、cmake/libclang 前提、模型下载/选择/删除命令、`models_dir`）；`AsrSettings` 只剩 `{version, consentCloud, apiKey, keyPresent, keyHint, bailian}`，旧 `engine/fallbackToLocal` 忽略；未配置/未同意/无 Key 直接 `mic.error`，不再回退本机；协议移除 `engine/model/fallback`，保留 `usage`。
26. 模型页 + 用量统计（2026-11-02，更新）：桌面主导航新增「模型」（聊天/剪贴板/AI 联动之后），设置 Sheet 只留自动输入权限与剪贴板；百炼配置只填完整服务地址（无业务空间 ID 字段/不传 `X-DashScope-WorkSpace`，占位符未替换会报错）+ Key/模型/语言/场景/热词/同意/测试/保存/清除 Key；用量改为区间切换（今天无明细/7 天/30 天按天/1 年按月），后端返回最近 365 天 `days`；`asr_usage.json`（0600、按本机时区、最多 400 天、原子写、每次 task-finished 有 usage 就记账）；北京/新加坡价格估算。API Key 改存本地 `asr.json`（0600），不再读写 Keychain，开页/测试/录音都不弹密码。
27. AI 会话列表 + 竖屏单布局（2026-11-03，代码完成待真机）：`status` 增加 `sessionList`（id/标题/状态/askKind/时间，最多 50 条）；DSH 插件维护标题/完成时间/列表，Rust 桥清洗广播并随快照下发；手机宠物页上方会话列表（收起 1 条/展开 5 条/新 asking 自动展开/本地清除/完成保留；2026-11-05 起改为「动态」页固定列表 + 宠物页最近 1 条，见 D79）；点 asking 会话发 `focus.request`，桌面 `open -a "DeepSeek Harness"` 切前台（1.5s 限频，只回错误码）。同时删除方向/双姿态，Android 锁竖屏；麦克风改 56px 高宽胶囊，录音状态并入胶囊。
28. `release/` 固定文件名安装包 + 打包脚本（2026-11-03，D63）：新增 `release/Sidekick-macOS.dmg`（3.8MB，未签名）与 `release/Sidekick-Android.apk`（7MB，release 构建 + 本地 keystore 签名，`apksigner verify` 通过）；新增 `scripts/package-desktop.sh` / `package-android.sh` / `package-release.sh`，每次打包覆盖同名文件、不建版本号目录，产物随提交进 `main`。
29. 结果卡片手动「回车 / 清空」（2026-11-04，D68）：语音输入成功后，手机「已输入」卡片新增两个用户主动点按的按钮——「回车」合成 Return（keycode 36），「清空」合成 `⌘A`+`Delete`（两次确认，第一次变「再点一次」）；新增 `key.request` / `key.result` 协议与桌面 `desktop_keys.rs` 安全闸门（目标窗口=插入时前台应用、密码框/辅助功能/非 macOS 拒绝、30 秒时效、成功即作废、500ms 限频），日志不含文本/应用名；桌面浮层同步提示。仍保持「绝不自动回车/发送」。
30. 下线宠物触摸互动（2026-11-04，D69）：删除手势识别、点击/戳/摸摸、触摸爱心、亲密度、`interacting` 状态与设置页「无障碍互动」；手机点击、长按、来回抚摸宠物都不再有任何反应，也不写存档。保留命名完成爱心、AI 四态、麦克风反应、睡眠/06:00 醒来、自动变暗；存档 version 1 不变，旧 `affinity*` 字段忽略。
31. 麦克风会话稳定性 + 电脑端中断（2026-11-04，D70）：修复手机快速连按/启动中松手导致电脑端永久「正在听」——手机端启动串行化（`startingRef` + `lifecycleRef` token + ref 判手势 + window pointerup 兜底），松手/取消一定结束；服务端同端重复 start 以最新会话为准、每个会话 `maxMs+3s` 看门狗、`mic.stop` 严格 owner+session；新增 `mic.cancel` 协议，桌面浮层「倾听中」右侧常显「取消录音」，点击 1 秒内两端 idle，不转写/不插入/不写剪贴板；手机提示「电脑端已取消录音。」，看门狗提示「录音超时，已自动停止。」。
32. 视觉系统方向 B「深潜声呐」+ 双主题（2026-11-04，D71）：`tokens.css` 重写为双主题深海语义色板（deep sea 自发光 / sea glass 海面雾光，全部 hex，默认深色）；新增主题运行时（`sidekick:theme`、`system|light|dark`、`index.html` 防闪脚本、`shared/lib/theme.ts` 的 `initTheme/useTheme/setThemePreference`、`data-theme` + `.dark` 双写、系统变化与 `storage` 监听、Sonner 跟随）与设置页「外观」三选一；桌面壳/连接声呐点/导航/聊天/剪贴板/AI 联动/模型/设置换皮，手机舞台保持深海并加 6.4s 背景声呐环；宠物复用现有 OpenPets 图集，不重绘/染色；`design-lab/` 评审稿收口；visual/ux/frontend-architecture/decisions/AGENTS 文档同步。

33. 修复 Android 16+ 连不上电脑（2026-11-04，D72）：真机换成 Android 17 / SDK 37 后 App 一直「未连接」，手动连接报「连接超时」。根因是 `targetSdk >= 36` 时访问局域网需要 `ACCESS_LOCAL_NETWORK` 运行时权限且系统默认拒绝，把 UDP 广播与 TCP 连接一并拦在进程内（`appops` 显示 `Uid mode: ignore`，shell 的 `curl` 却能连通，极易误判成防火墙/企业网）。补丁脚本现在声明该权限并在 `MainActivity.kt` 请求授权；同时修掉构建脚本写死的 JDK/NDK 路径与 pnpm 版本校验。真机验证：授权后局域网直连成功、重启 8 秒内自动重连；但该办公网仍抑制 UDP 广播，自动发现依旧为 0 台，只能手动填地址。
34. 手机扫电脑二维码连接（2026-11-04，D74）：企业网只放行单播（D73）导致自动发现不可用时，用户可在 App 聊天页点「扫电脑上的二维码」，扫桌面已有的二维码直接连接。桌面二维码内容不变（仍是 `http://<ip>:<port>`，浏览器扫码落地页下载 APK 不受影响）；手机端 `getUserMedia` 开后置相机 + `jsqr` 逐帧解码（懒加载 43KB gzip），解析只认 IPv4 并忽略 path/query；相机权限走 manifest + `on_permission_request`，由 wry 自动弹系统授权，未改 MainActivity。顺带修正桌面端「下载 App 后会自动发现」的误导文案（该路径在企业网必然失败）。
35. 外观默认跟随系统 + 宠物舞台随主题（2026-11-04，D76）：`sidekick:theme` 缺失/非法一律 `system`（首次启动、无存档时随系统亮暗；localStorage 不可用静默回退深色，偏好不写成 `dark`）；`--pet-*` 从「两套主题都深」改为随主题，浅色新增「海玻璃舞台」色板（`--pet-bg #dcebe7`、表面 `#f7fcfa`/`#edf7f3`、文字 `#0e2a2b`/`#3f5e5d` 等）与 `--pet-coral-foreground`；始终深色的桌面麦克风浮层改用新增的 `.deep-sea-scope` 钉住深色 pet 令牌，`SignalDot tone="stage"` 语义改为「用 pet 令牌（随主题）」；鲸鱼图集不重绘、不加 filter，浅色舞台下白色围裙/亮部对比度偏低（约 26% 不透明像素 <1.5、中位数约 3.5）是接受的代价。取代 D71 的「默认深色」与「舞台两套主题都深」两点。
36. 宠物交互收敛 + 会话行工具类别（2026-11-04，D77/D78）：① 手机宠物舞台删除背景声呐环（桌面 `SignalDot` 的 `.sonar-dot-ring` 保留）；② 宠物不再响应麦克风——删除 `MIC_START/SUCCESS/CANCEL/ERROR` 事件、`listening`/`concerned` 姿态、`proud`/`listening`/`concerned` 心情、`mic_success`/`mic_error` 文案与成功/失败触感；`PetPhase` 只剩 idle/celebrating/sleeping/away，`Mood` 只剩 content/happy/curious/sleepy；录音时仅保留 `micListening` 门禁静音 AI 音效/触感；③ done 动画改 `loop`（一轮 16×100ms=1.6s，completed 3 秒内约 1.875 轮，不再末帧定格）；④ 顺带修复 `phaseUntil` 到点没有 TICK 导致命名庆祝停在庆祝/末帧几十秒——`pet-store.ts` 的 `schedulePhaseExpiry` 在到点补发一次 TICK，庆祝按 1.5 秒正常结束。AI 联动侧：hook 插件 `PLUGIN_VERSION` 2→3，新增会话当前工具类别（`SESSION_TOOLS` 白名单 bash/read/edit/search/web/agent/plan/tool，工具名本地归一、未知工具落 `tool`、仅 working 上报）；Rust 桥 `SessionTool` 第二道白名单（未知值折叠为通用 `tool`、不保留原文）；手机会话工作行显示 spinner + 「正在<动作>」（无 `tool` 为「正在思考」），行尾保留相对时间；隐私只同步粗粒度工具类别，不读取/外发提示词、回复、工具参数、文件路径、模型名、工具名原文；桌面 AI 联动页「插件 v3」由 hello 上报动态显示（无需改版本展示代码），隐私文案同步改为「只同步状态、会话标题、当前工具类别、数量和事件时间；工具类别只取固定枚举，不含工具名原文、提示词、回复、工具参数或文件路径」。

37. 首次命名/改名下线（2026-11-05）：彻底删除「首次命名」整条功能——删除 `name-prompt.tsx`/`pet-hearts.tsx`；`PetSaveV1` 去掉 `name`（version 仍 1，旧 `name` 忽略、不迁移，其他字段照常恢复）；`PetEvent` 去掉 `NAME_SET`；`PetPhase` 去掉 `celebrating`；`Mood` 去掉 `happy`；清除 `phaseUntil`/`schedulePhaseExpiry`/爱心效果/`setName`；宠物固定显示「小跟班」，`first_meet` 文案改「你来了。我是小跟班。」，AI 完成态文案改「完成」；`onboarded` 保留为「是否已见过面」、首次 BOOT 置 true；设置页删名字表单、章节重排为 01 反馈 / 02 外观 / 03 显示 / 04 重置宠物 / 05 关于，重置文案改「要重置宠物吗？」；`pet_name_set` 事件与宠物 PRD/SPEC/AC/INDEX、scope、metrics、pet-runtime 同步删除。

38. 指挥舱 A 重设计完成（2026-11-05，D79）：按方向 A 重排两端壳——桌面 5 视图（总览 / 会话 / 内容 / 系统 / 设置）+ 顶部 48 全局状态条（服务 / 手机 / AI 三段可点）+ 72 图标导航（⌘1–⌘5）+ 56 页头 + 辅助功能提示条外壳级 + 全局麦克风浮层，聊天降级为「系统 › 消息」，960 单列（lg: 1024 断点）/ 1180 两列；手机部分已被 D80 取代（见下条）。共享底座：`shared/lib/{status,sessions,activity,activity-store}.ts`、`shared/ui/{signal-bars,status-chip}.tsx`、协议 `system.clients` 可选字段（Rust 连接/断开带上 clients）、`desktop/lib/{desktop-nav,desktop-status-store,desktop-clients-store,desktop-activity-store,desktop-voice-store}`、手机 `stream/activity-store.ts` 与 `first-use/store.ts`；旧 4 个平行 Tab、SettingsSheet、SessionPanel、ConnectionBar 已删除。设计依据 `design-review/v2/version-a.notes.md`（只读）。
39. 手机干净版两页壳（2026-11-05，D80 / v16）：手机只留「宠物（根）/ 设置（二级）」两页，删除动态页与底部 tab；宠物页 = 顶栏（gear / 连接状态 / chat）→ 会话卡（折叠 1 行、展开 5 行、working wash、× 二次确认）→ 无底色鲸鱼（230 / 展开 220）→ 居中 56 薄荷圆麦克风（距底 56）；设置从 gear 进、左上返回、17/400 inline 标题、首用清单 banner、无底栏；结果卡弹窗三段（grabber + header 16「已输入」/ 12 时间 + content 13 单行 + footer 15「清空 / ↵ 回车」纯文字，44 热区，清空二次确认），总高约 125。新增 `.mobile-clean` 作用域令牌（`app/src/mobile/styles/clean.css`），只影响手机；旧 `stream` / `tab-bar` / `now-row` / 动态页组件删除；`app.tsx` / `ui-store` 去 `stream`，asking/chat/settings → pet，offline → 上一页。**字体（D81）**：真机实际渲染是 OPPO Sans Regular，偏宽偏厚；改为随包 MiSans Normal 400（3.9MB WOFF2），会话标题 15，设置说明行高 1.625→1.45。591 tests / tsc / lint / build 全绿；真机 Realme RMX3370 已验证宠物页 / 会话展开 / 设置页 / 返回键 / 深色 / MiSans，待补录音禁切页、结果卡清空二次确认、320 宽真机。
40. 手机字体收敛（2026-11-05，D81）：用 CDP `CSS.getPlatformFontsForNode` 确认 Android WebView 把 `sans-serif` 解析为 `OPlusSans 3.1_GB18030`（OPPO Sans Regular），不是 PingFang；实测 OPPO Light 300 发虚、OPPO Regular 400 笨重。下载并真机对比 MiSans Normal/Regular、HarmonyOS Sans SC Regular/Light 后，选 **MiSans Normal 400**（随包 `app/src/mobile/assets/fonts/MiSans-Normal.woff2`），字重统一 400、标题 16→15、正文字号不动、设置说明行高 1.625→1.45；桌面端不加载。MiSans 免费商用但需注明，assets README 与设置「数据与关于」已加说明。

41. Token 用量看板 V1（2026-11-06，D82–D84）：桌面新增第 6 一级页「用量」（⌘4；系统 ⌘5、设置 ⌘6），只读 `~/.dsh/storages/cost-meter/ledger.json`，提供今天 / 7 天 / 30 天 / 180 天区间、客户端 / 会话 / 模型三维分组、30 天花费柱阵、缓存环与 Token 构成；手机在「设置 › 用量」提供只读版本（断连保留最后快照、录音中禁切页）。新增 `usage.request` / `usage` 协议（带 `data` 包装，不含提示词/路径/cwd），模型 ID 是否下发受 D83「在手机显示模型分组」开关控制。模型价格能力参考 tokei：seed（OpenRouter 目录）+ `~/.sidekick/token_pricing.json` 缓存 + `~/.sidekick/token_pricing_overrides.json` 覆盖 + DeepSeek 官方峰谷 CNY 价；实际 `costCny` 优先，缺价才按价格表估算并标 ≈；打开用量页且缓存 >24h 自动刷新、失败保留上次。新增依赖 `reqwest`（rustls-no-provider，ring provider 与 ASR 共用 `tls.rs`）。

42. 电脑端菜单栏常驻（2026-11-06，D88）：电脑端从「窗口应用」变「常驻服务 + 菜单栏图标」——关闭按钮 = 隐藏窗口（`CloseRequested` → `prevent_close` + `hide`），HTTP 服务 / UDP 发现 / DSH hook 桥 / 剪贴板监听在窗口关掉后继续跑；`ActivationPolicy::Accessory` 隐藏 Dock 图标（Cmd+Tab 不出现）；菜单栏 36×36 单色模板图标（猫头剪影 + 眼睛镂空，`scripts/gen-tray-icon.py` 从 `brand/logo-favicon.svg` 生成），左键显示并激活主窗口、右键菜单「显示主窗口 / 退出 Sidekick」是唯一退出入口；托盘创建失败自动退回「关窗即退出」，避免窗口/图标/退出入口全丢。`tauri` 的 `tray-icon` + `image-png` feature 只在桌面目标启用（Android 包不受影响）。**已验证（2026-11-06，dev 二进制无头冒烟）**：启动日志 `[tray] 菜单栏图标已就绪`，47810/47820/47815 同时监听，`lsappinfo` 返回 `ApplicationType="UIElement"`（Accessory 生效），单实例二次启动秒退、杀进程后端口释放；`cargo check` / `cargo fmt --check` / `cargo tree --target aarch64-linux-android -i tray-icon`（无输出）通过；592 前端测试 + tsc + Biome + 文档检查全绿。菜单栏观感/反色、关窗→隐藏、左键唤回、右键退出仍待人工 `pnpm tauri dev` 目检（契约与清单见 [engineering/desktop-tray.md](./engineering/desktop-tray.md) §5）。

43. 手机设置页排版收敛 + 鸿蒙字体（2026-11-06，D90/D91）：行标题 16/20→15/21、说明 13/17→13/19、单行/双行卡片行高 48/52→56/60、卡片间距 14→20、左右内边距 14→16、分段控件 44→36 且段间隙 2→4、标签与控件 10→16；字体由 MiSans 换成随包 **HarmonyOS Sans SC Regular**（8.1MB 原始 TTF，许可禁止转 WOFF2/subset），删除 MiSans WOFF2（−3.9MB），APK 净增约 4MB。真机 BKQ-AN10（Android 17 / WebView 156）用 CDP `CSS.getPlatformFontsForNode` 确认实际渲染 `HarmonyOS Sans SC`；冷启动字体加载约 430ms（`font-display: swap`）。


44. 首用清单 ③④ 跨端真实状态（2026-11-06，D92）：修复用户反馈「电脑已配置百炼 API Key、手机语音也能识别，但手机首用清单仍显示 ③ 未完成、还差 2 步」。新增桌面 → 手机 `desktop.status` 消息（`asrConfigured` / `asrHasKey` / `accessibilityTrusted` / `ts`，只含布尔与时间戳，不含 Key/掩码/路径）：桌面在新客户端连接与手机 `status.request` 时下发；手机在连接成功、回前台、打开设置页时刷新。清单 done 累计 ① ② 本地状态 + ③ ④ 桌面真实上报，③④ 为 true 才显示「已完成」，全部完成时 banner 显示「首用清单 · 已完成」；旧桌面/未收到时仍显示「在电脑上完成」，不伪造完成态。
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
- 宠物浏览器验证（历史，命名/双姿态已分别于 2026-11-05/D62 下线）：首启见面、设置页、减少动效、聊天入口/返回正常；无头 Chrome 1280×720 截图确认静态宠物舞台与设置页。
- Realme（WebView 103）已安装并启动；竖屏宠物舞台、设置页、杀进程重启恢复均通过；`sidekick-pet.json` 已写入应用私有目录（原改名/双姿态能力已下线）。
- 方向自动姿态已在 Realme 上验证：竖屏 handheld、横屏 docked，旋转后 320ms 内切换；设置手动覆盖可用。
- **自动发现端到端已验证（2026-10-31）**：Realme 打开 App 后 logcat 出现 `[discovery] 扫描结束，发现 1 台电脑` → `[mobile] connecting to ws://<电脑IP>:47810/ws` → 已连接；聊天页显示「设备名 + 地址 + 已连接」，发消息桌面日志出现 `[ws] recv` 且手机收到回显。
- **端口回退已验证（2026-10-31）**：先占用 47810，桌面日志显示 `端口 47810 绑定失败…尝试下一个候选端口` 后监听 47811；手机发现回包携带 `port=47811` 并自动连上。
- **桌面面板已改版验证（2026-10-31）**：真实服务 + 浏览器 `?role=desktop` 通过 CDP 检查，默认无 canvas（无大二维码），地址显示真实端口，展开后出现 160px 二维码。
- **Token 用量看板（2026-11-06，D82–D84）**：前端 `pnpm typecheck` / `pnpm lint` / `pnpm test`（74 files / **602 tests**）/ `pnpm build` 全绿；Rust `cargo fmt --check`、`cargo test`（**161 passed**）、`cargo clippy`（仅既有 warning，无 error）通过；`check-docs`、`check-boundaries`、`node --check scripts/update-pricing.mjs` 通过。真实账本只读冒烟（临时测试，已移除）：7 天区间 `tokens=2,174,514,477`、`costCny≈¥128.93`（128,929,334 微元）、`calls=9,715`、`sessions=76`（区间唯一会话 id 数），与独立 Python 直算一致（金额差 1 微元内）。浏览器无头验收：桌面 1180×760 / 960×640 深浅色、手机 390×844 / 320×640 深浅色均无横向滚动；价格 Sheet 可打开（刷新逻辑由前端组件测试覆盖）；手机模型开关关闭时模型 Tab 隐藏。真机 Realme、真实 Tauri 窗口命令调用与断网刷新尚未回归。
- 自动化测试：`pnpm typecheck/lint/test/build` 全绿（103 前端用例）；`cargo test` 10 passed；`check-boundaries`、`check-docs` 通过。
- 麦克风 spike：真机 5 秒长按生成约 143KB WAV，桌面收到并 whisper 转写；合成中文 WAV 得到 20 字文本；剪贴板 UTF-8 正确；自动粘贴因辅助功能权限返回 copied。
- 麦克风 P0 后端：Python WS 客户端按正式二进制协议发送 3.9 秒中文，服务端返回 `mic.result(copied, accessibility_off)`；whisper-rs base 在模型预热后延迟约 0.2–0.3s；剪贴板 UTF-8 内容正确。
- 剪贴板：复制文本后 `~/.sidekick/clipboard.json` 在 1 秒内出现，权限 `600`；带 `org.nspasteboard.ConcealedType` 的内容未记录；语音转写从 2026-11-01 起经 `write_text_and_record` 以 `kind=voice` 入库（此前版本不入库）。
- 前端质量：`pnpm typecheck` / `pnpm lint` / `pnpm test`（128 tests）/ `pnpm build` 通过；`cargo test --lib` 20 tests 通过。
- **断连自动重连已验证（2026-11-01，Realme 真机）**：22:47:54 杀掉桌面进程，手机 22:47:54.504 检测到 `[mobile] 连接已断开`；随后按退避自动重试（发现 0 台 → 退回上次地址 → 连接被拒），重试时间点 22:47:57 / 22:48:00.6 / 22:48:06.3 / 22:48:15.9 / 22:48:33.5（每次 = 退避 + 1.5s 扫描窗口）；桌面 22:49:05 恢复后下一轮自动发现 1 台并 `[mobile] connected`，无需任何手动操作。
- **端口变化自动重连已验证（2026-11-01，Realme 真机）**：占住 47810 后桌面回退到 47811，手机断连自动重试时发现回包 `port=47811` 并 `[mobile] connected to ws://…:47811/ws`；聊天页显示「已连接」与新端口。
- **重连 UI 已验证（2026-11-01）**：断连瞬间聊天页显示「未连接 / 正在自动重连（第 1 次）…」+「重新搜索」，连上后恢复正常；前端 147 个用例（含 fake timers 的退避/暂停/立即重连/多台不自动选）全绿。
- **宠物页屏幕常亮已验证（2026-11-01，Realme 真机 / Android 13）**：安装后打开 App 停在宠物页，`adb shell dumpsys window windows` 的窗口 `fl=` 含 `KEEP_SCREEN_ON`（默认开；设备上旧存档的 `"never"` 已迁移为 `true`）；点「打开聊天」后标志消失、返回宠物恢复；打开设置页时保持常亮；设置里关掉「屏幕常亮」标志消失、重开恢复；`sidekick-pet.json` 持久化为 `keepAwake: true`，logcat 无 `[keep-awake]` 错误。前端 159 用例全绿（含 `use-keep-awake` 3 例）。
- **手持模式录音 UI 已验证（2026-11-01，无头 Chrome CDP + Realme 真机 / WebView 103）**：393×852 无头 Chrome：空闲按钮 96×96、中心 x=196.5=视口中心、距底 24，录音条中心 196.5、宽 322.3、按钮上方 8px，上滑 60px 进入「松手取消」珊瑚态，松手回 idle 并提示「已取消，没有发送。」。Realme 真机（360×800，CDP `Input.dispatchTouchEvent`）：按钮 rect left 132/right 228（中心 180=视口中心，偏差 0px）、96×96、距底 24px，DOM 无「取消录音」按钮；按住后中心不变、录音条中心 180、与按钮 gap 8px；上滑 60px 按钮文案「松手取消」+ `bg-pet-coral`；松手回 idle 并出现「已取消，没有发送。」。852×393 docked：空闲胶囊中心 426、底边距 16，按住后容器 520 仍居中、录音条在胶囊内。
- **触感/变暗/常亮真机已验证（2026-11-02，Realme RMX3370 / Android 13）**：装上 debug APK 后 `dumpsys window` 宠物页含 `KEEP_SCREEN_ON`、切聊天页消失、返回恢复；长按聊天文本仍选中（`getSelection` 有 Range）但 logcat **无** `VibratorManagerService` 震动（证明 WebView 默认长按触感已关闭）；长按宠物页图标/空白无震动、无选中（`user-select:none`）；点宠物触发 App 触感（logcat waveform 45ms）。把存档 `dimMinutes` 改成 1 后重启，约 60s 出现 30% 黑色遮罩（`getComputedStyle(opacity)=0.3`），点一下恢复；旧存档自动补上 `dimMinutes: 5`、`keepAwakeHours: 2`；logcat 无 `[haptics]`/`[keep-awake]` 报错。
- **触感/时长可配已通过质量门（2026-11-02）**：`haptic` / `disable_webview_haptics`（`app/src-tauri/src/haptics.rs`，decorView `performHapticFeedback` + WebView `setHapticFeedbackEnabled(false)`）通过 `cargo check --target aarch64-linux-android`；前端 `haptics.ts` 收敛为唯一入口、麦克风按下中震、宠物页禁用长按选中；`dimMinutes`（默认 5）与 `keepAwakeHours`（默认 2，0 = 不限）落地并含旧存档迁移；`useKeepAwake(active, maxDurationMs)` 到点释放。`pnpm typecheck / lint / test（174 tests / 28 files）` 全绿；真机触感/变暗/常亮到点待验收。
- **语音入库 + 100 条上限已验证（2026-11-01）**：Rust `record_item` 单测覆盖 voice kind、同文本去重保置顶、100 条裁剪保置顶；剪贴板 UI 显示 `N / 100 条` 并给语音条目加 Mic 图标与「语音」标签；`cargo test --lib` 24 passed，`pnpm typecheck / lint / test（164 tests / 27 files）/ build` 全绿。`write_text_and_record` 的「暂停记录仍写系统剪贴板、不入历史」由代码路径与单测语义保证。
- **手机干净版两页壳 + MiSans 质量门（2026-11-05，D80/D81）**：全仓 72 files / 591 tests 全绿；`tsc` / lint / `build` 干净；浏览器 390×844、320×640、浅/深主题截图通过；真机 Realme RMX3370（1080×2400）安装启动，宠物页顶栏 / 会话卡折叠展开 / 鲸鱼无气泡 / 圆形麦克风 / 设置页 / Android 返回键 / MiSans 字体均正常，无 console error。未验证：录音禁切页、结果卡清空二次确认、深色真机、320 宽真机、TalkBack。
- **电脑端「简约 iOS」重做质量门（2026-11-06，D85）**：电脑端只留 4 个一级页（概览 ⌘1 / 内容 ⌘2 / 用量 ⌘3 / 设置 ⌘4）+ 216 侧栏（三行状态摘要）+ 大标题 + iOS 分组列表；删除会话列表页、系统页 4 段、48 状态条、72 图标导航、页脚与解释性文案；设置改为 iOS push 二级页（手机连接 / 语音输入 / AI 联动 / 自动输入 / 剪贴板 / 关于本机 / 消息通道）。新增 `app/src/desktop/styles/ios.css`（`.desktop-ios` 双主题）、`desktop/shell/{sidebar,list,segmented-control}.tsx`、`desktop/lib/desktop-nav.ts`（4 视图 + 8 个设置段）；窗口改 `titleBarStyle: Overlay`。`pnpm typecheck / lint / test（71 files / 588 tests）/ build`、`check-docs`、`check-boundaries` 全绿；`node scripts/qa-desktop-ios.mjs` 36 张截图（浅/深 × 1180/960 × 4 页 + 二级页 + 三个弹层）无横向溢出、无 console error，弹层背景 token 实测为 `#FFF`（浅）/`#2C2C2E`（深）。**未验证**：真实 Tauri 窗口的交通灯位置/拖动区/960 宽手感（本机屏幕不可截图，需人工 `pnpm tauri dev` 目检）。
- **电脑端第二轮「Liquid Glass · iOS 26」质感情景（2026-11-06，D86）**：在 D85 的 4 入口 / 设置 push 结构上重做质感层——224 玻璃侧栏（spring 滑块、彩色图标块）、sticky 玻璃工具栏（滚动 >6px 变玻璃胶囊 + 17/600 紧凑标题 + scroll-edge 模糊渐隐）、34/600 大标题、730 单列 / 16 圆角白卡 / 行 54 / 15 号标题、胶囊按钮 36/30/26 与分段控件（spring 滑块）、内容页胶囊搜索与复制 spring、消息通道全宽聊天区 + 薄荷实心气泡 + 浮玻璃输入栏、用量页 30/600 数字补间 + 柱阵 stagger、设置二级页 push 入场 + 展开收起过渡；specular 高光 / 2.6% grain / 极淡环境光；玻璃只做控件层，`prefers-reduced-motion` 与 `prefers-reduced-transparency` 双退化。**验证**：`pnpm typecheck / lint / test（72 files / 592 tests）/ build`、`check-docs`、`check-boundaries` 全绿；`node scripts/qa-desktop-ios.mjs` 44 张截图（浅/深 × 1180/960 × 4 页 + 7 个设置二级页 + 3 弹层 + 滚动态）无横向溢出 / console error；CDP 实测：切换区间数字补间、reduced-motion 下直接跳变、hover 动作显隐、按压缩放、弹层 token 正确。**未验证**：真实 Tauri 窗口的交通灯/拖动/滚动玻璃过渡手感（本机屏幕不可截图，需人工 `pnpm tauri dev` 目检）。
- **电脑端窗口级材质（2026-11-06，D87，补 D86）**：新增 `app/src-tauri/tauri.macos.conf.json`（`macOSPrivateApi` + `transparent` + `windowEffects: underWindowBackground` / `followsWindowActiveState`），`index.html` 内联脚本只在「真实 Tauri（有 `__TAURI_INTERNALS__.metadata`）+ macOS + 未关开关」时给 `<html>` 加 `.dsl-vibrancy`；该模式下 html/body/根透明、`.dsl-main` 不透明 + 环境光、侧栏只留 tint 且关掉 backdrop-filter，`prefers-reduced-transparency` 退实色；浏览器 dev mock 不触发，保留 D86 自绘玻璃。**验证**：`pnpm tauri dev` 编译并启动成功（配置被接受，`[server]`/`[discovery]`/`[ws] client connected` 正常）；`qa-desktop-ios.mjs` 新增 vibrancy 段：浏览器 mock 检测为 false、模拟真实 Tauri 为 true，`.dsl-vibrancy` 下 html/body/侧栏透明、内容区 `#000`/`#F2F2F7` 不透明（46 张截图无溢出/console error）。**未验证**：真实窗口的材质观感（透明侧栏、失焦变浅、深浅主题、缩放/拖动）——无头环境截不到窗口，需人工 `pnpm tauri dev` 目检。
- **语音一级页 + 关键词质量门（2026-11-06，D94；导航部分已被 D101 / D104 取代）**：当时语音从「设置 › 语音输入」提升为左侧一级「语音 ⌘2」，根页三组摘要（百炼状态 / 关键词计数 / 今天与近 7 天用量），配置、关键词、用量各自 push 二级页；设置首页删除语音行；关键词是单一列表（一行一个词、加号加行、保存），最多 2000 个、统一权重 4，旧热词/中间版本分组数据平铺迁移，新增 `asr_keywords_save`。**验证**：`pnpm typecheck / lint / test（77 files / 644 tests）/ build`、`cargo test（174 passed）`、`check-docs`、`check-boundaries` 全绿；`node scripts/qa-desktop-ios.mjs` 当时代码下桌面 QA 全页截图无横向溢出 / console error；目检 1180 浅/深语音根页、关键词页（行式表单 + 加号 + 保存）与连接与识别页。**未验证**：真实百炼 Key 下 2000 词首包延迟、真机录音链路。**导航现状以 D104 为准**（语音是第 4 个一级入口 ⌘4，单页三段、内部不再 push）。
- **AI 联动代码质量门（2026-11-02）**：`pnpm typecheck / lint / test（291 tests / 36 files）/ build` 全绿；`cargo test --lib` 71 passed（新增 dsh_hook 23 + install 24）；脚本 `node --check` + `vitest run src/dsh-hook` 32 passed；`node scripts/check-docs.mjs` 0 warning、`check-boundaries` 通过。浏览器 mock DOM 核对四态 `data-ai-state`、文案、asking 6s 降速、completed 3s 回 idle、桌面 AI 联动页首次/已连接态。**未做真实 DSH 插件加载/重启**，也未写真实 `~/.dsh`；需要在用户方便时重启 DSH 验收。
- **未验证**：macOS 辅助功能勾选后的实际 Cmd+V 粘贴、密码框/窗口切换完整矩阵、真机 60 秒与断连、真机语音转写进入剪贴板历史的端到端（本机 mock/单测已覆盖）、dialog/sheet/tooltip 在 WebView 103 的居中表现（仍用 translate 类）、竖屏 16:9/20:9 安全区、3 分钟 60fps、TalkBack、扩展状态行、AI 联动真实 DSH 重启/插件加载与 Realme 四态 60fps/音效/真机 3 米识别、会话列表/清除/focus 真机、百炼真实账号、本地 Key 迁移、真机流式/60s、用量区间切换/跨天/金额对账、指挥舱 A 桌面真机回归（5 视图 / 状态条 / ⌘ 快捷键 / 「在 DSH 打开」focus 链路）、手机 D80 真机补测（录音禁切页 / 结果卡清空二次确认 / 深色 / 320 宽）。

## 已知问题 / 技术债

| 项 | 说明 |
| --- | --- |
| 无鉴权/加密 | 同网段任何人可连 WS；仅限可信网络 |
| 无心跳（半开连接） | 断连靠 FIN/RST 立刻发现（实测约 0.5s）；电脑睡眠、路由器静默丢包时可能长时间仍显示「已连接」，直到写失败或 TCP keepalive 生效；WS 心跳待做 |
| 自动重连的后台限制 | App 切后台暂停重连（回前台立即重试）；进程被系统杀掉后需重新打开 App 才会再连 |
| 无持久化 | 消息不落库，重启即清空 |
| 消息回显 | 广播会把发送者自己的消息也回传（当前 UI 按 `from` 显示） |
| 包体 | debug APK 约 120–240MB（含调试符号）；`release/` 放 release 构建 + 本地密钥签名 APK（约 7MB，D63），正式签名/公证待做 |
| 包名遗留 | `app` 的 npm/Cargo 包名仍为 `desktop`（历史原因，产品名已是 Sidekick） |
| withGlobalTauri | `tauri.conf.json` 仍为 `true`；Phase 4 收紧为 `false` 时需回归 IPC/事件/QR |
| 麦克风（云端唯一） | 已实现；自动粘贴依赖 macOS 辅助功能，需要用户手动勾选一次；开发二进制重编译后可能需重勾选；结果卡片回车/清空同样依赖辅助功能与目标窗口不变 |
| 云端麦克风未完成项 | 真机 60 秒/断连、密码框/窗口切换完整矩阵、辅助功能实测、真实百炼账号/本地 Key、用量统计跨天/金额对账；回车/清空真机（终端等非标准输入框）与焦点切换矩阵 |
| 百炼云端未真机验收 | 403 已单独映射 `cloud_forbidden`、保存失败已回滚 Key；真实账号/本地 Key/流式 partial/60s 仍待验；默认旧域名是否支持该模型需用真实 Key 验证 |
| 云端依赖公网/额度 | 断网/限流/额度不足直接失败（无本机回退）；音频仅在用户显式同意后上传 |
| 旧 models 目录 | `~/Library/Application Support/Sidekick/models/` 可能仍有旧文件，不迁移、不参与运行，可手动删除 |
| 用量为估算 | 金额按北京/新加坡公开价估算，未对账百炼账单；`priceNote` 已说明 |
| 本地 Key 明文 | API Key 存 `asr.json`（0600），只靠文件权限保护；不要分享/提交该文件；旧钥匙串 Key 需重新粘贴一次 |
| 企业网只放行单播（D73） | `example-corp` 这类企业 WiFi 把终端间的**广播和组播全部丢弃**，只放行单播。2026-11-04 用原生探针实测：手机侧网段广播 / 受限广播 / 组播 `224.0.0.251`(mDNS) / `224.0.0.1` 全部 `sent OK`，电脑只收到单播；`Udp OutDatagrams` 差值 +3 与三次探测严格对应，证实是网络层丢弃而非 App 没发。**因此 mDNS 也不能作为替代方案**。自动发现恒为 0 台，只能手动输入 `IP:端口`（App 会记住并自动重连，电脑 IP 变化后需重填）；彻底解决需改用不依赖发现的扫码。与 `ACCESS_LOCAL_NETWORK` 权限是两个独立问题 |
| 手持取消只支持上滑 | 按住说话是单指连续手势，不设「取消」按钮；TalkBack/VoiceOver 的取消动作（无障碍替代）P1 补 |
| 宠物真机/性能未验证 | 无线 adb 断连；存档跨重启、横/竖屏安全区、3 分钟 60fps、掉电待真机回归 |
| AI 联动未真机验证 | 本地 DSH 脚本注入、首次重启、四态动作、三音效、杀 DSH/重连待真机回归；P0 只聚合顶层会话，子代理可能提前完成 |
| 会话工具动作真机（部分验证） | 2026-11-05 真机（Realme RMX3370 / Android 13）安装新 debug APK 后：桌面桥上报 `tool=bash` 时工作行显示 spinner +「正在运行命令」，旧数据无 `tool` 时回退「正在思考」；真实 DSH hook v3 链路需重启 DSH 后复验，抓包隐私审计与未知工具/并行回退仍待补（D78） |
| 宠物交互收敛真机（部分验证） | 2026-11-05 真机安装后：舞台无背景声呐环、AI completed 时 done 动画在 3 秒窗口内持续变化（不再末帧定格）、安装/自动连接正常；录音全程宠物无变化仍待补真机回归（D77）。命名庆祝已随首次命名下线（2026-11-05），不再需要回归 |
| AI 联动首次需重启 DSH | profile patch 在启动时加载；desktop profile 默认无 HMR；之后开关只改配置热生效 |
| AI 联动自由文本提问 | 只认显式提问/审批（ask_user_question/exit_plan_mode/approval/blocked）；模型在回复末尾问一句不算 |
| 指挥舱 A 待真机验收 | 代码完成（2026-11-05，D79）：浏览器 QA 15 屏无 console error / 无横向溢出，960 单列与 1180 两列已验证；待真机回归「在 DSH 打开」的 focus 链路（浏览器 mock 无本地 WS）、Android 返回键层级、录音中禁切页、双主题、首用清单与状态词 |
| 手机台数为近似 | 桌面「已连接 · N 台设备」来自 `system.clients - 1`（含桌面本机窗口与网页预览），不显示设备名；精确台数需 P1 角色握手 |
| 首用清单 ③④ 依赖电脑上报 | ③ 百炼 Key / ④ 辅助功能由桌面 `desktop.status` 上报真实布尔；手机连接、回前台、打开设置页时刷新，显示真实完成态；旧桌面或未收到时显示「在电脑上完成」，不伪造。TCC 授权变化后要等下一次快照才更新（不实时） |
| 动态「最近发生」不落盘 | 只存内存（cap 20），重启清空；由 `conn` / `status` / `mic.result` / `focus.result` 派生（活动流持久化为 P1） |
| 宠物图集只有四态 | 已接 OpenPets schema 2（D57）；睡眠等状态行待美术；done 已改 loop（D77） |
| 触感依赖系统设置 | App 主动触感走 `performHapticFeedback`，系统「触摸振动」关闭时不震（尊重用户设置，非 bug）；`navigator.vibrate` 因 APK 未声明 `VIBRATE` 被 WebView 忽略，只作浏览器兜底；iOS 暂无触感 |
| WebView 默认长按触感 | 已在启动时用 `setHapticFeedbackEnabled(false)` 关闭；若未来需要「长按复制消息」，只恢复功能、不要恢复系统触感 |
| WebView 103 兼容 | 真机 WebView 103 不支持 oklch/dvh/color-mix；已加 hex/rgb + 100vh 回退。也不支持 CSS `translate` 属性（Tailwind v4 的 translate 工具类）：麦克风居中、退出提示、宠物保存提示已改用 `inset-x-0`/`mx-auto`；dialog/sheet/tooltip 仍有 translate 类，真机居中待修 |
| 剪贴板历史 | 仅在桌面应用运行时记录；无全局快捷键；图片/文件/富文本不支持 |
| 端口候选回退 | 47810–47814、8848 依次尝试；全部占用时服务启动失败（server_info 报错） |
| 发现依赖 UDP 广播 | 路由器禁止广播/AP 隔离时发现失败，需手动输入地址或扫码 |
| 桌面端多开 | 已由 `tauri-plugin-single-instance` 拦住：第二个进程只聚焦已有窗口后退出（D60） | 曾因多开导致后启动实例改写 DSH hook endpoint、退出后状态断流、手机一直 idle |
| 「在 DSH 打开」浏览器 mock 不生效 | 该动作走桌面本地 WS 发 `focus.request`；浏览器 `?role=desktop` 的 dev mock 无 WS，只能在 `pnpm tauri dev` / 真机验证（2026-11-05，D79） |
| 舞台/聊天提示的「连接」按钮 | 仍保留：自动重连期间不可用，但用户可「立即重连」或「重新搜索」手动干预 |
| gen 不入库 | 克隆后需 `pnpm tauri android init` |
| 桌面端为开发模式 | 目前用 `tauri dev` 运行，未打包/未做开机自启 |

## 下一步（按优先级）

- [x] **前端平台分目录 + 迁移**：按 [standards/engineering.md](./standards/engineering.md) 落 `src/entries` / `src/desktop` / `src/mobile` / `src/shared` / `src/protocol`；对应 `frontend-architecture.md` 的 Phase 1。
- [x] **情绪宠物 P0**：代码完成（状态机/手势/plugin-store/静态舞台/手动双姿态/设置）；真机 60fps、存档跨重启与扩展状态行待补。
- [ ] **宠物真机回归（剩余）**：竖屏 16:9/20:9 安全区、3 分钟 60fps、TalkBack、扩展状态行；设置/存档已通过（2026-10-31）。
- [ ] **宠物交互收敛回归**：done 循环（3 秒约 1.875 轮、不末帧定格）、舞台无背景声呐环、录音全程宠物无变化（2026-11-04 代码完成，D77；命名庆祝已随首次命名下线）。
- [x] **外设麦克风 spike**：WebView 采集、whisper.cpp 本机转写、剪贴板/粘贴降级已跑通。
- [x] **外设麦克风 P0 代码**：二进制协议、内存 ASR、模型管理、手机 UI、桌面设置/浮层；待真机与辅助功能实测。
- [x] **桌面剪贴板 P1**：文本历史、搜索、置顶、隐私过滤、本地持久化。
- [x] **断连自动重连**：退避重试 + 静默重新发现 + 前后台暂停/恢复；聊天页常显重连状态与手动入口（2026-11-01）。
- [ ] **麦克风收尾**：勾选 macOS 辅助功能后验证自动粘贴；真机 60 秒/断连/密码框矩阵；模型准确率测试集；结果卡片回车/清空真机验收（2026-11-04 代码完成）。
- [ ] **麦克风中断真机验收**：快速连点/连按、启动中松手、电脑浮层「取消录音」、看门狗超时（2026-11-04 代码完成，见 MIC-AC-40..44）。
- [ ] **AI 联动（DSH hook）**：桌面「设置 › AI 联动」+ 本地脚本注入 + 手机四态/三音效 + 宠物页会话卡（折叠 1 行 / 展开最多 5 行）/清除/反问唤起；代码完成，待真机/隐私验收（2026-11-03）。
- [ ] **会话列表真机回归**：宠物页会话卡折叠 1 行 / 展开 5 行、asking 直接 focus、清除二次确认与重现、断连快照、旧插件兼容（2026-11-03；2026-11-05 按 D80 改版，基础折叠/展开/返回已验证）。
- [ ] **会话行工具动作验收**：工作行 spinner + 「正在…」、无工具/未知工具/旧插件回退、抓包确认无工具名原文/参数/路径/模型名（2026-11-04 代码完成，D78）。
- [ ] **手机 D80 真机回归**：宠物页顶栏 / 会话卡 / 无底色鲸鱼 / 圆麦克风；设置页返回；录音中禁切页；结果卡三段 + 清空二次确认；深色与 320 宽（2026-11-05 代码完成，基础页已真机验证）。
- [ ] **Token 用量看板验收**：真实 ledger 对账、空/损坏账本、价格联网/断网/覆盖文件、桌面「用量 ⌘3」与 960 宽、手机 320 宽与模型开关、隐私抓包（2026-11-06 代码完成，待真机/对账）。
- [ ] **电脑端 D85/D86/D87 真机目检**：窗口级材质（侧栏透出桌面、失焦变浅、reduce-transparency 退实色、`sidekick:vibrancy=off` 回退）、`pnpm tauri dev` 看交通灯位置、拖动区（侧栏 38 / sticky 工具栏）、滚动时玻璃工具栏与紧凑标题过渡、scroll-edge 渐隐、深浅主题、1180 与 960 两档、设置二级页 push/返回、概览二维码弹层、reduce-motion 下降级。
- [ ] **AI 联动后续**：手机回答 AI 提问（answer 回传 + hook 结果注入）、文本消息、Claude Code / Qoder 接入（接入后用量页客户端分组从「未接入」变为真实数据）。
- [x] **Release 打包**：`release/` 固定文件名 dmg（3.8MB）+ 签名 APK（7MB）+ 三个打包脚本（2026-11-03，D63）；待正式签名/公证。
- [ ] **蓝牙通道**：Tauri 移动端 BLE 插件（Kotlin）或 Python sidecar，见 `ble-notes.md`。
- [ ] **配对与鉴权**：首次扫码配对、长期密钥、信道加密。
- [ ] **iOS**：Tauri mobile 初始化，评估后台限制。

## 验收清单（每次改动的回归测试）

- [ ] `pnpm tauri dev` 正常启动，日志有 `[server] listening on http://0.0.0.0:47810` 与 `[discovery] UDP 响应器已启动`
- [ ] `scripts/build-android.sh` 成功产出 APK
- [ ] `scripts/package-release.sh` 产出 `release/` 两个固定文件（< 100MB、APK 已签名、dmg 可挂载）
- [ ] `scripts/install-android.sh` 安装并启动
- [ ] 手机打开 App 自动发现电脑并连接（无需输入地址/扫码）
- [ ] 占用 47810 后桌面服务回退到 47811，手机仍能自动发现并连接
- [ ] 杀掉桌面进程后手机自动按 1s→30s 退避重试；桌面恢复后无需操作自动连上
- [ ] 断连时聊天页显示「N 秒后自动重连」，「立即重连」「重新搜索」可用
- [ ] 桌面面板默认无大二维码，展开「用手机浏览器打开 / 安装 App」后出现二维码
- [ ] 手机发消息 → 桌面日志 `[ws] recv`
- [ ] 桌面发消息 → 手机收到，气泡在左侧
- [ ] 手机发消息 → 手机气泡在右侧
- [ ] 宠物竖屏 16:9/20:9、麦克风胶囊与 3 分钟 60fps（设置/存档已通过）
- [ ] 宠物杀进程重启后基线心情/精力/设置/存档恢复；宠物固定显示「小跟班」
- [ ] 宠物 3 分钟 60fps、无 >50ms 长任务
- [ ] 麦克风：权限拒绝/辅助功能未开/窗口切换/密码框/上滑取消的降级路径
- [ ] AI 联动：桌面安装/重启/连接；四态动作远看可区分；三音效默认关/录音静音；杀 DSH 15s 内静态；隐私审计通过
- [ ] 会话卡：折叠 1 行 / 展开 5 行、working wash、× 二次确认；点 asking 唤起 DSH；清除后新事件重现；断连保留最后快照
- [ ] 桌面壳（D85+D86+D104）：默认概览、224 玻璃侧栏 4 个入口（概览/内容/用量/语音）+ 底部设置 + 三行状态摘要、⌘1–⌘5、语音一级页单页（三段、内部不 push）、侧栏语音未配置琥珀点、设置二级页 push/返回、关键词保存与迁移、概览当前会话与「在 DSH 打开」、辅助功能提示只在概览顶部出现且授权后消失、麦克风浮层全局、浅/深主题弹层令牌、`node scripts/qa-desktop-ios.mjs` 无溢出、960×640 不裁切；滚动 >6px 出现玻璃工具栏与紧凑标题、内容从玻璃下经过不露边、reduce-motion 无位移动画、reduced-transparency 玻璃变实底
- [ ] 用量：真实账本对账、价格刷新/断网/覆盖、空态、手机模型开关、抓包无提示词/路径/cwd
- [ ] 手机壳：默认宠物、顶栏 gear/连接图标/今日用量/chat 可点（连上只显示信号塔图标、未连上补短词）、无底部 tab、结果卡三段、二级页返回层级、录音中禁切页、首用清单在设置 banner
- [ ] 状态语言：连接 7 / AI 4 / 麦克风 9 两端同词；琥珀只给等你决定；工作行 spinner +「正在<动作>」/「正在思考」
- [ ] 用量：桌面/手机区间切换与三维分组；数字与账本直算一致；空/损坏账本不造假；价格联网/断网/覆盖文件；手机模型开关；抓包无提示词/路径/cwd
- [ ] 用量壳：桌面「用量 ⌘3」（分组列表 + 2×2 汇总 30/600 + 数字补间 + 柱阵入场 + 价格表卡尾）；手机顶栏今日数字 → 用量页 → 返回宠物；设置页无用量入口；录音中禁切页；价格 Sheet 刷新与 stale

45. 手机顶栏 v17（2026-11-06，D93）：用户反馈「已连接 · 局域网」在顶栏占位太大、不是主要信息，且 Token 用量藏在设置里太深。改为顶栏四件套——左 gear + **连接状态信号塔图标**（`RadioTower` 20，连上只显示图标、不写文字；没连上才补最短状态词 连接中 / 重连中 / 重连 Ns / 未连接；完整固定文案留在 `aria-label` 与连接页）+ 右侧**今日用量数字**（13/400 tabular，今天花费；无快照/账本缺失/缺价退回仪表盘图标，→ 用量页）+ chat。用量页入口从「设置 › 用量」上移到顶栏，设置页删除该分组，用量页返回改回宠物、返回键同步；`usage-store` 新增独立 `today` 快照与 `requestToday()`（连上/回前台静默拉一次，不改变量页区间）。618 tests（新增顶栏/usage-store 测试）、tsc / lint / build 全绿；浏览器 QA `artifacts/mobile-qa` 390×844 / 320×640 浅深双主题，顶栏 44 无横向溢出、无 console error。真机待目检。
46. 语音录音/结果 UI 重做（2026-11-06，D100）：录音胶囊改为深石墨 `#2C2C2E` + 柔和向上阴影，取消提示移到胶囊上方（80/32 阈值不变）；实时卡/结果卡共用一张白卡、同一位置（距容器底 170→110），卡头「百炼 + 右侧 9px 已输入/已复制/没成功」、正文 11.5px/2 行，去掉 grabber、复制、时间、卡内底部动作区；清空/回车改为麦克风左右两个 56px 浅灰圆钮，仅 `inserted` 出现；胶囊 260→56（300ms）、卡片下滑（280ms）、动作圆错峰淡入（120/160ms），尊重 `prefers-reduced-motion`。`mic-button`/`pet-page` 测试同步；672 tests / tsc / lint / build 全绿；Android debug APK 已构建（250MB），真机安装/过渡目检待 adb。

46. App 图标与品牌标记换成「随身卡」（2026-11-06，D99）：图标从猫头 / 爪印方向换成**一张随身卡**——贴顶边的穿透挂孔（工卡）+ 左上斜切一角（SIM / 录音卡）+ 右下颗琥珀灯（REC / 待命），卡身歪 3.5°，深青底 `#0F3A3E`。母版双轨：App 图标走位图 `brand/appicon.png`（1024 满幅、不烤圆角），小尺寸走 `scripts/gen-brand-mark.py` 的矢量几何派生（favicon 16–32、侧栏 22、托盘 36 单色）。已重生成 `app/src-tauri/icons/**`（macOS `.icns`/`.ico`/各档 PNG、iOS `AppIcon-*`、Android 传统 `ic_launcher*`）与 `app/public/{favicon,logo-icon}.svg`；修正 Android 自适应图标白边（背景层改 `#0F3A3E`，前景层只画卡身并收到 60% 安全区，五档 `ic_launcher_foreground.png` 重写）；托盘 `icons/tray.png` 换成随身卡剪影。**待人工目检**：`pnpm tauri dev` 看 Dock / 菜单栏（浅色与深色各一次）、真机主屏看实际遮罩。过程稿与评审表留在本地 `brand/icon-drafts/card-round/`（`wallpaper-test.png` + `icon-build-check.png` + `svg-check.png`），已 gitignore、不入库，不作为事实源。

47. 语音收回「设置 › 语音输入」单页 + 桌面一级回到 4 个（2026-11-06，D101；导航部分已被 D104 取代）：用户认为电脑端语音部分没必要单独占一个一级页，也不该再设二级页。桌面一级改为 **概览 ⌘1 / 内容 ⌘2 / 用量 ⌘3 / 设置 ⌘4**，侧栏上半只有 3 项、设置固定底部；设置新增「语音输入」单页（功能组顺序：手机连接 / 语音输入 / AI 联动 / 剪贴板；行 meta 已配置「已配置」/ 未配置「未配置」+ 琥珀点），页内纵向三段 = 百炼配置 + 关键词面板 + 语音用量，**内部不再 push**、页头只有「‹ 设置」；删除旧「语音」一级页与「连接与识别 / 关键词 / 语音用量」3 个二级页，`?view=voice` / `?view=models` 作为调试别名落到设置语音页。关键词单一列表（一行一个词 / 2000 上限 / 统一权重 4）、`asr_keywords_save`、未配置信号、2 次点击可达（设置 → 语音输入）全部保留。文档与索引已同步（本文件、shell/mic/usage PRD、ux、engineering 契约、AGENTS.md）；测试与浏览器 QA 脚本由并行实现线同步，真机与交互回归待补。

48. 语音升为第 4 个一级入口（2026-11-07，D104，取代 D101 的导航部分）：用户觉得语音从设置里拿出来更顺手，指定放在「用量」下面。桌面导航变 5 项——概览 ⌘1 / 内容 ⌘2 / 用量 ⌘3 / 语音 ⌘4 / 设置 ⌘5，侧栏上半 4 个入口 + 底部设置；语音 = 单个一级页（fade 进入、页头 34/600「语音」），页内三段 = 百炼配置 + 关键词面板 + 语音用量，内部不再 push；未配置时侧栏「语音」项 6px 琥珀点；设置删除「语音输入」行与 section（功能组回到 手机连接 / AI 联动 / 剪贴板）；`?view=voice` / `?view=models` 落到一级语音页。关键词单列表（2000 上限 / 权重 4）、`asr_keywords_save`、未配置信号保留。文档与索引已同步（本文件、shell/mic/usage PRD、ux、engineering 契约、AGENTS.md）；测试与 QA 脚本由并行实现线同步，真机与交互回归待补。

49. 语音用量记账修复（2026-11-07，D105）：排查「语音输入了几条、Token/费用一直是 0」——直连百炼 WS 探针确认 `qwen-audio-3.1-asr-flash-streaming` 的 `task-finished` 只返回 `payload.output={}`，usage（duration/input_tokens/output_tokens/total_tokens）实际出现在部分 `result-generated.payload.usage`（累计值）；旧实现只读 task-finished，所以一条都不记。修复：`bailian_asr` 解析每条事件时累计最近一次 usage（result-generated 在任何 early return 之前读），task-finished 自带 usage 优先、为空时用快照兜底；新增单测（只有 result-generated 带 usage）与端到端 mock 会话测试（12 个 bailian 测试全绿）。价格核对：官方北京 ¥6/¥4.5、新加坡 ¥6.781/¥5.104 每百万 Token 与 `asr_pricing.rs` 一致，微元换算与历史账本自洽（368×6+46×4.5=2415）；音频 Token 按官方「时长×12.5」由服务端给出。历史漏记无法精确补，修复需重启桌面端后对下一次会话生效。

50. 手机会话卡改浮层 + 字号收一档 + 完成即展开可点（2026-11-07，D107）：用户反馈会话卡一展开鲸鱼就被往下顶约 104px、展开后鲸鱼几乎贴到麦克风，且会话字号比麦克风区大一号显「傻大」。改方案 A——**会话卡从文档流摘出、绝对定位浮在宠物舞台上**（top 8 / 左右 16 / z 20，低于麦克风 30 与变暗 40）；宠物舞台固定占「顶栏下 → 麦克风上」，顶部预留折叠卡高度（1 条 96 / ≥2 条 128），展开只把卡片 `max-height` 从 122 加到 314（260ms），鲸鱼固定 230、坐标与尺寸零变化（删掉 230→220 与死变量 `--pet-session-shift`）；展开时点卡片外或系统返回键先收起（`pushBackHandler`，不触发退出确认）。字号对齐麦克风区：标题 15→14/19、副行 13→12/16、header 13→12、计数 12→11、footer 13→12、chevron 14→12、行高 52→48（清除按钮 72×48）。完成态：`session-store.apply` 比对相邻快照标记「新完成」（首份只做基线，打开 App / 重连不弹历史完成），宠物页消费 `pendingExpand` 自动展开；完成行改薄荷对勾 + 薄荷「已完成」+ 行尾 ›，可点发 `focus.request`（复用现有协议，桌面只唤起 DSH 窗口、不定位到具体会话），行尾 spinner + 3.2s 提示复用 `focusErrorText`；新完成行铺 1.4s 薄荷脉冲，排在前 5 之外时替换第 5 位保证可见，`freshIds` 4s 后清。dev mock 新增 `?sessions=N` 与 `?ai=completed`（先 working 后 completed）。**验证**：692 tests（新增 store 新完成 / 基线、feed 浮层尺寸与完成态、pet-page 零位移 / 返回键 / 自动展开 / 点击切回）、tsc / lint / build / check-boundaries / check-docs 全绿；浏览器 QA（`artifacts/mobile-sessions-qa`）390/360/320 × 浅深：折叠 / 展开宠物 center 470/448/408 完全一致、卡片 122→314、完成自动展开且 1 行脉冲、无横向溢出 / console error。真机（Realme 360×800 / Honor）点击切回、返回键、录音中展开待走查。
