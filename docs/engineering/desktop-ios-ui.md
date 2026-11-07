---
doc: engineering/desktop-ios-ui
title: 电脑端「Liquid Glass · iOS 26」界面契约 v3（2026-11-06）
status: active
updated: 2026-11-06
load: on-demand
owner: engineering
related:
  - ../prd/shell/SPEC.md
  - ../prd/shell/PRD.md
  - ../frontend-architecture.md
  - ../standards/visual.md
  - ../../app/src/desktop/styles/ios.css
---

# 电脑端「Liquid Glass · iOS 26」界面契约 v3

> **v3（2026-11-06，D97）**：新增第一个**宽幅数据页**——用量页（900 内容、compact 页头、SVG 花费剖面、Token 光谱、带占比条的账本）；它是 §4「730 单列」的明确例外，见 §9。其余页面/壳层规则不变。
> **v2（2026-11-06 第二次视觉升级，D86）**：信息架构与 v1/D85 完全一致（4 入口、216→224 侧栏、分组列表、设置 push），只把「像 iOS」升级成「Liquid Glass · iOS 26」质感层——玻璃只给控件层、内容层不透明、弹簧动效、彩色图标块、specular 高光与极轻 grain。
> **v1（D85，同日）** 的结构决策（4 个一级入口、设置 push、删会话页 / 状态条 / 图标 rail、文案红线）继续有效；**D101 把语音收回「设置 › 语音输入」单页、D104（次日）又把语音升为第 4 个一级入口（⌘4）后，一级入口为 5 个**（D104 取代 D101 的导航部分；单页三段、内部不 push 与关键词 / 用量能力不变）；本文件只描述 v2 的材质、布局常量、组件行为与动效。
> 本文件是**实现契约**：改电脑端界面时按这里写；产品规则收进 `docs/prd/shell/`，视觉语义见 `docs/standards/visual.md`，交互规则见 `docs/standards/ux.md`。
> 事实源：令牌 / 材质 / 动效以 `app/src/desktop/styles/ios.css` 为准；组件行为以 `desktop/shell/*` 与各页为准。数值可能还会微调，**以「结构 + 规则」为准，不要逐像素抄**。

## 1. 结构

```
┌────────────────┬──────────────────────────────────────────────┐
│ 侧栏 224（玻璃） │  sticky 玻璃工具栏（滚动后浮现 17/600 紧凑标题）│
│ 38 交通灯区     │  概览（大标题 34/600）            [动作组]    │
│ logo + 小跟班   │                                              │
│ 概览            │  组标题 13/400                               │
│ 内容            │  ┌ 白卡 16 圆角（不透明） ────────────────┐   │
│ 用量            │  │ 行 52–54 / 图标块 30 / hairline 内缩   │   │
│ 语音            │  └────────────────────────────────────────┘   │
│ ──────────      │                                              │
│ 设置            │                                              │
│ ● 服务 47810    │                                              │
│ ● 手机 1 台     │                                              │
│ ● AI 空闲       │                                              │
└────────────────┴──────────────────────────────────────────────┘
```

- 一级导航 5 个：概览 ⌘1 / 内容 ⌘2 / 用量 ⌘3 / 语音 ⌘4 / 设置 ⌘5；设置固定在侧栏底部（D85 结构 + D104）。
- 语音是第 4 个一级页：单个一级页（fade 进入、页头 34/600「语音」），页内三段（百炼配置 `CloudAsrForm` / 关键词面板 `KeywordsPanel` / 语音用量 `UsageStatsPanel`）纵向排列，**内部不再 push**；侧栏语音项未配置时右侧 6px 琥珀点。
- 设置是 iOS 式「列表 → 二级页」：首页一张分组列表，点进手机连接 / AI 联动 / 自动输入 / 剪贴板 / 关于本机 / 消息通道；二级页从右侧 push 进入，工具栏左侧「‹ 设置」返回。
- 窗口 1180×760（最小 960×640）；macOS `titleBarStyle: Overlay` + `hiddenTitle`，交通灯浮在侧栏顶部 38 区域内。
- **拖动区**：侧栏顶部 38 与 sticky 工具栏（含二级页返回行）是 `data-tauri-drag-region`；工具栏里的按钮必须另有可用入口，不能把拖动区当唯一可点目标。
- 单列布局：内容列最大宽 730、左右 28；不写 `lg:` 两栏、不出现横向滚动。

## 2. 三层结构（v2 的核心规则）

| 层 | 成员 | 材质规则 |
| --- | --- | --- |
| **内容层** | 画布背景、分组白卡、列表行、图表/数据 | **不透明**。卡是 `--card` 实底 + 16 圆角 + 双层阴影 + 顶部 0.5px 高光；行只有 hover / 按下的浅面。**内容卡永远不用玻璃**（HIG：glass 只给导航与控件层）。 |
| **玻璃控件层** | 侧栏、sticky 工具栏、动作组、分段轨道、次级按钮、辅助功能提示 | 半透明 `--glass-bg` + `backdrop-filter: blur(22–30px) saturate(170–190%)` + 顶部 1px specular 高光 + 极轻投影；只出现在内容「之上」或「旁边」，不叠在白卡里。 |
| **弹层** | Dialog / Sheet / Toast 的遮罩与容器 | 遮罩 `rgba(0,0,0,.34)` + `blur(10px) saturate(120%)`；容器 20 圆角、`--popover` 实底 + `--popover-shadow`；入场 300ms。 |

- **和谐（concentric radii）**：外 18（工具栏）→ 16（白卡）→ 10（图标块）/ 9（导航项）→ 胶囊（按钮 / 分段 / 搜索）。新组件按「外层圆角 − 内边距」取同心值，不要随手写圆角。
- **画布环境光**：`background` 是页面底 + 两层极淡 radial gradient（`--ambient-a` 薄荷、`--ambient-b` 鲸蓝），让玻璃后面有可读的色差；不铺图片、不做噪点背景图。
- **grain**：`.desktop-ios::after` 固定一层 2.6% 透明度的 SVG 颗粒（`soft-light`，`z-index: 60`，`pointer-events: none`）。只做整体质感，**不要再加第二层**；不要调到可感知的强度。
- **`:root.desktop-ios`**：`app.tsx` 同时把 `.desktop-ios` 加到 `<html>`，Dialog / Sheet 走 portal 时才吃得到桌面令牌；只挂根 div 会让弹层掉回全局深海令牌。

## 3. 令牌（`ios.css`，`.desktop-ios` 作用域）

**基础色 / 文字**

| 令牌 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| `--background` | `#F2F2F7` | `#000000` | 画布底（分组灰 / 纯黑） |
| `--card` | `#FFFFFF` | `#1C1C1E` | 内容白卡、弹层内表面 |
| `--foreground` | `#1C1C1E` | `#F2F2F7` | 主文 |
| `--muted-foreground` | `#8A8A8E` | `#98989D` | 次级文字 / 行值 |
| `--tertiary` | `#B9B9C0` | `#5C5C61` | chevron、弱化图标 |
| `--border` | `#E4E4E9` | `#38383A` | 卡内控件分隔 |
| `--separator` | `rgba(60,60,67,.14)` | `rgba(255,255,255,.09)` | 列表行 hairline（0.5px） |
| `--signal` | `#0A7764` | `#3FC4A0` | 薄荷强调 / 选中图标 / focus |

**玻璃与控件**

| 令牌 | 浅色 | 深色 |
| --- | --- | --- |
| `--glass-bg` | `rgba(247,247,251,.78)` | `rgba(30,30,33,.80)` |
| `--glass-border` | `rgba(0,0,0,.07)` | `rgba(255,255,255,.08)` |
| `--glass-highlight` | `rgba(255,255,255,.72)` | `rgba(255,255,255,.10)` |
| `--sidebar-bg` | `rgba(236,236,240,.82)` | `rgba(16,16,18,.72)` |
| `--sidebar-item-active` | `rgba(255,255,255,.92)` | `rgba(58,58,62,.90)` |
| `--button-secondary` | `rgba(120,120,128,.12)` | `rgba(120,120,128,.24)` |
| `--seg-thumb` | `#FFFFFF` | `#636366` |
| `--focus-ring` | `rgba(10,119,100,.28)` | `rgba(63,196,160,.34)` |
| `--ambient-a` / `--ambient-b` | 薄荷 / 鲸蓝极淡 | 同色更亮一档 |

- `--glass-shadow`、`--card-shadow`、`--card-highlight`、`--popover-shadow`、`--sidebar-item-active-shadow` 都在 `ios.css`；组件不自己拼阴影。
- **iOS system colors**（只给图标块 / 数据强调）：`--ios-blue #0A84FF`、`--ios-green #34C759 / #30D158`、`--ios-orange #FF9F0A`、`--ios-purple #BF5AF2`、`--ios-pink #FF375F`、`--ios-teal #0A7764 / #3FC4A0`、`--ios-gray #8E8E93`。
- 琥珀 `--decide` 仍只给「等你决定」；危险 `--destructive` 浅 `#D1372C` / 深 `#FF6961`，只小面积。

## 4. 布局常量

| 项 | 值 |
| --- | --- |
| 侧栏 | 宽 **224**；顶部 38 交通灯区；logo 22 + 「小跟班」15/600；导航项高 34、圆角 9、14/500、图标 17（stroke 2.1）；选中项白色滑块（深色 `#3A3A3E`）用 spring 在入口之间 morph；「设置」固定底部；分隔线 + 三行状态摘要（行高 26、12 号、色点 7px） |
| sticky 工具栏 | 高 **48**、圆角 **18**、`sticky top-0 z-30`；未滚动时透明、只显示右侧动作组（二级页另有左侧「‹ 设置」返回），滚动 > 6px 后变玻璃并在左侧淡入 **17/600** 紧凑标题；拖动区 |
| 大标题 | **34/600**、`tracking -0.022em`，在工具栏下方；右侧可选状态胶囊；不写副题 / 说明句 |
| 内容列 | 最大宽 **730** 居中、左右 **28**、底部 64；页内滚动、`overscroll-contain`；组间距 **24**。**用量页例外（D97）**：`size="wide"` → 最大宽 **956**（1180 窗内约 900 内容）、`bottomGap="compact"` → 底部 24，见 §9。 |
| 白卡 / 列表行 | 卡 16 圆角；行最小高 **54**（`px-16 / py-10`）、行标题 **15/400**、说明 **13/400**、右侧值 **15**（mono 13、tabular）；分隔线 0.5px、左缩进 **16**（带图标块 **60**）；按下缩到 0.996 |
| 图标块 | **30×30 / 圆角 10**、白字、顶部 0.5px 高光；七个 tone：blue / green / orange / purple / pink / teal / gray；不给 tone 时退化为 22 盒薄荷线性图标 |
| 按钮 | **胶囊 999**；高 36（sm 30 / xs 26）、13–14/500；实心薄荷 / 玻璃次级 / 薄荷文字 / 危险红字；一页最多一个实心；按下缩到 0.97；工具栏相邻动作并进一个玻璃动作组 |
| 分段控件 | 胶囊玻璃轨道 + 白色滑块（深色 `#636366`），按钮高 28、13/500；滑块 spring morph |
| 开关 / 输入 / 搜索 | 开关 40×24、白滑块 20；输入 38 高 / 圆角 11 / 14 号；搜索是 40 高胶囊（`--muted` 底，聚焦柔光）；checkbox 18 / 圆角 5；select 34 / 圆角 10 |
| 弹层 | Dialog 20 圆角、标题 18/600、描述 14/1.5；遮罩 34% 黑 + blur 10；Sheet 20 圆角 |
| 焦点 | 内描边柔光 **3.5px** `--focus-ring`，`outline: none`；不在列表里抖动 |
| 字体 | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", …`；桌面不随包字体；mono 只给地址、版本号、快捷键，以及**用量页的数字/日期**（`.dsl-num`，D97，SF Mono/Menlo 回退） |

## 5. 组件（唯一来源）

`app/src/desktop/shell/list.tsx`：

- `ListGroup({ title?, action? })`：组标题（13/400 次级灰）在卡外；卡是 `.dsl-card`（不透明白卡）。
- `ListRow({ icon?, iconTone?, title, detail?, meta?, mono?, chevron?, control?, onClick?, tone?, separatorInset? })`：
  最小高 54；有 `iconTone` 时左侧渲染 30×30 彩色图标块、分隔线自动缩进 60；能点整行就整行点，右侧**只有一个值或一个控件**。
- `ListActionRow({ tone })`：卡尾一行动作（在 DSH 打开 / 清空历史 / 价格表），最小高 48、纯文字，不做实心按钮。
- `ListEmpty`：卡内一行居中弱化文字（最小高 76），不画空态插画。

`app/src/desktop/shell/page-shell.tsx` / `page-header.tsx`：

- `PageShell({ transition = "fade", size = "regular", tone = "default", bottomGap = "regular" })`：滚动容器 + 内容列（regular 730 / 28 / 底 64；wide 956 / 28 / 底 24）；`tone="usage"` 给滚动容器加 `dsl-usage-canvas`（用量页画布）；`fade` = 一级页切换（`dsl-page-in`），`push` = 设置二级页从右侧推入（`dsl-page-push`）；滚动 > 6px 时把「已滚动」状态提供给页头。
- `PageBody`：组间距 24。
- `PageHeader({ title, actions?, onBack?, backLabel?, compact? })`：sticky 玻璃工具栏 + 34/600 大标题；二级页在工具栏左侧显示「‹ 设置」；不写 description（旧参数仅兼容）；`compact` 用于宽幅数据页——不渲染大标题、工具栏标题常显、保留 `sr-only h1`。
- `shell/segmented-control.tsx`：胶囊玻璃轨道 + 白色滑块，spring morph；选中语义用 `aria-pressed`。
- `shell/sidebar.tsx`：224 玻璃侧栏 + 导航滑块 + 三行状态摘要。

其他：

- 按钮 `shared/ui/button`：`default` 实心薄荷（一页最多一个）、`outline`/`secondary` 玻璃次级、`ghost` 薄荷文字、`destructive` 红字。
- 开关 `shared/ui/switch`；确认用 `shared/ui/dialog`；粘贴提示用 Sonner toast。
- 图标块颜色只从 `ListIconTone` 七个值里选，不新增色值；普通图标用 22 盒薄荷线性图标。
- 旧 `Card` / `MetaRow` / `CardHint` 已无页面使用（仅保留导出、待删）；`PageFooter` 恒为 null。

## 6. 动效

| 场景 | 实现 | 规则 |
| --- | --- | --- |
| 一级页切换 | `dsl-page-in` 320ms | 淡入 + 轻微上浮/缩放；换页自然重播 |
| 设置二级页 push | `dsl-page-push` 340ms | 从右侧 26px 推入 + 淡入；返回不反向播 |
| 侧栏选中滑块 | Motion `layoutId` + spring | `SPRING_SLIDE`：stiffness 520 / damping 24 / mass 0.8（ζ≈0.59，过冲 10%） |
| 分段滑块 | Motion `layoutId` + spring | 同一令牌 `SPRING_SLIDE`：滑块跨选项 morph 时越位再落定 |
| 按压缩放 | CSS / Motion | 行 0.985 / 按钮 0.94 / checkbox 0.9 / 导航项 0.965；按下 90ms 快进、松手 320ms 回弹，只弹一次 |
| 弹层入场 | `dsl-dialog-in` 320ms / 遮罩 220ms | 遮罩 blur 从 0→10；容器从 0.94 + 8px 下方弹起，back-out 过冲到约 1.03 |
| 数值变化 | Motion 补间 400ms | 只给用量 2×2 数字；首帧直接显示最终值，不数数 |
| 柱阵入场 | Motion `scaleY` 420ms、20ms 错峰 | 只在日期窗口变化时重播，同区间刷新不重播 |

- **Q 弹（D89）**：弹簧只服务控件层——滑块、按压、弹层；页面 fade / push 不加过冲（730 内容列整体回弹会晕）。手机端在 `clean.css` 用同一根 back-out 曲线（`--spring-back`）：结果卡 300ms pop-in、会话行 260ms + 24ms 错峰、麦克风圆钮按下 0.92、开关滑块 transform 320ms；WebView 103 只认 `transform`，不写 CSS `translate` / `scale` 属性。
- **reduce-motion**（`prefers-reduced-motion: reduce`）：关掉页面 / 弹层入场、行与按钮过渡、按压缩放；滑块 spring 退化为 `duration: 0`；保留状态切换的即时反馈。
- **reduced-transparency**（`prefers-reduced-transparency: reduce`）：玻璃层去掉 `backdrop-filter`，背景退回 `--card` 实底；不允许在此时仍依赖模糊可读性。
- 动画只动 `transform` / `opacity` / 颜色；不做无限循环装饰；后台 / 失焦由 `useMotionPause` 暂停。

## 7. 文案红线（沿用 v1）

- 不写页面说明句、不复述标题含义、不放 mono 大写装饰、不写「暂无数据」。
- 每行只有「标题 + 一个短值 / 一句状态」；标题 ≤8 字，行值 ≤12 字优先。
- 只有三类解释可以留：不可逆/危险操作、安全与隐私承诺、必须的输入提示（如 Key、地址格式）。
- 版本行写「0.1.0 · 简约 iOS」（`AboutSettings`）。
- 空态只留一行结论或一个动作；错态 = 原因 + 下一步 + 动作。

## 8. 明确不做

- **内容层不做玻璃**：白卡 / 行 / 图表保持不透明；不要把 `backdrop-filter` 加到卡片、整页或滚动内容上。
- **不做真实窗口 vibrancy / 透明窗口**：macOS 窗口材质交给系统；不把窗口设为透明去透桌面。
- **不做纯装饰动效**：不加循环粒子、扫描线、发光边框；动效只为层级与操作反馈服务。
- **手机端不用玻璃**：`.mobile-clean` 不变，D80/D81 规则照旧。
- 不改协议、Rust、store 行为；不引入新依赖（图标只用 lucide-react、二维码沿用 `qrcode`）。
- 不恢复会话列表页、状态条、图标 rail、系统页分段条（D85 已删除）。
- 数据页例外：用量页允许 SVG 折线/面积、坐标轴、占比条与等宽数字（D97）；其他页面继续不画 SVG 数据图、不做图表库。

## 7. 窗口级材质（macOS vibrancy，D87）

真实 Tauri + macOS 时，窗口本身是透明的，底部由系统 `NSVisualEffectView`（`underWindowBackground`）负责模糊窗口背后的东西：

| 层 | 谁负责 | 结果 |
| --- | --- | --- |
| 窗口材质 | `tauri.macos.conf.json`：`macOSPrivateApi` + `transparent` + `windowEffects` | 桌面/窗口后面的内容被系统模糊；失焦时自动变浅 |
| 内容区 | `.dsl-main` 铺不透明 `--background` + 环境光 | 文字对比度不被材质影响 |
| 侧栏 | 只留一层白色 tint，`backdrop-filter: none` | 桌面透过侧栏，交通灯区域同样透明 |
| 弹层 | `.dsl-glass` / dialog | 不依赖窗口材质，portal 仍吃 `.desktop-ios` 令牌 |

开关与回退：

- `index.html` 内联脚本判断「真实 Tauri（`__TAURI_INTERNALS__.metadata`）+ macOS + 未设 `sidekick:vibrancy=off`」才加 `.dsl-vibrancy`；浏览器 dev mock 永远不加。
- 想临时关掉材质：DevTools 执行 `localStorage.setItem("sidekick:vibrancy","off")` 后刷新（恢复删除该项）。
- `prefers-reduced-transparency: reduce` 时侧栏退回 `--sidebar` 实色。
- **不要**把透明窗口配置写进基础 `tauri.conf.json`：Android 窗口会跟着透明。
- 无头/CI 只能验证「检测表达式 + `.dsl-vibrancy` 下的 CSS 契约」（`qa-desktop-ios.mjs` 的 `vibrancy` 段），真实材质必须人工目检。

## 9. 宽幅数据页（用量，D97）

> 用量页是「730 单列」的明确例外：它是数据页，不是设置列表；其他一级页/二级页仍按 §4。

- **骨架**：`<PageShell size="wide" tone="usage" bottomGap="compact">` + `<PageHeader compact title="用量" actions={区间下划线 tab + 刷新} />`。内容约 900（`max-w-[956px]` − 左右 28）；1180×760 首屏不裁切（底部 24）；`html.dsl-vibrancy` 下 `.dsl-usage-canvas` 透明，不吃掉原生材质。
- **层级**：花费 hero（58/500 等宽 + `≈` + 环比 + 区间日期）→ 花费剖面 → Token 光谱 + 分组账本（价格行贴底）；无白卡、无组标题；hairline `--border` 分隔，组间距 20–28。
- **令牌**：`app/src/desktop/styles/usage.css` 的 `.dsl-usage` 作用域——浅/深 `--usage-c1..c5`（缓存读固定 c1 薄荷）、`--usage-up`、`--usage-grid`、`--usage-glow`、`--usage-mono`；数字用 `.dsl-num`（SF Mono → Menlo → 等宽回退 + tabular）。**不要把这些颜色写回 `ios.css` / `tokens.css`**。
- **图表**：SVG `viewBox 900×196`，左轴 40 / 顶 14 / 底 170；2 条网格 + 基线 + `¥` 轴标；Catmull-Rom 平滑 + 面积渐变；今日竖虚线 + 空心点 + 呼吸环 + 末段虚线（仅最后一天是今天时）；峰值标注（峰值是今天则跳过）；单日柱 + 昨日基准；悬停十字线 + 气泡（高点自动翻到点下方）；`role="img"` + 完整 aria-label + `sr-only` 每日表；Motion `pathLength` 1.05s；`prefers-reduced-motion` 直接定格。
- **断点**：`max-width: 1079px` 时 hero 读数换行、下半区单列（账本在前、构成 + 价格在后）；960×640 允许页内纵向滚动，不横向溢出。
- **共享数学**：`app/src/shared/lib/usage-chart.ts`（桌面 + 手机共用），不要复制刻度 / 路径 / 百分比 / 环比逻辑。
- **明确不做**：图表库、内容层玻璃、把用量页改回 730、让缓存读继续用 `--chart-2` 蓝。
