---
doc: engineering/INDEX
title: 工程方案分支索引
status: active
updated: 2026-10-31
load: on-demand
children:
  - audio-pipeline.md
  - protocol-audio.md
  - pet-runtime.md
  - quality.md
  - lan-discovery.md
---

# 工程方案分支

这里回答“怎么实现”，不重复产品规则。产品规则见 [prd/INDEX.md](../prd/INDEX.md)，工程总规范见 [standards/engineering.md](../standards/engineering.md)。

## 读哪篇

| 你要做什么 | 读这篇 | 体量 |
| --- | --- | --- |
| 做麦克风：采集、传输、转写、输入 | [audio-pipeline.md](./audio-pipeline.md) | L |
| 改协议/加音频消息 | [protocol-audio.md](./protocol-audio.md) | L |
| 做自动发现、端口冲突、桌面二维码 | [lan-discovery.md](./lan-discovery.md) | M |
| 做宠物：Rive、状态机、持久化 | [pet-runtime.md](./pet-runtime.md) | M |
| 写测试、真机验收、发版 | [quality.md](./quality.md) | M |

## 当前状态

- 音频完整 P0 未实现（spike 已通过）；宠物 P0 代码已完成；局域网自动发现（本页新方案）已实现。
- 自动发现与端口策略：[lan-discovery.md](./lan-discovery.md)（UDP 广播探测 + 动态端口回退）。
- 现有架构事实：[architecture.md](../architecture.md)、[frontend-architecture.md](../frontend-architecture.md)。
- 现有协议事实：[protocol/README.md](../../protocol/README.md)。
- 新增依赖必须过 [dependency-policy.md](../dependency-policy.md) 六问，并记录 [decisions.md](../decisions.md)。

## 方案原则

1. **平台边界**：手机采集，桌面转写/输入；共享协议类型，不共享页面。
2. **本地优先**：音频不出本机；不落盘；不做后台录音。
3. **失败可恢复**：丢音频、给提示、可重录；不自动重试、不缓存待发。
4. **可替换**：采集/编码/ASR/输入都留 adapter；UI 不依赖第三方类型。
5. **先 spike 再定库**：ASR、Android 采集、macOS 输入都是高风险点，不在 PRD 里拍板。
6. **性能预算**：60fps、p95 延迟、包体、电量；超预算先减功能，不降标准。

## 未决技术问题

- Android WebView 能否稳定拿到麦克风 PCM？需 spike A/B。
- 本机 ASR 选 macOS Speech 还是 whisper.cpp？需 30 句测试集对比。
- 自动粘贴用 CGEvent 还是 AX API？需验证目标应用覆盖与安全输入。
- 音频 P0 用 PCM16 还是 Opus？当前建议 PCM16 先跑通，Opus 后置。
- 是否需要独立桌面浮窗进程/窗口？Tauri 第二窗口 vs 系统通知。
