---
doc: engineering/asr-model
title: 语音模型与用量统计
status: active
updated: 2026-11-02
load: on-demand
owner: engineering
---

# 语音模型与用量统计

> 回答“用哪个模型、哪里配置、用了多少、花了多少”。产品规则见 [mic PRD](../prd/mic/PRD.md)；云端协议见 [asr-cloud-bailian.md](./asr-cloud-bailian.md)；链路见 [audio-pipeline.md](./audio-pipeline.md)。

## 1. 结论

- 语音识别**只使用百炼云端**；本机 whisper 已下线，不再下载/选择/删除本机模型。
- 模型页只填**完整服务地址**、模型、Key 和识别参数；不再有“业务空间 ID”字段，也不发 `X-DashScope-WorkSpace`。
- API Key **只存在本机 `asr.json`（0600）**，不再读写系统钥匙串；打开模型页、测试连接、录音都不会弹系统密码。
- 每次百炼返回 usage 都会按本机日期记入 `asr_usage.json`；模型页用区间切换查看今天/近 7 天/近 1 个月/近 1 年。

## 2. 模型与默认参数

| 项 | 默认值 | 说明 |
| --- | --- | --- |
| 模型 | `qwen-audio-3.1-asr-flash-streaming` | 百炼实时语音识别 |
| 服务地址 | `wss://dashscope.aliyuncs.com/api-ws/v1/inference` | 北京；可切新加坡或粘贴完整业务空间 URL |
| 语言 | `zh`（中文） | 可选自动、中英混说 |
| 场景 | `near_meeting_16k` | 近场（手机贴嘴）；可选远场 |
| 静音断句 | 800ms | 200–6000ms |
| 热词 | 空 | 每行一个，最多 50 个，权重固定 5 |
| 心跳 | 开 | `heartbeat=true` |

- 服务地址：北京 `wss://dashscope.aliyuncs.com/api-ws/v1/inference`；新加坡 `wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference`。
- 模型推荐并默认 `qwen-audio-3.1-asr-flash-streaming`；模型页“使用推荐模型”可一键恢复，不静默覆盖自定义值。
- 3.1 是流式模型：`result-generated` 的 `sentence_end=false` 会按句实时更新到手机，松手后只插入最终文本。
- 用业务空间专属域名时，直接把完整 URL 粘贴到服务地址，例如 `wss://ws-123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`（新加坡把 region 换成 `ap-southeast-1`）。把 `{WorkspaceId}` 换成真实 ID；未替换会报“请填写完整服务地址…”。
- 代码会把 `https://`→`wss://`、`http://`→`ws://`，缺路径补 `/api-ws/v1/inference`；但业务空间占位符不会自动替换。
- 模型不下载到本机、不入 APK/Git；识别在百炼服务端完成。

## 3. 文件与目录

```text
~/Library/Application Support/Sidekick/
├─ asr.json          # 百炼配置/同意/keyPresent/keyHint；0600；不含 Key
├─ asr_usage.json    # 每日用量汇总；0600；最多 400 天
├─ clipboard.json    # 剪贴板历史
└─ models/           # 旧本机模型残留（不再读取，可删）
```

`asr.json` 结构（无 `workspaceId`、无 `engine`/`fallbackToLocal`）：

```json
{
  "version": 1,
  "consentCloud": { "granted": false, "at": 0 },
  "apiKey": null,
  "keyPresent": false,
  "keyHint": null,
  "bailian": {
    "endpoint": "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
    "model": "qwen-audio-3.1-asr-flash-streaming",
    "languageHints": ["zh"],
    "keepDialect": false,
    "vadModel": "near_meeting_16k",
    "maxSentenceSilenceMs": 800,
    "heartbeat": true,
    "vocabulary": []
  }
}
```

- `apiKey` 是明文 Key；`keyPresent`/`keyHint` 由它派生，`keyHint` 是掩码尾号（如 `sk-••••cdef`），不是密钥。
- Key 只在本机 `asr.json`（0600），不写日志、不上传；安全性低于系统钥匙串，不要分享该文件/备份。
- `asr.json`、`asr_usage.json` 均临时文件 + rename 原子写，权限 `0600`。
- 支持 `SIDEKICK_DATA_DIR` 覆盖数据目录（测试/排障）。

## 4. 配置（模型页）

桌面主导航：聊天 / 剪贴板 / AI 联动 / **模型**。模型页上半部分是百炼配置：

- 隐私同意：未勾选不能保存。
- 服务地址：北京/新加坡快捷按钮；业务空间直接粘贴完整 URL（无独立 ID 字段）。
- API Key：密码框；已保存时只显示掩码；`清除 Key` 删除本地 Key（并尝试清理旧钥匙串条目）。
- 模型、语言、场景、静音断句、热词（高级）。
- `测试连接`：握手 + 320ms 静音，显示延迟/模型/错误；`保存` 原子写 `asr.json`。
- 打开页面只读本地 `asr.json`；不再访问 Keychain，因此不会弹密码。旧版本钥匙串里的 Key 需重新粘贴一次。

设置 Sheet 只保留“自动输入权限 + 剪贴板”，不再有语音识别/本机模型入口。

## 5. 用量统计口径

### 5.1 记账时机

- 每次 `task-finished` 拿到 usage 后**先记一笔**，再插入文本；插入失败/空结果也计费。
- `sessions` 每次计费 +1；`totalTokens` 取 `total_tokens` 与 `input+output` 的较大值。
- 全零 usage 且无音频时长 → 跳过，不产生空记录。

### 5.2 接口与范围

`asr_usage_stats()` 返回：

| 字段 | 含义 |
| --- | --- |
| `today` | 本机今天 00:00 起 |
| `last7Days` | 今天向前 6 天（含今天） |
| `last30Days` | 今天向前 29 天 |
| `last365Days` | 今天向前 364 天 |
| `days` | 最近 365 天，今天起倒序，缺失日期补 0 |
| `priceNote` | 固定说明“估算，以百炼账单为准” |

- 按本机时区（`chrono::Local`）切天；跨时区/改系统时区会改变“今天”的边界。
- 最多保留 400 天，超出删最旧日期。
- 清空统计只把 `asr_usage.json` 重写为空汇总（文件保留）并清空内存，不影响配置/Key/剪贴板。

### 5.3 模型页区间切换

- segmented control：今天 / 近 7 天 / 近 1 个月（30 天）/ 近 1 年（365 天）。
- 只展示当前选中区间的一张汇总卡（金额、总/输入/输出 Token、会话、音频时长），不再同时展示四张。
- 今天：不显示明细列表，只显示汇总卡和提示。
- 近 7 天 / 近 1 个月：按天明细（7 / 30 行），缺失日期为 0。
- 近 1 年：按自然月汇总（约 12 行，避免 365 行），标签为 `YYYY-MM`。
- 明细列：日期/月份、会话、输入 Token、输出 Token、总 Token、金额、占比条。

### 5.4 金额换算

- 单位：人民币微元（1 元 = 1,000,000 微元），展示时转元。
- 北京：输入 ¥6/百万 Token、输出 ¥4.5/百万 → 6,000,000 / 4,500,000 微元。
- 新加坡：输入 ¥6.781/百万、输出 ¥5.104/百万 → 6,781,000 / 5,104,000 微元。
- 地域按 endpoint 粗判：含 `dashscope-intl` / `ap-southeast-1` / `singapore` → 新加坡；其余（含自定义）→ 北京估算。
- 四舍五入到微元；价格可能调整，统计只是本地估算。

### 5.5 展示格式

- 金额：0 显示 `¥0.00`；不足 1 分显示 4 位小数；其余 2 位。
- Token 千分位；音频 <60s 显示秒，否则 `m ss`。
- 底部固定 `priceNote`；`清空统计` 二次确认（只重置本地统计文件）。

## 6. 本地 Key 与跨平台

| 操作 | 读取位置 |
| --- | --- |
| 打开模型页 / `asr_cloud_status()` | 只读 `apiKey` 派生的 `keyPresent`/`keyHint`（对外 `hasKey`/`keyMasked`） |
| 保存配置（不改 Key） | 只读 `asr.json`，不写 Key |
| 保存新 Key / 清除 Key | 写/清 `asr.json` 的 `apiKey` |
| 测试连接 / 录音建会话 | 读 `asr.json` 的 `apiKey` |

- 整个链路不再访问 Keychain，所以不会弹系统密码；macOS/Windows/Linux 行为一致。
- 代价是明文存储，只靠 `0600` 文件权限保护；不要分享/提交 `asr.json`。
- 旧版本 Keychain 条目不再读取；清除 Key 时会尝试删除，失败也不影响本地清除。

## 7. 验收

- 模型页可保存/测试百炼配置；`asr.json` 无 `workspaceId`，含 `apiKey`；`keyPresent`/`keyHint` 正确。
- 打开模型页、测试连接、录音都不弹 Keychain；Key 从本地 `asr.json` 读取。
- 未替换 `{WorkspaceId}` 的服务地址保存时报“请填写完整服务地址…”。
- 未配置时手机录音收到 `mic.error(cloud_not_configured)`，明确提示去模型页重新粘贴 Key。
- 每次成功/失败但百炼返回 usage 的会话，统计都 +1；今天/7/30/365 数字随测试数据正确变化。
- 区间切换：今天无明细；7 天 7 行、30 天 30 行、1 年按月约 12 行；缺失日期为 0。
- 金额按北京/新加坡价格换算正确；清空统计后汇总与明细归零，配置文件与 Key 不受影响。
- 旧 `models/` 目录存在与否不影响录音/识别。

## 8. 限制与未验证

- 不做官方账单同步、按模型/地域分组、导出；统计只是本地估算。
- 不做多厂商/多套配置；当前单百炼配置。
- 真实账号、本地 Key 迁移、跨天/跨时区、金额与百炼账单对账待验收。
- 本地明文 Key 的权限/备份风险需要用户自行注意。
- 旧 `models/` 目录不自动删除，避免误删用户文件；文档提示可手动清理。
