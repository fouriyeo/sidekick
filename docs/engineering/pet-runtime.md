---
doc: engineering/pet-runtime
title: 宠物运行时方案
status: draft
updated: 2026-10-31
load: on-demand
owner: engineering
---

# 宠物运行时方案

> 目标：手机横屏里稳定跑一只会呼吸、会互动、会记住你的宠物；Rive 失败也能优雅降级。
> 产品/体验规则见 [pet PRD](../prd/pet/PRD.md) 与 [SPEC](../prd/pet/SPEC.md)。

## 1. 目录

```text
app/src/mobile/features/pet/
├─ PetStage.tsx          # 舞台、气泡、设置入口、姿态布局
├─ PetCanvas.tsx         # Rive 懒加载与输入驱动
├─ stateMachine.ts       # 状态/心情/转移（纯函数优先）
├─ mood.ts               # 精力/亲密度/时间计算
├─ persistence.ts        # 本地存档、版本迁移
├─ copy.ts               # 文案库（copy_id）
├─ posture.ts            # 支架/手持判断与手动覆盖
└─ components/
   ├─ PetFallback.tsx    # 静态图 + CSS 呼吸
   ├─ PetBubble.tsx
   └─ PetSettings.tsx
```

- 只允许 `mobile/entries` 引用；桌面不 import。
- 业务状态用纯函数 + Zustand；Rive 节点名不外泄。
- 文案用 `copy_id`，不在组件里散落字符串。

## 2. Rive 集成

- `@rive-app/react-canvas` 已在依赖基线；只在宠物页挂载时动态加载。
- `.riv` 与静态降级图放 `app/src/assets/pet/`；资源清单与体积登记。
- 加载流程：
  1. 优先加载 `.riv`；
  2. 1.5 秒未就绪或失败 → 显示静态图 + CSS 呼吸；
  3. 后台恢复后不重复加载已失败的实例，除非用户重试/重启。
- 生命周期：
  - 挂载时创建 Rive 实例；卸载时 destroy。
  - `visibilitychange` 后台暂停，回前台恢复并触发一次眨眼。
  - 低电量/减少动效：降帧或停用随机 idle。
- 渲染：Canvas 2D 默认；不在舞台使用 WebGL，除非真机测试证明必要。
- DPR 上限 2；Canvas 尺寸随舞台变化，避免频繁 resize。

## 3. 状态映射

### 3.1 应用状态

`idle` / `interacting` / `listening` / `celebrating` / `concerned` / `sleeping` / `away`。
转移规则见 [SPEC](../prd/pet/SPEC.md#3-状态机)；实现集中在 `stateMachine.ts`，UI 不写条件分支。

### 3.2 Rive 输入（命名稳定）

| 输入 | 类型 | 来源 | 说明 |
| --- | --- | --- | --- |
| `mood` | number | 当前心情枚举 | content/happy/curious/sleepy/listening/proud/concerned |
| `energy` | number | 0–100 | 影响哈欠/动作幅度 |
| `is_night` | boolean | 本地时段 | 夜间表情 |
| `trigger_pet` | trigger | 摸摸 | 一次性 |
| `trigger_poke` | trigger | 戳一戳 | 一次性 |
| `trigger_listen` | trigger | 麦克风开始 | 一次性 |
| `trigger_success` | trigger | 转写成功 | 一次性 |
| `trigger_cancel` | trigger | 取消录音 | 一次性 |
| `trigger_error` | trigger | 转写失败 | 一次性 |
| `trigger_wake` | trigger | 触摸/回前台 | 一次性 |

- 输入名是 UI 与 Rive 的契约；改名前必须同步本文与资产。
- 不在组件里硬编码节点名；映射只出现在 `PetCanvas.tsx`。
- 缺输入/缺状态机时降级静态，不抛异常给用户。

## 4. 心情、精力、亲密度

```ts
type Mood = "content" | "happy" | "curious" | "sleepy" | "listening" | "proud" | "concerned";
```

- 精力：0–100；前台每 30 分钟 -1，后台每 2 小时 -1，睡眠每小时 +5；clamp 0–100。
- 亲密度：0–100；有效互动 +1，每天最多 +5；只影响 idle 多样性与问候。
- 心情：由互动/时间/麦克风状态驱动；负面状态最多 3 秒。
- 不使用真实时间戳做“奖励结算”；只做衰减/恢复，避免时区/改时间刷值。
- 所有数值隐藏；UI 不显示进度条/等级。

## 5. 持久化

```ts
type PetSaveV1 = {
  version: 1;
  name: string;
  mood: Mood;
  energy: number;
  affinity: number;
  lastSeenAt: number;
  settings: {
    haptics: boolean;
    sound: boolean;
    reduceMotion: "system" | "on" | "off";
    posture: "auto" | "docked" | "handheld";
    keepAwake: "charging" | "always" | "never";
  };
};
```

- 存储：手机本地（Tauri store 或 localStorage，二选一；优先能持久且容量足够的方案）。
- 写入时机：值变化后防抖 500ms；App 进入后台立即写；启动读取。
- 版本迁移：`version` 不匹配时逐级迁移；未知版本回退默认。
- 损坏：try/catch 解析失败 → 默认值 + 尽量保留名字；不阻塞 UI。
- 不存：聊天、音频、转写、目标应用、剪贴板。
- 卸载会丢失：关于页说明；P1 考虑导出/备份。

## 6. 时间逻辑

- 时段：06–11 早晨、11–18 白天、18–23 傍晚、23–06 夜间。
- 睡眠：夜间 5 分钟无互动；任意触摸/麦克风开始唤醒。
- 回来问候：`now - lastSeenAt > 6h`；>3 天用特殊文案；每次前台最多一次。
- 系统时间回拨/时区变化：只重算时段；不补发问候；精力不补发衰减。
- 测试用可注入 `now`，不直接读 `Date.now()` 散落各处。

## 7. 交互管线

```text
Pointer 事件
  → 手势分类（tap / petting / 误触）
  → stateMachine.dispatch(event)
  → 副作用：Rive trigger + 震动 + 气泡 + 存档
```

- 手势阈值集中在 `stateMachine`/`gestures`，组件只上报原始点。
- 录音中 `dispatch` 忽略宠物互动；麦克风状态优先。
- 震动/声音通过 adapter；测试时 mock。
- 气泡受频率限制，`copy_id` + 触发原因，方便统计关闭率。

## 8. 性能

- 目标：真机 60fps；单帧主线程 <16ms；长任务 <50ms。
- Rive 网格/骨骼控制在中端安卓可承受范围；粒子最多 6 个。
- 不在动画中改 width/height/filter/box-shadow；只 transform/opacity。
- 舞台不可见时暂停；低电量降频；减少动效去随机 idle。
- 内存：宠物页常驻 ≤150MB `[待基线]`；卸载时释放 Rive/Canvas。
- 首屏：宠物 chunk 懒加载；`.riv` ≤2MB；静态图 WebP。

## 9. 测试

- 单元：状态转移、精力/亲密度边界、时段/问候、存档迁移、手势分类。
- 组件：静态降级、气泡频率、设置保存、减少动效。
- 集成：麦克风状态 → 宠物反应；后台/回前台；低电量。
- 真机：Realme 16:9/20:9、支架/手持、60fps、掉电、OLED 暗屏。
- Mock：Rive 组件、震动、时间、持久化。

## 10. 风险

| 风险 | 缓解 |
| --- | --- |
| Rive 资产未就绪阻塞开发 | 先用占位静态图 + 简化状态机；资产后替换 |
| 中端安卓掉帧 | 限制网格/粒子；真机门禁；降级静态 |
| 存档格式变更 | 版本号 + 迁移测试；损坏回退 |
| 时间/时区边界 | 可注入时钟；只做衰减/恢复 |
| 宠物与麦克风抢事件 | 状态优先级；录音中禁用宠物互动 |
| 卸载丢宠物 | 关于页说明；P1 备份/导出 |

## 11. 交付物

- [ ] `stateMachine.ts` + 单元测试。
- [ ] `persistence.ts` + 迁移测试。
- [ ] `PetStage` / `PetCanvas` / `PetFallback`。
- [ ] Rive 输入映射与资产清单。
- [ ] 文案库 `copy.ts`。
- [ ] 真机性能报告。
- [ ] 文档：SPEC 状态表与本文输入表同步。
