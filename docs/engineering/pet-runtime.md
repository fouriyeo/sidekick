---
doc: engineering/pet-runtime
title: 宠物运行时方案
status: draft
updated: 2026-11-14
load: on-demand
owner: engineering
---

# 宠物运行时方案

> 目标：手机里稳定跑一只会呼吸、会陪伴、会记住你的宠物。
> 渲染层是 BoopFace（D132），动作由一条显式的优先级总线决定（D133）；产品/体验规则见 [pet PRD](../prd/pet/PRD.md) 与 [SPEC](../prd/pet/SPEC.md)。

## 1. 目录

```text
app/src/mobile/features/pet/
├─ pet-page.tsx            # 宠物页屏幕壳（顶栏 / 会话卡 / 麦克风 / 变暗）
├─ pet-stage.tsx           # 舞台：BoopPet + 读屏播报 + 反应订阅的挂载点
├─ boop-pet.tsx            # BoopFace 包装：属性、动作切换、去重、兜底色
├─ boop-face.d.ts          # React 19 自定义元素 JSX 声明
├─ pet-action.ts           # 动作优先级纯函数（可单测）
├─ pet-reaction.ts         # 瞬态反应 store（最短 1.2s、同动作去抖）
├─ pet-reaction-wiring.ts  # 麦克风/连接/会话/问候 → 反应（边沿触发）
├─ state-machine.ts        # 状态/心情/转移（纯函数优先）
├─ ai-status.ts            # AI 四态展示状态（独立内存 store）
├─ mood.ts                 # 精力/时间计算
├─ sound.ts                # AI 三音效（Web Audio 合成）
├─ persistence.ts          # 存档 schema、迁移与 PetStorage 接口
├─ tauri-pet-storage.ts    # plugin-store adapter
├─ pet-store.ts            # Zustand store 与副作用
├─ pet-name.ts             # 固定显示名「小跟班」（无用户自定义名字）
├─ copy.ts                 # 文案库（copy_id）
├─ haptics.ts              # 触感语义 → 原生 haptic 命令（浏览器回退 navigator.vibrate）
├─ use-keep-awake.ts       # 宠物页常亮（含最长时长与到点释放）
├─ use-reduced-motion.ts   # 系统减少动效
├─ pet.module.css          # 舞台 / 宠物槽位 / 夜间滤镜
└─ types.ts                # PetState / PetEvent 等类型
```

- 只允许 `mobile/` 内部引用（入口经 `entries/mobile.tsx` → `mobile/app.tsx`）；桌面不 import。
- 业务状态用纯函数 + Zustand；动作名只出现在 `pet-action.ts` 与 `boop-pet.tsx`。
- 触感统一走 `haptics.ts` → 原生 `haptic` 命令（`performHapticFeedback`，无 VIBRATE 权限）；WebView 默认长按触感在 App 启动时关闭。
- 文件命名 kebab-case，组件导出 PascalCase（与 [frontend-architecture](../frontend-architecture.md) 第 7 节一致）。
- 文案用 `copy_id`，不在组件里散落字符串。
- **图集管线已删除**（`sprite-pet/manifest/player/state-map` 与 `assets/openpet/`，D136）。

## 2. 渲染：BoopFace + 皮肤 201（D132）

- 依赖：`boopface@0.8.0`（精确版本，见 [dependency-policy](../dependency-policy.md) §7 例外登记）；全量构建（要用皮肤，不用 `boopface/lite`），只进 mobile chunk。
- 宿主属性：

```html
<boop-face skin="201" color="#d5e4f5" motion="auto|reduce"
           auto-sleep="300000" wake-on="activity"
           press-squeeze="false" antenna-drag="false" />
```

- **皮肤**：201「冰透蓝」（Ice glass · Blue）。深浅主题共用一套（D132 的选择：单一代码路径，避免主题切换时重新加载 painter 闪一下）；圆度保持默认 `50`，不做个性化。
- **尺寸**：不传 `size`，用 `.face { --face-size: 100% }` 跟随 `.petSlot`（`min(230px, 62vw)`）——390 宽是 230、320 宽是 198，不需要第二套断点。
- **预加载**：模块加载时 `void loadSkins()` 提前拉 skin painter；painter 到位前宿主先用 `color="#d5e4f5"` 兜底，避免浅色页面上闪一下默认近黑脸。
- **手势**：中心按压、拖天线、视线跟随全部关闭——D77「触摸不产生宠物事件」仍然成立。`press-squeeze` 在触摸设备本来就不触发（只认鼠标/笔），显式关掉是防止以后接鼠标时行为漂移。
- **夜间**：`.motionLayer[data-night="true"] .face { filter: brightness(.9) saturate(.96) }`，只压暗不换素材。
- **减少动效**：`motion="reduce"`；同时冻结一次性动作之外的自动眨眼/瞟视。
- **自动睡眠**：`auto-sleep` 取 `settings.dimMinutes * 60_000`，和「无操作变暗」同一条时间线；`wake-on="activity"` 让任何触摸把它叫醒。AI 事件触发 `play()` 前会显式 `wake()`，睡眠态不会吞掉完成态。
- **生命周期**：`PetPage` 是条件渲染，离开即卸载 → 组件 `disconnectedCallback` 停 rAF 并复位；`document.hidden` 时自动暂停。
- **失败模式**：元素未升级（打包异常/脚本错误）→ 舞台空白但页面不崩；`customElements.whenDefined('boop-face')` 后会补一次动作同步。
- **体积**：web 资产从 746KB 图集 + 14KB poster 换成约 190KB 皮肤 chunk（201 只用 material 一族，native 那 76KB 不会下载）。

## 3. 状态与动作

### 3.1 应用状态

`idle` / `sleeping` / `away`。
转移规则见 [SPEC](../prd/pet/SPEC.md#3-状态机)；实现集中在 `state-machine.ts`，UI 不写条件分支。点击/抚摸宠物不产生事件（D69）；首次命名/`celebrating` 已下线（2026-11-05）。

```ts
type PetEvent =
  | { type: "BOOT"; now: number; save: PetSaveV1 | null; corrupted?: boolean }
  | { type: "TICK"; now: number }
  | { type: "VISIBILITY"; now: number; visible: boolean }
  | { type: "OVERLAY"; now: number; open: boolean }
  | { type: "RESET"; now: number };

function reducePet(state: PetState, event: PetEvent): { state: PetState; effects: PetEffect[] };
```

- 副作用（触感/气泡/存档）由 `effects` 描述，执行层统一处理；首次命名/爱心/`phaseUntil`/`schedulePhaseExpiry` 已随命名功能删除（2026-11-05）。
- 首次 BOOT 置 `onboarded=true` 并落盘；首次见面只发 `first_meet` 气泡（「你来了。我是小跟班。」），不再有命名弹窗或 `NAME_SET`。
- 麦克风联动：D133 起**恢复为纯视觉**——录音/转写/成功/失败会切换动作，但不产生 `PetEvent`、不写存档、不放额外音效；录音中仍然静音 AI 音效/触感（`micListening` 门禁不变）。
- **AI 联动四态仍不新增 `PetPhase`**：静态=idle，工作中/等你决定/完成由 `ai-status.ts` 的独立内存 store 驱动；`displayStateOf` 只决定最终展示姿态，AI 状态不落盘。

### 3.2 动作优先级（D133）

`resolvePetAction({ phase, ai, mic, reaction, now })`，从高到低：

| 优先 | 条件 | 动作 | 说明 |
| --- | --- | --- | --- |
| 1 | 瞬态反应未过期 | `affirm` / `failure` / `surprise` / `love` | 一次性，最短 1.2s |
| 2 | `mic=processing` | `inspect` | 眯眼扫描（转写中） |
| 3 | `mic=arming|listening` | `input` | 眼睛变文本光标（录音中） |
| 4 | `ai=asking` | `wary` | 侧头打量「等你决定」 |
| 5 | `ai=working` | `waiting-wave` | 循环等待 |
| 6 | `ai=completed` | `success` | 3 秒窗口（延续原完成态） |
| 7 | `phase=sleeping` 且 AI 静态 | `sleep` | 夜间/久无操作 |
| 8 | `phase=away` | `bored` | 离开 |
| 9 | 其他 | `idle` | 待机（眨眼/瞟视由组件自己做） |

- 「睡着」只能压静态：夜间正在跑 AI 任务时仍然展示 AI 状态（沿用 D20 规则）。
- 录音相关的三档压过 AI：录音时用户正看着麦克风，麦的反馈优先。

### 3.3 触发源

| 事件 | 动作 | 时长 / 约束 |
| --- | --- | --- |
| AI working / asking / completed | `waiting-wave` / `wary` / `success` | 跟随 AI store；completed 3s |
| 无操作入睡、离开 | `sleep` / `bored` | 跟随 `phase` |
| 录音中（arming→listening） | `input` | 保持到 processing 结束 |
| 转写中（processing） | `inspect` | 保持 |
| 结果上屏（→ delivered 边沿） | `affirm` | 1.6s |
| 识别失败（→ error 边沿） | `failure` | 2.0s |
| 连接断开 / 连接失败 | `failure` | 2.0s；只在 `connected|connecting → disconnected|error` |
| 重连成功 | `affirm` | 1.6s；**首次连接不算重连** |
| 新会话（一次新增 1–2 条） | `surprise` | 1.2s，5s 冷却；批量快照不触发 |
| 回来问候（`returning` / `returning_long` 气泡） | `love` | 2.4s |

- 全部走**边沿触发**：首帧、重连补发的整表快照都不会误触发；订阅用引用计数，StrictMode 双挂载只有一套。
- 反应不是状态：到期自动回落，不写存档、不进 `PetEvent`。

### 3.4 暂不接的动作

`angry` / `refuse` / `random` / `waiting-spin` / `waiting-wrap` / `wake`：没有诚实的触发源（策略拦截、彩蛋、鼠标悬停等尚未存在）。等待动作固定用 `waiting-wave`（眼睛轮流上下浮动）——`waiting-spin` 会让两只眼睛在画面中间重叠成一个「独眼」帧，`waiting-wrap` 会出现整张空白脸。API 保留，等真实事件再接，不要为了「用满 18 个」硬造状态。

## 4. 心情与精力

```ts
type Mood = "content" | "curious" | "sleepy";
```

- 精力：初值 100、clamp 0–100；前台每 30 分钟 -1，后台每 2 小时 -1，睡眠每小时 +5。
- 心情：只持久化基线（content/sleepy）；curious 为瞬态，不落盘；启动按时段/精力重算基线。curious 来自首次见面；`happy` 随命名流程下线删除（2026-11-05）。
- 低精力 `[假设]`：energy<30 哈欠增加、<15 sleepy；`energy_bucket` 取 0–25/26–50/51–75/76–100。
- 没有负面状态与惩罚；不使用真实时间戳做「奖励结算」，只做衰减/恢复，避免时区/改时间刷值。
- 所有数值隐藏；UI 不显示进度条/等级。

## 5. 持久化

```ts
type BaselineMood = "content" | "sleepy";

type PetSaveV1 = {
  version: 1;
  onboarded: boolean;             // 是否已见过面；首次 BOOT 置 true
  mood: BaselineMood;             // 只存基线，瞬态不落盘
  energy: number;                 // 0–100，初值 100
  lastSeenAt: number;
  lastInteractionAt: number;
  lastEnergyAt: number;
  settings: {
    haptics: boolean;
    sound: boolean;               // 字段保留，默认关
    reduceMotion: "system" | "on" | "off";
    keepAwake: boolean;
    dimMinutes: number;           // 1–60，默认 5
    keepAwakeHours: number;       // 0–24，0 = 不限，默认 2
  };
};
```

- 存储：`@tauri-apps/plugin-store@2.5.0` + `tauri-plugin-store = "2.5.0"`（支持 Android），文件 `sidekick-pet.json`；不再提供 localStorage 二选一。
- `PetStorage` adapter：`load() / save(save) / clear()`；feature 只依赖接口，plugin-store 类型不泄漏到状态机/UI。
- 写入：值变化后防抖 500ms；App 进入后台立即写；启动读取。
- 版本迁移：`version` 不匹配时回退默认；版本号仍为 1。旧存档的 `name` 字段忽略、不迁移，其他字段照常恢复（2026-11-05 首次命名下线）。
- 损坏：try/catch 解析失败 → 默认值；不阻塞 UI。
- `reset()` 清宠物数据（含 `onboarded`），保留 settings；下次启动重新首次见面。
- 不存：聊天、音频、转写、目标应用、剪贴板；localStorage 只存服务器地址。
- 卸载会丢失：关于页说明；P1 考虑导出/备份。

## 6. 时间逻辑

- 时段：06–11 早晨、11–18 白天、18–23 傍晚、23–06 夜间。
- 睡眠倒计时只累计前台（宠物页可见且未打开设置/聊天覆盖层）；夜间 5 分钟无互动入睡；06:00 后 `TICK` 自动醒，回前台按跨夜规则重算（不能靠触摸唤醒）。
- 回来问候：`now - lastSeenAt > 6h`；>3 天用特殊文案；每次前台最多一次；与睡眠冲突时睡眠优先。
- 后台跨夜离开 ≥5 分钟回前台直接 `sleeping`，不弹问候；覆盖层关闭后恢复计时，不重新问候。
- 布局：单竖屏（D62），无方向监听、无姿态切换；Android Activity 锁 `portrait`，浏览器 dev 也按竖屏渲染。
- 精力结算按 `lastEnergyAt` 分段累计（前台 -1/30min、后台 -1/2h、睡眠 +5/h），clamp 0–100；启动补算但不超过阈值。
- 系统时间回拨/时区变化：只重算时段；不补发问候；精力不补发衰减。
- 测试用可注入 `now`，不直接读 `Date.now()` 散落各处。

## 7. 事件与副作用

```text
BOOT / TICK / VISIBILITY / OVERLAY / RESET
  → reducePet / dispatch(event)
  → 副作用：震动 + 气泡 + 存档

麦克风 / 连接 / 会话 / 问候气泡
  → pet-reaction-wiring（边沿触发）
  → pet-reaction（最小时长 + 同动作去抖）
  → resolvePetAction 优先级
  → <boop-face> 换动作
```

- 宠物舞台不挂 pointer 处理器；点击、长按、来回抚摸不产生 `PetEvent`（D69），BoopFace 的手势也显式关闭。
- 麦克风只影响**动作**（D133），不产生 `PetEvent`、不写存档；录音时 AI 音效/触感仍由 `micListening` 门禁静音。
- 震动/声音通过 adapter；测试时 mock。
- 气泡受频率限制，`copy_id` + 触发原因，方便统计关闭率。
- 屏幕常亮：`mobile/app.tsx` 读 `pet.settings.keepAwake`，`useKeepAwake(keepAwake && view === "pet")` 调 `shared/lib/tauri.ts` 的 `setKeepScreenOn` → Rust 命令 `set_keep_screen_on`（`app/src-tauri/src/keep_awake.rs`）→ Android `Window.addFlags/clearFlags(FLAG_KEEP_SCREEN_ON)`；非宠物页/后台/卸载时释放（D79）。原生不支持或 JNI 失败时静默降级。

## 8. 性能

- 目标：真机 60fps；单帧主线程 <16ms；长任务 <50ms。
- BoopFace 以约 30fps 的 rAF 循环更新 SVG 属性（眨眼/视线/拖拽），皮肤高光跟随指针；`motion="reduce"` 或入睡后 `_canPauseFrames` 会停循环。
- 舞台不可见（页面卸载）时组件 `disconnectedCallback` 停 rAF；`document.hidden` 自动暂停。
- 内存：宠物页常驻 ≤150MB `[待基线]`；无图集解码（原图集约 16.8MB 解码内存随之消失）。
- 首屏：宠物 chunk 懒加载；首屏 JS +约 38KB gzip（组件 + 皮肤 catalog），皮肤 painter 为懒加载 chunk。
- 真机基线（2026-11-14，Realme RMX3370 / Android 13 / WebView 103.0.5060.129）：
  - 旧图集（working）：rAF 60.2fps；20s 主线程 TaskDuration 占用 59.1%；JS heap 2.7MB；DOM 节点 5315。
  - 新组件（asking/wary 首轮）：rAF 60.1fps；TaskDuration 66.4%；JS heap 3.9MB；DOM 节点 1169。
  - 结论：帧率不掉；主线程占用 +7 个百分点（仍在 1.5× 门槛内）；DOM 节点从 5315 降到 1169。final 构建（`waiting-wave`）的 working 态复测与 30 分钟 soak 待补。

## 9. 测试

- 单元：状态转移（覆盖层/后台/睡眠/醒来）、精力边界、时段/问候、plugin-store 迁移/损坏、点击宠物不产生事件、录音不产生 `PetEvent`。
- 动作：`pet-action.test.ts` 覆盖优先级全矩阵；`pet-reaction.test.ts` 覆盖最小时长/去抖/到期；`pet-reaction-wiring.test.ts` 覆盖边沿触发、首帧/批量快照、首连不算重连、退订与重复挂载。
- 组件：`boop-pet.test.tsx` 覆盖宿主属性（皮肤/兜底色/auto-sleep/手势关闭）、四态与录音态动作、瞬态反应压过 AI、同动作不重播。
- 降级：元素未升级时舞台空白不崩（组件层 `whenDefined` 补同步）。
- 真机：RMX3370 竖屏 60fps/掉电/30 分钟 soak、锁屏恢复、深浅主题、TalkBack。
- Mock：震动、时间、PetStorage adapter、麦克风/连接 store 直接 setState。

## 10. 风险

| 风险 | 缓解 |
| --- | --- |
| 上游 1.0 前 API 变动（单人维护） | 精确锁 0.8.0；`dependency-policy` §7 登记例外、复核时间与退出方案（vendor/fork） |
| 角色形象与授权 | 代码 MIT；形象不转让 → NOTICE 写明只作内嵌形象、不宣称原创 |
| 30fps rAF 常驻掉帧/耗电 | 真机门槛（掉帧率/CPU/TaskDuration）；`auto-sleep` 与变暗同线；`motion="reduce"` |
| 动作抖动（连续状态消息） | 优先级收敛 + 最短 1.2s + 同动作去抖 + 5s 新会话冷却 |
| 麦克风联动分散注意力 | 只在动作层表达，文案/音效/触感不变；D77 保留「不产生 PetEvent」 |
| 皮肤 painter 首帧空白/闪黑 | `loadSkins()` 预热 + `color` 兜底 |
| 深色主题刺眼/浅色对比不足 | 201 冰透蓝深浅共用（已对比）；真机目检兜底 |
| 存档格式变更 | 不变；版本号 1 |
| 时间/时区边界 | 可注入时钟；只做衰减/恢复 |

## 11. 交付物

- [x] `pet-action.ts` / `pet-reaction.ts` / `pet-reaction-wiring.ts` + 三个单测。
- [x] `boop-pet.tsx` / `boop-face.d.ts` / `boop-pet.test.tsx`。
- [x] `pet-stage.tsx` / `pet.module.css` 切换到 BoopFace。
- [ ] 删除 `sprite-pet.tsx` / `sprite-manifest.ts` / `sprite-player.ts` / `sprite-state-map.ts` 与 `assets/openpet/`（真机签字后单独提交）。
- [x] 文档：SPEC 状态表与本文动作表同步；D132/D133；依赖登记；NOTICE。
- [ ] 真机性能报告（掉帧/CPU/heap + 30 分钟 soak）。
