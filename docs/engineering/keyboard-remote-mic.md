---
doc: engineering/keyboard-remote-mic
title: 键盘遥控录音（全局快捷键 → 手机麦克风）
status: active
updated: 2026-11-15
load: on-demand
owner: engineering
---

# 键盘遥控录音（D132/D133）

> 这篇回答：桌面全局快捷键怎么遥控手机录音、三条新消息怎么走、HUD 与失败码怎么定义、哪些坑不能踩。
> 不包含：麦克风会话状态机与二进制帧（见 [protocol-audio.md](./protocol-audio.md)）、云端识别与用量（见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)）、插入与按键合成（见 [audio-pipeline.md](./audio-pipeline.md)）。

## 1. 数据流

```
[快捷键] NSEvent 全局/本地 monitor（旁听，不吞键）
  └─ hotkey::Detector（单键按一下切换 / 组合键按一下或按住 / Esc 取消）
       └─ mic_remote::RemoteMic
            ├─ 0 台可遥控手机 → HUD「未连接手机麦克风」
            ├─ 多台            → HUD「检测到多台手机」
            └─ 恰好 1 台 → WS 定向 mic.remote{action:start|stop|cancel}
                           └─ 2s 内没 ack → HUD「手机没有响应」

[手机] 两条路，按「后台待命」是否开启分流：
  ├─ 未待命：app.tsx → remote-mic.ts（控制器只在宠物页注册）
  │    ├─ 未注册 → ack{code:"not_pet_page"}
  │    ├─ 开关关/忙/没权限/音频被挡 → ack 对应错误码
  │    └─ 可以 → 复用既有录音流程（session 由手机生成）→ mic.start / 帧 / mic.stop(release)
  └─ 已待命：Rust remote_mic.rs 直接接管
       ├─ RemoteMicService（microphone FGS）AudioRecord → remote-mic/<session>.pcm
       ├─ Rust tail 文件，按 100ms 组帧 → mic.start / SK01 / mic.stop
       └─ 不依赖 WebView；锁屏/切后台/划掉任务仍可录

[桌面] desktop_server 现有链路照旧（ASR → 剪贴板 → Cmd+V → 安全闸门 → 记账）
  └─ mic.start/stop/result/cancel 处回调 RemoteMic → HUD 状态
```

## 2. 消息（v1 追加）

| 方向 | 类型 | 字段 |
| --- | --- | --- |
| 桌面 → 手机 | `mic.remote` | `requestId`(≤64)、`action`: `start` / `stop` / `cancel`、`ts` |
| 手机 → 桌面 | `mic.remote.ack` | `requestId`、`action`、`ok`、`code`、`ts` |
| 手机 → 桌面 | `mic.remote.status` | `enabled`、`standby`、`ts`（连上电脑 + 开关变化各一次） |

`code` ∈ `remote_disabled` / `not_pet_page` / `standby_off` / `notification_denied` / `service_failed` / `busy` / `permission_denied` / `audio_blocked` / `not_recording` / `disconnected` / `cancelled` / `mic_start` / `bad_request`。

- **`mic.remote` 只能由桌面后端发起**，`desktop_server` 不把任何 WS 输入映射成这条命令（当前无鉴权）。
- 桌面按 `client_id` 记住可遥控手机（`mic.remote.status`），断连即清；只在恰好 1 台时下发。
- 失败必须回 ack，不允许静默；桌面 2s 超时按 `ack_timeout` 处理。

## 3. 桌面实现

- `hotkey.rs`：`NSEvent::addGlobalMonitorForEventsMatchingMask` + `addLocalMonitor`（`FlagsChanged|KeyDown|KeyUp`），**本地 monitor 原样返回事件**；`Detector` 是纯逻辑（可单测）。绑定分两类：`Bare`（单键修饰键，按一下切换）、`Single`（任意普通键单键，需无修饰键）、`Combo`（修饰键 + 键，可按住）。配置 `~/.sidekick/hotkey.json`（0600，原子写）。
- `mic_remote.rs`：capable 注册表、单手机路由、ack 超时、phase（Idle/Connecting/Listening/Processing）、HUD 事件。`on_trigger` 在 Connecting/Processing 不再静默忽略，而是显示「正在连接/识别中」。
- `mic_hud.rs`：**HUD 语义层**。吃 `{state, reason}`，把协议错误码翻译成标题 + 第二行解释，再交给 `mic_panel`。所有失败分支（没手机、多手机、ack 超时、start 超时、手机拒绝、断线、识别失败）都必须在这里有文案。
- `mic_panel.rs`：真正的顶部 NSPanel（520×60，`NSScreenSaverWindowLevel` + `CanJoinAllSpaces`/`FullScreenAuxiliary`，非激活、不接鼠标）。WKWebView 渲染胶囊；`generation` 防旧定时器收起新状态；录音态显示波形与计时，失败态显示原因和下一步。
- 命令：`hotkey_status` / `hotkey_save` / `hotkey_test_arm` / `hotkey_test_disarm`（设置卡），事件：`hotkey-changed`、`hotkey-tested`。
- `hotkey-tested` 是**测试键位专属**：10 秒窗口内下一次 Trigger 只回报，不启动手机录音；用截止时间而不是 bool，避免前端关闭后吞掉真实快捷键。
- 旧 `mic-hud` WebView 窗口/capability 保留但不再创建；不要再往 `mic_hud::show` 里加「只 eprintln」的分支。

## 4. 手机实现

- `mic/remote-mic.ts`：控制器注册表 + `handleRemoteMicCommand`（收到命令 → 调控制器 → 必回 ack）。
- `mic-button.tsx`：`heldRef`（手指按住）与 `remoteRef`（键盘遥控）分开，`isCapturing()` 二者取或；`startRecording(event?)` 少传 event 即遥控路径，返回 `{ok, code}` 供 ack 使用；pointer 专属逻辑（capture/cancelZone/位移）只在 pointer 路径执行。
- `voice-recorder.ts`：`AudioContext.state !== "running"` 时抛 `AudioBlockedError`，上层回 `audio_blocked`（安卓自动播放策略，要求先有用户手势）。
- 设置：`更多 › 麦克风 › 电脑遥控录音`（`settings.remoteMic`，默认开）；连上电脑与开关变化时各发一次 `mic.remote.status`。
- 后台待命：`更多 › 麦克风 › 后台待命`（`settings.remoteMicStandby`，默认关）。开启时申请 `RECORD_AUDIO` + `POST_NOTIFICATIONS`，启动 `RemoteMicService`；通知栏常驻「电脑遥控待命」，录音时变「正在录音」。
- 待命只在前台可见时启动（Android 12+/14+ 限制）；切后台/锁屏后由 FGS + Rust 继续，JS 不参与采集。
- 采集参数：16k mono PCM16、100ms 一帧；服务写 `<files>/remote-mic/<session>.pcm`，Rust 每 20–50ms tail 新增字节，按 3200 字节组帧；停止时写 `<path>.stop`（原因），Rust 读后发 `mic.stop`。

## 5. 真实波形

- 手机 `voice-recorder.ts` 本来就按 chunk 算 RMS（`computeLevel`），现在随 `sendMicFrame` 一起把 0–1 电平传给 Rust；
- 手机 Rust 在发完二进制帧后附带 `mic.level {session, level: 0-100}`（约 8Hz）；
- 桌面 `desktop_server` 路由给 `mic_remote.on_level`（只在录音态生效），再 `evaluateJavaScript` 注入 HTML；
- HTML 用与手机端 `voice-waveform.tsx` 相同的画法：24 根柱子、历史右移、居中伸缩、50ms 采样，每根柱子带固定形状差异；没有数据 >700ms 时回落到静态底噪（不会僵死也不会假跳）。胶囊宽度 **520×60**，两行：第一行状态/计时，第二行原因或下一步；配色走「低对比深灰 + 淡绿」，失败态点变红/琥珀。

## 6. HUD 状态与文案

文案的**唯一来源**是 `mic_hud.rs › feedback()`（Rust 侧，原生 NSPanel 直接渲染）；旧 `shared/lib/mic-status-copy.ts` 只保留手机端/历史测试引用，不要把它当桌面 HUD 的事实来源。

| 状态 | 文案（标题 · 第二行） |
| --- | --- |
| `unavailable` + `no_phone` | 未连接手机麦克风 · 打开手机小跟班并保持连接；锁屏可开「后台待命」 |
| `unavailable` + `standby_off` | 手机没有开后台待命 · 手机上打开「后台待命」，或让手机留在小跟班页面 |
| `unavailable` + `notification_denied` | 手机没有通知权限 · 去系统设置允许通知 |
| `unavailable` + `service_failed` | 手机待命服务启动失败 · 重新打开 Sidekick 或重启手机 |
| `unavailable` + `multi_phone` | 检测到多台手机 · 只保留一台手机在待命 |
| `connecting` | 正在连接手机… · 快捷键已触发，等手机响应 |
| `stopping` / `cancelling` | 正在结束… / 正在取消… |
| `listening` | 正在听 · 再按一次结束 · Esc 取消 + 计时/波形 |
| `processing` | 识别中… · 说完的文字马上进当前窗口 |
| `failed` + `ack_timeout` | 手机没有响应 · 确认后台待命，或回小跟班页面再试 |
| `failed` + `start_timeout` | 手机没有开始录音 · 再按一次；仍无反应就看「后台待命」 |
| `failed` + `disconnected` | 连接断了 · Rust 会自动重连，稍后再按 |
| `delivered` / `copied` / `failed` | 已输入 / 已复制原因 / 具体失败原因 + 下一步 |
| `cancelled` | 已取消 · 这段录音不会转写 |

## 6.1 快捷键“时灵时不灵”的排查

- **先看手机通知还在不在**：如果「电脑遥控待命」消失，说明待命 FGS 被停了（旧实现一断 WS 就停；现在会保留并自动重连 3 分钟）。仍消失就重新打开 Sidekick，确认待命开关。
- **先看桌面 HUD**：`no_phone` = 没收到手机的 `mic.remote.status`（WS 断了/App 没连上）；`ack_timeout` = 手机没回；`start_timeout` = 手机答应了但没发 `mic.start`。这三类以前只写日志、界面完全没提示，现在都会停留 4.5 秒并给出下一步。
- **用「语音 › 键盘快捷键 › 测试键位」区分两件事**：点「开始测试」后按当前键位。10 秒内显示「电脑已收到按键」= 全局监听/键位没问题，问题在手机侧或连接；一直不出现 = 电脑没收到按键，按检查清单看「启用 / 辅助功能 / 安全输入 / 键位」。
- **安全输入**：密码框、部分密码管理器会打开 macOS Secure Input，全局监听收不到任何按键；设置卡会显示提示，关掉密码框再试。
- **简单切 App 不断 WS**，所以通常没问题；电脑重启、路由器切换、手机久置省电、OEM 杀进程才会断。
- **点一下手机录音又好了**：这会把 App 拉到前台，既触发待命重启，也可能把卡在 `connecting/listening` 的桌面状态机拉到 `idle`；不是玄学，是两个状态共同复位。
- 修复后：断线由 Rust 每 2s 重连并补发 status；后台不调用 WebView `emit`（避免冻结卡死重连任务），回前台补一条权威 `conn`；桌面 3s 没等到 `mic.start` 会回 idle，不会吞掉下一次快捷键。

## 7. 坑

- 全局监听依赖「辅助功能」；没授权时监听器装上但收不到事件，设置卡必须显示授权状态。「测试键位」只检测、不录音，是区分「快捷键没收到」与「手机没响应」的最短路径。
- 监听器 token 生命周期 = App，故意不释放；重复安装会双触发。
- 单键判定：同一次按住只算一次；按住期间按了别的键 → 这次不算点按（否则 ⌘C 会误触发）；普通单键带修饰键时不触发；过滤 `isARepeat`。
- HUD 不抢焦点、不自开 WS；否则插入退化成「只复制」或 `system.clients - 1` 多算一台手机。
- **HUD 迁移要迁移全部调用方**：D133 的 WebView HUD 后来被原生 NSPanel 取代时，`mic_hud::show` 被留成 no-op，但 `mic_remote` 的失败分支仍在调它——表现就是「按快捷键完全没反应」。改 HUD 后必须用「手机断开 + 按快捷键」走一遍所有错误分支，不能只看成功录音。
- 全屏 Space 下 always-on-top 窗口可能不显示（已知限制，待验收）。
- **待命 FGS 必须在前台启动**：不能在后台「即用即开」；`RemoteMicService` 只能由 App 前台时的 `remote_mic_standby_start` 拉起。后台收到 `mic.remote` 但待命没开时直接回 `standby_off`，不要让它等 2 秒 ack 超时。
- **通知权限是硬前提**：Android 13+ 拒绝通知时 FGS 通知不可见，等于偷偷开麦；`prepare` 必须拦住。通知 channel 用低重要度、`setOngoing(true)`、带「停止」动作（Android 12+ 有 action 会立即显示）。
- **后台 JS 会被冻结**：`mic.remote`、采集、帧发送都不能放在 WebView；Rust 接管后只碰文件/WS，不碰 `AppHandle` 的 WebView。
- **文件 tail 的帧边界**：服务写 raw PCM，Rust 自己组 100ms 帧；停止原因走 `<path>.stop`，不要只靠 `mic.stop` 到达顺序（通知栏「停止」不经过桌面）。
- **OEM 杀进程**：FGS 也挡不住所有国产 ROM；待命被系统杀了就回 `standby_off`/`service_failed`，不要假装能录。
