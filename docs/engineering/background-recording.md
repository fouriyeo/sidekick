---
doc: engineering/background-recording
title: 后台录音调研：锁屏/切后台继续录的可行方案
status: active
updated: 2026-11-15
load: on-demand
owner: engineering
children: []
related:
  - memo-pipeline.md
  - ../prd/memo/PRD.md
  - ../prd/mic/PRD.md
  - ../decisions.md
---

# 后台录音调研

> 结论先行：**「先在 App 里开录，再锁屏/切后台」可以做，业界标准做法是原生 `AudioRecord` + `microphone` 前台服务 + 常驻通知 + 分段落盘；「手机已经在后台/锁屏，再由电脑快捷键开麦」不能只加一个服务，Android 12+ 不允许从后台启动前台服务、14+ 对麦克风这类 while-in-use 类型更严，要做只能常驻「待命服务」并把采集/推流整体搬出 WebView。后者如果接受常驻通知与鉴权前提，可按 §6.2 做；建议先补配对鉴权。**
> 读者：产品 / 工程 / 测试。不包含：排期承诺（见 §9）、iOS 实现细节（后续单独评估）。

## 1. 先分清三个「后台」

| 场景 | 现在为什么停 | 系统允许继续吗 | 结论 |
| --- | --- | --- | --- |
| **A. 备忘录**：在 App 里点录音 → 锁屏 / 切到别的 App | `memo-recorder.ts` 在 `visibilitychange` 主动 `stop()`；WebView `getUserMedia` 在后台也会被系统掐掉 | 允许：在前台可见时启动 `microphone` 前台服务，之后可继续 | **可做，推荐先做** |
| **B. 键盘遥控 / 语音输入**：手机已锁屏或在后台，电脑按快捷键要开麦 | 手机不在宠物页 → `not_pet_page`；即便在，Android 14+ 也不允许从后台新建麦克风 FGS | 不允许「从后台新建」；只能预先常驻一个 FGS | **能做，但要常驻待命 + 通知；见 §6.2** |
| **C. Mac 端窗口隐藏 / 切到别的 App** | Sidekick 桌面端不采集麦克风；托盘常驻，HTTP/WS/UDP 继续跑（D88） | 允许 | **不是本次问题**；若以后桌面采集，见 §7 |

> 先确认你说的「电脑录音」是哪一种：如果是 B（用 Mac 快捷键、手机放一边），不是一个开关能解决的；如果是 A（备忘录录着录着锁屏），有成熟方案。

## 2. 现状与约束（代码事实）

- 备忘录：`app/src/mobile/features/memo/memo-recorder.ts` 用 `getUserMedia` + `ScriptProcessor`；`document.hidden` 时停止；`set_keep_screen_on` 只能保屏幕常亮，保不了后台。
- 语音输入：`mic-button.tsx` / `remote-mic.ts` 同样依赖 WebView 采集；PRD 明确「App 进入后台、锁屏、来电、失去麦克风焦点 → 立即停止并丢弃」（[mic PRD](../prd/mic/PRD.md) §3、MIC-AC-05）。
- 决策：D118 把「原生采集 + 前台服务 + 通知 + 电池白名单」列为 P1；[memo-pipeline.md](./memo-pipeline.md) §3.6 已预留 `MemoRecorderService`。
- 桌面：`mic_remote.rs` 只做遥控；`desktop_mic.rs` 是插入与辅助功能，不采集音频。
- Android 工程：`targetSdk 37`、`minSdk 24`；当前 manifest 有 `RECORD_AUDIO`，但没有前台服务、通知、WakeLock 权限。

## 3. 系统约束（Android，targetSdk 37）

| 约束 | 对本项目的影响 |
| --- | --- |
| `RECORD_AUDIO` 是 while-in-use 权限 | 后台采集必须有 `microphone` 类型的前台服务（FGS） |
| targetSdk 34+ 在 Android 14+ 必须声明 `android:foregroundServiceType="microphone"` + `FOREGROUND_SERVICE_MICROPHONE` | 清单要补；`startForeground()` 要传 `FOREGROUND_SERVICE_TYPE_MICROPHONE` |
| Android 12+ 不能从后台启动 FGS；Android 14+ while-in-use 类型连「从后台创建」都不行（豁免也不适用于麦克风） | 录音必须由用户在前台点按开始；后台直接开麦无解 |
| Android 15 的 FGS 时限只针对 `dataSync` / `mediaProcessing` | `microphone` 没有 6 小时上限；长会议可继续 |
| Android 16 起，FGS 里启动的 JobScheduler/WorkManager 任务受普通配额限制 | 转写重试不要依赖 WorkManager 在后台猛跑；用 Rust 单飞队列或用户可见的 FGS |
| Android 13+ 通知权限运行时授予；FGS 通知默认可被用户划掉 | 必须 `POST_NOTIFICATIONS`；`setOngoing(true)` 才不可划掉 |
| Android 12+ FGS 通知可能延迟约 10 秒；带操作按钮的通知会立即显示 | 通知加「停止」按钮，既合规也更好用 |
| Doze / OEM 省电 | FGS 不受普通后台限制，但 Doze 仍可能影响网络；小米/华为/OPPO/vivo/realme 还可能杀进程，需要白名单引导 |
| 麦克风可能被电话/其它 App 抢占 | `AudioRecord.read()` 出错或长时间 0 帧 → 停止并保存，不静默续录 |
| Google Play 前台服务政策 | 必须如实声明 `microphone` 类型；不能静默后台开麦 |

官方依据：[FGS 类型](https://developer.android.com/develop/background-work/services/fgs/service-types)、[后台启动限制](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)、[FGS 时限](https://developer.android.com/develop/background-work/services/fgs/timeout)、[FGS 变更](https://developer.android.com/develop/background-work/services/fgs/changes)、[前台服务总览](https://developer.android.com/develop/background-work/services/foreground-services)、[Google Play 设备与网络滥用政策](https://support.google.com/googleplay/android-developer/answer/9888379)。

## 4. 别的软件怎么做

| 产品 | 后台策略 | 用户可见性 | 备注 |
| --- | --- | --- | --- |
| Google Recorder | 锁屏继续录，单条最长 18 小时 | 「Currently recording」常驻通知 | [Pixel 官方帮助](https://support.google.com/pixelphone/answer/16267367)：屏幕休眠也继续录 |
| Apple Voice Memos | `UIBackgroundModes: audio` + 音频会话；锁屏继续 | 状态栏橙色麦克风点 | [AVAudioSession.record](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/record)；Apple DTS 明确「前台开始后可在后台持续录」 |
| 飞书妙记 | 手机端录音可缩成**应用内浮窗**，在飞书内继续操作 | 浮窗 | [官方帮助](https://www.feishu.cn/hc/zh-CN/articles/386045971891)只承诺飞书内浮窗，没有承诺 OS 级后台 |
| 讯飞听见 | 第三方介绍称「退到后台也能录」 | 通知/悬浮窗 | 官方帮助未明确写后台；实际依赖系统保活 |
| Otter.ai | 第三方评测称可后台；断网时本地续录、恢复后补传 | 通知 | 官方帮助未找到明确后台条款，按「宣称支持」看待 |
| Zoom / 火山 RTC / Agora RTC | 进后台前先启动 FGS，再继续采集 | 通话/会议通知 | [火山引擎 FAQ](https://docs.volcengine.com/docs/real-time-communication/android-integration-faq?lang=zh)、[Agora FAQ](https://docs.agora.io/en/api-reference/faq/quality/android_background) |
| React Native Audio API | FGS 与录音器绑定，划掉任务仍继续；通知暂停/停止；重挂载可接回 | 标准录音通知 | [更新日志](https://swmansion.com/changelog/react-native-audio-api-0-13-6/)（`androidFSStopWithTask: false`、consume-once） |

**共同点（也是 Sidekick 该抄的作业）：**

1. **必须在前台、由用户动作启动**，不接受后台静默开麦；
2. 采集放在**原生层**，不依赖 WebView/JS 常驻；
3. `microphone` 类型 FGS + **常驻通知**（计时、暂停/停止、点按回 App）；
4. 音频**先落盘/分片**，再上传或转写，进程被杀也能恢复；
5. 状态机可「重新接回」正在进行的录音（Activity 重建、划掉任务、回前台）；
6. 对 OEM 省电做白名单引导，但不假设一定能活。

## 5. 推荐方案：备忘录后台录音（场景 A）

先看路线对比：

| 路线 | 能做到什么 | 代价 | 结论 |
| --- | --- | --- | --- |
| **A. 原生 `AudioRecord` + `microphone` FGS** | 锁屏/切后台/划掉任务都能继续；PCM 可直接进现有 WAV/ASR 管道 | 新增 Kotlin 服务与插件；通知/权限/OEM 适配 | **推荐** |
| B. `MediaRecorder` 录 AAC + FGS | 体积约降到 1/10 | 现有管道吃 PCM16，需解码；电平/分段/恢复都要另写 | 二期压缩时再评估 |
| C. 保持 WebView，只保屏幕常亮 | 不改架构 | 切后台/锁屏必停，不是后台方案 | 不可行 |
| D. 待命 FGS + 原生语音输入（场景 B） | 手机锁屏也能被电脑唤起开麦 | 常驻通知/耗电/信任成本 + 重做整条语音输入 | 可选（用户 2026-11-15 要求）；待确认常驻通知与鉴权 |

### 5.1 目标行为

- 前台点「录音」→ 立即启动 FGS + 通知；锁屏、切 App、按 Home 都**继续录**。
- 主要服务 C 双模里的「轻点锁定」：按住说话仍然松手即停；锁定后锁屏/切后台才继续。
- 通知显示计时与「停止」，点通知回到备忘录页；回 App 自动显示「录音中」并接回。
- 2 小时自动停止并保存；来电/麦克风被抢占 → 停止、保存、回来提示原因。
- 划掉任务/进程被杀 → 已写入部分可恢复；**绝不静默开始录音**。
- 录音期间系统麦克风指示（绿点）与通知始终可见；通知权限被拒时不允许进入后台模式。

### 5.2 架构

```text
React 备忘录页
  │ invoke memo_recording_start / stop / status
  ▼
Rust memo::mobile（命令层）
  │ PluginHandle.run_mobile_plugin("start"/"stop"/"status")
  ▼
Kotlin MemoRecorderPlugin
  │ startForegroundService(ACTION_START)
  ▼
MemoRecorderService（FGS, type=microphone）
  ├─ AudioRecord 16k mono PCM16（VOICE_RECOGNITION，失败回退 MIC）
  ├─ 写 <tmp>/<id>.part（44 字节 WAV 头 + PCM，每 5s 回填长度）
  ├─ recording.json（id / startedAt / bytes / state，原子写）
  ├─ PARTIAL_WAKE_LOCK（录音期间）
  └─ 常驻通知：计时 / 停止 / 点按回 App
  ▼ 停止
Rust memo_recording_finish
  ├─ repair WAV 头 → rename 到 audio/<id>.wav
  ├─ sha256、插 memos 行、kick 现有转写/结构化/同步管道
  └─ 通知消失
```

### 5.3 关键实现点

- **采集放 Kotlin**：`AudioRecord` 读循环 + `FileOutputStream` 追加；不要每 1 秒经 JS 回传 PCM（后台 WebView 会被节流/销毁）。
- **复用现有 WAV/恢复逻辑**：Kotlin 按 `WavWriter::create` 的 44 字节头写；停止/崩溃后 Rust `wav::repair()` 回填长度即可，`recording.json` 沿用现有 `recover()` 思路。
- **Rust 不长期持有文件句柄**：`memo_recording_start` 生成 id/path，Kotlin 独占写；`finish` 时 Rust 再打开、修复、入库。
- **Tauri 插件先例**：`MicProbePlugin.kt` 已经走「`app/src-tauri/mobile/android/` 入库 → `scripts/patch-android-manifest.mjs` 同步到 `gen/` → `register_android_plugin`」这条路，后台服务照抄，不要直接改 `gen/`。
- **版本分支**：`minSdk 24`，`startForeground(id, notification)` 与带 type 的 `ServiceCompat.startForeground(...)` 要按 API 29/30/34 分支。
- **通知**：`setOngoing(true)`、`setOnlyAlertOnce(true)`、`setShowWhen(false)`、`chronometer`；加「停止」`PendingIntent`；channel 用低打扰但可听见的「录音」类别。
- **失败处理**：`AudioRecord` 初始化失败（采样率不支持/麦克风被占）→ 回退 44.1k/48k + 重采样，或明确失败并提示；读循环连续 0 帧 > 2s → 停止保存。

### 5.4 权限与清单

```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />

<service
  android:name=".MemoRecorderService"
  android:exported="false"
  android:foregroundServiceType="microphone"
  android:stopWithTask="false" />
```

- `POST_NOTIFICATIONS` 在 Android 13+ 运行时请求；拒绝时只允许前台录音，并给出「后台录音需要通知权限」的明确文案。
- 不要申请 `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 的弹窗作为默认路径（Play 审核敏感）；改为跳系统电池优化页 + OEM 自启页的引导。
- realme/OPPO 官方口径：允许自启动、允许关联启动、允许完全后台行为、后台锁定应用；小米/华为/三星同类入口不同，做一张机型引导表即可。

### 5.5 改动清单（文件级）

| 文件 | 改动 |
| --- | --- |
| `app/src-tauri/mobile/android/MemoRecorderPlugin.kt` | 新增：命令 `start/stop/status/cancel`，启动/绑定服务 |
| `app/src-tauri/mobile/android/MemoRecorderService.kt` | 新增：FGS、AudioRecord、WAV、通知、WakeLock、marker |
| `scripts/patch-android-manifest.mjs` | 同步两个 Kotlin 文件；注入权限与 `<service>` |
| `app/src-tauri/src/memo/mobile/recording.rs` | 原生会话分支：start 交给插件、finish/recover 读取原生文件 |
| `app/src-tauri/src/memo/mobile/mod.rs` | 命令改为 async/插件调用；保留 iOS/旧路径回退 |
| `app/src/mobile/features/memo/memo-recorder.ts` | Android 不再 `getUserMedia`；改为原生 start/stop/status + 电平事件；移除 `visibilitychange` 停止 |
| `app/src/mobile/features/memo/*` | 录音条/页面接「后台录音中」状态与通知解释文案 |
| `docs/prd/memo/{PRD,SPEC,ACCEPTANCE}.md` | 改写 M-02/M-03、M-02b；补通知与恢复验收 |
| `docs/engineering/memo-pipeline.md` | §3.6 指向本文，修正「只替换采集层」的说法 |

### 5.6 不需要改的

转写/结构化管道、SQLite schema、局域网镜像、`mic.*` 语音输入协议、桌面端。后台录音只替换「采集 + 落盘」，后面的 5 分钟分段与同步照旧。

### 5.7 产品规则要跟着改

- 录音中锁屏/切后台：**不再停止并保存**，改为「继续录；通知可停止」。
- 录音中离开备忘录页/按返回：**不再自动停**，给一次「录音在后台继续」的提示；停止只走页面按钮/通知。
- 屏幕常亮不再用于备忘录录音（省电），只保留宠物页的常亮。
- 隐私口径不变：必须用户点按开始、系统麦克风指示可见、通知可见、不静默开录、不后台排队重发。
- 2 小时上限与 115MB/h 仍是 D118 的临时值；后台长会议可能不够，是否放宽到 3–4 小时或按剩余存储动态停，列入待定。

## 6. 场景 B（键盘遥控/语音输入）：限制与可行方案

用户 2026-11-15 明确要的是：**手机切到别的 App/锁屏后，Mac 按快捷键仍能让手机开麦，并把声音传回电脑。** 结论：能做，但不能「零通知」。

### 6.1 硬约束

1. **系统层不允许即用即开**：手机锁屏/在后台时，Android 12+ 不能从后台启动 FGS，Android 14+ 更不允许创建 `microphone` 类型 FGS；没有「收到快捷键就新建麦克风服务」的合法路径。
2. **只能预启动**：必须在前台、用户可见时先把一个 `microphone` 类型 FGS 挂起来（待命），之后才能在后台开录。FGS 必然带常驻通知，无法隐藏。
3. **后台 JS 会被冻结**：现有 `mic.remote` 处理、`getUserMedia` 采集、PCM 推流都在 WebView/JS 侧；必须搬到 Rust/原生，否则切后台就断。
4. **放大现有安全风险**：当前 WS 无鉴权；待命模式等于把「同网段可触发开麦」的能力长期化。正式做之前建议先补配对/鉴权，或至少只在可信网络启用并在设置里明示。

### 6.2 可行方案：待命 FGS + 原生采集

```text
Mac 快捷键
  → 桌面 RemoteMic → WS mic.remote
  → 手机 Rust mobile_client（不再 emit 给 JS）
      → RemoteMicService（待命 FGS, type=microphone）
          ├─ 待命：只挂通知，不碰麦克风
          └─ 开录：AudioRecord 16k mono → remote-mic/<session>.pcm
      → Rust 读线程每 20–50ms 读新增字节 → 100ms 一帧
      → 现有 mic.start + SK01 帧 + mic.stop
  → 桌面 ASR / 插入 / 记账（完全不变）
```

流程：

1. 手机前台、已连电脑、用户打开「后台待命」→ 启动 FGS，通知「电脑遥控待命」；此时不申请麦克风、不亮绿点。
2. Mac 按快捷键 → 桌面发 `mic.remote.start` → 手机 Rust 让服务开 `AudioRecord`，通知切「正在录音 00:12」，拿 partial wake lock。
3. Rust 把 PCM 按 100ms 组帧发给桌面；桌面 HUD 波形、ASR、插入照旧。
4. 松开/再按/60 秒/Esc → 停录、关文件、通知回待命；语音输入仍不落历史，文件删除。
5. 断开电脑/关闭待命/进程被杀 → 停待命；下次打开 App 且连上电脑时再启动。

关键实现：

- **采集到 Rust 走文件 tail（推荐）**：服务写 `remote-mic/<session>.pcm`，Rust 轮询读新增字节；无 JNI、无 socket，延迟约 50–100ms，够 ASR 用。若嫌延迟高，再换 127.0.0.1 TCP。
- **Rust 接管遥控**：`mobile_client` 读到 `mic.remote` 先交给新的 `mobile_remote_mic`，不再 `emit` 给 JS；复用现有 `mic_start` / `mic_frame` / `mic_stop` 和 `mic.remote.ack`。
- **协议小改**：`mic.remote.status` 加 `standby`；ack 加 `standby_off` / `notification_denied` / `service_failed`；桌面 HUD 区分「手机待命未开」。
- **权限**：首次开启待命时请求 `RECORD_AUDIO` + `POST_NOTIFICATIONS`；任一被拒就不能开待命，并给明确引导。
- **通知**：待命/录音两态；`setOngoing(true)`；「停止」动作；点按回 App。通知权限被拒时 FGS 通知不可见，等于偷偷开麦，必须禁止。
- **设置**：新增「后台待命（常驻通知）」开关，默认关；与现有「电脑遥控录音」分开，避免所有人被迫常驻通知。

### 6.3 代价与前提

- **常驻通知**：待命期间通知栏一直有一条；录音时变成「正在录音」。这是 Android 的硬要求，不是实现偷懒。
- **耗电**：待命不碰麦克风，耗电很低；录音时才有 AudioRecord + 文件写 + wake lock，60 秒上限，影响可控。
- **OEM**：国产 ROM 仍要自启动/电池白名单；锁屏、划掉任务、长时间待机存活要真机验证。
- **安全**：无鉴权的待命服务风险高；建议先做配对/鉴权，或把待命限制为「仅可信 Wi-Fi + 手动开启」。
- **产品原则**：mic PRD 的「无后台」要被改成「可选后台待命，默认关，通知可见」；这是产品决策，不只是技术改动。
- **工作量**：spike 2–3 天（真机：切后台/锁屏 + Mac 按键 + 音频到 Mac + 60 秒 + 来电）；MVP 1.5–2 周；打磨 3–5 天。

### 6.4 不接受的替代

- 保持现状：手机留在小跟班页面 + 亮屏；HUD 已写「让手机留在小跟班页面并保持亮屏」。
- 手机上的大按钮点一下开始，再锁屏（属于场景 A 的能力），但语音输入是 60 秒短会话，收益有限。
- 如果只是想在电脑前随时说，可评估「桌面直接用 Mac 麦克风采集」；那是另一条产品路径，不用手机待命。

> 建议顺序：先补配对/鉴权 → 2–3 天 spike 验证待命/锁屏/音频链路 → 再决定是否做完整版；不要和备忘录后台录音混在一个迭代里。

## 7. 桌面端（macOS）备注

- 现在桌面端不采集麦克风；窗口隐藏后托盘、HTTP/WS/UDP、DSH hook 都继续跑（D88），不需要「后台录音」改造。
- 若以后桌面端要采集：用原生音频（cpal/AVAudioEngine），不要用 WebView `getUserMedia`；macOS App Nap 会节流后台 JS，已有人踩过「全局快捷键触发的 `getUserMedia` 排到回前台才执行」的坑（[案例](https://github.com/epicenter-so/epicenter/blob/f6b0ca51acfab6f2234a53fb3fe50b472c249927/docs/articles/stop-using-navigator-api-for-desktop-recording.md)）。
- 长时间录音/转写用 Rust 线程或原生 API，不依赖 JS 定时器；必要时用 `NSProcessInfo` activity / `IOPMAssertion` 防休眠。

## 8. iOS（以后）

- `Info.plist` 加 `UIBackgroundModes: audio`；`AVAudioSession` 用 `.record` 或 `.playAndRecord`；必须前台开始，锁屏后靠音频会话继续，状态栏橙色指示可见。
- `beginBackgroundTask` 只有约 30 秒，不能当长录音方案。
- App Review 可能质疑「后台 audio 是否核心功能」；Voice Memos 类应用有先例，但仍需在审核说明里写清用途。
- 等 Android 方案稳定后再做，别两端同时开。

## 9. 工作量与排期（1 人估算）

| 阶段 | 内容 | 估算 |
| --- | --- | --- |
| Spike | Kotlin FGS + AudioRecord 写 WAV；真机锁屏 30/60 分钟；通知/权限/杀进程 | 1–2 天 |
| MVP | 插件 + Rust 接入 + JS 改造 + 恢复 + 通知 + 权限引导 + 单测 | 4–6 天 |
| 打磨 | 来电/拔耳机/低电/存储不足、OEM 引导、电量温升测量、真机矩阵 | 2–3 天 |
| 合计 | 可验收的备忘录后台录音 | **约 1.5–2 周** |
| 场景 B | 待命 FGS + 采集/推流搬 Rust + 重做语音输入状态机 | 另加 2–3 周，可单独迭代 |

## 10. 验收与风险

**验收（真机，至少覆盖 RMX3370 / Android 13 与一台 Android 15/16 机型）：**

| 用例 | 通过标准 |
| --- | --- |
| 锁屏 30/60/120 分钟 | 音频时长与墙钟误差 < 1s；回放无长段静音；转写成功 |
| 切到其它 App / 按 Home | 继续录；通知仍在；回 App 自动接回「录音中」 |
| 通知「停止」 | 立即停、保存、通知消失；回 App 列表出现条目 |
| 划掉任务 / 杀进程 | 重启后能恢复已写部分；不产生重复条目 |
| 来电 / 麦克风被占 | 停止并保存；回来提示原因；不自动续录 |
| 通知权限拒绝 | 不进入后台模式，给出明确引导；不静默录 |
| 耳机拔出/蓝牙切换 | 不崩溃；音频路由变化后仍可继续或明确停止 |
| 存储不足 | 提前停止并保存；不写坏 WAV |
| OEM 白名单 | realme/OPPO 按官方入口设置后 2 小时不掉；未设置时给出预期说明 |
| 电量/温升 | 记录 %/h 与温度曲线；先定预算再验收，不拍脑袋写数字 |

**主要风险：**

- **OEM 杀进程**：标准 FGS 也挡不住所有厂商；只能降低概率 + 恢复已录部分，不能承诺 100%。
- **通知权限**：用户拒绝后后台录音不可见；必须阻止进入后台模式，否则违反信任与 Play 政策。
- **Tauri/Service 生命周期**：Activity 销毁但 Service 存活时，不要让 Service 依赖 `AppHandle`/WebView；Service 只碰文件和通知，Rust 在回前台时导入。
- **采样率/音源差异**：`VOICE_RECOGNITION` 与 WebView 的 AGC/NS 处理不同，ASR 准确率要 A/B；不支持 16k 的机型要回退重采样。
- **体积**：PCM 115MB/h，2 小时 230MB；后台长录更容易撞存储，先加剩余空间闸门。
- **产品语义**：锁屏继续录会让「按返回=停」的旧习惯失效；需要一次性提示与通知入口，否则用户会以为没停。

## 11. 参考

- Android：[FGS 类型](https://developer.android.com/develop/background-work/services/fgs/service-types) · [后台启动限制](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start) · [FGS 时限](https://developer.android.com/develop/background-work/services/fgs/timeout) · [FGS 变更](https://developer.android.com/develop/background-work/services/fgs/changes) · [前台服务总览](https://developer.android.com/develop/background-work/services/foreground-services) · [Google Play 政策](https://support.google.com/googleplay/android-developer/answer/9888379)
- 同类产品：[Pixel Recorder](https://support.google.com/pixelphone/answer/16267367) · [Apple AVAudioSession.record](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/record) · [Apple DTS 后台录音答复](https://developer.apple.com/forums/thread/776949) · [飞书妙记](https://www.feishu.cn/hc/zh-CN/articles/386045971891) · [讯飞听见 FAQ](https://www.iflyrec.com/zhuanxie/64d59281.html) · [火山引擎 RTC FAQ](https://docs.volcengine.com/docs/real-time-communication/android-integration-faq?lang=zh) · [Agora FAQ](https://docs.agora.io/en/api-reference/faq/quality/android_background)
- 工程参考：[Tauri 移动插件](https://v2.tauri.app/develop/plugins/develop-mobile/) · [社区 Tauri 后台录音插件](https://github.com/HMUysal/tauri-plugin-audio-recorder-android)（0.1.x，成熟度未验证，建议自建） · [React Native Audio API 录音通知](https://github.com/software-mansion/react-native-audio-api) · [macOS App Nap 与 WebView 录音](https://github.com/epicenter-so/epicenter/blob/f6b0ca51acfab6f2234a53fb3fe50b472c249927/docs/articles/stop-using-navigator-api-for-desktop-recording.md)
- 本仓库：[memo-pipeline.md](./memo-pipeline.md) · [memo PRD](../prd/memo/PRD.md) · [mic PRD](../prd/mic/PRD.md) · [keyboard-remote-mic.md](./keyboard-remote-mic.md) · [decisions.md](../decisions.md)（D118）
