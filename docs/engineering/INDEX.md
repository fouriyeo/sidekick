---
doc: engineering/INDEX
title: 工程方案分支索引
status: active
updated: 2026-11-08
load: on-demand
children:
  - pitfalls.md
  - audio-pipeline.md
  - protocol-audio.md
  - asr-cloud-bailian.md
  - clipboard-manager.md
  - dsh-hook.md
  - pet-runtime.md
  - quality.md
  - release.md
  - lan-discovery.md
  - token-usage-pricing.md
  - memo-pipeline.md
  - desktop-ios-ui.md
  - desktop-tray.md
  - desktop-usage-panel.md
---

# 工程方案分支

这里回答「怎么实现」，不重复产品规则。产品规则见 [prd/INDEX.md](../prd/INDEX.md)，工程总规范见 [standards/engineering.md](../standards/engineering.md)，当前状态见 [status.md](../status.md)。

## 读哪篇

| 你要做什么 | 读这篇 | 体量 |
| --- | --- | --- |
| 改代码前先看已知坑与硬约束 | [pitfalls.md](./pitfalls.md) | L |
| 改麦克风端到端链路（采集 → 输入） | [audio-pipeline.md](./audio-pipeline.md) | M |
| 改音频消息/二进制帧协议 | [protocol-audio.md](./protocol-audio.md) | L |
| 接百炼云端识别（地址/Key/流式/错误码） | [asr-cloud-bailian.md](./asr-cloud-bailian.md) | L |
| 改桌面剪贴板历史与隐私过滤 | [clipboard-manager.md](./clipboard-manager.md) | M |
| 改自动发现、端口冲突、桌面二维码 | [lan-discovery.md](./lan-discovery.md) | M |
| 做 AI 联动：DSH 脚本注入、Rust 桥、四态协议 | [dsh-hook.md](./dsh-hook.md) | M |
| 做 Token 用量看板、读 DSH 账本、模型价格 | [token-usage-pricing.md](./token-usage-pricing.md) | L |
| 做语音备忘录：录音、分段转写、LLM 归类、镜像 | [memo-pipeline.md](./memo-pipeline.md) | M |
| 改电脑端界面（Liquid Glass 结构 / 导航 / 列表 / 文案红线） | [desktop-ios-ui.md](./desktop-ios-ui.md) | S |
| 做菜单栏常驻 / 关窗隐藏 / Dock 图标 / 退出入口 | [desktop-tray.md](./desktop-tray.md) | S |
| 做菜单栏 Token 小看板 / 第二窗口 / 图标下方定位 | [desktop-usage-panel.md](./desktop-usage-panel.md) | M |
| 做宠物：帧动画图集、状态机、持久化 | [pet-runtime.md](./pet-runtime.md) | M |
| 写测试、真机验收、发布门 | [quality.md](./quality.md) | M |
| 发版：打包 / 签名 / 传 GitHub Releases / 回滚补发 | [release.md](./release.md) | M |

## 方案原则

1. **平台边界**：手机采集，桌面转写/输入；共享协议类型，不共享页面；`mobile` 不 import `desktop`，反之亦然。
2. **云端可控**：语音输入链路音频只到用户配置的百炼、不落盘、不做后台录音；语音备忘录是另一条显式落盘链路（用户可见、可关闭保留），见 [memo-pipeline.md](./memo-pipeline.md)，不要把两条链路的隐私口径混为一谈。
3. **失败可恢复**：丢音频、给提示、可重录；不自动重试、不缓存待发。
4. **可替换**：采集/编码/ASR/输入都留 adapter；UI 不依赖第三方类型。
5. **先 spike 再定库**：高风险点不在 PRD 里拍板。
6. **性能预算**：60fps、p95 延迟、包体、电量；超预算先减功能，不降标准。

## 未决技术问题

- Opus/BLE 何时引入？当前 PCM16 已跑通。
- 自动粘贴对哪些 macOS 应用不兼容？需继续扩充真机矩阵。
- 桌面独立 always-on-top 浮窗是否值得从应用内浮层升级？
- 菜单栏图标是否升级成状态化（等你回答时换图标/加文字）？v1 按 D88 只放静态图标。
- 剪贴板全局快捷键的优先级（菜单栏入口已由 D88 提供）。

## 维护

- 现有架构事实：[architecture.md](../architecture.md)、[frontend-architecture.md](../frontend-architecture.md)；协议事实：[protocol/README.md](../../protocol/README.md)。
- 新增依赖必须过 [dependency-policy.md](../dependency-policy.md) 六问，并记录 [decisions.md](../decisions.md)。
- 新踩的坑写 [pitfalls.md](./pitfalls.md)，不写进产品文档；变更记 [history.md](../history.md)。
