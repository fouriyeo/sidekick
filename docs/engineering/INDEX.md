---
doc: engineering/INDEX
title: 工程方案分支索引
status: active
updated: 2026-11-02
load: on-demand
children:
  - audio-pipeline.md
  - protocol-audio.md
  - asr-model.md
  - asr-cloud-bailian.md
  - clipboard-manager.md
  - dsh-hook.md
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
| 配置百炼模型、看 Token/费用统计 | [asr-model.md](./asr-model.md) | M |
| 接百炼云端流式识别（Key/流式/失败） | [asr-cloud-bailian.md](./asr-cloud-bailian.md) | L |
| 桌面剪贴板历史与隐私过滤 | [clipboard-manager.md](./clipboard-manager.md) | M |
| 做自动发现、端口冲突、桌面二维码 | [lan-discovery.md](./lan-discovery.md) | M |
| 做 AI 联动：DSH 脚本注入、Rust 桥、四态协议 | [dsh-hook.md](./dsh-hook.md) | M |
| 做宠物：Rive、状态机、持久化 | [pet-runtime.md](./pet-runtime.md) | M |
| 写测试、真机验收、发版 | [quality.md](./quality.md) | M |

## 当前状态

- 麦克风（百炼云端唯一）已实现（二进制音频协议、云端流式、`mic.partial`、Keychain、失败直接报错）；模型页 + 用量统计已实现；真实账号/Keychain/真机/金额对账待验收；剪贴板 P1 辅助能力已实现。
- 宠物 P0 代码已完成；局域网自动发现与动态端口已实现。
- AI 联动（DSH）开发中：本地脚本注入 + 回环桥 + status 协议 + 手机四态/三音效；见 [dsh-hook.md](./dsh-hook.md)。
- 自动发现与端口策略：[lan-discovery.md](./lan-discovery.md)（UDP 广播探测 + 动态端口回退）。
- 云端识别：[asr-cloud-bailian.md](./asr-cloud-bailian.md)（桌面中转、Keychain、50ms partial、失败不降级）；模型页/用量见 [asr-model.md](./asr-model.md)。
- 现有架构事实：[architecture.md](../architecture.md)、[frontend-architecture.md](../frontend-architecture.md)。
- 现有协议事实：[protocol/README.md](../../protocol/README.md)。
- 新增依赖必须过 [dependency-policy.md](../dependency-policy.md) 六问，并记录 [decisions.md](../decisions.md)。

## 方案原则

1. **平台边界**：手机采集，桌面转写/输入；共享协议类型，不共享页面。
2. **云端可控**：音频只到用户配置的百炼；不落盘；不做后台录音。
3. **失败可恢复**：丢音频、给提示、可重录；不自动重试、不缓存待发。
4. **可替换**：采集/编码/ASR/输入都留 adapter；UI 不依赖第三方类型。
5. **先 spike 再定库**：ASR、Android 采集、macOS 输入都是高风险点，不在 PRD 里拍板。
6. **性能预算**：60fps、p95 延迟、包体、电量；超预算先减功能，不降标准。

## 未决技术问题

- Opus/BLE 何时引入？当前 PCM16 已跑通。
- 自动粘贴对哪些 macOS 应用不兼容？需继续扩充真机矩阵。
- 桌面独立 always-on-top 浮窗是否值得从应用内浮层升级？
- 剪贴板全局快捷键/菜单栏入口的优先级。
