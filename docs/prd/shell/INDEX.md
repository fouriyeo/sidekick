---
doc: prd/shell/INDEX
title: 应用外壳（桌面 Liquid Glass · iOS 26 + 手机两页壳）· 一页摘要
status: active
updated: 2026-11-06
load: on-demand
children:
  - PRD.md
  - SPEC.md
  - ACCEPTANCE.md
---

# 应用外壳（桌面 Liquid Glass · iOS 26 + 手机两页壳）· 一页摘要

> 两端应用「怎么装、怎么走、状态怎么说」——桌面 5 个一级入口（概览 / 语音 / 内容 / 用量 / 设置）+ 手机两页壳，以及连接 / AI / 麦克风三套状态词。
> 本期定位：**只重排承载与入口，不改功能行为**。宠物、麦克风、AI 联动的规则仍在各自 PRD。
> 决策：D85（2026-11-06，桌面结构重做：4 入口 / 设置 push / 删旧壳；D94 把语音提升为第 2 个一级页，变 5 入口）与 D86（同日第二轮视觉升级：Liquid Glass · iOS 26 质感层，取代 D85 的视觉与布局数值）；手机按 D80（两页壳）/ D90（设置页字号留白）/ D91（HarmonyOS Sans SC），本轮不动。

## 本期做什么

- 桌面：**224 玻璃侧栏**（4 个一级入口 + 底部设置 + 三行状态摘要）+ **sticky 玻璃工具栏**（未滚动透明、滚动 >6px 变玻璃并淡入 17/600 紧凑标题；大标题 34/600）+ 不透明白卡分组列表（16 圆角 / 行 54 / hairline / 30×30 彩色图标块）；一级只有 概览 ⌘1 / 语音 ⌘2 / 内容 ⌘3 / 用量 ⌘4 / 设置 ⌘5；默认首页 = 概览；用量规则见 [usage PRD](../usage/PRD.md)。
- 桌面设置是 iOS 式 push：首页一张分组列表（外观、自动输入、手机连接、AI 联动、剪贴板、关于本机、消息通道），点进去从右侧 push 到二级页，工具栏左侧「‹ 设置」返回。
- 质感层规则：**玻璃只做控件层**（侧栏 / 工具栏 / 动作组 / 分段轨道 / 辅助功能提示 / 弹层遮罩），白卡与列表行保持不透明；同心圆角、specular 高光、2.6% grain 与极淡环境光只做整体质感。
- 手机：顶部 44 条（gear / 连接状态信号塔图标 / 今日用量数字 / chat）+ 宠物根页 + 设置二级页 + 二级页 asking / chat / usage / offline / scan + 麦克风胶囊 / 圆钮 56；用量从宠物页顶栏今日数字进入（v17 / D93，设置页不再有入口）。
- 状态语言：连接 7 态、AI 4 态、麦克风 9 态、会话行工具动作（D78）；琥珀只给「等你决定」；会话对象用「已完成」、AI 聚合用「完成」。
- 首用清单 4 步（连接 / 麦克风 / 百炼 / 辅助功能）；①② 手机本地验证，③④ 由桌面 `desktop.status` 上报真实状态，未知时写「在电脑上完成」。

## 不做什么

- 不改宠物行为（D69/D77）、麦克风链路、AI 联动协议（D78）；本文件只定义它们的承载位置。
- 不恢复已被 D85 删除的桌面结构：48 全局状态条、72 图标导航、桌面会话列表页、系统页 4 段、56 页头；也不回到 v1 的扁平设置页（玻璃只做控件层，不铺内容卡）。
- 不新增协议字段：`asrConfigured`、精确手机台数、活动流持久化、手机批准/拒绝 AI 提问均为范围外（P1，见 [PRD](./PRD.md#8-范围外p1)）。
- 不写视觉令牌与配色细节：桌面实现契约见 [engineering/desktop-ios-ui.md](../../engineering/desktop-ios-ui.md)，通用视觉见 [standards/visual.md](../../standards/visual.md)。
- 不写通用触控 / 无障碍 / 返回键细则：见 [standards/ux.md](../../standards/ux.md)。

## 阅读地图

| 你是谁 | 读什么 | 读哪节 |
| --- | --- | --- |
| 产品 / 评审 | [PRD.md](./PRD.md) | 1–3、5–8 节 |
| 设计 / 前端 | [SPEC.md](./SPEC.md) | 全文（布局常量、页面骨架、状态词表、首用清单） |
| 桌面实现 | [engineering/desktop-ios-ui.md](../../engineering/desktop-ios-ui.md) + [SPEC.md](./SPEC.md) §1.1–§3 | 全文 |
| 测试 | [ACCEPTANCE.md](./ACCEPTANCE.md) | 全部 P0 用例 |
| 实现排期 | [docs/status.md](../../status.md) | 2026-11-06 条目 |

## 当前结论

- 桌面「状态在侧栏」：三行状态摘要（服务 / 手机 / AI）常驻，服务与手机点按进「设置 › 手机连接」，AI 进「设置 › AI 联动」；概览另有同内容三行列表。AI 在做什么只在「概览 › 当前会话」一行。
- 手机「宠物是首屏」：宠物页 = 顶部条（gear / 信号塔 / 今日用量 / chat）+ 会话卡（折叠 1 行 / 展开最多 5 行）+ 鲸鱼 + 圆麦克风；会话与 asking 都在宠物页处理，asking 有独立页（D80 删除动态页）。
- 一等入口只有 4 个（桌面）/ 2 页（手机）；配置与排障全部收进设置，不再和主任务平级。
- 数据真实性：只展示协议能给出的字段；手机台数是 `clients - 1` 近似值，不显示设备名 / 延迟 / 心跳等虚构信息。
- 状态词两端同词同落点；颜色只是第二线索。手机顶部条连上时只显示信号塔图标（完整文案在 `aria-label` 与连接页），没连上时才补最短状态词；其它状态仍要求文字 + 颜色点。
- 桌面质感结论：玻璃只给控件层，内容层不透明；动效只服务层级与操作反馈（页面 fade / 二级页 push / 滑块 spring / 按压缩放），`prefers-reduced-motion` 与 `prefers-reduced-transparency` 都有退化路径。

## 维护规则

- 改导航、页面归属、状态词：先改本目录，再同步 [standards/ux.md](../../standards/ux.md) 与 [frontend-architecture.md](../../frontend-architecture.md)。
- 改桌面结构 / 视觉：先改 [engineering/desktop-ios-ui.md](../../engineering/desktop-ios-ui.md)（实现契约），再同步本目录与 `app/src/desktop/styles/ios.css`。
- 改功能行为：去对应功能 PRD（[pet](../pet/INDEX.md) / [mic](../mic/INDEX.md) / [hook](../hook/INDEX.md) / [usage](../usage/INDEX.md)），不要写进本目录。
- 协议字段变化：同步 [../protocol/README.md](../../../protocol/README.md) 与本目录 SPEC 的「数据来源」节。
- 新页面 / 新入口：必须同时补 PRD 页面清单、SPEC 骨架、ACCEPTANCE 用例三处，否则视为未完成。
