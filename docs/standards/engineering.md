---
doc: standards/engineering
title: 工程规范与平台边界
status: active
updated: 2026-10-31
load: on-demand
---

# 工程规范与平台边界

> 本文是工程规则的入口；现有架构/依赖细节仍以
> [frontend-architecture.md](../frontend-architecture.md)、[dependency-policy.md](../dependency-policy.md)、
> [architecture.md](../architecture.md)、[protocol/README.md](../../protocol/README.md) 为准。
> 本文只补充**平台边界**和新增功能的工程约束，不重复版本号与依赖清单。

## 1. 组织方式：单仓库、双产物、平台分目录

- 一个仓库、一个 Tauri 工程、两个构建产物：
  - 桌面：`pnpm tauri build` → macOS `.app` / `.dmg`，内置 axum 服务。
  - 手机：`pnpm tauri android build` → APK，作为客户端。
- Rust 继续用 `cfg(desktop)` / `cfg(mobile)` 分流；桌面服务代码不进手机包，手机客户端代码不进桌面包。
- 前端按平台分目录，**禁止跨平台 import**：

```text
app/src/
├─ entries/
│  ├─ desktop.tsx          # 只挂桌面壳
│  └─ mobile.tsx           # 只挂手机壳
├─ desktop/                # 桌面专属
│  ├─ features/
│  │  └─ mic-receiver/     # 状态浮窗、转写结果、输入提示
│  └─ components/
├─ mobile/                 # 手机专属
│  ├─ features/
│  │  ├─ pet/              # 宠物舞台、状态机、持久化
│  │  ├─ mic/              # 按住说话、波形、权限、结果
│  │  └─ connect/          # 地址、连接状态
│  └─ components/
├─ shared/                 # 无平台语义
│  ├─ ui/                  # shadcn 复制组件
│  ├─ lib/                 # tauri.ts、utils、audio 抽象
│  └─ styles/
└─ protocol/
   └─ messages.ts          # 两端共享协议类型
```

依赖方向：

- `entries` → 对应平台的 `features` → `shared` → `protocol`。
- `mobile` 不 import `desktop`；`desktop` 不 import `mobile`。
- `shared` 不 import 任何平台的 features/entries。
- `features` 之间不直接 import；跨功能协作走共享 store 或 `shared/lib` 接口。
- `shared/ui` 只放通用 UI，不放业务逻辑。

## 2. 平台职责

| 能力 | 手机 | 桌面 |
| --- | --- | --- |
| 宠物渲染 | ✅ `mobile/features/pet` | ❌ |
| 麦克风采集 | ✅ `mobile/features/mic` | ❌ |
| WS 客户端 | ✅ Rust `mobile_client` | ✅ 桌面 UI 本地回环 |
| WS 服务端 | ❌ | ✅ Rust `desktop_server` |
| 转写 | ❌ | ✅ `desktop/features/mic-receiver` + Rust |
| 文本输入 | ❌ | ✅ macOS 辅助功能/剪贴板 |
| 状态浮窗 | ✅ 手机内状态 | ✅ 独立小窗 |

> 平台矩阵的产品定义见 [product/scope.md](../product/scope.md#2-平台矩阵)；实现不得把手机功能塞进桌面壳。

## 3. Tauri 边界

- 前端不直接 `invoke`/`listen`；统一走 `shared/lib/tauri.ts`。
- 命令/事件名、参数类型集中定义；feature 里不出现裸字符串。
- 协议类型集中在 `protocol/messages.ts`，用 `type` 做 discriminated union；边界用 type guard 或 zod/valibot（二选一）。
- 手机采集的音频通过 Tauri 命令进入 Rust，再经 WS 发送；不在 WebView 里直接连 `ws://`（混合内容限制）。
- 桌面转写/输入在 Rust 侧完成，前端只收状态事件；不把音频交给 UI 层处理。

## 4. 构建与平台配置

- `beforeBuildCommand` 仍用 `pnpm build`；如果后续要排除另一端 chunk，再引入 `VITE_APP_TARGET` 分平台构建，不在本期增加复杂度。
- Tauri capabilities 最小权限；新增麦克风/辅助功能相关能力时逐项开，不开 `core:default` 之外的大礼包。
- CSP 不允许长期为 `null`；上线前收紧，Rive WASM 需显式允许 `wasm-unsafe-eval`。
- `tauri.conf.json` 的窗口配置只对桌面生效；手机布局不依赖它。

## 5. 音频边界（P0）

- 采集：手机端；格式、编码、分片见 [audio-pipeline.md](../engineering/audio-pipeline.md)。
- 传输：Rust WS 二进制帧；不广播音频；按 session 路由。
- 转写：桌面本机；默认不上传云端。
- 输入：桌面本机；只输入文本，绝不自动回车/发送。
- 失败：丢音频、给可重试提示；不落盘、不后台重试。

## 6. 状态与数据

- Zustand 按平台/功能拆 store；不引第二套状态库。
- 连接状态唯一事实源；宠物/麦克风只读它，不各自维护 `online`。
- 宠物持久化只存名字、心情、精力、亲密度、lastSeen、设置；不存聊天/音频/转写。
- 麦克风不持久化音频/转写；最近一次转写只在内存，重启清空。
- 本地存储必须带版本号；升级时做迁移，损坏时回退默认并提示。

## 7. 错误、日志与隐私

- 用户可见错误：中文、说明原因 + 下一步；不显示堆栈/错误码。
- 内部日志：只记阶段、错误码、时长；不记音频、转写全文、宠物名字、剪贴板、目标应用名。
- 目标应用只记类别（editor/terminal/browser/unknown）。
- 任何新增日志字段先过隐私检查；默认不上报。
- 失败路径必须可恢复：重试、回设置、回连接页，不留死胡同。

## 8. 测试与完成定义（DoD）

**每个功能完成的定义**

- [ ] PRD / SPEC / ACCEPTANCE 已评审，P0 AC 通过。
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全绿。
- [ ] 真机验证：Realme 横屏、支架/手持各一遍。
- [ ] 无障碍：减少动效、对比度、标签。
- [ ] 隐私：无音频落盘、无全文日志、录音指示可见。
- [ ] 性能：60fps、延迟预算达标。
- [ ] 文档：协议/架构/索引同步；`node scripts/check-docs.mjs` 通过。

**测试层级**

- 单元：状态机、协议解析、纯函数、持久化迁移。
- 组件：麦克风按钮状态、宠物降级、错误提示。
- 集成：WS 音频流（mock STT）、文本输入（mock 辅助功能）。
- 真机：权限、后台、来电、断网、长按 60 秒、掉电。

详见 [engineering/quality.md](../engineering/quality.md)。

## 9. 新依赖

- 走 [dependency-policy.md](../dependency-policy.md) 的六问；新增运行时依赖追加 [decisions.md](../decisions.md)。
- 音频编解码/ASR 模型/虚拟声卡驱动都属于高风险依赖，先做 spike，再决定是否引入。
- 不为一个函数引整库；不引第二套动画/状态/样式方案。

## 10. 平台边界检查

运行：

```bash
node scripts/check-boundaries.mjs
```

检查规则：

- `mobile/**` 不得 import `desktop/**`；
- `desktop/**` 不得 import `mobile/**`；
- `shared/**` 不得 import `mobile/**` 或 `desktop/**`；
- `protocol/**` 不得 import 应用层（mobile/desktop/shared/entries）；
- `entries/desktop` 不得 import mobile；`entries/mobile` 不得 import desktop。

平台目录已于 2026-10-31 完成迁移，脚本已生效。在 CI 或提交前运行；违反即失败。边界靠脚本，不靠自觉。

## 11. 文档同步

- 改协议：更新 `protocol/README.md`、`engineering/protocol-audio.md`、`protocol/messages.ts`、Rust 类型。
- 改平台职责：更新 `product/scope.md`、本文件、`frontend-architecture.md`。
- 改交互/视觉：更新 `standards/ux.md` / `visual.md`，再同步 SPEC。
- 重大取舍：追加 `decisions.md`，不改历史结论。
