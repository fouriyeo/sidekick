---
doc: product/metrics
title: 指标与埋点
status: active
updated: 2026-11-05
load: on-demand
---

# 指标与埋点

> 本期没有账号、没有云端后台。指标用于自用验证和 5 人试用，不做增长考核。
> 所有目标值都是 `[假设]`，试用后校准；不编造行业数据。

## 1. 北极星指标

**每周有效使用次数 / 活跃设备** = 麦克风成功输入次数 + 宠物页有效回访次数。

- 宠物触摸互动已下线（D69），不再统计触摸互动事件；宠物侧用 7 日回访率与 `pet_open`/`pet_bubble` 观察陪伴价值。
- 有效麦克风输入：转写成功并完成输入/复制，且用户没有立刻撤销。

## 2. 输入指标

| 指标 | 定义 | 目标 `[假设]` |
| --- | --- | --- |
| 7 日回访率 | 首次打开后第 7 天仍打开宠物页 | ≥ 40% |
| 周均麦克风使用 | 每台活跃设备每周成功语音输入次数 | ≥ 10 次 |
| 麦克风一次成功率 | 转写后无需手动大改即可使用 | ≥ 80% |
| 端到端延迟 p95 | 松手 → 文本出现在目标应用（≤10 秒语音） | ≤ 3 秒 |
| 倾听反馈延迟 | 按下 → 视觉进入倾听 | ≤ 100ms |
| 宠物帧率 | 真机宠物舞台 | 60fps，长任务 < 50ms |

## 3. 护栏指标

| 指标 | 红线 | 说明 |
| --- | --- | --- |
| 隐私事故 | 0 | 原始音频落盘、后台录音、明文上传都算事故 |
| 误输入 | 0 次自动回车/自动发送 | 只输入文本，不提交 |
| 错误目标应用 | 0 次 | 目标窗口变化时只复制，不粘贴 |
| 崩溃/白屏 | 崩溃自由会话 ≥ 99.5% | 宠物皮肤失败要有兜底纯色脸，不白屏 |
| 宠物打扰 | 气泡主动关闭率 < 20% | 过高说明文案或频率有问题 |
| 电量 | 支架模式 30 分钟掉电 ≤ 5% `[待基线]` | 屏幕常亮是主要成本 |
| 无障碍 | 减少动效下无强制动画 | 系统设置 + 应用内开关 |
| 包体 | 宠物 chunk ≤ 600KB（JS，含 BoopFace）；皮肤 painter ≤ 250KB 懒加载 | 见 [frontend-architecture.md](../frontend-architecture.md) |

## 4. 事件命名与字段

格式：`feature_action_result`，全小写蛇形；属性只放枚举/桶值，不放原始文本。

| 事件 | 触发 | 关键属性 | 用途 |
| --- | --- | --- | --- |
| `pet_open` | 宠物页进入前台 | `mood`, `energy_bucket` | 使用频率 |
| `pet_bubble` | 气泡展示/关闭 | `trigger`, `copy_id`, `dismissed` | 文案效果、打扰度 |
| `pet_reset` | 重置宠物 | 无 | 重置使用 |
| `mic_start` | 开始录音 | `source`（button/lock） | 使用场景 |
| `mic_stop` | 停止录音 | `reason`（release/cancel/timeout/background/disconnect）, `duration_bucket` | 取消原因 |
| `mic_result` | 转写/输入完成 | `outcome`（inserted/copied/failed）, `latency_ms`, `text_length_bucket` | 成功率、延迟 |
| `mic_error` | 失败 | `code`（permission_denied/no_connection/asr_failed/target_mismatch/secure_input/insert_failed） | 失败分布 |
| `mic_permission` | 权限请求结果 | `type`（phone_mic/accessibility）, `result` | 权限摩擦 |
| `insert_result` | 文本输入 | `mode`（auto/clipboard）, `target_category`（editor/terminal/browser/unknown）, `success` | 输入可靠性 |

## 5. 隐私与保留

- 不记录原始音频、完整转写文本、剪贴板内容、目标应用名称。
- 目标应用只记类别（editor/terminal/browser/unknown），不记具体应用。
- 事件默认仅存本机，保留 30 天；设置页提供“清除本地统计”。
- 导出/上报必须显式征得同意；本期默认不上报。
- 日志脱敏：错误日志只记错误码、时长、阶段，不记 payload。

## 6. 怎么测

| 方法 | 频率 | 产出 |
| --- | --- | --- |
| 自用记录 | 每天 | 真实使用次数、失败截图、延迟体感 |
| 5 人试用 | 每个功能完成后 1 次 | 任务完成率、卡点、文案反馈 |
| 30 句转写测试集 | 每次改 ASR/模型后 | 字符准确率、代码术语错误 |
| 真机性能 | 每次发版前 | 帧率、掉电、发热、内存 |
| 端到端计时 | 每次发版前 | p50/p95 延迟 |

## 7. 反指标（不做）

- 不做日活/时长考核；不为了停留时间拉长动画或制造焦虑。
- 不做连续签到、等级、排行榜。
- 不把宠物互动次数当 KPI 压给用户；触摸互动已下线，宠物的价值用回访与试用访谈判断。
