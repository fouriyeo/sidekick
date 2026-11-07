---
doc: engineering/desktop-usage-panel
title: 菜单栏 Token 用量小看板（第二窗口）
status: active
updated: 2026-11-07
load: on-demand
owner: engineering
related:
  - ./desktop-tray.md
  - ./token-usage-pricing.md
  - ../prd/usage/PRD.md
  - ../decisions.md
  - ../../app/src-tauri/src/usage_panel.rs
---

# 菜单栏 Token 用量小看板（D108）

> 一句话：左键点菜单栏图标 → 图标下方弹出一个「320×432 的只读 Token 用量卡片」；主窗口改走右键菜单或看板底部的「打开用量页」。
> 它回答的是「扫一眼今天花了多少」，不是第二个主界面：不加载桌面壳、不连 WS、不新增协议、不写账本。

## 1. 行为契约

| 动作 | 行为 |
| --- | --- |
| 左键点菜单栏图标 | 面板可见则收起；不可见则定位到图标下方并显示（`show` + `set_focus`） |
| 再点一次图标 | 收起（`hide`，窗口不销毁，下次秒开） |
| 点其它 App / 桌面 | 面板失焦 → `Focused(false)` → 收起 |
| Esc | 前端调 `hide_usage_panel` 收起 |
| Cmd+W / 其它关闭请求 | 拦截 `CloseRequested` → `prevent_close` + `hide`，不销毁 |
| 底部「打开用量页」 | 显示并激活主窗口，再发 `sidekick-navigate`，主窗口切到「用量」页 |
| 右键点图标 | 菜单不变：`显示主窗口` / `退出 Sidekick`（唯一退出入口） |
| 主窗口关掉（隐藏）后 | 面板照常可开；HTTP / UDP 发现 / hook 桥 / 手机连接不受影响 |

**回退链**：面板窗口创建失败或显示失败 → 打 `[panel] …` 日志并回退 `show_main_window`，左键不能「点了没反应」。托盘创建失败时根本不预创建面板（沿用 D88 的「关窗即退出」旧行为）。

## 2. 窗口与定位

| 项 | 值 |
| --- | --- |
| label | `usage-panel`（`capabilities/panel.json` 的 windows 必须与它一致） |
| 窗口 | 360×468 逻辑像素；`decorations(false)`、`transparent(true)`、`shadow(false)`、`resizable(false)`、`always_on_top(true)`、`skip_taskbar(true)`、`accept_first_mouse(true)` |
| 可见卡片 | 320×432，透明留白非对称（左右 20 / 上 8 / 下 28），只用来放向外延伸的 CSS 阴影 |
| 阴影 | 卡片自身 `0 8px 18px` + `0 2px 6px` 柔和阴影；窗口层不铺任何底色/阴影，阴影随留白自然淡出，不再被 14px 窄边裁成灰框 |
| 位置 | 卡片顶边 = 图标事件矩形底边（GAP 0，视觉约在菜单栏下 8pt）；水平居中对齐图标；再夹到图标所在显示器的左右 8pt 安全边 |
| 创建时机 | 启动 setup 时预创建并隐藏（第一次点按也秒开）；失败时首次点按再试 |
| URL | `index.html?window=panel`（`main.tsx` 按查询参数挂 `entries/panel.tsx`，不再走 `app_role` 分支） |
| 内容层 | 不透明卡片（D86：内容层不透明），透明窗口只服务于圆角和阴影；**不设 NSVisualEffectView** |
| 页面透明 | 面板入口把 `.desktop-ios` 挂在 `<html>`，ios.css 会因此给 html 铺页面底色；`panel.css` 必须用 `html.desktop-ios { background: transparent }` 压过它，否则整窗（含透明留白）是一圈灰/黑，和壁纸冲突 |

定位数学在 `usage_panel::panel_origin`（纯函数，单测覆盖主屏居中、右/左边缘夹取、副屏负坐标、拿不到显示器、非法 scale）。托盘矩形来自 `TrayIconEvent::Click.rect`（tauri/tray-icon 在 macOS 上已换算成顶部原点的 `dpi::Position/Size`，统一 `to_physical(scale)` 后再算）。

## 3. 数据与刷新

- 数据只走现有命令 `token_usage_stats`（只读 `<DSH_HOME>/storages/cost-meter/ledger.json`，mtime 缓存）；面板复用 `useUsageStore`，不新建聚合逻辑。
- 区间：`今天 / 7 天` 两个胶囊；默认「今天」（与 D102 用量页一致）。
- 分组：`客户端 / 会话 / 模型` 三个下划线 tab（D109，默认「模型」），切 tab 只换列表、不重新读账本；每组按金额取 Top 3，行底 4px 底轨 + 填充占比条（按整组金额算）。
- 迷你柱：固定 `daysForRange(stats.days, "7d", stats.generatedAt)`。协议约定 `days` 是最近最多 180 个真实日期（不按区间裁剪），所以「今天」快照也能画 7 根柱子；dev mock 也已按该协议改成最少 180 天历史。
- 刷新时机：挂载、窗口重新获得焦点、页面重新可见（700ms 节流）、手动刷新按钮；旧快照保留，打开瞬间不闪空。
- 状态：账本缺失/损坏 → 一句结论 + 重试；区间无记账 → 「这个区间还没有记账」；缺价 → `—`；估算 → `≈¥`。不显示假 0。
- 隐私：与用量页同一白名单；不新增外发字段、不写账本、不发遥测。

## 4. 文件与职责

| 文件 | 职责 |
| --- | --- |
| `app/src-tauri/src/usage_panel.rs` | 窗口预创建/定位/toggle/收起、两个命令（`hide_usage_panel` / `open_usage_page`）、导航事件、定位单测 |
| `app/src-tauri/src/tray.rs` | 左键改调 `usage_panel::toggle`；tooltip 文案；右键菜单不变 |
| `app/src-tauri/src/lib.rs` | setup 预创建、`CloseRequested`/`Focused(false)` 拦截、注册命令 |
| `app/src-tauri/capabilities/panel.json` | 给 `usage-panel` 窗口 `core:default` |
| `app/src/main.tsx` | `?window=panel` 分支（先于 `app_role`） |
| `app/src/entries/panel.tsx` | 挂 `.desktop-ios` 令牌、引入 `ios.css` + `panel.css`、mount 面板 |
| `app/src/desktop/panel/usage-panel.tsx` | 紧凑卡片（hero / 三读数 / 7 天迷你柱 / 客户端/会话/模型 Top 3 分组 + 占比条 / 打开用量页 / 状态） |
| `app/src/desktop/styles/panel.css` | 卡片令牌与布局（深浅两套） |
| `app/src/shared/lib/tauri.ts` | `hideUsagePanel` / `openUsagePage` 命令、`subscribeNavigate` |
| `app/src/desktop/app.tsx` | 订阅 `sidekick-navigate`，收到 `usage` 切页 |
| `app/src/dev/tauri-mock.ts` | 浏览器 QA 的两个命令空实现；`token_usage_stats` 的 180 天历史 |
| `scripts/qa-desktop-ios.mjs` | 360×468 × 浅/深 + 空态 + 悬停截图，校验卡片 320×432、内部不裁切、无溢出/控制台错误 |

## 5. 已知代价 / 风险

1. **抢焦点**：普通 `NSWindow`（不是 NSPanel）在显示时会激活 App；失焦收起是焦点启发式，不是原生 popover。若后续觉得打扰，再评估 `tauri-nspanel`/自写 NSPanel，不要在 v1 引插件。
2. **全屏 Space**：别的 App 处于全屏 Space 时，普通窗口可能不覆盖该 Space（菜单栏图标仍可点）。
3. **菜单栏无法自动截图**：最终观感必须人工 `pnpm tauri dev` 目检；浏览器 QA 只验收面板内部布局。
4. **多一个 WebView**：预创建隐藏窗口多占几十 MB 内存，换取点开即出；主窗口隐藏的 WebView 本来就常驻。
5. **`macos-private-api` 是硬前提**：`tauri.macos.conf.json › macOSPrivateApi: true` 要求 `tauri` 依赖开启该 feature（透明窗口）。删掉它 `tauri-build` 会直接报 feature allowlist 不匹配，`cargo test` 都跑不了。
6. **CSS 权重坑**：面板按钮重置必须用 `:where(.dsl-panel) button`（而不是 `.dsl-panel button`），否则会压过 `.dsl-panel-tab` / `.dsl-panel-open` 的 `font-size` 与背景，表现为分段控件变纯文字、主按钮没底色。

## 6. 验证清单

**自动化**

- `cargo test usage_panel`（6 个定位单测）；`cargo test` 全量。
- `pnpm typecheck / lint / test / build`；`node scripts/check-boundaries.mjs`、`node scripts/check-docs.mjs`。
- `pnpm dev --host 127.0.0.1` + `node scripts/qa-desktop-ios.mjs`：面板 6 张截图（浅/深 × 正常/空态 + 悬停），卡片必须 `320×432` 且 `scrollHeight <= clientHeight`，无横向溢出/console error。

**人工（菜单栏只能目检）**

1. `pnpm tauri dev` → 终端出现 `[tray] 菜单栏图标已就绪（左键用量看板 / 右键菜单：主窗口·退出）` 与 `[panel] 已创建隐藏窗口 360×468`。
2. 左键图标 → 卡片出现在图标正下方，宽 320、高 432，圆角/阴影正常（浅/深主题各看一次）；日志出现 `[panel] 显示`，再点图标/点其它 App 后出现 `[panel] 收起`。
3. 鼠标在近 7 天柱上横向移动 → 命中柱加亮、顶部浮出「日期 · 金额」气泡（今天显示「今天」），移出消失；分组行 hover 有淡底。
4. 再点图标收起；点桌面/其它 App 收起；Esc 收起；Cmd+W 后隐藏但下次仍能开。
5. 底部「打开用量页」→ 主窗口出现并落在用量页。
6. 右键菜单三项仍在；「退出 Sidekick」退出后面板与图标一起消失。
7. 关主窗口后左键图标仍能开看板；手机仍「已连接」、`lsof -nP -iTCP:47810` 仍监听。
8. 双屏：把菜单栏图标所在屏切到副屏再点，面板不越界、不被夹到主屏。

## 7. 明确不做

- 菜单栏常驻数字/图标徽标、预算/告警、面板内切 30 天/半年、导出/分享。
- 手机端任何变化；`usage` 协议字段变化；写 DSH 账本。
- 原生 NSPanel / 不抢焦点 / 全屏 Space 覆盖（记作后续可选项）。
