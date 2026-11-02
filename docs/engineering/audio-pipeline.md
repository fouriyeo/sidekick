---
doc: engineering/audio-pipeline
title: 麦克风音频链路方案
status: active
updated: 2026-11-02
load: on-demand
owner: engineering
---

# 麦克风音频链路方案

> 目标：手机按住说话 → 局域网 → 桌面转写（本机或百炼云端）→ 输入到当前应用。
> 状态：本机 P0 已实现（2026-10-31）；百炼云端流式识别已实现（2026-11-02），真实账号/真机验收待补。

## 1. 范围与非目标

**范围**

- 手机横屏采集 16kHz 单声道音频。
- 通过现有局域网 WS 通道发送到桌面。
- 桌面转写：默认本机 whisper；可选百炼云端流式识别（显式开启）。
- 桌面把文本输入到当前焦点应用；失败时复制。
- 全链路状态回传手机与桌面浮窗。

**非目标**

- 系统级虚拟麦克风（会议/录音软件）。
- 后台录音、录音历史、音频回放。
- 多厂商云端 ASR、强制云转写、多语言、语音指令（P1/P2）。
- 蓝牙传输（P2）。

## 2. 端到端流程

```text
手机麦克风
  → WebView getUserMedia，16kHz / mono / 2048 samples（约 128ms）PCM16
  → Tauri 命令 mic_frame（base64 PCM，Rust 组二进制帧）
  → WS 二进制帧（局域网，magic=SK01）
  → 桌面 axum 按 session 追加到内存缓冲（不广播）
  → 引擎路由：本机 whisper 或 百炼 WebSocket（流式）
  → 本机：mic.stop 后内存转写；云端：音频实时转发 + mic.partial 回显
  → mic.stop(release/timeout) → 最终文本一次性落字
  → CGEvent Cmd+V / 仅复制
  → mic.result 回传手机 + 桌面应用内浮层
```

关键点：

- 音频不经过 WebView 的 `new WebSocket`（混合内容限制）；由 Rust 发送。
- 桌面服务不把音频广播给其它客户端；按 session 路由，`mic.stop` 后才落字。
- 音频只在内存；本机转写完成/失败/取消后立即丢弃；云端只在用户显式启用并同意时上传，不写临时 WAV。
- 控制消息仍是 JSON；手机停止/取消有明确 `reason`，取消类不转写。

## 3. 采集方案（已选定）

使用 WebView `getUserMedia` + `ScriptProcessor(2048)`，在 Realme/WebView 103 实测可用：

- 优先创建 `AudioContext({ sampleRate: 16000 })`；设备拒绝时回退默认采样率，并用连续线性重采样到 16k。
- 每块 PCM16 立即通过 `mic_frame` 交给 Rust，不在 JS 缓存整段；避免 base64 WAV 和临时文件。
- Tauri 移动端需要 `on_permission_request` 允许 `Microphone`；AndroidManifest 声明 `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS`。
- 首次使用前展示 3 行权限说明；拒绝后显示系统设置步骤，不重复弹系统框。

不采用 Kotlin AudioRecord 插件：当前采集稳定性、格式与 60 秒录音已满足 P0；若后续出现爆音/延迟问题再切换。

## 4. 音频格式

### P0 实现：PCM16

- 16kHz / 单声道 / 16bit / 小端。
- WebView 103 的 `ScriptProcessor` buffer 必须是 2 的幂；2048 samples ≈ 128ms，约 8 帧/秒。
- 局域网带宽约 32KB/s；10 秒语音约 320KB；不落盘。
- 优点：无需编解码依赖；调试简单；延迟低。
- 缺点：带宽/电量比 Opus 高；后续可换。

### P1：Opus

- 24–32kbps VBR；20ms 帧；需编码器与容器/解码依赖。
- 只有在带宽/电量成为问题时再引入；需走依赖审批。

## 5. 传输（已实现）

- 使用现有 WS 通道，新增二进制帧；控制消息仍用 JSON。
- 协议细节见 [protocol-audio.md](./protocol-audio.md)；编码器/解析器在 `mic_protocol.rs`，手机 Rust 维护当前 session 与序列号。
- 桌面端按 session 追加到内存缓冲；音频帧**绝不广播**。
- 同一时间只允许一个 active session；重复 start 返回 `mic.error`。
- 断线/取消/后台：立即丢弃缓冲，不后台重连补发。
- 65 秒或 2.2MB 缓冲上限，超过丢弃；单帧上限 64KB。

## 6. 引擎路由与转写

### 6.1 路由

- 会话开始时读取 `asr.json` 快照：`engine=local|bailian`；云端未配置/未同意且本机可用时直接走本机。
- 本机：PCM 全部缓冲，`mic.stop` 后 whisper 转写；云端：音频帧同时进入桌面缓冲（供回退）并转发给百炼，中间结果通过 `mic.partial` 回显。
- 云端失败/空结果：若 `fallbackToLocal` 且本机模型可用，用同一份 PCM 跑本机；结果 `engine=local`、`fallback=true`，只插入一次。
- 云端配置、Keychain、协议细节见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)；协议字段见 [protocol-audio.md](./protocol-audio.md)。

### 6.2 本机（已选定 whisper-rs）

- 使用 whisper-rs 0.16 / whisper.cpp + Metal，在桌面进程内转写；模型加载缓存并启动时 prewarm。
- 模型可选 tiny/base/small/medium，下载、存储、切换见 [asr-model.md](./asr-model.md)。
- 默认中文（`language=zh`）+ 简体 prompt；文本换行替换为空格，最多 2000 字。
- 10 秒语音在 base 模型上实测约 0.2–0.3s（模型已加载）；首次加载通过 prewarm 隐藏。
- 原始音频不写文件；模型文件本身除外。
- macOS Speech 未采用：命令行访问受 TCC 限制，且准确率/模型可控性不如 whisper.cpp。

### 6.3 百炼云端（可选）

- 桌面直连百炼 WebSocket，模型默认 `qwen-audio-3.1-asr-flash-streaming`；手机不直连、不持 Key。
- 连接后 `run-task`，收到 `task-started` 前缓存音频，之后补发并实时转发；`result-generated` 的中间/最终句组装为可见文本。
- `mic.partial` 以 50ms 节流回显；最终文本仍由 `desktop_mic::insert_transcript` 统一落字。
- Key 存 macOS Keychain；`asr.json` 0600 且不含 Key；未同意不上传。
- 完整方案、错误码与验收见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)。

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
- **绝不发送 Return/Enter**；不调用任何“提交/发送”快捷键。
- 输入后系统撤销（⌘Z）应能撤回该段文本；不做自建撤销栈。
- 权限被拒/未授权：不阻塞录音与转写，只降级。
- 设置页提供“请求权限 / 打开系统设置 / 在 Finder 中显示当前程序 / 重新检测”；macOS 不允许程序自行授权，必须用户勾选一次。

### 7.3 安全边界

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
| 停止 → 解码/拼接 | ≤50ms | PCM16 无需解码 |
| ASR（10 秒语音） | ≤2s | 本机，模型已就绪 |
| 云端首条 partial | ≤1.5s | 从开口算；含连接/补发 |
| 云端收尾 | ≤8s | `finish-task` 到 `task-finished` |
| 文本输入 | ≤150ms | 剪贴板 + Cmd+V |
| **松手 → 输入完成** | **≤3s** | 目标值；p50 ≤1.5s |

- 首次模型加载/权限弹窗不计入稳态延迟，但要有“准备中”反馈。
- 网络抖动时优先保证不丢整段；超过 2 秒积压就停止并提示，不静默失败。

## 9. 失败处理

| 失败 | 处理 | 用户看到 |
| --- | --- | --- |
| 手机麦克风权限拒绝 | 不采集；引导设置 | “需要麦克风权限…” |
| 录音中被其他应用占用 | 停止并丢弃 | “麦克风被其他应用占用。” |
| WS 断开 | 停止并丢弃 | “连接断了，这段没有发送。” |
| 桌面转写超时 10s | 丢弃，回到 idle | “电脑端没回应，再说一次？” |
| ASR 返回空 | 不输入 | “没听清，靠近一点。” |
| 云端未配置/未同意 | 不静默上传；有本机则本机 | “云端还没配置…” |
| 云端握手/网络/收尾失败 | 有本机则回退；否则失败 | “云端不可用，已用本机转写。”/“连不上百炼” |
| 云端 Keychain 读取失败 | 不落明文；提示重存 | “读取不到密钥，去设置重新保存。” |
| 辅助功能未授权 | 只复制 | “已复制；要自动输入请授权。” |
| 目标窗口变化 | 只复制 | “你切到了别的窗口，文字已复制。” |
| 密码框 | 只复制 | “当前是密码框，已复制。” |
| 目标无输入框 | 只复制 | “没找到输入框，已复制。” |
| 文本超长 | 截断到 2000 字 | “太长了，先输入前 2000 字。” |

## 10. 隐私与安全

- 原始音频只在内存；转写完成/失败/取消后立即释放。
- 不写临时文件、不做录音缓存、不做后台重试队列。
- 日志只记阶段、错误码、时长；不记音频、全文、剪贴板、目标应用名、API Key。
- 云端为显式可选：设置页需勾选同意；音频直达用户配置的百炼地域，不经 Sidekick 服务器；Key 只存 Keychain。
- 录音时手机端始终有可见指示；App 后台立即停止。
- 当前局域网无鉴权/加密：仅可信网络；公共 Wi-Fi 明确警告；P1 做配对与加密。
- ASR 模型/运行时/编解码依赖按 [dependency-policy.md](../dependency-policy.md) 审核，记录决策。

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
- 隐私：默认本机时检查应用目录无音频文件、抓包无云端上传；云端开启时确认只连用户配置的百炼地址、无 Key/全文日志。
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
- 协议：`mic.start` / `mic.ready` / `mic.stop` / `mic.result` / `mic.state` / `mic.error` + `SK01` PCM16 二进制帧；服务端单会话缓冲，音频不广播、不落盘。
- ASR：whisper-rs + `ggml-base`，启动 prewarm；实测 3.9 秒中文在模型已加载时约 0.2–0.3s。base 对“异步/注释”等术语仍有误识，可用模型页切换 small。
- 输入：`arboard` 写剪贴板；`core-graphics` 合成 Cmd+V；未授权/目标变化/安全输入只复制；不发送回车。
- 桌面：设置页管理模型与辅助功能；应用内语音浮层显示倾听/转写/结果；剪贴板历史见 [clipboard-manager.md](./clipboard-manager.md)。
- 云端（2026-11-02）：`asr.json` + Keychain + `asr_cloud_*` 命令；百炼 WS 会话（run-task/finish-task/二进制 PCM）；`mic.partial` 50ms 节流；`mic.ready`/`mic.result` 带 engine/model/fallback/usage；失败回退本机；设置页语音识别页（引擎/地址/Key/模型/热词/测试）。
- 待验证：macOS 辅助功能实际勾选后的自动粘贴、密码框/窗口切换完整矩阵、真机 60 秒与断连、测试集准确率；百炼真实账号/Keychain 授权/真机流式与回退验收。
