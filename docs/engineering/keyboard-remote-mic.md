---
doc: engineering/keyboard-remote-mic
title: 键盘遥控录音（全局快捷键 → 手机麦克风）
status: active
updated: 2026-11-13
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

[手机] app.tsx → remote-mic.ts（控制器只在宠物页注册）
  ├─ 未注册 → ack{code:"not_pet_page"}
  ├─ 开关关/忙/没权限/音频被挡 → ack 对应错误码
  └─ 可以 → 复用既有录音流程（session 由手机生成）→ mic.start / 帧 / mic.stop(release)

[桌面] desktop_server 现有链路照旧（ASR → 剪贴板 → Cmd+V → 安全闸门 → 记账）
  └─ mic.start/stop/result/cancel 处回调 RemoteMic → HUD 状态
```

## 2. 消息（v1 追加）

| 方向 | 类型 | 字段 |
| --- | --- | --- |
| 桌面 → 手机 | `mic.remote` | `requestId`(≤64)、`action`: `start` / `stop` / `cancel`、`ts` |
| 手机 → 桌面 | `mic.remote.ack` | `requestId`、`action`、`ok`、`code`、`ts` |
| 手机 → 桌面 | `mic.remote.status` | `enabled`、`ts`（连上电脑 + 开关变化各一次） |

`code` ∈ `remote_disabled` / `not_pet_page` / `busy` / `permission_denied` / `audio_blocked` / `not_recording` / `disconnected` / `cancelled` / `mic_start` / `bad_request`。

- **`mic.remote` 只能由桌面后端发起**，`desktop_server` 不把任何 WS 输入映射成这条命令（当前无鉴权）。
- 桌面按 `client_id` 记住可遥控手机（`mic.remote.status`），断连即清；只在恰好 1 台时下发。
- 失败必须回 ack，不允许静默；桌面 2s 超时按 `ack_timeout` 处理。

## 3. 桌面实现

- `hotkey.rs`：`NSEvent::addGlobalMonitorForEventsMatchingMask` + `addLocalMonitor`（`FlagsChanged|KeyDown|KeyUp`），**本地 monitor 原样返回事件**；`Detector` 是纯逻辑（可单测）。绑定分两类：`Bare`（单键修饰键，按一下切换）、`Single`（任意普通键单键，需无修饰键）、`Combo`（修饰键 + 键，可按住）。配置 `~/.sidekick/hotkey.json`（0600，原子写）。
- `mic_remote.rs`：capable 注册表、单手机路由、ack 超时、phase（Idle/Connecting/Listening/Processing）、HUD 事件。
- `mic_hud.rs`：`mic-hud` 窗口（460×116，always-on-top、`focused(false)`、`accept_first_mouse(false)`、透明、主屏顶部居中），惰性创建、长期复用；`hide_later` 用 generation 防「新状态被旧的收起定时器关掉」。
- 命令：`hotkey_status` / `hotkey_save`（设置卡），事件：`hotkey-changed`、`mic-hud`。
- capability：`capabilities/mic-hud.json`（`core:default`），HUD 只 `listen`，不连 WS。

## 4. 手机实现

- `mic/remote-mic.ts`：控制器注册表 + `handleRemoteMicCommand`（收到命令 → 调控制器 → 必回 ack）。
- `mic-button.tsx`：`heldRef`（手指按住）与 `remoteRef`（键盘遥控）分开，`isCapturing()` 二者取或；`startRecording(event?)` 少传 event 即遥控路径，返回 `{ok, code}` 供 ack 使用；pointer 专属逻辑（capture/cancelZone/位移）只在 pointer 路径执行。
- `voice-recorder.ts`：`AudioContext.state !== "running"` 时抛 `AudioBlockedError`，上层回 `audio_blocked`（安卓自动播放策略，要求先有用户手势）。
- 设置：`更多 › 麦克风 › 电脑遥控录音`（`settings.remoteMic`，默认开）；连上电脑与开关变化时各发一次 `mic.remote.status`。

## 5. HUD 状态与文案

| 状态 | 文案（`shared/lib/mic-status-copy.ts › REMOTE_HUD_COPY`） |
| --- | --- |
| `unavailable` + `no_phone` | 未连接手机麦克风 · 让手机留在小跟班页面并保持亮屏 |
| `unavailable` + `multi_phone` | 检测到多台手机 · 只保留一台 |
| `connecting` | 正在连接手机… |
| `listening` | 正在听 · 计时（50 秒变黄） |
| `processing` | 识别中… |
| `delivered` / `copied` / `failed` | 已输入 / 已复制原因 / 失败原因（复用 `micReasonText`） |
| `cancelled` | 已取消（不转写） |

## 6. 坑

- 全局监听依赖「辅助功能」；没授权时监听器装上但收不到事件，设置卡必须显示授权状态。
- 监听器 token 生命周期 = App，故意不释放；重复安装会双触发。
- 单键判定：同一次按住只算一次；按住期间按了别的键 → 这次不算点按（否则 ⌘C 会误触发）；普通单键带修饰键时不触发；过滤 `isARepeat`。
- HUD 不抢焦点、不自开 WS；否则插入退化成「只复制」或 `system.clients - 1` 多算一台手机。
- 全屏 Space 下 always-on-top 窗口可能不显示（已知限制，待验收）。
