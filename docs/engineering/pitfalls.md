---
doc: engineering/pitfalls
title: 已知坑与硬约束
status: active
updated: 2026-11-08
load: on-demand
owner: engineering
---

# 已知坑与硬约束

> 这篇回答「为什么这样做、为什么不能那样改」。每条都是踩过的坑，带现象与正确做法。
> 按域分节读：只读你正在改的那一节。`AGENTS.md §8` 只保留 Top 12 与本文锚点。

## 1. 前端与平台边界

- **不要给 body 加平台状态类**：桌面/手机是两个独立 entry，各自固定布局；历史上 `.mobile { display:none }` 命中 `<body class="mobile">` 导致整页黑屏。
- **StrictMode 订阅**：Tauri `listen` 是异步的；`shared/lib/tauri.ts` 的 `subscribe*` 已处理 pending/cleanup，组件 effect 必须调用返回的同步退订函数，不要每次渲染重新 listen。
- **广播回显**：发送后不要本地追加，等服务端广播回显；按 `from` 判断 me/them。
- **dev mock**：浏览器验证用 `http://localhost:1420/?role=mobile`；`src/dev/tauri-mock.ts` 只在 `import.meta.env.DEV` 生效。
- **shadcn 不要混 base**：固定 `base-nova`（Base UI），不要再引 Radix 版本；类名合并用 `cn`，不要另装 clsx/tailwind-merge。
- **`--accent` 与 `--whale` 分开**（D71）：`--accent` 是 shadcn hover/选中面（= `--wash` 薄荷薄层），鲸蓝用 `--whale`；改 `--accent` 会让所有组件 hover 变蓝块。

## 2. 主题与桌面令牌

- **主题防闪**：`app/index.html` `<head>` 内联脚本必须在最前——在 CSS/React 之前读 `localStorage["sidekick:theme"]`（`system|light|dark`，缺失/非法一律 `system`），写 `data-theme` + `.dark` + `color-scheme`；localStorage 禁用时静默回退深色。移到 React 会闪错误主题，key 不能改。
- **主题双写**：令牌看 `data-theme`，Tailwind `dark:` 看 `.dark` class；`shared/lib/theme.ts` 的 `applyTheme` 已同时处理，不要只改一个或手写 `className`。系统主题走 `matchMedia`，多窗口同步靠 `storage`；Sonner 用 `useTheme().resolved`。
- **桌面令牌作用域**：颜色/圆角/材质全在 `app/src/desktop/styles/ios.css` 的 `.desktop-ios`（同时挂根 div 与 `<html>`，portal 才吃得到）；用语义类（`bg-card`/`text-muted-foreground`/`text-signal`/`--ios-*`），不要写死颜色、不要拿 `tokens.css` 当桌面色板。
- **弹层要吃到桌面令牌**：Dialog/Sheet portal 到 `body`，所以 `desktop/app.tsx` 把 `.desktop-ios` 也加到 `<html>`；离开该 class 弹层会掉回深海令牌。
- **舞台随主题（D76）**：`--pet-*` 随 `data-theme`——深色深海自发光（`--pet-bg #030e12`），浅色海玻璃（`--pet-bg #dcebe7`、surface `#f7fcfa`/`#edf7f3`、text `#0e2a2b`/`#3f5e5d`、border `#9dbab4`）+ `--pet-coral-foreground`。始终深色的表面（桌面麦克风浮层）用 `.deep-sea-scope` 钉住深色 pet 令牌与 `--signal/--ring/--decide/--destructive/--abyss`；`SignalDot tone="stage"` 只表示「用 pet 令牌」。鲸鱼图集不重绘、不加 filter（浅底对比偏低是接受的代价）。
- **WebView 103 兼容**：不支持 `oklch`/`dvh`/`color-mix`——颜色用 `tokens.css` 的 hex，`h-dvh` 由 `globals.css` 未分层 `100vh` 覆盖。**也不支持 CSS `translate` 属性**：Tailwind v4 的 `translate-x/y-*` 编译成 `translate:`，真机被忽略（元素偏半个自身宽度）。居中用 `inset-x-0` + flex `items-center` 或 `left-0 right-0 mx-auto`，不要 `left-1/2 -translate-x-1/2`。
- **手机字体（D91，取代 MiSans）**：Android WebView 把 `sans-serif` 解析成 OEM 字体（OPlusSans），宽而厚；随包 `app/src/mobile/assets/fonts/HarmonyOS_SansSC_Regular.ttf`（400，8.1MB），`clean.css` `@font-face` + `.mobile-clean` 首选，**许可禁止转 WOFF2/subset**；标题 15/21、正文 13/19，全手机 400。
- **桌面文案红线**：不写页面说明句、mono 大写装饰、「暂无数据」；每行只有标题 + 一个短值/一句状态；只有危险操作、隐私承诺、必须输入提示可留一句。

## 3. Android 真机与权限

- **手机只支持竖屏**：`use-orientation`/`posture`/`SET_POSTURE` 已删除；`scripts/patch-android-manifest.mjs` 写 `screenOrientation="portrait"`；旧存档 `posture` 被忽略；不写 `landscape:` 断点。
- **Android 返回键**：App 启动注册一次 `subscribeBackButton`；「更多」页走 `mobile/system-back.ts` 返回栈，其它二级页由 `MobileApp` 按视图层级处理，根页面「再按一次退出」（2 秒内第二次 `exitApp()`，需 `core:app:allow-exit`）。**新增全屏页面必须 `pushBackHandler`**，否则按返回会被当成退出确认。
- **手机返回层级与录音**：settings/chat/asking/usage → pet，offline → 上一页，scan → offline；录音中所有换页入口由 `ui-store.setView` 拦截（旧 3 档的「录音中 · 松手后再切页」文案已废）。
- **屏幕常亮**：走原生窗口标志（`keep_awake.rs`，`with_webview` + `jni_handle().exec`），不用 `navigator.wakeLock`；`jni` 锁 0.21 且只加 Android 目标；无需 `WAKE_LOCK` 权限；`useKeepAwake(active, maxDurationMs)` 到点释放、回前台重新计时（`keepAwakeHours` 默认 2，0 = 不限）。
- **触感**：WebView 默认长按会由系统发 `LONG_PRESS` 震动，启动时 `disable_webview_haptics` 关掉；App 触感走 `haptic(style)` → `performHapticFeedback`（light/medium/success/error），**不需要 VIBRATE 权限**；`navigator.vibrate` 会被忽略。宠物页用 `user-select:none` + `-webkit-touch-callout:none` + `contextmenu` 阻止选中。
- **麦克风权限**：Android 需 `RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS`（补丁脚本写入 gen manifest）；Tauri 移动端 `on_permission_request` 允许 `Microphone`；WebView 103 的 `ScriptProcessor` buffer 必须是 2 的幂（已用 2048）。
- **扫码要用相机（D74）**：manifest 声明 `CAMERA` 后，只需 `on_permission_request` 让 `PermissionKind::Camera` 返回 `Allow`，**不用改 MainActivity**；解码用 `jsqr`（动态 import，43KB gzip），**不要换 `BarcodeDetector`**（依赖 GMS，缺 GMS 静默失效）；解析只认 IPv4 与 http/https/ws/wss，忽略 path/query；全屏扫码页要 `pushBackHandler`。
- **Android 16+ 局域网权限**：`targetSdk` 37 下访问局域网要 `ACCESS_LOCAL_NETWORK`（运行时权限，系统默认拒绝）。缺它时发现恒为 0 台、手动连接「连接超时」（`CONNECT_TIMEOUT` 4s），**但同一台手机 shell 里 `curl` 能通**——不要误判成防火墙。排查：`adb shell appops get dev.sidekick.app ACCESS_LOCAL_NETWORK` 出现 `Uid mode: ignore` 即被拒；`adb reverse tcp:47810 tcp:47810` 后连 `127.0.0.1` 能通反证是权限问题；`gen/` 每次 `tauri android init` 后要重跑补丁脚本。
- **企业网只放行单播（D73）**：某些企业 WiFi（如只放行单播的办公网） 广播与组播全丢（实测网段广播/受限广播/mDNS/all-hosts 全丢，手机侧发出计数正常）。**mDNS 不是替代方案**（同走组播）；只能手动输入地址（App 记住并自动重连）或扫码；单播扫 /24 接近端口扫描，可能触发安全告警。
- **无线调试两个端口不同**：配对弹窗里的是「配对端口」（`adb pair`），无线调试主页的是「连接端口」（`adb connect`）；配对码离开弹窗即失效。
- **adb 重复设备**：mDNS 与 IP 两条 transport 并存会报 `more than one device/emulator`；`adb disconnect <mDNS 服务名>` 只留 IP。
- **compileSdk 37**：SDK 包名是 `platforms;android-37.0`，不是 `android-37`。
- **麦克风上滑取消的 pointercancel 坑**：pointerdown 落在子元素（mic SVG）上、recording 开始后子元素卸载，Chrome 会补 `pointercancel`，手指轻微一动（真机 12px）就被当成取消。修法：按钮加 `mic-gesture`，`.mic-gesture > * { pointer-events: none; }`，手势永远落在按钮本身。

## 4. 麦克风录音 UI 与按键

- **录音 UI 锚点（D100）**：底部居中 56px 容器只放按钮本身；实时卡/结果卡放独立绝对定位层（`inset-x-0 mx-auto w-[min(86vw,380px)]`、`pointer-events-none`），`.mic-card-layer` 在 `bottom-[170px]`→`bottom-[110px]` 过渡；动作圆绝对定位在麦克风左右（`calc(50%±120px)`），不参与 flex 宽度——否则容器被撑宽、按钮「按住后跳走」。
- **录音胶囊（D100）**：空闲 56px 薄荷圆钮居中、距底 56；录音展开 `min(90vw,420px)` 深石墨 `#2C2C2E` + 柔和向上阴影；取消提示在胶囊上方 `bottom-[100px]`（80/32 阈值）；**胶囊不再变珊瑚色**；结果卡白卡卡头「百炼 + 右侧 9px 状态」、正文 11.5/2 行，**不要恢复 grabber/复制/时间/卡内动作区**；清空/回车是麦克风左右两个 56px 浅灰圆钮，仅 `inserted` 出现；减少动效时直接切结果态。
- **结果卡片手动按键**：`key.request` 只接受「最近一次 `mic.result(inserted)`」的目标（owner+session），30 秒过期、成功即作废、500ms 限频；按键前重新核对前台应用/密码框/辅助功能，不符只回错误码。「清空」是 `⌘A`+`Delete`（两次确认），不是 ⌘Z；终端等非标准输入框可能不生效，**绝不能回退成回车**；日志不打文本/应用名/按键序列。
- **麦克风会话/中断（D70）**：手势结束看 ref（`heldRef`/`pointerIdRef`）而不是渲染期 `phase`；一次只允许一个 in-flight start（`startingRef` + `lifecycleRef` token），否则出现「手指已抬起但电脑端一直正在听」。服务端同端重复 `mic.start` 以最新会话为准、异端仍 `session_busy`；`mic.stop` 必须 owner+session 匹配；每会话 `maxMs+3s` 看门狗；`mic.cancel` 广播 `reason=desktop|timeout`，手机收到后不校验本地 session 强制停采集。改 `mic.cancel` 同步 `protocol/README.md`、`protocol-audio.md`、Rust `handle_mic_cancel` 与双端解析。

## 5. 语音识别与数据

- **百炼云端 ASR（唯一）**：本机 whisper 已下线，`whisper-rs`/cmake/libclang 不再是构建前提。未同意/地址或模型无效/无 Key 时 `mic.start` 直接回 `mic.error(cloud_not_configured|cloud_key_unavailable)`，不建会话、不回退。
- **本地 Key 存储**：API Key 只存 `~/.sidekick/asr.json`（0600，明文 `apiKey` + 派生 `keyPresent`/`keyHint`），**整个链路不读写 Keychain**，所以开页/测试/录音都不弹密码；升级前的旧钥匙串 Key 不自动迁移（每次重编译签名都变，读旧条目会弹密码），只能重新粘贴。`asr_keychain.rs` 只保留「清除时顺手删旧条目」，不要加迁移读取。Payoff：明文只靠 0600，不要分享/提交。
- **百炼地址与关键词**：地址必须完整 URL，业务空间直接粘贴并把 `{WorkspaceId}` 换成真实 ID（未替换报「请填写完整服务地址…」），不再发 `X-DashScope-WorkSpace`。`asr.json › bailian.vocabulary` 是关键词唯一事实源（一行一个 ≤2000），中间版本 `dictionaries` 读取时平铺后丢弃；统一按热词权重 4 发送，空列表不传 `parameters.vocabulary`；日志只打数量不打词；英文词在 `language_hints` 只含 `zh` 时可能被官方过滤。改字段同步 `asr_config.rs`/`bailian_asr.rs`/`asr_cloud.rs`/前端 `keywords.ts`。
- **usage 来源**：`task-finished.payload.usage` 可能为空（qwen-audio-3.1 实测只返回 `payload.output={}`），usage 实际出现在部分 `result-generated.payload.usage`（累计值）；`bailian_asr` 累计最近一次并在收尾兜底，不要只读 `task-finished`（D105）。
- **rustls 必须显式 ring provider**：`tokio-tungstenite` 用 rustls 0.23，进程必须先 `rustls::crypto::ring::default_provider().install_default()`；`Cargo.toml` 保留 `rustls`（`default-features=false`，features `ring`/`std`/`tls12`）。删 `reqwest` 后曾因缺 CryptoProvider 在 TLS 握手 panic 并被误报成 `cloud_network`（D59）；改 TLS/依赖后跑 `cargo tree -e features -i rustls` 确认 `ring` 还在。
- **本机数据目录**：`~/.sidekick/`（`asr.json`/`asr_usage.json`/`clipboard.json` 均 0600，另有 `sidekick.db` 备忘录镜像、`android-release.jks`）+ 迁移标记 `.migrated-from-app-support`；首次启动从旧 `~/Library/Application Support/Sidekick/` 复制一次（不覆盖、只一次）。`SIDEKICK_DATA_DIR` 可覆盖给测试。
- **旧 models 目录**：`~/Library/Application Support/Sidekick/models/` 可能还在磁盘，但不迁移、不运行，可手删。
- **自动粘贴 TCC（D75）**：合成 Cmd+V 需要辅助功能勾选；未勾选时 `outcome=copied`、结果卡片不出现按键。桌面「概览」顶部有 `AccessibilityHint`，授权后/`window.focus` 回来自动收起；「去开启」走 `accessibility_request()` 弹原生提示，**不要自己拼 `x-apple.systempreferences:` URL**；TCC 不可编程授权。App 是自签名，TCC 按 CDHash 记账，**每次重新打包旧授权失效**（开关看着开着但无效），`codesign -dvv` 对比 CDHash，`tccutil reset Accessibility dev.sidekick.app` 后重新授权可恢复；根治要固定签名。
- **剪贴板**：`NSPasteboard` 每 500ms 查 changeCount；`ConcealedType`/`TransientType`/`GeneratedType` 与密码管理器类型不记录；自身写入用 `skip_next` 防重复；语音转写经 `write_text_and_record` 以 `kind="voice"` 入库（暂停记录时仍写系统剪贴板但不入历史）；上限默认 100、可配 10–200（D121），置顶优先淘汰。
- **语音用量统计**：`asr_usage.json`（0600，原子写，≤400 天）只存每日汇总；按本机时区切天；每次 `task-finished` 有 usage 就记账（插入失败/空结果也计费）；`asr_usage_stats()` 返回今天/7/30/365 + 最近 365 天 `days`；金额人民币微元，北京 ¥6/¥4.5、新加坡 ¥6.781/¥5.104 每百万 Token，自定义地址按北京估算，`priceNote` 明示估算。清空只重置每日汇总。

## 6. 网络、发现与桌面常驻

- **自动发现的三个前提**：同网段、路由器不拦广播/无 AP 隔离、macOS 防火墙允许 Sidekick（TCP 服务端口 + UDP 47820）。第一次弹「允许传入网络连接」必须允许。
- **端口被占用正常**：`47810` 起自动顺延到 `47811`…，日志与窗口显示真实端口，发现回包也带真实端口。
- **桌面 IP 不写死**：`server_info` 每次按网卡实时选 IPv4（`pick_lan_ip`：en* 优先，跳过 utun/bridge/awdl/anpi，防 VPN 地址进二维码）；手机地址来自 UDP **源 IP** + 回包端口。
- **手动输入在连接页**：顶部连接状态 → 连接页 →「手动输入地址」；扫码是主按钮；发现失败空态卡也有入口。
- **桌面端单实例（D60）**：`tauri-plugin-single-instance` 在 `Builder` 最先注册，第二个进程只聚焦已有窗口后退出。多开代价隐蔽：后启动实例会把 `~/.dsh/sidekick/config.json` 的 `endpoint` 改到它的回环端口（47816），退出后 hook 上报打空、桥永远 idle；手机发现只认持有 UDP 47820 的先启动实例。状态不更新时先查 `lsof -nP -iTCP:47815-47819` 与 config.json 的 endpoint 是否指向活着的进程。
- **待机/省电会把 App 网络置为 DOZE（ColorOS 实测）**：手机能 ping 通电脑、`adb shell` 里 `nc` 也通，但 App 内 WS 连接恒超时（4s）。用 `adb shell dumpsys netpolicy | grep UID=<app uid>` 看到 `blocked_state={blocked=DOZE,...}`；修复：`adb shell cmd deviceidle whitelist +<pkg>`、`am set-standby-bucket <pkg> active`，再重启 App。真机排查「只有 App 连不上」时先看这个，不要先怀疑代码或防火墙。
- **重复连接**：手机 `connect_server` 已串行化（abort 旧连接 + generation 守卫），自动连接与手动点击并发不会互相覆盖。
- **自动重连**：`connection-store` 用模块级单一定时器，退避 1s→2s→4s→8s→16s→30s；每次先静默 UDP 重新发现，发现 0 台退回上次地址，多台回上次那台、无地址停止；手动连接/重新搜索取消排期并清零退避；`document.hidden` 暂停、回前台立即重试。
- **无心跳**：协议没有 ping/pong，进程退出/断网靠 FIN/RST（实测 ~0.5s），电脑睡眠/静默丢包可能长时间仍显示「已连接」，待补心跳。
- **在线人数会跳动**：广播的「当前 N 个」是瞬时连接数，测试脚本/网页预览会造成数字变化，不是 bug。
- **关窗 = 隐藏窗口，不是退出（D88/D112）**：`tray.rs` 拦截 `CloseRequested` → `prevent_close` + `hide()`；HTTP（47810+）、UDP 发现（47820）、hook 桥（47815–47819）继续跑。**唯一退出入口是菜单栏右键「退出 Sidekick」**；关窗后 Dock 图标隐藏、⌘Q/Cmd+Tab 不可用。托盘创建失败自动退回「关窗即退出」（`TRAY_READY=false`）。排查「手机连不上」先看菜单栏图标与 `lsof -nP -iTCP:47810`。
- **菜单栏/激活策略随窗口切换（D112）**：`Accessory` 应用没有自己的菜单栏，主窗口聚焦时左上角是上一个 App 的菜单。`tray::show_main_window` 先 `activation::window_shown`（切 `Regular`）再 `set_focus`；`CloseRequested` 隐藏后 `activation::window_hidden`（回 `Accessory`）。不要在 setup 里只设一次，也不要永远 `Regular`（Dock/Cmd+Tab 常驻）。读策略用 `NSRunningApplication.activationPolicy`，不要用 `lsappinfo`（返回 NULL）。
- **窗口拖动区要能力授权**：`data-tauri-drag-region` 会 invoke `plugin:window|start_dragging`，必须在 `capabilities/default.json` 授 `core:window:allow-start-dragging`，否则拖动毫无反应且无报错；用 `data-tauri-drag-region="deep"` 让整块可拖（按钮仍优先）。
- **默认窗口 1180×760**（min 960×640）：改窗口/侧栏宽度时同步检查 960 不溢出、1180 不空。
- **窗口 Overlay 标题栏**：`titleBarStyle: "Overlay"` + `hiddenTitle`，交通灯浮在侧栏顶部 38 区域；拖动区只有两处（侧栏顶部 38、sticky 工具栏），新增页面别把唯一可点元素放进拖动区。
- **窗口材质（D87）**：真实材质在 `tauri.macos.conf.json`（`macOSPrivateApi` + `transparent` + `windowEffects.underWindowBackground`/`followsWindowActiveState`），**不要写进基础 `tauri.conf.json`**（Android 会跟着透明）。`index.html` 内联脚本只在「真实 Tauri（`__TAURI_INTERNALS__.metadata`）+ macOS + 未设 `sidekick:vibrancy=off`」时给 `<html>` 加 `.dsl-vibrancy`；该模式下 html/body 透明、`.dsl-main` 自铺不透明底 + 环境光、侧栏只留 tint 且关 backdrop-filter，`prefers-reduced-transparency` 退实色。真实材质只能 `pnpm tauri dev` 目检。

## 7. 桌面壳与看板

- **壳体结构（D85+D86+D104/D119/D123）**：视图切换是组件状态（桌面 `route.view`、手机 `ui-store.view`），不写 URL、不引路由、不给 `<body>` 加状态类；⌘1–⌘6 在输入框/下拉/contentEditable 里不劫持。一级 = 概览/剪贴板/备忘录/用量/语音/设置/英语角（语音第 4 个一级页单页三段、内部不 push；备忘录 ⌘3 独立只读页；剪贴板 ⌘2，历史与设置都在该页，设置里没有剪贴板行与二级页；英语角 ⌘7 是独立页，快捷键按 `item.shortcut` 反查，别再按下标算）。**会话列表页、系统页、48 状态条、72 图标 rail 已删除，不要恢复**；AI 在做什么只在「概览 › 当前会话」。
- **玻璃只做控件层**（HIG 红线）：侧栏、sticky 工具栏、`dsl-action-group`、`dsl-glass` 提示卡/聊天输入栏可用玻璃；**列表卡/内容区/表单卡一律不透明**，不叠玻璃、不玻璃套玻璃，同屏别超过 3–4 块。
- **桌面列表/分段基元**：列表用 `desktop/shell/list.tsx`（ListGroup/ListRow/ListActionRow/ListEmpty，`iconTone` 出彩色图标块），分段用 `shell/segmented-control.tsx`；旧 `Card`/`MetaRow`/`CardHint` 是无人使用的兼容导出，下一轮删。
- **宽幅数据页（用量，D97）**：用量页是「730 单列」唯一例外——`PageShell size="wide"`（max-w 956）、`tone="usage"`、`bottomGap="compact"`；`PageHeader compact` 不画 34/600 大标题，只留工具栏 17/600 + `sr-only h1`。样式在 `desktop/styles/usage.css`，不要塞回 `ios.css`/`tokens.css`；图表是手写 SVG，不要引图表库。
- **sticky 玻璃工具栏**：`PageShell` 管滚动与 `scrolled`（>6px），`PageHeader` 用 sticky 包装 + `data-scrolled`：未滚动透明、>6px 变玻璃胶囊并淡入 17/600 紧凑标题；顶部 0–86px 用 `--topbar-fade` + mask 做 scroll-edge 渐隐，别让内容贴到玻璃上沿。二级页 `PageShell transition="push"`。
- **动效（D89/D110）**：页面 fade 320 / push 340（不加过冲）/ 滑块 `SPRING_SLIDE`（520/24/0.8，ζ≈0.59、过冲 10%）/ 按压 0.94–0.985 / 弹层 320+220 / 数字 400ms / 柱阵 420ms + 20ms 错峰。**任何新动效都要 `useReducedMotion()` 或 `prefers-reduced-motion` 退化**；`prefers-reduced-transparency: reduce` 时玻璃退实底。WebView 103 只认 `transform`。
- **动效图标（D110）**：加载/提示一律用 `shared/ui/motion` 的 `LoadingOrbit`/`LoadingDots`/`HintCheck`/`HintAsk`/`HintError`，不要再手写 `Loader2 + animate-spin` 或内联 keyframes；颜色只读 `currentColor`、尺寸只走 `size`（行内 20 / 行尾 14）、默认装饰、尊重 reduced-motion；环类描线 3.2–3.4、时长放慢 20–40%、带过冲缓动。
- **菜单栏用量小看板（D108）**：第二窗口 label 固定 `usage-panel`，`capabilities/panel.json` 的 `windows` 必须一致；`main.tsx` 用 `?window=panel` 先于 `app_role` 分支。收起三入口：托盘再点（`is_visible` 就 hide）、`Focused(false)`、Esc 的 `hide_usage_panel`；`CloseRequested` 必须 prevent+hide，否则 Cmd+W 销毁窗口。创建/显示失败回退 `show_main_window`。**CSS 权重**：面板按钮重置只能用 `:where(.dsl-panel) button`，写成 `.dsl-panel button` 会压掉 `.dsl-panel-tab`/`.dsl-panel-open` 的字号与背景。**面板 html 也挂 `.desktop-ios`**：`panel.css` 的 `html { background: transparent }` 会被 `ios.css` 的 `.desktop-ios` 背景盖掉，必须写 `html.desktop-ios`。**阴影必须放得下**：留白 左右 20 / 上 8 / 下 28，阴影 `0 8px 18px` 落在留白内，超出会被裁成「卡片外一圈灰框」。**顶部留白别加大**：窗口顶边保持菜单栏底线（30pt），否则盖住托盘图标下半区、再点关不掉。**`macos-private-api` 不能从 `Cargo.toml` 删**（透明窗口前提，删了 `cargo test` 的 feature allowlist 直接失败）。
- **看板玻璃只铺卡片区（D120）**：`panel_glass.rs` 把 `NSVisualEffectView` 垫在 WebView 之下，frame = 卡片矩形、圆角靠 `layer.setCornerRadius + masksToBounds`。**不要整窗铺**（留白变磨砂、阴影发脏），**不要在 `panel.css` 加 `backdrop-filter`**（透明窗口无可采样像素）；原生 view 插进去后 CSS 关不掉，回退只能走 Rust `SIDEKICK_UI_VIBRANCY=off`；前端必须靠 `panel_glass_ready` 判断。`prefers-reduced-transparency` 在 WKWebView 不匹配，不能当降级开关。玻璃态**不描边、不投影**，`NSGlassEffectView` 必须套同尺寸 `masksToBounds` 容器（它自己会往外蹭 ~5%/20pt 柔光）。改这里用 `SIDEKICK_PANEL_PREVIEW="x,y"` 截图复核。

## 8. 用量看板

- **账本口径**：只读 `$DSH_HOME/storages/cost-meter/ledger.json`（180 天、日粒度、`costCny` 实际记账）；金额人民币微元，总 Token 五桶相加，缓存命中 = `cacheRead/(input+cacheRead+cacheWrite)`；缺 `costCny` 才按价格表估算并标 `≈`，未知模型不编造；百炼 ASR 费用不并入。`usage` 消息带 `data` 包装，不含提示词/路径/cwd；模型 ID 默认上手机（D83），关闭开关后 `groups.models=[] + modelsHidden=true`。价格表 seed 由 `scripts/update-pricing.mjs` 更新，缓存/覆盖在 `~/.sidekick/`；刷新失败保留上次成功，禁止写零价。
- **区间过滤（D97/D98）**：`usage.days` 是「最近最多 180 个真实日期」，**不是当前区间**；两端必须先用 `shared/lib/usage-chart.ts` 的 `daysForRange(days, range, generatedAt)` 过滤再画；真机 00:00 曾出现「今天」配 7 天曲线就是漏了这步。不要改后端 `days`。
- **会话标题回填（D103）**：会话行标签优先账本 `sessions[].title`；没有时**只读** `<DSH_HOME>/storages/session_projcache/sessions/<id>.json` 的 `record.rows.title.val`（≤80 字符，不读 `titleInput`/消息，id 只允许字母数字/`-`/`_`），Top 8 才回填；都没有才「会话 + 8 位短 id」。
- **手机用量页（D98）**：无卡片、hairline 分区，样式在 `mobile/styles/usage.css` 的 `.mobile-usage`，在 `clean.css` 之后引入；**不要改 clean.css**（其它页在用）。图表 `touch-action: pan-y`，水平位移 >8px 才 `setPointerCapture`，不 preventDefault 纵向滚动；手机不做循环呼吸动画；分组 tab 在 `modelsHidden` 时隐藏；价格行只读。
- **图表共享数学**：刻度/路径/日期/环比/五桶百分比/占比/排序都在 `shared/lib/usage-chart.ts`（纯函数，双端共用）；改图表先改这里并跑 `usage-chart.test.ts`。SVG `stop-color` 用 CSS 类给 `<stop>`，别写 `stop-color="var(--x)"`（WebKit 不解析）。
- **手机顶栏今日数字（D93）**：只读独立 `today` 快照（连上/回前台静默 `usage.request(today)`，不改变量页区间）；无快照/账本缺失/缺价退回仪表盘图标，不显示假数字；设置页没有「用量」入口。

## 9. 宠物与手机壳

- **宠物图集（OpenPets schema 2）**：资产在 `app/src/mobile/features/pet/assets/openpet/`（webp 764KB + poster 14KB + pet.json）；一列一帧、单状态 ≤32 帧、兼容 16；播放器 rAF 按 `frames[].duration` 推进，done 用 `loop`（一轮 1.6s，3 秒约 1.875 轮，**不再末帧定格**）；后台/覆盖层暂停，减少动效冻结第 0 帧；manifest 非法/解码失败/尺寸不匹配 → poster 兜底。**`.petSlot` 在 max-width 卡住时会变竖长（360×800 上是 272×440 CSS），播放器必须按 `min(宽,高)` 取方形格子 + `overflow:hidden` 居中**，否则会露出相邻行（像两只宠物）。
- **宠物资产红线（D71）**：复用现有图集 + `SpritePet`，**不重绘、不染色、不新增鲸鱼**；本体颜色归图集，不要再加 CSS fill/filter；手机舞台背景声呐环已删（D77），不要加回来；桌面 `SignalDot` 的 `.sonar-dot-ring` 保留。
- **宠物背景不要加光晕**：OLED 像素自发光，光晕/大面积亮色渐变直接耗电；舞台只用 `--pet-bg` 单一纯色底，装饰只做小面积低亮度（D58）。
- **宠物触摸互动已下线（D69）**：点击/长按/抚摸无任何反应，不再有 `POKE`/`PET_*`/`interacting`/亲密度/触摸爱心；不要再加 pointer 手势。**麦克风反应已下线（D77）**：录音时宠物姿态/气泡/触感不变，只保留 `micListening` 门禁静音 AI 音效/触感。变暗遮罩点击唤醒是屏幕行为，不是宠物互动。
- **首次命名/改名已下线**：宠物固定显示「小跟班」，`first_meet` 文案「你来了。我是小跟班。」；不要再加命名弹层/`NAME_SET`/`celebrating`/`happy`/爱心/`phaseUntil`/`setName`，也不要给 `PetSaveV1` 加 `name`。`onboarded` 只表示「是否已见过面」；旧存档 `name` 忽略。手机「更多」页分组固定 01 连接 / 02 外观 / 03 反馈 / 04 显示 / 05 数据与关于（含重置宠物）/ 06 消息通道。
- **变暗/常亮时长**：`dimMinutes`（默认 5，1–60）与 `keepAwakeHours`（默认 2，0 = 不限）在 `persistence.ts` 归一化；改默认值同步迁移测试与 `docs/prd/pet/SPEC.md` §7。
- **手机会话列表**：`sessionList` 随 `status` 广播（≤50 条、标题 ≤80 字符、`tool` 仅 working 有值）；`session-store` 用本地清除标记过滤（`lastEventAt <= cleared.through`），标记存 `sidekick-sessions.json` 只含 id/at/through（7 天 TTL、≤200 条）；已完成会话 2 小时无新事件自动隐藏（派生过滤，不落盘）。**已归档会话不下发**：桌面桥读 `$DSH_HOME/storages/workspace.json` 的 `global.archivedSessionIds`（2s 缓存）过滤并按可见列表重算聚合态。改 `sessionList` 字段同步 `protocol/README.md`、Rust 桥、手机解析三处。
- **会话卡浮层（D107）**：绝对定位浮层（`absolute inset-x-4 top-2 z-20`），**不要放回文档流**（进流后展开会把鲸鱼往下顶）。舞台 `reserveTop = sessionFeedReserveHeight(rows.length)`，折叠/展开都按折叠高度居中，鲸鱼固定 230（`--pet-session-shift` 已删）；卡片用 inline `max-height` 过渡，`SESSION_FEED_HEADER_H`/`SESSION_ROW_H`/`SESSION_FEED_FOOTER_H` 与 Tailwind `h-10`/`h-[50px]`/`h-8` 必须同步；展开时 z-10 catcher 点空白收起，`pushBackHandler` 先收列表；新完成由 `session-store.apply` 比对上一份快照（首份只做基线），`pendingExpand` + `freshIds`(4s) 驱动自动展开与 1.4s 脉冲。
- **会话行左滑（D95/D96）**：行内容用 `transform: translate3d(...)` 左移 72px；**不要把位移写在 `<li class="ms-row">`**（入场动画最终帧 `transform:none` 会压掉内联 transform），放内层 `data-swipe-content`；拖动期间直接改 style、松手才 setState；`setPointerCapture` 只在水平位移 >8px 后调用（否则 click 被重定向、asking 行点不开）；滑动后吞掉一次 click。自动隐藏是 `visibleSessions({now, autoClearCompletedAfterMs})` 派生过滤，**不要写 `cleared` 标记**。
- **首用清单/设备数/focus**：手机本地判定「连接 + `micReady`」，③百炼 Key / ④辅助功能由桌面 `desktop.status` 上报（只含布尔 + ts）；手机在连接成功、回前台、打开设置页时发 `status.request` 刷新；只有桌面明确 true 才显示「已完成」，未收到显示「在电脑上完成」，不得伪造。改字段同步 `protocol/README.md`、Rust `desktop_server.rs`、手机 `protocol/messages.ts`、`first-use/store.ts` 四处。桌面「已连接 · N 台设备」= `system.clients - 1`。

## 10. 构建、打包与发布

- **`gen/` 不入库**：`app/src-tauri/gen/` 已 gitignore，克隆后先 `pnpm tauri android init`；补丁脚本（manifest 权限/竖屏）每次 init 后必须重跑。
- **Android 构建会剥 feature**：`tauri android build` 会从 `Cargo.toml` 去掉 `macos-private-api`（移动端不兼容），但它是桌面透明窗口的硬前提；`scripts/build-android.sh` 用 trap 在退出时调 `restore-desktop-features.mjs` 补回。绕过脚本直跑后 `cargo test` 报 feature allowlist 时先手动补回。
- **打包顺序不能反**：桌面 `build.rs` 会把 `release/Sidekick-Android.apk` 编译期嵌进二进制，DMG 里的安装包取决于编译那一刻磁盘上的那份；必须**先 `package-android.sh` 再 `package-desktop.sh`**（`package-release.sh` 已按此顺序）。验证：`target/release` 二进制里搜 APK 头 64 字节能命中。
- **release/ 不入库（D125，撤销 D63）**：`release/` 只放本地构建产物（gitignore），分发走 `scripts/publish-release.sh` → GitHub Releases。debug APK 约 120–314MB，任何时候都不要入库。
- **直接跑 debug 二进制会白屏**：`cargo build`（不加 `tauri/custom-protocol`）是 dev 模式，启动加载 `http://localhost:1420`，没有 Vite dev server 就白屏。要独立运行用 `scripts/run-desktop.sh`（先 `pnpm build` 再 `cargo build --features tauri/custom-protocol`）；日常改前端用 `pnpm tauri dev`，两者不要混。
- **图标管线（D99）**：App 图标母版是位图 `brand/appicon.png`，小尺寸（favicon/侧栏 22/托盘 36 单色/Android 自适应前景）由 `scripts/gen-brand-mark.py` 的矢量几何派生；改形状改脚本常量，不要手改 SVG。`pnpm tauri icon` 会把 `ic_launcher_background` 写成 `#FFFFFF`，必须在**之后**跑 `python3 scripts/gen-brand-mark.py` 重写背景色与五档前景层，否则自适应图标外圈露白边。玻璃/内部细节不能当图标（40px 只吃轮廓与明度差）。
- **验证顺序**：改前端 → `pnpm typecheck / lint / test / build`；改桌面 UI → `node scripts/qa-desktop-ios.mjs` 再 `pnpm tauri dev` 目检；改手机 UI → `node scripts/qa-memo.mjs` / 浏览器 320·390 浅深 + 真机；改协议 → `protocol/README.md` + Rust + 双端解析三处同步。
