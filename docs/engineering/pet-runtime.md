---
doc: engineering/pet-runtime
title: 宠物运行时方案
status: draft
updated: 2026-11-02
load: on-demand
owner: engineering
---

# 宠物运行时方案

> 目标：手机里稳定跑一只会呼吸、会互动、会记住你的宠物；图集加载失败也能优雅降级。
> 产品/体验规则见 [pet PRD](../prd/pet/PRD.md) 与 [SPEC](../prd/pet/SPEC.md)。

## 1. 目录

```text
app/src/mobile/features/pet/
├─ pet-stage.tsx          # 舞台、气泡、设置/聊天入口、姿态布局
├─ sprite-pet.tsx         # 帧动画播放器（OpenPets schema 2 图集）
├─ sprite-manifest.ts     # 图集 manifest 解析与校验
├─ sprite-state-map.ts    # App 语义 → 图集状态候选链
├─ sprite-player.ts       # 纯函数帧推进（loop / once）
├─ assets/openpet/        # spritesheet.webp + poster.webp + pet.json
├─ state-machine.ts       # 状态/心情/转移（纯函数优先）
├─ mood.ts                # 精力/亲密度/时间计算
├─ persistence.ts         # 存档 schema、迁移与 PetStorage 接口
├─ tauri-pet-storage.ts   # plugin-store adapter
├─ pet-store.ts           # Zustand store 与副作用
├─ gestures.ts            # 摸摸/戳识别与冷却
├─ copy.ts                # 文案库（copy_id）
├─ posture.ts             # 方向→姿态映射与手动覆盖
├─ use-orientation.ts     # matchMedia 方向检测 + resize 兜底
├─ pet-settings.tsx       # 设置页（姿态/震动/减少动效/常亮/变暗/重置）
├─ haptics.ts             # 触感语义 → 原生 haptic 命令（浏览器回退 navigator.vibrate）
├─ use-keep-awake.ts      # 宠物页常亮（含最长时长与到点释放）
├─ pet-bubble.tsx         # 气泡
└─ pet-hearts.tsx         # 爱心粒子
```

- 只允许 `mobile/entries` 引用；桌面不 import。
- 业务状态用纯函数 + Zustand；图集状态名只出现在 manifest / `sprite-state-map.ts`。
- 触感统一走 `haptics.ts` → 原生 `haptic` 命令（`performHapticFeedback`，无 VIBRATE 权限）；WebView 默认长按触感在 App 启动时关闭。
- 文件命名 kebab-case，组件导出 PascalCase（与 [frontend-architecture](../frontend-architecture.md) 第 7 节一致）。
- 文案用 `copy_id`，不在组件里散落字符串。

## 2. 帧动画图集（OpenPets schema 2）

- 资产：`app/src/mobile/features/pet/assets/openpet/`（`pet.json` + `spritesheet.webp` + `poster.webp`），通过 Vite 资源导入，只进 mobile 包，桌面包不引用。
- **一列一帧**：`grid.cell` 是单帧边长（当前 256），`grid.cols` 是列数（当前 16；上限 32），行号由 `states.*.row` 声明。
- 单状态帧数 1–32，兼容 16；不同状态可以帧数不同，只播 `frames` 里列出的列。
- 播放：按 `frames[].duration` 累计推进（rAF，只在帧号变化时改 `background-position`）；`loop` 循环，`once` 播完停在末帧（done 的 1.5s 定格由末帧 duration 表达）。
- 尺寸：`ResizeObserver` 量容器后按 px 设置 `background-size/position`，旋转/姿态变化不重新解码；DPR 上限 2。
- 降级：manifest 校验失败、解码失败、或图片尺寸与 `cols/cell` 不匹配 → 显示 `poster.webp`；气泡/触感/录音不受影响。
- 内存：4096×1024 解码约 16.8MB；需要再降可拆状态条按需解码（协议不变）。

## 3. 状态映射

### 3.1 应用状态

`idle` / `interacting` / `listening` / `celebrating` / `concerned` / `sleeping` / `away`。
转移规则见 [SPEC](../prd/pet/SPEC.md#3-状态机)；实现集中在 `state-machine.ts`，UI 不写条件分支。

```ts
type PetEvent =
  | { type: "PET"; at: number }            // 摸摸结束
  | { type: "POKE"; at: number }
  | { type: "TICK"; now: number }
  | { type: "FOREGROUND"; now: number }
  | { type: "BACKGROUND"; now: number }
  | { type: "OVERLAY_OPEN" } | { type: "OVERLAY_CLOSE" }
  | { type: "MIC_START" } | { type: "MIC_SUCCESS" }
  | { type: "MIC_CANCEL" } | { type: "MIC_ERROR" };

function reducePet(state: PetState, event: PetEvent): { state: PetState; effects: PetEffect[] };
```

- 副作用（震动/气泡/爱心/存档）由 `effects` 描述，执行层统一处理。
- MIC_* 本轮无生产事件源，仅单测注入；状态为 P1 契约保留。
- **AI 联动四态不新增 `PetPhase`**：静态=idle，工作中/等你决定/完成由 `mobile/features/pet/ai-status.ts` 的独立内存 store 驱动；`displayStateOf` 只决定最终展示姿态，AI 状态不落盘。优先级与动作见 [hook SPEC](../prd/hook/SPEC.md) §2。

### 3.2 图集状态映射（候选链）

App 不硬编码四个状态名：`sprite-state-map.ts` 给出**候选链**，`SpritePet` 取第一个在 manifest 里存在的状态；都不存在时回落 `defaultState` → `idle`。以后加行不用改渲染器。

| 场景（phase / AI） | 候选链（从左到右） |
| --- | --- |
| sleeping | `sleeping` → `idle`（AI 非静态时跟随 AI） |
| listening | `listening` → `idle`（不落到 attention，避免误解为“等你决定”） |
| interacting | `petting` → `happy` → `idle` |
| celebrating | `celebrate` → `done` → `idle` |
| concerned | `concerned` → `idle` |
| away | `away` → `idle` |
| AI working | `working` → `idle` |
| AI asking | `attention` → `idle` |
| AI completed | `done` → `celebrate` → `idle` |

- 当前资产只有 `idle/working/attention/done` 四行，预留状态会自动回落。
- **新增状态行**：① 图集底部加一行；② `pet.json` 增加 `states.<name> = { row, frames, loop? }`（一列一帧，≤32 帧）；③ 如需新触发，在 `sprite-state-map.ts` 的候选链里加名字；④ 渲染器/播放器不用改。
- 减少动效：冻结每个状态的第 0 帧，保留四套可区分的静态轮廓。
- 夜间/睡眠：只降亮度或冻结，不额外播素材（当前无睡眠行）。
- 行数不要求连续；实际行数以解码后的图片高度为准，manifest 声明的行必须都存在。

## 4. 心情、精力、亲密度

```ts
type Mood = "content" | "happy" | "curious" | "sleepy" | "listening" | "proud" | "concerned";
```

- 精力：初值 100、clamp 0–100；前台每 30 分钟 -1，后台每 2 小时 -1，睡眠每小时 +5。
- 亲密度：初值 0、clamp 0–100；有效互动 +1，按本地日期每天最多 +5；落盘 `affinityDate/affinityGainedToday`。
- 心情：只持久化基线（content/sleepy）；happy/curious/listening/proud/concerned 为瞬态，不落盘；启动按时段/精力重算基线。
- 低精力 `[假设]`：energy<30 哈欠增加、<15 sleepy；`energy_bucket` 取 0–25/26–50/51–75/76–100。
- 负面状态最多 3 秒；不使用真实时间戳做“奖励结算”，只做衰减/恢复，避免时区/改时间刷值。
- 所有数值隐藏；UI 不显示进度条/等级。

## 5. 持久化

```ts
type BaselineMood = "content" | "sleepy";

type PetSaveV1 = {
  version: 1;
  onboarded: boolean;
  name: string;
  mood: BaselineMood;             // 只存基线，瞬态不落盘
  energy: number;                 // 0–100，初值 100
  affinity: number;               // 0–100，初值 0
  affinityDate: string | null;    // 本地日期 YYYY-MM-DD
  affinityGainedToday: number;    // 0–5
  lastSeenAt: number;
  lastInteractionAt: number;
  lastEnergyAt: number;
  settings: {
    haptics: boolean;
    sound: boolean;               // 字段保留，暂未接入
    reduceMotion: "system" | "on" | "off";
    posture: "docked" | "handheld";
    keepAwake: "never";           // 字段保留，暂未接入
  };
};
```

- 存储：`@tauri-apps/plugin-store@2.5.0` + `tauri-plugin-store = "2.5.0"`（支持 Android），文件 `sidekick-pet.json`；不再提供 localStorage 二选一。
- `PetStorage` adapter：`load() / save(save) / clear()`；feature 只依赖接口，plugin-store 类型不泄漏到状态机/UI。
- 写入：值变化后防抖 500ms；App 进入后台立即写；启动读取。
- 版本迁移：`version` 不匹配时逐级迁移；未知版本回退默认。
- 损坏：try/catch 解析失败 → 默认值 + 尽量保留名字；不阻塞 UI。
- `reset()` 清宠物数据（含 `onboarded`），保留 settings。
- 不存：聊天、音频、转写、目标应用、剪贴板；localStorage 只存服务器地址。
- 卸载会丢失：关于页说明；P1 考虑导出/备份。

## 6. 时间逻辑

- 时段：06–11 早晨、11–18 白天、18–23 傍晚、23–06 夜间。
- 睡眠倒计时只累计前台（宠物页可见且未打开设置/聊天覆盖层）；夜间 5 分钟无互动入睡；触摸唤醒（麦克风唤醒为 P1）。
- 回来问候：`now - lastSeenAt > 6h`；>3 天用特殊文案；每次前台最多一次；与睡眠冲突时睡眠优先。
- 后台跨夜离开 ≥5 分钟回前台直接 `sleeping`，不弹问候；覆盖层关闭后恢复计时，不重新问候。
- 姿态：`use-orientation.ts` 监听 `(orientation: portrait)` 与 resize/orientationchange；横屏 docked、竖屏 handheld；设置手动覆盖，下一次方向变化恢复自动。
- 精力结算按 `lastEnergyAt` 分段累计（前台 -1/30min、后台 -1/2h、睡眠 +5/h），clamp 0–100；启动补算但不超过阈值。
- 系统时间回拨/时区变化：只重算时段；不补发问候；精力不补发衰减。
- 测试用可注入 `now`，不直接读 `Date.now()` 散落各处。

## 7. 交互管线

```text
Pointer 事件
  → 手势分类（tap / petting / 误触）
  → reducePet / dispatch(event)
  → 副作用：震动 + 气泡 + 爱心 + 存档（画图层由 phase/AI 驱动）
```

- 手势阈值集中在 `gestures.ts`/`state-machine.ts`，组件只上报原始点；slop 8px 起步，真机校准。
- 摸摸：1.5 秒内 ≥2 次方向变化，持续 3 秒 → happy，爱心 ≤6；冷却 2 秒（手势结束起算）；指针抬起 2 秒无新触摸回 idle。
- 戳一戳：<250ms，冷却 2 秒；冷却期点击丢弃、不计数、不排队，仅保留按下态视觉。
- 快速连戳（2 秒 3 次、冷却 5 秒）归 P1，本轮不实现。
- 录音中 `dispatch` 忽略宠物互动（P1 契约）；麦克风状态优先。
- 震动/声音通过 adapter；测试时 mock；声音本轮未接。
- 气泡受频率限制，`copy_id` + 触发原因，方便统计关闭率。
- 屏幕常亮：`mobile/app.tsx` 读 `pet.settings.keepAwake`，`useKeepAwake(keepAwake && view === "pet")` 调 `shared/lib/tauri.ts` 的 `setKeepScreenOn` → Rust 命令 `set_keep_screen_on`（`app/src-tauri/src/keep_awake.rs`）→ Android `Window.addFlags/clearFlags(FLAG_KEEP_SCREEN_ON)`；聊天页/后台/卸载时释放。原生不支持或 JNI 失败时静默降级，不做用户可见报错。

## 8. 性能

- 目标：真机 60fps；单帧主线程 <16ms；长任务 <50ms。
- 图集单帧 256px、10fps 播放，主线程只做背景位置更新；粒子最多 6 个。
- 不在动画中改 width/height/filter/box-shadow；只 transform/opacity。
- 舞台不可见时暂停；低电量降频；减少动效去随机 idle。
- 内存：宠物页常驻 ≤150MB `[待基线]`；图集解码约 16.8MB，卸载时释放。
- 首屏：宠物 chunk 懒加载；图集 WebP ≤1MB；poster ≤20KB。

## 9. 测试

- 单元：状态转移（含覆盖层/指针抬起）、精力/亲密度边界、时段/问候、plugin-store 迁移/损坏、手势分类与冷却。
- 组件：四态行/候选链回落、done 定格、减少动效冻结、气泡频率、设置保存、解码失败降级。
- 集成：麦克风状态 → 宠物反应（P1 mock）；后台/回前台；低电量。
- 真机：Realme 16:9/20:9、手动态、60fps、掉电、锁屏恢复。
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
| 宠物与麦克风抢事件 | 状态优先级；录音中禁用宠物互动 |
| 卸载丢宠物 | 关于页说明；P1 备份/导出 |

## 11. 交付物

- [ ] `state-machine.ts` + `gestures.ts` + 单元测试。
- [ ] `persistence.ts` + `tauri-pet-storage.ts`（plugin-store adapter）+ 迁移/损坏测试。
- [ ] `pet-stage.tsx` / `sprite-pet.tsx` / `sprite-manifest.ts` / `sprite-state-map.ts` / `sprite-player.ts`。
- [ ] 图集 manifest（一列一帧、≤32 帧、多状态行）与资产清单。
- [ ] 文案库 `copy.ts`。
- [ ] 真机性能报告 + plugin-store 读写验证。
- [ ] 文档：SPEC 状态表与本文输入表同步。
