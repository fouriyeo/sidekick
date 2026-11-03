---
doc: engineering/audio-pipeline
title: 麦克风音频链路方案
status: active
updated: 2026-11-04
load: on-demand
owner: engineering
---

# 麦克风音频链路方案

> 目标：手机按住说话 → 局域网 → 桌面百炼云端转写 → 输入到当前应用。
> 状态：云端唯一链路已实现（2026-11-02）；真实百炼账号、Keychain、真机与用量统计验收待补。

## 1. 范围与非目标

**范围**

- 手机横屏采集 16kHz 单声道音频。
- 通过现有局域网 WS 通道发送到桌面。
- 桌面把音频实时转发给百炼 WebSocket，流式回显中间文本，松手后插入最终文本。
- 全链路状态回传手机与桌面浮窗；每次 usage 记入本地用量统计。

**非目标**

- 本机/离线转写（本机 whisper 已下线）。
- 多厂商云端 ASR、多语言、语音指令、按句追加输入（P1/P2）。
- 后台录音、录音历史、音频回放、音频落盘。
- 蓝牙传输（P2）。

## 2. 端到端流程

```text
手机麦克风
  → WebView getUserMedia，16kHz / mono / 2048 samples（约 128ms）PCM16
  → Tauri 命令 mic_frame（base64 PCM，Rust 组二进制帧）
  → WS 二进制帧（局域网，magic=SK01）
  → 桌面 axum 按 session 追加到内存缓冲
  → 会话开始时读 asr.json + Keychain；未配置/未同意/无 Key → mic.error
  → 百炼 WebSocket：run-task → task-started → 二进制 PCM → result-generated
  → mic.partial 50ms 节流回显手机/桌面
  → mic.stop(release/timeout) → finish-task → task-finished
  → 记 usage → 最终文本一次性落字（剪贴板 + Cmd+V / 仅复制）
  → mic.result 回传手机 + 桌面浮层
  → 用户在结果卡片点「回车/清空」→ key.request → 校验目标窗口/密码框/辅助功能
  → core-graphics 合成 Return 或 ⌘A+Delete → key.result 回传手机 + 桌面浮层
```

关键点：

- 音频不经过 WebView 的 `new WebSocket`（混合内容限制）；由 Rust 发送。
- 桌面服务不把音频广播给其它客户端；按 session 路由，且只在内存中。
- 音频只在内存；转写完成/失败/取消后立即丢弃；不写临时 WAV。
- 控制消息仍是 JSON；手机停止/取消有明确 `reason`，取消类不转写。
- 云端唯一：连接/鉴权/收尾失败直接报错，不切换引擎、不回退本机。

## 3. 采集方案

使用 WebView `getUserMedia` + `ScriptProcessor(2048)`，在 Realme/WebView 103 实测可用：

- 优先创建 `AudioContext({ sampleRate: 16000 })`；设备拒绝时回退默认采样率，并用连续线性重采样到 16k。
- 每块 PCM16 立即通过 `mic_frame` 交给 Rust，不在 JS 缓存整段；避免 base64 WAV 和临时文件。
- Tauri 移动端需要 `on_permission_request` 允许 `Microphone`；AndroidManifest 声明 `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS`。
- 首次使用前展示 3 行权限说明；拒绝后显示系统设置步骤，不重复弹系统框。

不采用 Kotlin AudioRecord 插件：当前采集稳定性、格式与 60 秒录音已满足 P0；若后续出现爆音/延迟问题再切换。

## 4. 音频格式

- 16kHz / 单声道 / 16bit / 小端。
- WebView 103 的 `ScriptProcessor` buffer 必须是 2 的幂；2048 samples ≈ 128ms，约 8 帧/秒。
- 局域网带宽约 32KB/s；10 秒语音约 320KB；不落盘。
- 转发百炼时去掉 `SK01` 28 字节头，只发 PCM16 payload；不重采样、不重编码。

## 5. 传输

- 使用现有 WS 通道，二进制帧；控制消息仍用 JSON。
- 协议细节见 [protocol-audio.md](./protocol-audio.md)；编码器/解析器在 `mic_protocol.rs`，手机 Rust 维护当前 session 与序列号。
- 桌面按 session 追加到内存缓冲；音频帧**绝不广播**。
- 同一时间只允许一个 active session；重复 start 返回 `mic.error(session_busy)`。
- 断线/取消/后台：立即丢弃缓冲并 abort 云端，不后台重连补发。
- 65 秒或 2.2MB 缓冲上限，超过丢弃；单帧上限 64KB。

## 6. 云端转写

- 桌面直连百炼 WebSocket（默认 `wss://dashscope.aliyuncs.com/api-ws/v1/inference`），模型默认 `qwen-audio-3.1-asr-flash-streaming`。
- 连接前读 `asr.json` + Keychain；未同意/地址或模型无效/无 Key 时直接回 `mic.error`，不建立会话。
- `run-task` 后，`task-started` 前把音频缓存在内存；收到后先补发，再实时转发。
- `result-generated` 的中间/最终句组装为可见文本，`mic.partial` 以 50ms 节流回显；最终文本仍由 `desktop_mic::insert_transcript` 统一落字。
- `task-finished` 的 usage 先记入 `asr_usage.json`，再插入；即使插入失败/空结果也计费。
- 失败：`mic.result(failed, cloud_*)` 或启动时 `mic.error`；不插入、不重试。
- Key 存 macOS Keychain；`asr.json` 0600 且不含 Key；未同意不上传。
- 完整方案、模型页与用量口径见 [asr-cloud-bailian.md](./asr-cloud-bailian.md) / [asr-model.md](./asr-model.md)。

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
- 备选：仅复制，用户手动粘贴。
- 不直接改目标控件值（兼容性差、可能破坏撤销）。
- **绝不自动发送 Return/Enter**；不调用任何“提交/发送”快捷键。只有用户在手机结果卡片主动点按「回车」时，才在最近一次插入的目标窗口里合成一次 Return（见 7.4）。
- 输入后系统撤销（⌘Z）应能撤回该段文本；不做自建撤销栈。
- 权限被拒/未授权：不阻塞录音与转写，只降级。
- 设置页提供“请求权限 / 打开系统设置 / 在 Finder 中显示当前程序 / 重新检测”。

### 7.3 手动按键（回车 / 清空）

- 入口：手机「已输入」结果卡片上的两个按钮；**只在 `outcome=inserted` 时出现**，仅复制/失败不显示。
- 「回车」：一次点按合成 Return（keycode 36）；「清空」：`⌘A` + 40ms + `Delete`，需点两次确认（第一次变「再点一次」，3 秒失效）。
- 安全闸门与自动粘贴一致并更严格：目标应用必须仍是插入时记录的前台应用；密码/安全输入拒绝；辅助功能未授权拒绝；非 macOS 不支持。
- 时效：插入后 30 秒内有效，成功一次即作废；全局 500ms 限频；只认发起该麦克风会话的连接。
- 错误只回错误码（`no_target` / `session_mismatch` / `target_mismatch` / `secure_input` / `accessibility_off` / `send_failed` / `rate_limited` / `unsupported_platform`），手机显示中文原因；不发送文本、不记录应用名。
- 「清空」对终端等非标准输入框可能不生效或只选中不删除；以 macOS 标准输入框为准，绝不因此回退成发送回车。

### 7.4 安全边界

- 不读取剪贴板历史；只写入本次转写。
- 不记录目标应用名称到日志；只记类别。
- 不在密码框、支付、密钥管理类应用中自动输入。
- 目标应用切换时宁可只复制，不冒险输错。

## 8. 延迟预算

| 阶段 | 预算（p95） | 说明 |
| --- | --- | --- |
| 按下 → 倾听视觉 | ≤100ms | UI 先反馈，不等权限/网络 |
| 采集分片 | 100ms | 100ms 一包 |
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
| 云端未配置/未同意/无 Key | 不建立会话；回 `mic.error` | “云端还没配置，去电脑「模型」页…” |
| 握手 401/403 | 不建立会话 | “Key 无效 / 没有权限” |
| 云端网络/超时/收尾失败 | 不插入；回失败 | “连不上百炼 / 响应超时” |
| 云端返回空文本 | 不插入；仍记 usage | “没听清，靠近一点。” |
| 辅助功能未授权 | 只复制 | “已复制；要自动输入请授权。” |
| 目标窗口变化 | 只复制 | “你切到了别的窗口，文字已复制。” |
| 密码框 | 只复制 | “当前是密码框，已复制。” |
| 目标无输入框 | 只复制 | “没找到输入框，已复制。” |
| 文本超长 | 截断到 2000 字 | “太长了，先输入前 2000 字。” |

## 10. 隐私与安全

- 原始音频只在内存；转写完成/失败/取消后立即释放。
- 不写临时文件、不做录音缓存、不做后台重试队列。
- 日志只记阶段、错误码、时长、tokens；不记音频、全文、剪贴板、目标应用名、API Key。
- 音频直达用户配置的百炼地域，不经 Sidekick 服务器；使用前必须在模型页勾选同意。
- Key 只存 Keychain；配置/用量文件 0600 且不含 Key。
- 录音时手机端始终有可见指示；App 后台立即停止。
- 当前局域网无鉴权/加密：仅可信网络；公共 Wi-Fi 明确警告；P1 做配对与加密。

## 11. 电量与热

- 单次最长 60 秒；后台停止；不做常驻录音。
- PCM16 32KB/s；10 次/分钟以内对电量影响可控。
- 波形用轻量 Canvas/CSS，不用 WebGL；只动 transform/opacity。
- 录音中降低宠物 idle 频率；避免同时跑重动画与音频编码。
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
- 延迟：5/10/30 秒语音各 20 次，记录 p50/p95。
- 稳定性：连续 20 次录音、60 秒长录音、录音中切后台/来电/断网。
- 输入安全：密码框、无输入框、目标窗口切换、全屏应用、终端/编辑器/浏览器。
- 隐私：应用目录无音频文件；抓包只连用户配置的百炼地址；无 Key/全文日志。
- 用量：每次返回 usage 的会话在模型页 +1；清空统计不影响配置。
- 电量：30 分钟混合使用掉电/温度。
- 详见 [quality.md](./quality.md)。

## 14. 开放式问题

- Opus/BLE 何时引入？当前 PCM16 已跑通。
- 自动粘贴对哪些 macOS 应用不兼容？需继续扩充真机矩阵。
- 桌面独立 always-on-top 浮窗是否值得从应用内浮层升级？
- AX 焦点是否可编辑输入框的检查（P1）如何覆盖终端/浏览器？
- 局域网配对/加密仍在 P1。

## 15. 实现状态（2026-11-02）

- 采集：WebView `getUserMedia` + `AudioContext(16000)` + `ScriptProcessor(2048)`；Realme/WebView 103 可用；Android 权限已配置。手机 UI 含波形、计时、上滑取消、50/60 秒、后台取消、权限说明。
- 协议：`mic.start` / `mic.ready` / `mic.stop` / `mic.partial` / `mic.result` / `mic.state` / `mic.error` + `SK01` PCM16 二进制帧；服务端单会话缓冲，音频不广播、不落盘。
- 识别：只走百炼 `qwen-audio-3.1-asr-flash-streaming`；`asr.json` + Keychain + `asr_cloud_*`；失败不回退本机。
- 用量：`asr_usage.json` 按本机日期汇总；`asr_usage_stats/clear`；金额按北京/新加坡价格估算。
- 输入：`arboard` 写剪贴板；`core-graphics` 合成 Cmd+V；未授权/目标变化/安全输入只复制；不自动发送回车。
- 手动按键：结果卡片「回车/清空」→ `key.request` → `desktop_keys` 安全闸门 → Return / ⌘A+Delete；30 秒时效、成功即作废、500ms 限频（2026-11-04）。
- 桌面：主导航「模型」页（AI 联动之后）配置百炼 + 查看用量；应用内语音浮层；剪贴板历史见 [clipboard-manager.md](./clipboard-manager.md)。
- 待验证：真实百炼账号/Keychain 授权/真机流式与失败路径、用量统计准确性、辅助功能自动粘贴、60 秒/断连、30 句准确率、结果卡片回车/清空的真机与焦点切换矩阵。
