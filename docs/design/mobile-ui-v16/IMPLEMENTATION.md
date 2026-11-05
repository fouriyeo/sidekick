---
doc: design/mobile-ui-v16/IMPLEMENTATION
title: 干净版手机端重构 · 实施计划
status: active
updated: 2026-11-05
owner: lead
---

# 干净版手机端重构 · 实施计划

> 设计基线：v16（`screens-v16.png` / `screens-v16.html`）。用户已确认布局与视觉方向。
> 范围：只改手机端（Tauri Android WebView）；桌面端、协议、Rust 服务不改。
> 原则：先结构、后皮肤；先宠物页闭环、再设置与结果卡；每一步可运行、可回滚。
> **状态（2026-11-05）**：P0 / P1 / P2 / P3 ✅ 已落地；P4 部分完成（浅/深主题、591 tests、真机宠物页/设置页/展开/返回/字体已验证；结果卡 390/320 浏览器验证；录音禁切页、结果卡清空二次确认、320 真机待补）。字体按 D81 改为 MiSans Normal 400（标题 15、设置说明行高 1.45），对比见 [font-compare.png](./font-compare.png)。

## 1. 目标与非目标

**目标**

1. 手机端从「3 档 + 动态页」改为「宠物页 + 设置二级页」两页结构；删除底部 tab。
2. 宠物页：顶部 gear / 连接状态 / chat；消息卡置顶（折叠/展开、清除 ×、状态图标、working wash）；鲸鱼无底色、下移；麦克风居中。
3. 设置页：从 gear 进入，左上返回 + 居中 17 inline 标题；无底栏；分组卡片、400 字重。
4. 说完话结果卡：弹窗三段（grabber / header 16 / content 13 单行 / footer 15），纯文字动作，清空二次确认。
5. 手机端使用干净的近白底 + 单一薄荷 tint + 400 字重；深色主题同步适配（同一套结构，换深色值）。

**非目标**

- 不改协议、不改 DSH hook、不改桌面端布局与 Rust。
- 不新增业务能力（不新增 AI 对话详情、不改会话数据字段）。
- 不做 Liquid Glass / 大面积 blur；不重绘鲸鱼。

## 2. 关键决策（需在实现中固化，完成后写入 decisions）

| # | 决策 | 说明 |
| --- | --- | --- |
| 1 | 删除「动态」页与底部三档 | 会话回宠物页；设置从左上 gear 进；消息从右上 chat 进 |
| 2 | 连接状态仍在顶部，可点进连接页 | 保留现有 `openOffline` |
| 3 | 首用清单移入设置页顶部一条 banner | 不再占宠物首屏；点击展开原有清单 |
| 4 | 「最近发生」活动流不再展示 | 会话卡已覆盖状态；连接事件可留在连接页 |
| 5 | asking 会话仍可点开 AskingPage | 从宠物页消息卡直接进入，返回宠物 |
| 6 | 清理会话：每行右侧 ×，二次确认 | 复用 `session-store` 的 pendingClear；长按/右滑不作为主入口 |
| 7 | 结果卡动作：纯文字 tint 链接 | 清空二次确认；不再用 44 高实心按钮 |

## 3. 视觉令牌（mobile 作用域）

新增 `app/src/mobile/styles/clean.css`（或 `tokens-mobile.css`），只挂在手机根节点 `.mobile-clean` 下，覆盖语义变量，避免污染桌面：

| 令牌 | 浅色 | 深色 |
| --- | --- | --- |
| `--background` | `#F7F8F8` | `#0B0B0C` |
| `--card` / `--popover` | `#FFFFFF` | `#1C1C1E` |
| `--foreground` | `#1C1C1E` | `#F2F2F7` |
| `--muted-foreground` | `#6C6C70` | `#AEAEB2` |
| `--border` / hairline | `#E5E5EA` | `#38383A` |
| `--primary` / tint | `#0A7764` | `#3FC4A0` |
| `--wash` | `#F0F7F5` | `#12312B` |
| `--decide` | `#A66A16` | `#EAB173` |
| `--success` | `#1D7A4F` | `#64D9A4` |
| `--destructive` | `#B3483A` | `#E6847A` |

字重：手机端只用 400 / 500（标题 400；状态标签最多 500）。字号：inline 17 / 行 16 / 正文 15 / 次要 13 / caption 12；结果卡正文 13、单行。

## 4. 文件与改动面

| 区域 | 文件 | 改动 |
| --- | --- | --- |
| 手机根 | `src/mobile/app.tsx` | 只渲染 pet/settings/chat/asking/offline/scan；删除 stream；返回层级调整 |
| 视图 | `src/mobile/ui-store.ts` | `MobileView` 去掉 `stream`；默认 pet；返回 settings→pet、asking→pet |
| 主题 | `src/mobile/styles/clean.css` + `entries/mobile.tsx` | `.mobile-clean` 包裹 + 浅/深令牌 |
| 顶栏 | `src/mobile/shell/pet-top-bar.tsx` | gear / 状态 / chat 三件套；44 高；状态可点 |
| 宠物页 | `src/mobile/features/pet/pet-page.tsx` | 新结构：顶栏 → 消息卡 → 鲸鱼 → 居中麦克风；删首用/NowRow/最近行/TabBar |
| 舞台 | `pet-stage.tsx` / `pet.module.css` | 去底色、去品牌小字、鲸鱼尺寸与下移；保留 AI 气泡（按状态） |
| 消息卡 | 新增 `features/sessions/session-feed.tsx` | 折叠/展开、header、状态图标、working wash、× 清除、最多 5 行 |
| 会话行 | `features/sessions/session-row.tsx` | 16/400 标题、13/400 副行、状态图标；去掉旧 signal bars/mono |
| 设置页 | `features/settings/more-page.tsx` | 二级页、返回、inline 标题、分组卡、无底栏、首用 banner |
| 结果卡 | `features/mic/mic-button.tsx` | 弹窗三段、13 单行正文、15 文字动作、清空二次确认 |
| 页头 | `shell/page-header.tsx` | 17/400 inline 标题；仅二级页使用 |
| 其他 | `first-use/*`、`stream/*` | 首用卡改为设置页 banner；stream 组件暂留但不再路由，验收后删除 |
| 文档 | `docs/prd/shell/*`、`docs/decisions.md`、`status.md`、`frontend-architecture.md` | 记录 2 页结构与 D80 |

## 5. 阶段与验收

### P0 · 基线与令牌（0.5 天）

- 新增 `.mobile-clean` 浅/深令牌与字号/字重约定；手机根节点挂 class。
- 不改布局；跑 `typecheck`、现有 609 tests 应全绿。
- 验收：桌面端视觉无变化；手机端仅颜色/字重变化。

### P1 · 宠物页 + 消息卡（1.5–2 天）

- 新结构：顶栏（gear/状态/chat）、消息卡（折叠 1 行 / 展开 3–5 行、×、标题/状态/时间、working wash）、鲸鱼无底色下移、麦克风居中。
- 删除宠物页的 first-use / NowRow / 最近行 / TabBar；首用清单暂迁设置页 banner。
- 保留：dim、keep-awake、haptics、pet stage 四态、asking 点击、连接页入口。
- 验收：空态/1 条/多条/asking；320–420 宽不溢出；单测更新；真机/浏览器截图。

### P2 · 设置二级页 + 移除动态（1 天）

- `ui-store` 去 stream；`app.tsx` 返回层级；settings 从 gear 进、返回宠物；chat 从右上进。
- 设置页重排为分组卡（连接/外观/反馈/显示/数据与关于/消息通道），首用 banner 在顶部；无底栏。
- 删除/停用 stream 路由；活动流不再渲染。
- 验收：返回键层级、录音中禁切页、重连入口、首用清单可达。

### P3 · 说完话结果卡（0.5–1 天）

- 弹窗三段：grabber + header 16 + content 13 单行 + footer 15 文字动作；清空二次确认；键盘/无障碍标签。
- 验收：inserted / copied / error / 清空二次确认 / 录音中不遮挡。

### P4 · 深色主题 + 收口（1 天）

- 深色值、对比度、OLED；双主题截图。
- 全量 `pnpm typecheck` / `pnpm lint` / `pnpm test`；真机验证（如设备可用）。
- 文档同步、决策记录、旧组件删除。

## 6. 测试计划

- 更新：`mobile/app.test.tsx`（3 档 → 2 页；返回层级；录音禁切页；keep-awake 只在 pet）。
- 新增：`session-feed.test.tsx`（折叠/展开、× 二次确认、最多 5 行、空态）；
  `more-page.test.tsx`（banner、无 tab、返回）；`mic-button` 结果卡（header/content/footer、清空二次确认）。
- 保持：协议解析、会话 store、麦克风链路、宠物状态机测试不动。
- 手工：360×800 真机/模拟器；断连/重连；asking；录音 60s；系统返回；深浅主题。

## 7. 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| 删动态页导致 asking/活动流不可达 | 消息卡承接 asking；活动流停用但 store 保留，必要时回滚 |
| 无底栏后设置入口难发现 | 首用清单/首次进入提示 gear；设置页顶部说明 |
| 双主题对比度 | 先浅色验收，深色用同一套令牌表；逐项测对比度 |
| 现有 609 tests 大量失败 | P1/P2 分步改测试，保持每个小步可跑；失败测试与代码同改 |
| 鲸鱼/麦克风布局挤压 | 360×800 固定验收；鲸鱼 230/220、麦克风 56、结果卡 125 |

## 8. 并行分工（Agent Teams）

| 角色 | 写作用域 | 产出 |
| --- | --- | --- |
| Lead | `mobile/app.tsx`、`ui-store.ts`、`styles/clean.css`、`entries/mobile.tsx`、`app.test.tsx`、docs | 路由/主题/集成/测试/文档 |
| pet-shell-dev | `features/pet/**`、`features/sessions/**`、`shell/pet-top-bar.tsx` | 新宠物页 + 消息卡 |
| settings-mic-dev | `features/settings/**`、`features/mic/mic-button.tsx`、`shell/page-header.tsx` | 设置二级页 + 结果卡 |

> 先由 Lead 落 P0 令牌与路由骨架，两个 dev 再并行；合并时 Lead 统一跑全量测试与截图。

## 9. 完成定义（DoD）

- 手机上只有「宠物 / 设置」两页，无底部 tab；会话在宠物页可折叠/展开/清除。
- 顶栏 gear/状态/chat 可用；返回键层级正确；录音中禁切页。
- 结果卡为 v16 弹窗结构，清空二次确认。
- 浅/深两套主题通过对比度与 360×800 截图；`typecheck`/`lint`/`test` 全绿。
- 文档（PRD shell、decisions、status、frontend-architecture）同步。
