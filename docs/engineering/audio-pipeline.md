---
doc: engineering/audio-pipeline
title: 麦克风音频链路方案
status: active
updated: 2026-11-08
load: on-demand
owner: engineering
---

# 麦克风音频链路方案

> 这篇回答：手机按住说话 → 局域网 → 桌面百炼转写 → 输入到当前应用的端到端链路，以及 macOS 文本输入与安全边界。
> 不包含：消息字段与二进制帧（见 [protocol-audio.md](./protocol-audio.md)）、百炼会话/Key/错误码/用量口径（见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)）、产品规则与文案（见 [mic PRD](../prd/mic/PRD.md) / [SPEC](../prd/mic/SPEC.md)）。
> 状态：云端唯一链路已实现（2026-11-02）；真实百炼账号、真机与用量统计验收待补。

## 1. 范围与非目标

**范围**：手机采集 16kHz 单声道 → 现有局域网 WS 通道 → 桌面实时转发百炼 → 流式回显中间文本 → 松手后只插入最终文本；全链路状态回传手机与桌面浮层。

**非目标**：本机/离线转写（whisper 已下线）、多厂商云端 ASR、后台录音、录音历史/回放/落盘、蓝牙传输（P2）。

## 2. 端到端流程

```text
手机麦克风
  → WebView getUserMedia，16kHz / mono / 2048 samples（约 128ms）PCM16
  → Tauri 命令 mic_frame（base64 PCM，Rust 组二进制帧）
  → WS 二进制帧（局域网，magic=SK01）
  → 桌面 axum 按 session 追加到内存缓冲
  → 会话开始读 asr.json（含本地 Key）；未同意/未配置/无 Key → mic.error
  → 百炼 WebSocket：run-task → task-started → 二进制 PCM → result-generated
  → mic.partial 50ms 节流回显手机/桌面
  → mic.stop(release/timeout) → finish-task → task-finished
  → 记 usage → 最终文本一次性落字（剪贴板 + Cmd+V / 仅复制）
  → mic.result 回传手机 + 桌面浮层
  → 用户在结果卡片点「回车/清空」→ key.request → 校验目标窗口/密码框/辅助功能
  → core-graphics 合成 Return 或 ⌘A+Delete → key.result 回传手机 + 桌面浮层

异常兜底（两条都不转写、不插入）：
  桌面浮层点「取消录音」→ 本机 WS mic.cancel → 服务端 take active + abort 百炼
    → 广播 mic.state(cancelled) + mic.cancel(reason=desktop) → 手机停本地采集
  maxMs + 3s 没收到 mic.stop（手机卡死/停止消息丢失）→ 服务端看门狗 abort 百炼
    → 广播 mic.state(cancelled) + mic.cancel(reason=timeout)
```

关键点：

- 音频不经过 WebView 的 `new WebSocket`（混合内容限制），由 Rust 发送；桌面**不广播**音频，只在内存里按 session 路由。
- 音频在转写完成/失败/取消后立即丢弃，不写临时 WAV、不回退本机。
- 控制消息仍是 JSON；取消类 `mic.stop` 不转写。电脑端始终可以中断：浮层「取消录音」+ `maxMs + 3s` 看门狗，避免「桌面显示正在听但没有收尾」。
- 手机一次只允许一个启动中的会话（ref + lifecycle token）；启动中松手不会进入录音，桌面最多看到一个已取消的会话。
- 字段、状态机、超时、缓冲上限以 [protocol-audio.md](./protocol-audio.md) 为唯一事实源；云端会话细节见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)。

## 3. 采集方案

使用 WebView `getUserMedia` + `ScriptProcessor(2048)`，在 Realme/WebView 103 实测可用：

- 优先创建 `AudioContext({ sampleRate: 16000 })`；设备拒绝时回退默认采样率，并用连续线性重采样到 16k。
- 每块 PCM16 立即通过 `mic_frame` 交给 Rust，不在 JS 缓存整段；避免 base64 WAV 和临时文件。
- Tauri 移动端需要 `on_permission_request` 允许 `Microphone`；manifest 声明 `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS`。
- 首次使用前展示 3 行权限说明；拒绝后显示系统设置步骤，不重复弹系统框。

不采用 Kotlin `AudioRecord` 插件：当前采集稳定性、格式与 60 秒录音已满足 P0；若出现爆音/延迟问题再切换。

## 4. 音频格式

- 16kHz / 单声道 / 16bit / 小端。
- WebView 103 的 `ScriptProcessor` buffer 必须是 2 的幂；2048 samples ≈ 128ms，约 8 帧/秒。
- 局域网带宽约 32KB/s；10 秒语音约 320KB；不落盘。
- 转发百炼时去掉 `SK01` 28 字节头，只发 PCM16 payload；不重采样、不重编码。

## 5. 传输

- 复用现有 WS 通道：音频走二进制帧，控制消息走 JSON；编码器/解析器在 `mic_protocol.rs`。
- 音频帧只按 session 追加到内存缓冲，**绝不广播**；未知 session/非 owner 直接丢弃。
- 单会话约束、`mic.stop` 的 owner + session 校验、65 秒 / 2.2MB 缓冲上限、单帧 64KB 上限、看门狗取值，全部见 [protocol-audio.md](./protocol-audio.md)。

## 6. 云端转写

- 桌面直连百炼 WebSocket：模型与默认参数、`run-task`/`finish-task`、句子组装、错误码、usage 记账口径见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)。
- 本链路只负责三件事：`task-started` 前缓存、收到后补发并实时转发 PCM；把可见文本按 50ms 节流回显；收尾时调用统一落字 `desktop_mic::insert_transcript`。
- 未同意/地址或模型无效/无 Key → `mic.error`，不建立会话；失败不插入、不重试、不切换引擎。

## 7. 文本输入（macOS）

### 7.1 目标应用校验

1. 录音开始时记录前台应用（bundle id + display name）。
2. 插入前再次读取前台应用；bundle id 不一致 → 不自动输入，只复制。
3. `IsSecureEventInputEnabled()` 为真（密码框等）→ 只复制。
4. 辅助功能未授权 → 只复制，并提示在设置里授权。
5. 读取焦点 UI 元素是否为可编辑输入框为 P1；当前用前台应用 + 安全输入两道检查。
6. 以上任一不满足，桌面浮层显示“已复制”，手机显示原因。

### 7.2 输入方式

- 首选：辅助功能权限 + `arboard` 写剪贴板 + `core-graphics` 合成 `Cmd+V`（keycode 9 + Command）。
- 备选：仅复制，用户手动粘贴；不直接改目标控件值（兼容性差、可能破坏撤销）。
- **绝不自动发送 Return/Enter**；只有用户在手机结果卡片主动点按「回车」时，才在最近一次插入的目标窗口里合成一次 Return（见 7.3）。
- 输入后系统撤销（⌘Z）应能撤回该段文本；不做自建撤销栈。
- 权限被拒/未授权：不阻塞录音与转写，只降级。设置页提供“请求权限 / 打开系统设置 / 在 Finder 中显示当前程序 / 重新检测”。

### 7.3 手动按键（回车 / 清空）

- 入口：手机结果卡片左右的圆钮；**只在 `outcome=inserted` 时出现**，仅复制/失败不显示。
- 「回车」：一次点按合成 Return（keycode 36）；「清空」：`⌘A` + 40ms + `Delete`，需点两次确认（第一次变「再点一次」，3 秒失效）。
- 安全闸门与自动粘贴一致并更严格：目标应用必须仍是插入时记录的前台应用；密码/安全输入拒绝；辅助功能未授权拒绝；非 macOS 不支持。
- 时效：插入后 30 秒内有效，成功一次即作废；全局 500ms 限频；只认发起该麦克风会话的连接。
- 错误只回错误码（`no_target` / `session_mismatch` / `target_mismatch` / `secure_input` / `accessibility_off` / `send_failed` / `rate_limited` / `unsupported_platform`），手机显示中文原因；不发送文本、不记录应用名。
- 「清空」对终端等非标准输入框可能不生效或只选中不删除；以 macOS 标准输入框为准，绝不因此回退成发送回车。

### 7.4 安全边界

- 不读取剪贴板历史；只写入本次转写。不记录目标应用名称到日志，只记类别。
- 不在密码框、支付、密钥管理类应用中自动输入；目标应用切换时宁可只复制，不冒险输错。

## 8. 延迟预算

| 阶段 | 预算（p95） | 说明 |
| --- | --- | --- |
| 按下 → 倾听视觉 | ≤100ms | UI 先反馈，不等权限/网络；首次权限弹窗给“准备中” |
| 采集分片 | 100ms 级别 | 2048 samples ≈ 128ms 一包 |
| 局域网 RTT | ≤20ms | 同一 Wi-Fi，可信网络 |
| 云端首条 partial | ≤1.5s | 从开口算；含连接/补发 |
| 云端收尾 | ≤8s | `finish-task` 到 `task-finished` |
| 文本输入 | ≤150ms | 剪贴板 + Cmd+V |
| **松手 → 输入完成** | **≤3s** | 目标值；p50 ≤1.5s |

- 首次连接/权限弹窗不计入稳态延迟，但要有“准备中”反馈。
- 网络抖动时优先保证不丢整段；超过 2 秒积压就停止并提示，不静默失败。

## 9. 失败处理

| 失败 | 处理 | 用户看到 |
| --- | --- | --- |
| 手机麦克风权限拒绝 | 不采集；引导设置 | “需要麦克风权限…” |
| 录音中被其他应用占用 | 停止并丢弃 | “麦克风被其他应用占用。” |
| WS 断开 | 停止并丢弃 | “连接断了，这段没有发送。” |
| 云端未配置/未同意/无 Key | 不建立会话；回 `mic.error` | “云端还没配置，去电脑「语音」页…” |
| 写失败/握手/收尾失败 | 不插入；回失败码 | “连不上百炼 / 响应超时” |
| 云端返回空文本 | 不插入；仍记 usage | “没听清，靠近一点。” |
| 辅助功能未授权 / 目标窗口变化 / 密码框 / 无输入框 | 只复制 | “已复制…” + 原因 |
| 手机停止消息丢失/浮层卡住 | 看门狗或电脑端「取消录音」→ abort 云端、停手机采集 | “录音超时，已自动停止。”/“电脑端已取消录音。” |
| 文本超长 | 截断到 2000 字 | “太长了，先输入前 2000 字。” |

- 云端错误码全表与文案见 [asr-cloud-bailian.md](./asr-cloud-bailian.md) §11；手机端文案表见 [mic SPEC](../prd/mic/SPEC.md) §7。

## 10. 隐私与安全

- 原始音频只在内存；转写完成/失败/取消后立即释放；不写临时文件、不做录音缓存、不做后台重试队列。
- 日志只记阶段、错误码、时长、tokens；不记音频、全文、剪贴板、目标应用名、API Key。
- 音频直达用户配置的百炼地域，不经 Sidekick 服务器；使用前必须在「语音」一级页勾选同意。
- Key 与用量文件的存储口径见 [asr-cloud-bailian.md](./asr-cloud-bailian.md) §6；录音时手机端始终有可见指示，App 后台立即停止。
- 当前局域网无鉴权/加密：仅可信网络；公共 Wi-Fi 明确警告；P1 做配对与加密。

## 11. 电量与热

- 单次最长 60 秒、后台停止、不做常驻录音；PCM16 32KB/s，10 次/分钟以内对电量影响可控。
- 波形用轻量 Canvas/CSS，不用 WebGL，只动 transform/opacity；录音中降低宠物 idle 频率，避免同时跑重动画与音频编码。
- 真机测 30 分钟混合使用掉电与温度，写入 [quality.md](./quality.md)。

## 12. 权限矩阵

| 平台 | 权限 | 时机 | 拒绝后 |
| --- | --- | --- | --- |
| Android | `RECORD_AUDIO` | 首次按下前说明，再请求 | 引导系统设置；不能录音 |
| Android | `INTERNET` | 已有 | 无 |
| macOS | 辅助功能（自动输入） | 首次自动粘贴前说明 / 设置页请求 | 只复制；可重新授权并重新检测 |
| macOS | 麦克风 | 不需要（桌面不采集） | — |

不申请后台服务、通知、定位等无关权限。

## 13. 测试计划

- 30 句固定测试集：中文 15、代码术语 10、中英混说 5；安静/有风扇噪声各一遍。
- 延迟：5/10/30 秒语音各 20 次，记录 p50/p95。稳定性：连续 20 次录音、60 秒长录音、录音中切后台/来电/断网。
- 输入安全：密码框、无输入框、目标窗口切换、全屏应用、终端/编辑器/浏览器。
- 隐私：应用目录无音频文件；抓包只连用户配置的百炼地址；无 Key/全文日志。
- 电量：30 分钟混合使用掉电/温度。用例清单见 [quality.md](./quality.md) 与 [mic ACCEPTANCE](../prd/mic/ACCEPTANCE.md)。

## 14. 实现状态与未验证

- 已实现：采集（getUserMedia + 16k + `ScriptProcessor(2048)`）、`mic.*` + `SK01` 单会话缓冲（不广播、不落盘）、云端流式（`mic.partial` 50ms 节流）、断连/看门狗取消、`arboard` + `core-graphics` 落字、结果卡片「回车/清空」（2026-11-04）。
- 待验证：真实百炼账号、真机流式与失败路径、用量统计准确性、辅助功能自动粘贴、60 秒/断连、30 句准确率、手动按键的焦点切换矩阵。
- 未决问题（Opus/BLE、自动粘贴兼容矩阵、独立浮窗是否升级、AX 焦点检查、局域网配对/加密）统一记在 [engineering/INDEX.md](./INDEX.md)「未决技术问题」，本文不再重复。
