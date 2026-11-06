---
doc: standards/visual
title: 视觉与动效规范
status: active
updated: 2026-11-05
load: on-demand
---

# 视觉与动效规范

> 概念：**深海声呐（Direction B · Sonar）**——鲸鱼在深海里发声，电脑和手机用声呐互相找到；信号与连接本身就是品牌。
> 两套主题：深色「深海自发光」与浅色「海面雾光 + 海玻璃」（第二主题，重新设计光源，不是把深色反色）。外观默认跟随系统；宠物舞台随主题——深色是深海自发光，浅色换成「海玻璃舞台」。
> 唯一事实源：颜色、圆角、字体、动效令牌以 [`app/src/shared/styles/tokens.css`](../../app/src/shared/styles/tokens.css) 为基线；桌面另有 [`app/src/desktop/styles/ios.css`](../../app/src/desktop/styles/ios.css)（`.desktop-ios` 作用域；D85 定「简约 iOS」结构，**D86 升级为 Liquid Glass · iOS 26 质感层**），手机另有 `app/src/mobile/styles/clean.css`（`.mobile-clean`，D80/D81），两者互不影响。本文档解释语义与用法。2026-11-04 起取代「夜灯桌宠」单暗色方案（[D71](../decisions.md)）；同日 D76 把默认值改为跟随系统、宠物舞台随主题；2026-11-06 D85 桌面换「简约 iOS」，D86 换 Liquid Glass。

## 1. 视觉原则

1. **每个发亮的东西都有理由**：薄荷 = 信号/可操作/正在发生；琥珀 = 需要你决定；其余退回海水层。不做「近黑底 + 单一荧光绿」的装饰性发光。
2. **深、清、准**：分层海水表面、1px 精确描边、点阵/等距刻度。**电脑端 D86 起允许 Liquid Glass 材质，但只做控件层**（侧栏 / 工具栏 / 动作组 / 分段 / 弹层遮罩）；不做霓虹、发光边框，不把玻璃铺到内容卡或整页。
3. **仪器而不是玩具**：数据用等宽字 + tabular-nums；状态不是红绿灯（文字 + 颜色点，颜色只是第二线索；3 格信号只在手机消息页的连接强度处保留）。
4. **会呼吸的仪器**：同心声呐环（仅桌面状态点；手机宠物舞台环已删除，D77）、呼吸光点；只动 `transform` / `opacity`。
5. **可读性优先**：正文/次要文字 ≥ 4.5:1；颜色不是唯一状态提示；焦点永远可见。
6. **性能即风格**：安卓 WebView 避免大面积 `filter`/`blur`/阴影动画；OLED 在深色主题下保持深底、装饰只做小面积低亮度。

## 2. 两套主题

| | 深色 | 浅色 |
| --- | --- | --- |
| 名字 | 深海自发光 | 海面雾光 + 海玻璃 |
| 光源 | 生物荧光自身发光 | 顶部雾光打在磨砂海玻璃上 |
| 页面底 | `#06181e` 墨绿蓝海水 | `#e7efed` 雾白海玻璃 |
| 表面层次 | `#0b242c` → `#11313a`，越靠前越亮 | `#f5faf8` → `#fcfefd`，越靠前越亮 |
| 文字 | `#dceceb` 带青雾白 | `#0e2a2b` 深墨绿 |
| 薄荷 | 亮 `#6ef0c8` / `#3fc4a0` | 沉成深水青 `#0a7764` / `#095b51` |
| 鲸蓝 | 远处水体 `#8fb6e0` | 印刷墨蓝 `#28618c` |
| 阴影 | 少，靠描边与明度分层 | 极轻顶光，几乎无投影 |
| 宠物舞台 | `#030e12` 深海自发光 | `#dcebe7` 海玻璃舞台 |

- 默认跟随系统：`sidekick:theme` 缺失/非法一律视为 `system`，首次启动、无存档时随系统亮暗（运行时见 [frontend-architecture](../frontend-architecture.md#6-样式规范)）；只有 localStorage 不可用（隐私模式等）时运行时静默回退深色，偏好本身不会写成 `dark`。
- 浅色是独立手调的一套，不是反色；两套都必须单独验收对比度与视觉层级。
- **宠物舞台随主题**：深色 `--pet-bg #030e12` 深海自发光；浅色换成「海玻璃舞台」`--pet-bg #dcebe7`（表面 `#f7fcfa`/`#edf7f3`、文字 `#0e2a2b`/`#3f5e5d`）。鲸鱼资产不重绘、不加 CSS filter，浅底对比度偏低是已知代价（见 §8）。

**桌面「Liquid Glass · iOS 26」作用域（D85 结构 + D86 质感，`ios.css` 只挂 `.desktop-ios`）**

基础色与基线 `tokens.css` 同语义，但桌面独立取值：

| 项 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| 页面底 | `#F2F2F7` | `#000000` | 内容层画布 |
| 卡 / 弹层 | `#FFFFFF` / `#FFFFFF` | `#1C1C1E` / `#2C2C2E` | 分组白卡、dialog（不透明） |
| 主文 / 次级 | `#1C1C1E` / `#8A8A8E` | `#F2F2F7` / `#98989D` | 标题与短值 |
| hairline / 分隔线 | `#E4E4E9` / `rgba(60,60,67,.14)` | `#38383A` / `rgba(255,255,255,.09)` | 控件边框 / 列表行 0.5px |
| 薄荷信号 | `#0A7764` | `#3FC4A0` | 强调、选中图标、focus |
| 等你决定 / 危险 | `#B3730F` / `#D1372C` | `#EAB173` / `#FF6961` | 琥珀只给等你决定；危险只小面积 |

**玻璃与材质（只给控件层）**

| 令牌 | 浅色 | 深色 | 用法 |
| --- | --- | --- | --- |
| `--glass-bg` | `rgba(247,247,251,.78)` | `rgba(30,30,33,.80)` | 侧栏、sticky 工具栏、动作组、辅助功能提示 |
| `--glass-border` / `--glass-highlight` | `rgba(0,0,0,.07)` / `rgba(255,255,255,.72)` | `rgba(255,255,255,.08)` / `rgba(255,255,255,.10)` | 玻璃边缘 + 顶部 specular 高光 |
| `--sidebar-bg` | `rgba(236,236,240,.82)` | `rgba(16,16,18,.72)` | 224 侧栏底 |
| `--sidebar-item-active` | `rgba(255,255,255,.92)` | `rgba(58,58,62,.90)` | 导航选中滑块 |
| `--button-secondary` | `rgba(120,120,128,.12)` | `rgba(120,120,128,.24)` | 次级按钮 / 分段轨道 |
| `--seg-thumb` | `#FFFFFF` | `#636366` | 分段滑块 |
| `--focus-ring` | `rgba(10,119,100,.28)` | `rgba(63,196,160,.34)` | 3.5px 柔光焦点 |
| `--ambient-a` / `--ambient-b` | 薄荷 / 鲸蓝极淡 | 同色更亮一档 | 画布两层 radial 环境光 |

- **材质公式**：`background: var(--glass-bg)` + `backdrop-filter: blur(22–30px) saturate(170–190%)` + `box-shadow: var(--glass-shadow), inset 0 0.5px 0 var(--glass-highlight)`；玻璃层之间不要互相叠 blur。
- **同心圆角**：18（工具栏）→ 16（白卡）→ 10（图标块）/ 9（导航项）→ 胶囊（按钮 / 分段 / 搜索）。新组件取外层圆角减内边距，不要随手写圆角。
- **specular 高光**：玻璃 / 白卡 / 实心按钮 / 图标块顶部 0.5–1px 白色高光（浅色更明显），这是「玻璃感」的主要来源之一，不要用整块渐变替代。
- **grain**：`.desktop-ios::after` 固定一层 2.6% 透明度 SVG 颗粒（`soft-light`、`z-index: 60`、不接事件）；只做整体质感，不加第二层、不调重。
- **画布环境光**：页面底 + 两层极淡 radial（薄荷 / 鲸蓝），让玻璃后面有可读色差；不铺图片、不加第二种背景纹理。
- **iOS system colors**（只给图标块 / 数据强调）：`blue #0A84FF`、`green #34C759 / #30D158`、`orange #FF9F0A`、`purple #BF5AF2`、`pink #FF375F`、`teal #0A7764 / #3FC4A0`、`gray #8E8E93`。
- **玻璃只用于控件层**：侧栏、sticky 工具栏、动作组、分段轨道、次级按钮、辅助功能提示、弹层遮罩；**内容卡 / 列表行 / 图表永远不透明**（HIG：glass 是导航与控件层）。
- **兜底**：`prefers-reduced-transparency: reduce` 时玻璃去掉 `backdrop-filter`、背景退回 `--card` 实底；此时不能依赖模糊来保证可读性。
- 桌面字体用系统栈 `-apple-system`，不随包字体；手机才用随包 MiSans Normal 400（D81）。


## 3. 语义色板

下表是 `tokens.css` 的两端基线（手机 / 宠物舞台 / 通用语义）；**桌面以 §2 的 `.desktop-ios` 取值为准**。hex 与 `tokens.css` 一致；对比度按 WCAG 2.1 计算（正文 ≥ 4.5:1，非文字控件 ≥ 3:1），标注为「浅色 / 深色」。

**基础表面与文字**

| 令牌 | light | dark | 用途 | 关键对比度 |
| --- | --- | --- | --- | --- |
| `--background` | `#e7efed` | `#06181e` | 页面底 | 正文 L 12.98 / D 14.90 |
| `--foreground` | `#0e2a2b` | `#dceceb` | 主文字 | 同上 |
| `--card` / `--card-foreground` | `#f5faf8` / `#0e2a2b` | `#0b242c` / `#dceceb` | 卡片、左栏 | 14.38 / 13.23 |
| `--popover` / `--popover-foreground` | `#fcfefd` / `#0e2a2b` | `#11313a` / `#dceceb` | 输入框、气泡、弹层内表面 | 14.97 / 11.46 |
| `--secondary` | `#fcfefd` | `#11313a` | 次表面 | — |
| `--muted` / `--muted-foreground` | `#dfece8` / `#3f5e5d` | `#10393b` / `#93b4b2` | 弱化面、次要文字/标签 | 6.05 / 8.13 |
| `--accent` / `--accent-foreground` | `#dfece8` / `#0e2a2b` | `#10393b` / `#dceceb` | shadcn hover/选中面（= `--wash`） | 其上文字 12.49 / 10.32 |
| `--border` | `#a4beb9` | `#2b5560` | 1px 描边、分隔线、刻度 | 约 1.9:1，非文字 hairline |
| `--input` | `#6f8f89` | `#578893` | 表单控件描边（加强） | 对输入框底 3.48 / 3.51；对卡片 3.34 / 4.10 |
| `--ring` | `#0a7764` | `#6ef0c8` | 键盘焦点环 | 与 `--signal` 同值 |

**语义与品牌**

| 令牌 | light | dark | 用途 | 关键对比度 |
| --- | --- | --- | --- | --- |
| `--primary` / `--primary-foreground` | `#095b51` / `#f7fdfb` | `#3fc4a0` / `#032019` | 主按钮实色 + 其上文字 | 7.77 / 7.85 |
| `--signal` | `#0a7764` | `#6ef0c8` | 数据字、声呐环、状态点、导航高亮 | 4.68 / 12.93（页面底） |
| `--decide` | `#8a5410` | `#eab173` | 只给「等你决定」 | 5.93 / 8.47（卡片） |
| `--whale` | `#28618c` | `#8fb6e0` | 鲸蓝：次层信息、剪影、完成态 | 5.65 / 8.59（页面底） |
| `--wash` | `#dfece8` | `#10393b` | 选中/悬停/我方气泡的薄荷薄层 | — |
| `--abyss` | `#082229` | `#030e12` | 深色舷窗/装饰底；宠物舞台已改用随主题的 `--pet-bg`（D76） | 仅深底 |
| `--glow` | `#6ef0c8` | `#6ef0c8` | 舷窗内生物荧光（两主题同值，装饰） | 仅深底 |
| `--success` | `#186b49` | `#64d9a4` | 完成/成功（小面积） | 6.15 / 9.21（卡片） |
| `--warning` | `#8a5410` | `#eab173` | 表单校验/提醒，与 `--decide` 同源 | 5.93 / 8.47（卡片） |
| `--destructive` / `--destructive-foreground` | `#9c3a2b` / `#fff8f6` | `#e6847a` / `#2b100c` | 删除/失败，只小面积 | 6.52 / 6.10（卡片） |
| `--chart-1…5` | 见 tokens.css | 见 tokens.css | 图表，顺序 = signal / whale / decide / destructive / success | — |

**宠物作用域**：`--pet-*` 随主题切成两套。深色：`--pet-bg #030e12`、surface `#0b242c`/`#11313a`、wash `#10393b`、text `#dceceb`、muted `#93b4b2`、border `#2b5560`、input `#578893`、primary `#3fc4a0`/`#032019`、signal `#6ef0c8`、coral `#e6847a`、coral-foreground `#2b100c`、ask `#eab173`、success `#64d9a4`、danger `#e6847a`。浅色「海玻璃舞台」：`--pet-bg #dcebe7`、surface `#f7fcfa`/`#edf7f3`、wash `#cfe4de`、text `#0e2a2b`、muted `#3f5e5d`、border `#9dbab4`、input `#6f8f89`、primary `#095b51`/`#f7fdfb`、signal `#0a7764`、coral `#b34628`、coral-foreground `#fff8f6`、ask `#8a5410`、success `#186b49`、danger `#9c3a2b`。始终深色的表面（桌面麦克风浮层）加 `.deep-sea-scope` 重新钉住深色 pet 令牌，以及浮层用到的壳层信号色（`--signal`/`--ring`/`--decide`/`--destructive`/`--abyss`），避免浅色主题把深底浮层刷成深底深字/深底深信号色。鲸鱼本体颜色归 OpenPets 图集，CSS 不再定义 `--pet-body` / `--pet-belly` / `--pet-eye` / `--pet-cheek`。

### 3.1 语义约定

- **`--signal`（= `--ring`）**：负责「读数」——数据字、声呐环、状态点、导航高亮、focus ring。它比 `--primary` 更亮/更青一档（同族两级），不单独承担大块实色。
- **`--primary`**：负责「可点」——主按钮实色。浅色主题必须保持深水青 `#095b51`，不要为了“亮”提亮成荧光绿，否则会退化成「白底亮绿按钮」。
- **`--decide`（琥珀）**：只出现在「等你决定 / 需要你确认」。表单校验失败、连接失败用 `--destructive`，不能用琥珀。
- **`--whale`（鲸蓝）**：次层信息、鲸鱼剪影、完成态、图表第二色。**不要写进 `--accent`**——`--accent` 是 shadcn 的 hover/选中面，语义上等于 `--wash`；改 `--accent` 会让所有组件 hover 变蓝块。
- **`--wash`**：选中、悬停、我方气泡的薄荷薄层，不是实色。
- **`--abyss` / `--glow`**：只在深色舷窗/宠物舞台内部使用；`--glow` 是装饰光，不能做文字色，也不能铺大面积。
- **`--border` 是 hairline（约 1.9:1）**：只做分隔和轮廓，靠 1px 线 + 相邻表面明度差 + 2px focus ring 建立边界。为满足 WCAG 1.4.11（非文字 ≥ 3:1），表单控件（input/textarea/select/checkbox 边框）单独用加强的 **`--input`**，而不是把全站描边加粗——整页 3:1 描边会把仪器感变成工程图，而卡片/分隔线并不参与控件识别。
- **不许用 `oklch` / `color-mix` 定义最终令牌**：真机 WebView 103（Realme）不支持，全部用 hex；`color-mix` 只可作为渐进增强并带 hex fallback。

## 4. 间距、圆角与层次

**间距刻度（4 的倍数）**

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| space-1 | 4px | 图标与文字、标签内缝 |
| space-2 | 8px | 控件之间、列表行内、按钮组 |
| space-3 | 12px | 卡片内元素、按钮横向、表单行 |
| space-4 | 16px | 卡片内边距、手机页面边距、卡片之间 |
| space-5 | 24px | 桌面页面内边距、模块间距、手机安全边距 |
| space-6 | 32px | 分区间距、桌面内容区边距 |
| space-7 | 48px | 大区块之间、Hero 上下 |
| space-8 | 64px | 章节呼吸、桌面窗口内大分区 |

实际落地直接用 Tailwind 的 4px 基准刻度 `1/2/3/4/6/8/12/16`，不再新增间距变量。

- 桌面：224 玻璃侧栏 + 内容左右 28、最大宽 730 居中；组间距 24；窗口设计基准 **1180×760**（最小 960×640）。
- 手机：页面左右 16，顶部状态条上边距 16–18，底部 `env(safe-area-inset-bottom)` + 麦克风上方 14；单列竖屏。
- 卡片内边距 14/16，大面板 24；标题与内容 8–10；同组按钮 8，表单行 12，卡片之间 16，分区之间 48–64。

**圆角**

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--radius-sm` | 10px | 输入框、小按钮、列表行 |
| `--radius-md` | 12px | 按钮、卡片、气泡 |
| `--radius-lg` | 14px | 气泡组、弹层、面板 |
| `--radius-xl` | 16px | 窗口、宠物舷窗、大卡片 |
| `--radius-2xl` / `3xl` / `4xl` | 20 / 24 / 28px | 大面板、手机弹层 |
| `--radius-pill` | 999px | 状态胶囊、麦克风、开关 |

`--radius` 基座 12px；shadcn 的 `--radius-sm…4xl` 由 `@theme inline` 派生，组件不要写死圆角数字。
- 桌面「Liquid Glass」覆盖（`ios.css`）：控件胶囊 999、白卡 16、工具栏 18、dialog/sheet 20、输入 11、搜索胶囊 999、图标块 10、导航项 9、开关高 24；手机沿用上表。

**描边与阴影**

- 描边永远 1px；不用 2px 以上粗边、不靠粗黑边（Neubrutalism 不适合本产品）。
- 桌面没有自绘窗口阴影（macOS Overlay 标题栏，阴影交给系统）；白卡用双层 `--card-shadow`（0.5px 描边 + 1px 近影 + 大范围极淡远影）+ 顶部 `--card-highlight` 高光；玻璃用 `--glass-shadow`；弹层一层 `--popover-shadow`。
- 层次顺序：背景 → 水面/卡片 → 宠物 → 气泡 → 控制区；z-index 用固定层级，不临时加 9999。

## 5. 字体与排版

- 系统无衬线：`-apple-system, "PingFang SC", "Noto Sans CJK SC", "Helvetica Neue", sans-serif`；桌面不打包字体；手机随包 MiSans Normal 400（D81，`.mobile-clean` 首选，系统字体做缺字回退）。
- 数据等宽：`ui-monospace, SFMono-Regular, "SF Mono", Menlo, "Cascadia Mono", monospace`；数字统一 `font-variant-numeric: tabular-nums`（`body` 已全局开启）。
- 字重 400 / 500 / 600（桌面大标题 600、字距 -0.022em）；中文行高 1.55–1.7；拉丁小标签字距 0.14–0.22em；显示级 -0.03em。

| Role | 字号 / 行高 | 字重 · 字距 | 用在哪 |
| --- | --- | --- | --- |
| display | 40–68 / 1.02–1.06 | 600 · -0.03em | 品牌/提案页；App 内不用 |
| h1 | 34 / 1.0 | 600 · -0.022em | 桌面页面大标题（D86）；手机二级页 inline 标题 17/400（D80/D81） |
| h2 | 13 / 1.3 | 400 · 0 | 桌面组标题（卡外）；桌面 sticky 紧凑标题 17/600；手机卡片标题 15–16/400（D81） |
| h3 / 手机状态 | 21 / 1.35 | 600 · -0.01em | 宠物页主状态文案 |
| body | 14–15 / 1.55–1.7 | 400 · 0 | 正文、气泡、说明 |
| label | 10–11 / 1.6 | 500 · 0.14–0.22em | 拉丁小标签（全大写）；**桌面 D85 起不再使用 mono 大写装饰**，只留给设计归档 |
| data | 11–13 / 1.6 | 400 · tabular | 地址、延迟、用量、时间 |
| micro | 8.5–10 / 1.5 | 400 · 0.12em | 舷窗角标/刻度，仅装饰不承载信息 |

- 中文不用全大写/宽字距制造“科技感”；中文标题靠字重和负字距收紧，数字靠等宽对齐。
- 桌面新壳字号：大标题 34/600（`tracking -0.022em`）、sticky 紧凑标题 17/600、组标题 13/400、行标题 15/400、行值 15（mono 13）、说明 13/400、按钮 13–14/500、状态摘要 12。
- 手机端承载信息的小标签 ≥ 10.5px（真机 DPR ≥ 2）；8.5–9px 只给装饰刻度。

## 6. 动效

| 层 | 引擎 | 用途 | 约束 |
| --- | --- | --- | --- |
| 微动效 | CSS transition | hover、按下、颜色、透明度、呼吸点 | 120–180ms；只动 transform/opacity/color |
| 界面 | Motion | 弹层/抽屉、页面进入、滑块 morph、数字/柱阵入场 | 240–420ms；桌面用 spring 或 `cubic-bezier(.16,1,.3,1)`（详见下） |
| 角色 | 帧动画图集 | 宠物 AI 四态与状态行 | 10fps；后台/覆盖层暂停；减少动效冻结第 0 帧 |
| 装饰 | CSS keyframes | 桌面状态点声呐环、呼吸点 | 见下；纯装饰、`aria-hidden` |

- 时长令牌：`--dur-1 120ms` / `--dur-2 180ms` / `--dur-3 240ms` / `--dur-4 320ms`；缓动统一 `--motion-ease-out-soft`（`cubic-bezier(.22,1,.36,1)`）。
- **声呐环**：只剩桌面「已连接」状态点的 5.6s 极慢同心环（`.sonar-dot-ring`，细描边、低亮度，已落地）；手机宠物舞台的背景环已删除（D77，舞台不再绘制声呐环）。环只动 `transform`/`opacity`，不发光、不叠 `filter`；是背景装饰，不参与宠物帧选择，也不包住鲸鱼本体。
- 呼吸光点 3.2s：已连接但空闲时一个 8px 光点极慢呼吸，不闪不转。
- 按钮/状态反馈 ≤ 100ms；宠物瞬态庆祝已随首次命名下线（2026-11-05）；已无失败关心短态（D77）。
- **桌面 Liquid Glass 动效（D86）**：一级页 fade 320ms、设置二级页 push 340ms（右侧 26px 推入）；侧栏滑块 spring（stiffness 520 / damping 40 / mass 0.8）、分段滑块 spring（520 / 38 / 0.7）；按压缩放行 0.996、按钮 0.97、checkbox 0.94；弹层入场 300ms + 遮罩 220ms（blur 0→10）；用量数字 400ms 补间、柱阵 420ms / 20ms 错峰。只动 `transform` / `opacity` / 颜色，不做循环装饰。
- **桌面兜底**：`prefers-reduced-motion` 关页面 / 弹层入场、行与按钮过渡、按压缩放（滑块 spring 退化为 `duration: 0`）；`prefers-reduced-transparency` 玻璃去 `backdrop-filter`、退为 `--card` 实底；后台 / 失焦仍由 `useMotionPause` 暂停。
- `prefers-reduced-motion: reduce`：冻结声呐环与波形，去掉随机 idle/弹跳/粒子，保留状态切换的即时反馈（120ms 交叉淡入）和按钮反馈；宠物冻结第 0 帧。
- 后台/窗口失焦暂停：`useMotionPause` 监听 `visibilitychange` + window `blur/focus`，写 `<html data-motion-paused>`，CSS 动画 `animation-play-state: paused`；帧动画播放器也在后台/覆盖层暂停，回前台恢复。
- AI 四态必须在轮廓、速度、道具、主色上明显不同；减少动效也要保留四套不同静态轮廓。详见 [prd/hook/SPEC](../prd/hook/SPEC.md) §2。

## 7. 组件规则

| 组件 | 规则 |
| --- | --- |
| 主按钮 | `--primary` 实色 + `--primary-foreground`；手机高 44；桌面 D86 为胶囊（999），高 36 / sm 30 / xs 26、13–14/500，一页最多一个；顶部 0.5px specular 高光；不发光 |
| 次按钮 | 桌面 = 玻璃次级（`--button-secondary` + blur 18 / saturate 170），胶囊、无边框；手机 = 透明底 + 1px `--border`；文字用 `--foreground` |
| 幽灵按钮 | 无底无边，hover 薄层（桌面 `--accent`、手机 `--wash`）；用于取消/次要动作 |
| 危险按钮 | `--destructive` 实色或描边，只在删除/清空等破坏性操作；不发光 |
| 输入/文本域 | 手机高 44、1px `--input`；桌面高 38、圆角 11、`--muted` 填充、无边框、14 号；搜索是 40 高胶囊；focus 用 3.5px `--focus-ring` 柔光；错误用 `--destructive`，不用琥珀 |
| 开关 | 桌面 40×24（iOS 尺寸）、手机 44×26；开 = `--primary`，关 = 灰色轨道；不用红色表示“关”；整行可点 |
| 分段导航 | 桌面侧栏选中 = 白色滑块（深色 `#3A3A3E`）+ 薄荷图标，spring morph；分段控件 = 胶囊玻璃轨道 + 白滑块（`data-slot="segmented"`），spring morph；手机无分段主导航 |
| 状态提示 | 文字永远在场 + 颜色点；颜色只是第二线索；3 格信号只在手机消息页的连接强度保留；不做红绿灯；桌面状态摘要每行 26 高、12 号、色点 7px |
| 卡片 | 桌面：不透明白卡 16 圆角 + 双层 `--card-shadow` + 顶部 `--card-highlight`（内容层不用玻璃）；手机：16 圆角 + 0.5 hairline + 极轻浮影；标题 15–16/400、正文 13/400 |
| 列表行 | 桌面：最小高 54、左右 16、0.5px hairline（内缩 16 / 带图标块 60）、整行可点、右侧只一个值或控件、按下缩 0.996；手机：行 52、无行内分割线 |
| 聊天气泡 | 我方 = `--wash` 薄层 + 1px `--signal` 边；对方 = `--popover` 表面；系统提示 = 居中小胶囊；圆角 12–14 |
| 焦点 | 键盘焦点：桌面用内描边柔光 3.5px `--focus-ring`（避免列表抖动），手机 2px `--signal` + 2px offset；不能裸写 `outline: none` |
| 触控 | 手机：按钮/输入 ≥ 44、列表行 52、麦克风 56、状态条 44；桌面：列表行 ≥52、按钮 26–36；图标按钮必须有 `aria-label` |
| Toast | `--popover` 底 + 1px `--border`；Sonner 跟随当前主题（`theme={resolved}`） |

- 图标统一 lucide-react；尺寸 16/20/24/28，线宽 1.8（组件可按需微调）；不只靠图标表达状态。桌面列表可配 iOS 同款 30×30 彩色图标块（圆角 10、白字、7 个 system color），普通图标仍用薄荷线性。
- **玻璃纪律**：玻璃只允许出现在控件层（侧栏 / 工具栏 / 动作组 / 分段轨道 / 次级按钮 / 辅助功能提示 / 弹层遮罩）；不在内容卡、列表或滚动内容上叠 `backdrop-filter`，不做整页磨砂、发光边框、扫描线动画。

## 8. 宠物资产红线（不可越界）

1. **复用现有 OpenPets schema 2 图集 + `SpritePet`**：资产在 `app/src/mobile/features/pet/assets/openpet/`（`pet.json` + `spritesheet.webp` + `poster.webp`）。不重绘、不染色、不新增鲸鱼，不用 CSS `filter` 调鲸鱼颜色。
2. **颜色归图集**：`tokens.css` 不再定义 `--pet-body` / `--pet-belly` / `--pet-eye` / `--pet-cheek`；不要再为鲸鱼本体加颜色变量或内联 fill。
3. **舞台随主题（浅色海玻璃）**：`--pet-*` 跟随 `data-theme`——深色是 `--pet-bg #030e12` 深海自发光，浅色换成「海玻璃舞台」`--pet-bg #dcebe7`（surface `#f7fcfa`/`#edf7f3`、text `#0e2a2b`/`#3f5e5d`、border `#9dbab4`）。始终深色的表面（桌面麦克风浮层等）加 `.deep-sea-scope` 钉住深色 pet 令牌与浮层用到的壳层信号色（`--signal`/`--ring`/`--decide`/`--destructive`/`--abyss`），不随浅色主题漂白。鲸鱼资产不重绘、不加 CSS `filter`：浅色舞台下白色围裙/亮部对比度偏低（实测约 26% 不透明像素对比度 <1.5，中位数约 3.5）是明确接受的代价，不能靠重绘图集、加光晕或加描边 filter「修」（违反第 1、2、5 条）。
4. **声呐环只做装饰（仅桌面状态点）**：手机宠物舞台的环已删除（D77），舞台不再绘制声呐环；桌面 `SignalDot` 的 `.sonar-dot-ring` 保留，细描边低亮度、只动 transform/opacity，不改变宠物帧、不跟随宠物姿态、不包住鲸鱼做发光描边。如未来恢复手机环，必须遵守本节与 §6 的约束。
5. **不加光晕**：OLED 像素自发光，光晕/大面积亮色渐变直接耗电；舞台只保留单一纯色底 + 小面积低亮度装饰（深色主题为深海深底，D58 于 2026-11-02 移除 `--pet-glow`；浅色海玻璃舞台同样不叠加光晕/大面积亮色渐变）。
6. 帧动画要求继续按 [engineering/pet-runtime.md](../engineering/pet-runtime.md) 执行：一列一帧、单状态 ≤32 帧、后台暂停、减少动效冻结、失败降级 poster；资产来源/授权/体积登记到 [dependency-policy](../dependency-policy.md)。

## 9. 声音

- 默认关闭；设置里可开（AI 联动三音效：开工/提问/完成；三个试听按钮）。
- 声音只做点缀：轻“叮”、短上扬、完成琶音；不循环、不尖锐、≤ 420ms。
- 只在宠物页前台、麦克风未录音时播放；录音/后台静音；提问音最多 2 次。
- P0 用 Web Audio 合成音，不新增音频文件；P1 可换专门设计的小宠物叫声资产。
- 不绕过系统静音；系统静音/勿扰/音乐焦点可能无法完全遵守，文档与设置页说明，P1 接原生提示音。
- 所有声音信息必须有视觉替代（动作 + 文案 + `aria-live`）。

## 10. 资源与性能

- 图片 WebP；图标 SVG；宠物图集只进 mobile 按需 chunk，不进桌面首屏。
- 不打包中文字体；如需品牌字体，必须子集化并走依赖审批。
- 宠物舞台 `devicePixelRatio` 上限 2；安卓避免大面积 blur/shadow 动画。
- 真机 60fps 是硬指标；掉帧就减粒子/网格，不降整体帧率目标。
- 暗色 OLED 防烧屏：屏幕常亮已落地（默认开、默认最长 2 小时，可关/可调），宠物页无操作默认 5 分钟自动暗到 70%（可调 1/2/5/10/15/30 分钟），触摸恢复。
- **OLED 功耗**：OLED 像素自发光，功耗与亮度和点亮面积近似成正比；深色主题下宠物舞台保持纯深色背景，不叠加光晕/大渐变/大面积亮色（2026-11-02 移除 `--pet-glow`，D58），装饰只做小面积、低亮度。浅色主题是海玻璃浅底、跟随用户偏好出现（D76），功耗会明显高于深底——这是「舞台随系统」的取舍，不是回归。
- 声呐环（仅桌面状态点）是常驻动效：只动 transform/opacity、细描边不发光、reduced-motion 冻结、后台/失焦暂停；手机舞台已无环（D77），安卓舞台不叠 filter 与大面积亮像素。

## 11. 无障碍

- 两套主题的文字对比都 ≥ 4.5:1（`--muted-foreground` 最低 6.05:1）；表单控件描边用 `--input` 达 ≥ 3:1。
- 颜色不是唯一状态提示：状态提示始终有文字（桌面为文字 + 颜色点，手机顶部条同）；连接点始终有文字。
- 键盘焦点：桌面 3.5px `--focus-ring` 柔光、手机 2px `--signal`，深浅主题都可见；触控目标按 §7。
- 装饰环/刻度 `aria-hidden`；状态播报用 `role="status"` / `aria-live="polite"`。
- 减少动效见 §6；浅色主题同样要验证对比度，不能只测深色。

## 12. 交接

- 令牌落地：基线 `app/src/shared/styles/tokens.css`，桌面覆盖 `app/src/desktop/styles/ios.css`（`.desktop-ios`），手机覆盖 `app/src/mobile/styles/clean.css`（`.mobile-clean`）；组件只引用语义令牌；主题运行时见 [frontend-architecture.md](../frontend-architecture.md#6-样式规范)。
- 具体数值看可视化总表 [style-guide.html](./style-guide.html)：字号 / 行高 / 文字间距 / 间距刻度 / 圆角 / 阴影与组件几何，含深浅两套实物与标本；改令牌时同步该页。
- 图集状态映射写入 [engineering/pet-runtime.md](../engineering/pet-runtime.md)；不在 UI 组件里硬编码状态行/帧号。
- 新视觉资产登记来源、许可证、体积到 [dependency-policy.md](../dependency-policy.md) 的资源规则。
- 任何视觉方案变更影响 PRD/SPEC 时同步更新文档；两套主题的改动要同时验证深浅色与对比度。

## 13. Do / Don't

| Do | Don't |
| --- | --- |
| 深海底 + 信号薄荷只给「可操作/正在发生」；桌面用同心圆角 + specular 高光 + 2.6% grain | 霓虹、发光边框、扫描线、满屏渐变；给内容层加 `backdrop-filter` |
| 1px 精确描边 + 分层表面；桌面玻璃只做控件层（D86） | 把玻璃铺到内容卡 / 整页磨砂、大面积背景模糊 |
| 数据用等宽字、tabular-nums 对齐 | 用红绿黄当状态灯 |
| 琥珀只给「等你决定」 | 浅色主题做白底 + 亮绿按钮 |
| 浅色主题重新设计光源与表面 | 把深色直接反色当浅色 |
| 桌面声呐环细描边、低亮度、可暂停 | 给鲸鱼加光晕/滤镜/大面积亮像素；在手机舞台恢复背景环 |
| 复用现有图集与 SpritePet | 重绘/染色/新增鲸鱼，或改 `--pet-*` 本体色 |
| 用 `--whale` 表达鲸蓝 | 改 `--accent` 当品牌次色 |
| 令牌只用 hex（`#rrggbb`） | 用 `oklch` / `color-mix` 定义最终令牌 |
