---
doc: prd/english-corner/ACCEPTANCE
title: 英语角（生词本）验收标准
status: active
updated: 2026-11-09
load: on-demand
owner: qa
---

# 英语角（生词本）验收标准

> Given-When-Then；每条可在桌面/手机或单测里直接执行。`[ ]` 表示待执行。
>
> 2026-11-09 已执行并通过：EC-AC-70/71/72/73（Rust 测试、前端 865 tests / 104 files、`qa-desktop-ios.mjs` 72 张截图无溢出、`check-docs`/`check-boundaries`、Android debug APK 构建与安装）。
> 真机（Android 13 / ColorOS）已验证：EC-AC-40（桌面 → 手机快照）、EC-AC-44（手机离线新增后联网补推）、EC-AC-41 的解释保留（字段级合并单测 + 真机库对比）。其余 UI 级人工项待走查。

## A. 词库与输入

| # | Given | When | Then |
| --- | --- | --- | --- |
| EC-AC-01 | 词库为空 | 输入 `resilient` 并查词 | 列表新增一条，状态从 pending 变 ready |
| EC-AC-02 | 已有 `run` 且已解释 | 再次输入 `Run` | 不新增重复词条；打开原详情；0 次网络调用 |
| EC-AC-03 | 输入框为空 | 点查词 | 内联提示「请输入英文单词」，不发请求 |
| EC-AC-04 | 输入 `跑` 或 `run123` | 点查词 | 提示仅支持英文单词/短语，不发请求 |
| EC-AC-05 | 输入 65 个字母 | 点查词 | 拒绝并提示长度上限 |
| EC-AC-06 | 已有词条 | 搜索 `alp` | 只显示匹配词形/释义的词条 |
| EC-AC-07 | 已有词条 | 删除并二次确认 | 列表移除；重启后仍不出现（墓碑） |
| EC-AC-08 | 词条为 failed | 点重试 | 重新发起解释，成功后状态变 ready |

## B. AI 解释

| # | Given | When | Then |
| --- | --- | --- | --- |
| EC-AC-10 | 未同意 | 点查词 | 出现隐私说明；不发网络请求；返回 need_consent |
| EC-AC-11 | 已同意但无 Key | 点查词 | 提示去语音页配置；不发请求 |
| EC-AC-12 | 已同意有 Key | 查 `bank` | 返回释义 ≥1 条、例句 ≥1 条、词性；音标可为空 |
| EC-AC-13 | 模型返回缺右括号的 JSON | 查词 | 自动修复后成功（单测 `repairs_missing_closing_brace`） |
| EC-AC-14 | 模型返回非 JSON | 查词 | 重试 1 次；仍失败则 failed + `bad_json`，输入不清空 |
| EC-AC-15 | 请求超时 | 查词 | failed + `timeout`；可重试 |
| EC-AC-16 | 已有 ready 且模型/提示词版本一致 | 再次查同一词 | 直接返回缓存，usage 不变 |
| EC-AC-17 | 解释成功 | 打开用量 | 今日次数 +1，token 与估算金额增加 |

## C. 造句

| # | Given | When | Then |
| --- | --- | --- | --- |
| EC-AC-20 | 词库有 3 个 ready 词 | 选 3 个并生成 | 返回 3–5 句，每句含至少 1 个所选词，附中文翻译 |
| EC-AC-21 | 选中含 pending 词 | 打开造句卡 | pending 词不可选（只列 ready） |
| EC-AC-22 | 未选词 | 点生成 | 按钮禁用或提示先选词，不发请求 |
| EC-AC-23 | 模型返回空 sentences | 生成 | 失败提示 `bad_json`，已选词保留 |
| EC-AC-24 | 生成成功 | 打开用量 | 调用次数与 token 增加 |

## D. 用量

| # | Given | When | Then |
| --- | --- | --- | --- |
| EC-AC-30 | 今天有 2 次成功调用 | 打开用量 | 今日次数 = 2，金额标注「估算」 |
| EC-AC-31 | 失败调用 | 打开用量 | 失败不计入次数 |
| EC-AC-32 | 跨天后 | 打开用量 | 今日归零，近 30 天仍包含昨天 |

## E. 双端同步

| # | Given | When | Then |
| --- | --- | --- | --- |
| EC-AC-40 | 手机已配对、桌面新增 `alpha` | 手机打开英语角 | 2 秒内看到 `alpha`（同一局域网） |
| EC-AC-41 | 桌面已解释 `alpha`、手机新增 `alpha`（pending） | 手机同步 | 桌面解释不丢；两端都是 ready |
| EC-AC-42 | 桌面删除 `alpha` | 手机同步 | 手机不再显示；重启不复活 |
| EC-AC-43 | 手机未配对 | 打开英语角 | 本地词库可用；提示「连上电脑后自动同步」；不发 word.* |
| EC-AC-44 | 手机未连接 | 新增词条 | 本地保存成功；联网后自动补推 |
| EC-AC-45 | 对端发来非法词条 | 同步 | 跳过该条，不落库，不影响其他条目 |
| EC-AC-46 | 两端同时改备注 | 同步 | updatedAt 较新的一方胜（桌面时间权威） |

## F. 界面与无障碍

| # | Given | When | Then |
| --- | --- | --- | --- |
| EC-AC-50 | 桌面 | 按 ⌘7 | 切到英语角；⌘6 仍是设置；输入框内按 ⌘7 不劫持 |
| EC-AC-51 | 桌面 | 1180/960 × 深浅主题 | 无横向溢出、无 console error（`qa-desktop-ios.mjs`） |
| EC-AC-52 | 手机 320 宽 | 打开英语角 | 无横向滚动；点击目标 ≥44 |
| EC-AC-53 | 手机在详情页 | 按系统返回 | 回到列表；再按回宠物页 |
| EC-AC-54 | 手机顶栏 | 点击英语角图标 | 进入英语角；消息入口仍在「设置 › 消息通道」 |
| EC-AC-55 | 首次打开手机英语角 | 无配对 | 显示配对引导，不显示空白页 |
| EC-AC-56 | 桌面添加卡 | 点「从剪贴板取词」 | 显示候选 chips；点候选只填入输入框，不自动查词 |
| EC-AC-57 | 词库非空 | 点「导出」 | 弹层显示 Markdown；复制成功提示；空词库按钮禁用 |
| EC-AC-58 | 有 ≥1 个 ready 词 | 打开「今天复习」 | 抽 5 个（不足取全部），看释义 → 下一个 → 复习完成 → 再来一组 |
| EC-AC-59 | 桌面详情 / 手机详情 | 点发音 | 桌面系统朗读；手机 Web Speech 朗读；不可用时不显示按钮 |

## G. 隐私

| # | Given | When | Then |
| --- | --- | --- | --- |
| EC-AC-60 | 任意 | 抓包一次解释请求 | 只含系统提示词 + 单词原文 +（可选）语境句；不含词库全量/剪贴板/设备信息 |
| EC-AC-61 | 任意 | 检查日志 | 不含词条正文、语境句、Key |
| EC-AC-62 | 首次使用 | 阅读隐私说明 | 能回答「发什么/发去哪/存哪」三项 |

## H. 回归

| # | 检查 | Then |
| --- | --- | --- |
| EC-AC-70 | `cargo test word` | 全过 |
| EC-AC-71 | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` | 全过 |
| EC-AC-72 | `node scripts/check-docs.mjs && node scripts/check-boundaries.mjs` | 全过 |
| EC-AC-73 | `node scripts/qa-desktop-ios.mjs` | 英语角页无溢出/无 console error |
