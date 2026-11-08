---
doc: engineering/pet-runtime
title: 宠物运行时方案
status: draft
updated: 2026-11-08
load: on-demand
owner: engineering
---

# 宠物运行时方案

> 目标：手机里稳定跑一只会呼吸、会陪伴、会记住你的宠物；图集加载失败也能优雅降级。
> 产品/体验规则见 [pet PRD](../prd/pet/PRD.md) 与 [SPEC](../prd/pet/SPEC.md)。

## 1. 目录

```text
app/src/mobile/features/pet/
├─ pet-page.tsx           # 宠物页屏幕壳（顶栏 / 会话卡 / 麦克风 / 变暗）
├─ pet-stage.tsx          # 舞台：鲸鱼图集 + 读屏播报
├─ sprite-pet.tsx         # 帧动画播放器（OpenPets schema 2 图集）
├─ sprite-manifest.ts     # 图集 manifest 解析与校验
├─ sprite-state-map.ts    # App 语义 → 图集状态候选链
├─ sprite-player.ts       # 纯函数帧推进（loop / once）
├─ assets/openpet/        # pet.json + spritesheet.webp + poster.webp
├─ state-machine.ts       # 状态/心情/转移（纯函数优先）
├─ ai-status.ts           # AI 四态展示状态（独立内存 store）
├─ mood.ts                # 精力/时间计算
├─ sound.ts               # AI 三音效（Web Audio 合成）
├─ persistence.ts         # 存档 schema、迁移与 PetStorage 接口
├─ tauri-pet-storage.ts   # plugin-store adapter
├─ pet-store.ts           # Zustand store 与副作用
├─ pet-name.ts            # 固定显示名「小跟班」（无用户自定义名字）
├─ copy.ts                # 文案库（copy_id）
├─ haptics.ts             # 触感语义 → 原生 haptic 命令（浏览器回退 navigator.vibrate）
├─ use-keep-awake.ts      # 宠物页常亮（含最长时长与到点释放）
├─ use-reduced-motion.ts  # 系统减少动效
├─ pet.module.css         # 舞台 / 鲸鱼槽位样式
└─ types.ts               # PetState / PetEvent 等类型
```

- 只允许 `mobile/` 内部引用（入口经 `entries/mobile.tsx` → `mobile/app.tsx`）；桌面不 import。
- 业务状态用纯函数 + Zustand；图集状态名只出现在 manifest / `sprite-state-map.ts`。
- 触感统一走 `haptics.ts` → 原生 `haptic` 命令（`performHapticFeedback`，无 VIBRATE 权限）；WebView 默认长按触感在 App 启动时关闭。
- 文件命名 kebab-case，组件导出 PascalCase（与 [frontend-architecture](../frontend-architecture.md) 第 7 节一致）。
- 文案用 `copy_id`，不在组件里散落字符串。

## 2. 帧动画图集（OpenPets schema 2）

- 资产：`app/src/mobile/features/pet/assets/openpet/`（`pet.json` + `spritesheet.webp` + `poster.webp`），通过 Vite 资源导入，只进 mobile 包，桌面包不引用。
- **一列一帧**：`grid.cell` 是单帧边长（当前 256），`grid.cols` 是列数（当前 16；上限 32），行号由 `states.*.row` 声明。
- 单状态帧数 1–32，兼容 16；不同状态可以帧数不同，只播 `frames` 里列出的列。
- 播放：按 `frames[].duration` 累计推进（rAF，只在帧号变化时改 `background-position`）；`loop` 无限循环，`once` 播完停在末帧。内置图集 `done` 已改为 `loop`：一轮 16×100ms=1.6 秒，completed 展示 3 秒内约循环 1.875 轮，不再末帧定格；`once` 能力保留给未来需要定格的状态，当前内置图集没有 `once` 状态。
- 尺寸：`ResizeObserver` 量容器后取 `min(宽,高)` 做方形格子（`.petSlot` 可能被 max-width 卡成竖长），元素本身设成该方形 + `overflow:hidden` 居中，再按 px 设置 `background-size/position`；旋转（竖屏锁定）不重新解码，DPR 上限 2。
- 降级：manifest 校验失败、解码失败、或图片尺寸与 `cols/cell` 不匹配 → 显示 `poster.webp`；气泡/触感/录音不受影响。
- 内存：4096×1024 解码约 16.8MB；需要再降可拆状态条按需解码（协议不变）。

## 3. 状态映射

### 3.1 应用状态

`idle` / `sleeping` / `away`。
转移规则见 [SPEC](../prd/pet/SPEC.md#3-状态机)；实现集中在 `state-machine.ts`，UI 不写条件分支。点击/抚摸宠物不产生事件（D69）；麦克风不产生宠物事件（D77）；首次命名/`celebrating` 已下线（2026-11-05）。

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
- 麦克风联动已下线（D77）：没有 `MIC_*` 事件、`listening`/`concerned` 姿态与成功/失败触感；录音时只通过 `micListening` 门禁静音 AI 音效/触感，宠物本身不变。
- **AI 联动四态不新增 `PetPhase`**：静态=idle，工作中/等你决定/完成由 `mobile/features/pet/ai-status.ts` 的独立内存 store 驱动；`displayStateOf` 只决定最终展示姿态，AI 状态不落盘。优先级与动作见 [hook SPEC](../prd/hook/SPEC.md) §2。

### 3.2 图集状态映射（候选链）

App 不硬编码四个状态名：`sprite-state-map.ts` 给出**候选链**，`SpritePet` 取第一个在 manifest 里存在的状态；都不存在时回落 `defaultState` → `idle`。以后加行不用改渲染器。

| 场景（phase / AI） | 候选链（从左到右） |
| --- | --- |
| sleeping | `sleeping` → `idle`（AI 非静态时跟随 AI） |
| away | `away` → `idle` |
| AI working | `working` → `idle` |
| AI asking | `attention` → `idle` |
| AI completed | `done` → `celebrate` → `idle` |

- 当前资产只有 `idle/working/attention/done` 四行，预留状态会自动回落。
- 麦克风联动已下线（D77）：不再有 listening/concerned 候选链；录音时宠物不切换姿态。
- **新增状态行**：① 图集底部加一行；② `pet.json` 增加 `states.<name> = { row, frames, loop? }`（一列一帧，≤32 帧）；③ 如需新触发，在 `sprite-state-map.ts` 的候选链里加名字；④ 渲染器/播放器不用改。
- 减少动效：冻结每个状态的第 0 帧，保留四套可区分的静态轮廓。
- 夜间/睡眠：只降亮度或冻结，不额外播素材（当前无睡眠行）。
- 行数不要求连续；实际行数以解码后的图片高度为准，manifest 声明的行必须都存在。

## 4. 心情与精力

```ts
type Mood = "content" | "curious" | "sleepy";
```

- 精力：初值 100、clamp 0–100；前台每 30 分钟 -1，后台每 2 小时 -1，睡眠每小时 +5。
- 心情：只持久化基线（content/sleepy）；curious 为瞬态，不落盘；启动按时段/精力重算基线。curious 来自首次见面；`happy` 随命名流程下线删除（2026-11-05）。麦克风联动已下线（D77），不再有 listening/proud/concerned。
- 低精力 `[假设]`：energy<30 哈欠增加、<15 sleepy；`energy_bucket` 取 0–25/26–50/51–75/76–100。
- 没有负面状态与惩罚（麦克风失败关心已随 D77 下线）；不使用真实时间戳做“奖励结算”，只做衰减/恢复，避免时区/改时间刷值。
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
  → 副作用：震动 + 气泡 + 存档（画图层由 phase/AI 驱动）
```

- 宠物舞台不挂 pointer 处理器；点击、长按、来回抚摸不产生 `PetEvent`（D69），因此没有手势阈值/冷却/热区。
- 麦克风不产生 `PetEvent`（D77）；录音时只由 `micListening` 门禁静音 AI 音效/触感，宠物姿态/气泡不变。
- 震动/声音通过 adapter；测试时 mock。
- 气泡受频率限制，`copy_id` + 触发原因，方便统计关闭率。
- 屏幕常亮：`mobile/app.tsx` 读 `pet.settings.keepAwake`，`useKeepAwake(keepAwake && view === "pet")` 调 `shared/lib/tauri.ts` 的 `setKeepScreenOn` → Rust 命令 `set_keep_screen_on`（`app/src-tauri/src/keep_awake.rs`）→ Android `Window.addFlags/clearFlags(FLAG_KEEP_SCREEN_ON)`；非宠物页/后台/卸载时释放（D79：设置改为「更多」整页）。原生不支持或 JNI 失败时静默降级，不做用户可见报错。

## 8. 性能

- 目标：真机 60fps；单帧主线程 <16ms；长任务 <50ms。
- 图集单帧 256px、10fps 播放，主线程只做背景位置更新；无粒子层。
- 不在动画中改 width/height/filter/box-shadow；只 transform/opacity。
- 舞台不可见时暂停；低电量降频；减少动效去随机 idle。
- 内存：宠物页常驻 ≤150MB `[待基线]`；图集解码约 16.8MB，卸载时释放。
- 首屏：宠物 chunk 懒加载；图集 WebP ≤1MB；poster ≤20KB。

## 9. 测试

- 单元：状态转移（含覆盖层/后台/睡眠/醒来）、精力边界、时段/问候、plugin-store 迁移/损坏、旧存档带 `name` 忽略并恢复其他字段、首启无弹窗/无权限请求、点击宠物不产生事件、录音不产生事件。
- 组件：四态行/候选链回落、done 循环（3 秒内约 1.875 轮、无末帧定格）、减少动效冻结、气泡频率、设置章节与保存、解码失败降级。
- 集成：录音中宠物无变化（D77）；后台/回前台；低电量。
- 真机：Realme 16:9/20:9 竖屏、旋转锁竖屏、60fps、掉电、锁屏恢复。
- Mock：震动、时间、PetStorage adapter、Image 解码。

## 10. 风险

| 风险 | 缓解 |
| --- | --- |
| 图集资产/分辨率不够 | 复用 OpenPets 格式，换资产只改 `assets/openpet/`；256 帧放大偏软时可换 512 cell |
| 中端安卓掉帧 | 只改背景位置；真机门禁；降级 poster |
| 存档格式变更 | 版本号 + 迁移测试；损坏回退 |
| plugin-store Android 兼容未验证 | Android 编译已通过；真机读写/杀进程恢复待回归，失败则回到 PetStorage adapter 的另一实现 |
| 屏幕常亮耗电 | 设置可关；仅宠物页前台生效（聊天/后台释放）；最长常亮默认 2 小时（可调，0 = 不限）；无操作默认 5 分钟自动变暗（可调）；JNI 失败静默降级为系统默认熄屏 |
| 时间/时区边界 | 可注入时钟；只做衰减/恢复 |
| 图集授权/品牌 | 当前资产来自 DeepSeek 鲸鱼（zip 无 LICENSE）；正式发版前确认授权或替换同格式资产 |
| 麦克风与宠物已解耦 | D77 后麦克风不再驱动宠物；录音中只静音 AI 音效/触感，避免两套反馈抢注意力 |
| 卸载丢宠物 | 关于页说明；P1 备份/导出 |

## 11. 交付物

- [ ] `state-machine.ts` + 单元测试。
- [ ] `persistence.ts` + `tauri-pet-storage.ts`（plugin-store adapter）+ 迁移/损坏测试。
- [ ] `pet-stage.tsx` / `sprite-pet.tsx` / `sprite-manifest.ts` / `sprite-state-map.ts` / `sprite-player.ts`。
- [ ] 图集 manifest（一列一帧、≤32 帧、多状态行）与资产清单。
- [x] 文案库 `copy.ts`（固定显示名，无用户自定义名字）。
- [ ] 真机性能报告 + plugin-store 读写验证。
- [ ] 文档：SPEC 状态表与本文输入表同步。
