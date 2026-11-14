---
doc: engineering/dsh-hook
title: DSH Hook 技术方案
status: active
updated: 2026-11-06
load: on-demand
owner: engineering
related:
  - ../prd/hook/PRD.md
  - ../prd/hook/SPEC.md
  - ../../protocol/README.md
---

# DSH Hook 技术方案

> 目标：不安装第三方 npm 包，把 DSH 的会话状态注入 Sidekick；桌面桥聚合后广播给手机，手机只负责表现。
> 产品规则见 [hook PRD](../prd/hook/PRD.md) 与 [SPEC](../prd/hook/SPEC.md)。

## 1. 总览

```text
DSH session/event
  → ~/.dsh/profiles/<profile>/plugins/sidekick-hook.mjs（本地脚本，5s 心跳）
  → POST http://127.0.0.1:47815/hook/dsh（Bearer token）
  → Sidekick Rust HookBridge（聚合/3s 完成/15s 超时）
  → 现有局域网 WS 广播 status
  → 手机 Rust → chat 事件 → parseStatusMessage → pet AI 状态
```

## 2. 文件与职责

| 路径 | 职责 |
| --- | --- |
| `app/src/dsh-hook/sidekick-hook.mjs` | 注入 DSH 的本地脚本；监听 session 事件、聚合、POST |
| `app/src/dsh-hook/sidekick-hook.test.mjs` | 脚本纯 reducer 测试（Vitest Node 环境） |
| `app/src-tauri/src/dsh_hook.rs` | HookBridge：状态、回环 HTTP、广播、快照、定时器 |
| `app/src-tauri/src/dsh_hook_install.rs` | profile 检测、插件/配置/patch 写入、备份、移除 |
| `app/src-tauri/src/desktop_server.rs` | 新 WS 连接发快照；处理 `status.request` |
| `app/src-tauri/src/mobile_client.rs` | `send_status_request` 命令 |
| `app/src/protocol/messages.ts` | `StatusMessage` / `isStatusMessage` / `parseStatusMessage` |
| `app/src/shared/lib/tauri.ts` | `dsh_hook_*` / `send_status_request` 命令与 `dsh-hook-status` 事件 |
| `app/src/desktop/features/hook/` | 桌面系统 › 联动段与 store |
| `app/src/mobile/features/pet/ai-status.ts` | 手机 AI 状态、完成定时器、优先级 |
| `app/src/mobile/features/sessions/session-store.ts` | 会话列表、排序、清除标记、focus 结果 |
| `app/src/mobile/features/sessions/session-row.tsx` | 手机会话行（状态/工具动作/清除标记） |
| `app/src/mobile/features/sessions/session-feed.tsx` | 宠物页会话卡：header 折叠 / 展开、footer、行列表（最多 5 行） |
| `app/src/mobile/features/sessions/session-storage.ts` | 本地清除标记（`sidekick-sessions.json`，只存 id + 时间） |
| `app/src-tauri/src/app_focus.rs` | 手机 focus 请求 → 激活/启动 DSH（macOS `open -a`） |
| `app/src/mobile/features/pet/sound.ts` | Web Audio 三音效 |
| `app/src/mobile/features/pet/pet-stage.tsx` / `boop-pet.tsx` / `pet-action.ts` / `pet.module.css` | 宠物舞台与 BoopFace 动作（四态 + 录音/连接/会话/问候）；只 transform/opacity |

## 3. DSH 注入

### 3.1 profile patch

写入 `~/.dsh/profiles/<profile>/cordis.patch.yml` 末尾（带标记，便于移除）：

```yaml
# >>> sidekick-hook (managed by Sidekick; do not edit)
- insert:
    - id: sidekick-hook
      name: './plugins/sidekick-hook.mjs'
# <<< sidekick-hook
```

- DSH 的 patch 加载会把 `insert` 中相对 patch 文件的 `./` 路径转成 file URL（官方文档已确认）。
- 本地文件路径插件不需要 `package.json`/版本清单；不参与 npm 依赖解析。
- 插件不在 `required` 列表；导入失败只会产生一条 DSH 警告，不影响 DSH 启动。
- 首次写入后 profile patch 只在 DSH 启动时加载，因此**首次需要重启 DSH**；之后开关只改配置文件，脚本热生效。

### 3.2 安装/卸载

- DSH home：`SIDEKICK_DSH_HOME`（测试）→ `DSH_HOME` → `~/.dsh`。
- profile：`profiles/*/package.json`；运行中的 profile 从 `ps -axo command` 解析 `dsh-desktop-host` 参数，找不到默认 `desktop`。
- 写入顺序：先写脚本 `plugins/sidekick-hook.mjs`，再写 `sidekick/config.json`，最后改 patch；失败回滚。
- 备份：首次修改前 `cordis.patch.yml.sidekick.bak-<ts>`。
- patch 边界：
  - 空文件/仅注释：直接追加标记块。
  - `[]`：替换为标记块（不能 `[]` + `- insert`，YAML 非法）。
  - 序列：末尾追加标记块。
  - 非序列/不认识的顶层结构：报错，不写。
- 移除顺序：先删 patch 标记，再删脚本/配置；patch 只剩注释/空白时写回 `[]`。
- 配置文件 `0600`；token 64 位 hex（32 字节 /dev/urandom；其它平台时间+pid 兜底，仅本机防误触）。

### 3.3 本地脚本

- 文件：`sidekick-hook.mjs`；纯 ESM，无外部 import。
- 导出：`export const name = "sidekick-hook"`、`export function apply(ctx)`。
- 协议版本：`PLUGIN_VERSION = 3`（v2 增加 `sessionList`，v3 增加会话当前工具类别）；随 `hello` / `state` 上报，桌面系统 › 联动页的「插件 v3」由该值动态渲染，页面代码不用改。
- 监听：`const root = ctx.root ?? ctx; root.on("session/event", handler, { global: true })`、`root.on("session/disposed", ...)`；`ctx.effect` 负责清理 interval/listener。
- 配置：`<DSH_HOME>/sidekick/config.json`，每秒读一次（缓存 mtime）：
  ```json
  {
    "version": 1,
    "enabled": true,
    "profile": "desktop",
    "endpoint": "http://127.0.0.1:47815/hook/dsh",
    "token": "<hex>"
  }
  ```
- 自检：`enabled`；`profile` 与 `import.meta.url` 路径 `/profiles/<profile>/plugins/` 一致；endpoint 必须是 `127.0.0.1` / `localhost` / `::1`。
- 发送：状态变化立即发；每 5s 心跳；启动发 hello；失败重试一次后等心跳；全部 try/catch。
- 日志：只记事件类型/错误码；不记会话内容。

## 4. 事件与聚合

`session/event(session, event)`：

| event.type / 条件 | 处理 |
| --- | --- |
| `turn/start` | 会话 working；清空旧 ask/approval 与进行中工具 |
| `tool/call` 提问类 | 会话 asking；记录 callId；清空工具动作（手机行显示「等你决定」） |
| `tool/call` 普通工具 | 工具名归一成白名单类别，记入进行中工具；会话行 `tool` 取最近开始的一个 |
| `tool/result` 对应 callId | 清 ask / 移除该工具；`tool` 回退到仍在跑的工具（没有则 null）；回 working/idle |
| `tool/result` 无法配对 callId | 防呆清空该会话所有 ask/工具，避免「工具动作」永久卡住 |
| `approval/asked` | 会话 asking；记录 approval id；清空工具动作 |
| `approval/decided` | 清 approval；回 working/idle |
| `user/message` | 清该会话所有 ask/approval 与工具；按 turnActive 回 working/idle |
| `turn/end` reason completed | 完成脉冲（无新鲜 asking 时）；清空工具动作 |
| `turn/end` reason blocked | asking；清空工具动作；10 分钟内没有 pending 且无事件则按 idle（D141） |
| `turn/end` 其他 reason | idle；清空工具动作 |
| `session/title` | 更新会话标题（单行 ≤80 字符） |
| `session/disposed` | 移除会话 |

工具类别白名单（插件本地归一，`SESSION_TOOLS`）：`bash` / `read` / `edit` / `search` / `web` / `agent` / `plan` / `tool`。常见工具名先整名匹配、再按 token 兜底（如 `file_read`→`read`、`web_search`→`web`、`glob`/`grep`→`search`、`subagent`→`agent`、`todo_write`/`enter_plan_mode`→`plan`）；未知工具统一落 `tool`，空工具名不记录（手机显示「正在思考」）。**工具名原文、参数、路径都不离开本机**；只有 working 会话上报 `tool`，asking/idle/completed 恒为 null。

子代理过滤：`session.header.origin === "subagent"` 或 `delegationDepth > 0` 不参与状态/计数（P0）。

陈旧清理（D141）：`turn/end blocked` 产生的 asking 没有 pending 可回答；`askKind=null`、pending ask/approval 为空且超过 `DEFAULT_STALE_ASKING_MS = 10min` 未更新时按 idle 处理；超过 `DEFAULT_STALE_SESSION_MS = 24h` 没有事件的 idle 会话从 reducer 移除。真实 asking（有 pending/askKind）不受 10 分钟规则影响，working 长任务不清。

聚合：

- 任一顶层会话 asking → `asking`。
- 否则任一 working → `working`。
- 否则最近 completed 脉冲未过期（3s）→ `completed`。
- 否则 `idle`。
- completed 脉冲 5s 内最多一次；有**新鲜** asking 时不发 completed（陈旧 blocked asking 已按 idle 清理，D141）。
- `sessions` = 进行中的顶层会话数。
- completed 的 `resume` = 有其它 working 则 `working`，否则 `idle`。

## 5. 协议

见 [protocol/README.md](../../protocol/README.md) 的 `status` 与 `status.request`。

```json
{
  "type": "status",
  "v": 1,
  "source": "dsh",
  "state": "working",
  "sessions": 1,
  "resume": null,
  "remainingMs": null,
  "sessionList": [
    { "id": "…", "title": "修复登录", "source": "dsh", "state": "working",
      "askKind": null, "tool": "bash", "lastEventAt": 1730000000000, "completedAt": null }
  ],
  "ts": 1730000000000
}
```

`sessionList`：最多 50 条；`state` 不含 completed，完成态由 `completedAt` 推导；旧客户端忽略。已归档会话不会出现在列表里（桌面桥按 DSH `workspace.json` 过滤，见 §6），归档的 asking/working 也不再计入聚合态。

- `tool`：仅 `state=working` 有值，白名单 `bash` / `read` / `edit` / `search` / `web` / `agent` / `plan` / `tool`（§4）。旧插件不发送（手机显示「正在思考」）；未知值在桌面桥折叠为通用 `tool`，**不保留原文**；手机端对未知值/非 working 值归一为 `null`。
- 隐私：`tool` 是插件本地归一后的固定枚举，不是工具名透传；提示词、回复、工具参数、文件路径、模型名、工具名原文都不外发。工具类别变化也会改变列表摘要并触发广播，手机行内动作能跟上当前工具。

- 桌面是 completed 的权威计时器：收到 completed 后广播（带 `remainingMs`），3 秒后广播 resume 状态。
- 手机用 `remainingMs` 本地兜底；新状态会取消旧定时器。
- 新连接/`status.request` 的 `snapshot_json()` 同样带最新 `sessionList`；completed 快照也带。
- 新 WS 连接：桌面直接向该 socket 发当前快照。
- `status.request`（手机→桌面）：桌面回当前快照；手机上线/回前台时调用。
- 旧版手机把 `status` 当未知类型忽略；聊天/麦克风不受影响。

## 6. 桌面 Rust 桥

- `HookBridge`：
  - `Mutex` 状态：installed/enabled/connected/profile/current state/sessions/lastEventAt/recent 20。
  - 回环 axum `127.0.0.1:47815–47819`，`POST /hook/dsh`；Bearer token；body ≤64KB；state 枚举校验；`sessionList` 最多 50 条、标题截断 80 码点。
  - `tool` 第二道白名单（`SessionTool`）：插件报来的值只在 working 时保留，未知字符串折叠为通用 `tool`，**绝不把原始字符串透传给手机**；旧插件缺字段按 `null`（手机显示「正在思考」）。
  - 状态变化：更新状态 → `tx.send(status_json)` 广播 → `app.emit("dsh-hook-status")`。
  - completed 定时器：3s 后广播 resume；新状态/关闭/断开取消。
  - 心跳超时：15s 无 hello/state/heartbeat → connected=false + idle + 广播。
  - `snapshot_json()`：当前状态 + `remainingMs`；新连接/`status.request` 使用。
- `desktop_server.rs`：`AppState` 持有 `Arc<HookBridge>`；新 socket 在 spawn send task 之前直接发快照；收到 `status.request` 回快照。
- 端口：先绑定成功者生效；实际 endpoint 写回 `config.json`，脚本 1s 内切换。
- 单实例前提：桌面端由 `tauri-plugin-single-instance` 保证一台机器只有一个进程（D60）。多开时后启动实例会把 endpoint 改成自己的回环端口，它退出后 hook 上报全部打空，存活实例一直 idle；排查时先看 `lsof -nP -iTCP:47815-47819` 与 `config.json` 的 endpoint 是否指向活着的进程。
- 快照补发：新 WS 连接直发 `snapshot_json()`；手机上线/回前台发 `status.request`，服务端广播快照。手机重启不会丢状态。
- 列表：`BridgeInner.session_list` 随 state/heartbeat 替换；heartbeat 列表变化（含仅工具类别变化）也要广播；hello/超时/关闭/移除清空。
- 归档过滤：读 `<DSH_HOME>/storages/workspace.json` 的 `global.archivedSessionIds`（2s 缓存；文件缺失/非法按空集合），从 `sessionList` 去掉归档会话，并按可见列表重算聚合态/`sessions`；这样用户在 DSH 里归档的会话不会在手机上「突然蹦出来」，也不需要改插件或重启 DSH。
- 命令：`dsh_hook_status/install/set_enabled/remove/test`；移动端注册 `send_status_request` 与 `send_focus_request`。

## 7. 手机端

- 协议解析：`parseStatusMessage(raw)`；在 `subscribeChat` 中先于 `parseMessage`，避免进入聊天。
- `ai-status.ts`：`AiState`、`AiStatus`、`reduceAiStatus`、`displayStateOf`。
  - completed：`remainingMs ?? 3000`；到点回 `resume ?? idle`；新状态取消旧定时器；超过 `remainingMs` 的旧 completed 忽略。
  - asking 持久；working 覆盖 sleep；away 优先；宠物动作由 D137 单独驱动，录音只静音 AI 音效/触感。
- `pet-store.ts`：`ai` 内存状态；不落盘；进入 asking 两下轻震、completed 成功震；设置/前后台/麦克风门控。录音中收到 completed 只记 `deferredCompletePending`，`setMicListening(false)` 后 3 秒补一次 `playComplete`；等待中又开录顺延，asking 到达取消（D139）。asking 下比较 `sessionList.completedAt`，检测到 15 秒内新完成时只播轻提示，视觉保持 asking；首份/断线快照只建基线（D142）。
- `sound.ts`：Web Audio 合成三音效；unlock；`playWork/playAsk/playComplete`；ask 12s 最多再响 1 次；录音/后台静音；总音量 `MASTER_GAIN = 3.9`（在 3 倍基础上再 +30%，约 +2.3 dB；单音峰值最高 0.702，不削波）。`playCompleteSoft()` 用于 asking 下：单音 E6、120ms、gain 0.1（峰值 0.39），打 `[pet-sound] complete-soft start/done`。`PetStage` 挂载时先 `unlock()` 一次（Wry 已关闭 `mediaPlaybackRequiresUserGesture`，真机无手势为 running），pointerdown/试听兜底；未解锁打 `[pet-sound] blocked: not unlocked` 并静默跳过。
- 排查日志（2026-11-14 临时保留）：WebView console 打 `[pet-hook]`（收到 status）、`[pet-ai]`（状态/门禁/补音）、`[pet-sound]`（开始/结束）；Rust 打 `[mobile] status recv`。手机上用 `adb logcat` 过滤 `Tauri/Console` 与 `RustStdoutStderr` 查看。
- `pet-stage.tsx` / `boop-pet.tsx`：`data-ai-state` + `data-pet-action`；动作由 `pet-action.ts` 优先级决定；只 transform/opacity。
- `pet-page.tsx`：宠物页组装（顶部条 → 会话卡 → 宠物 → 麦克风）。
- `app.tsx`：上线/回前台 `sendStatusRequest()`；状态不追加到聊天。
- 旧存档 schema 不变；AI 状态只存内存。
- 会话卡：`session-store` 过滤本地清除标记（`lastEventAt <= cleared.through` 隐藏）、排序 asking/working/completed/idle；`session-feed` 置顶在宠物页，折叠 1 行 / 展开最多 5 行（无自动展开），超出的只保留 header 计数；点 asking 行进「等你决定」页，其他行只读。工作中行显示小圆环 spinner + 「正在<动作>」（bash 运行命令 / read 阅读文件 / edit 修改文件 / search 搜索代码 / web 查资料 / agent 处理子任务 / plan 整理计划 / tool 使用工具；无 `tool` 显示「正在思考」），行尾保留「 · 相对时间」。
- 清除标记存 `sidekick-sessions.json`（只存 id/at/through，7 天 TTL、最多 200 条），不存标题/列表；有更新事件自动解除。
- focus：手机生成 requestId 发 `focus.request`，3s 超时提示；`focus.result` 只处理匹配 requestId 的结果。

## 8. 隐私与安全

- 回环 only；token；body 限制；不广播非法请求。
- 只发 state/sessions/ts/resume/remainingMs/sessionList（id、标题、状态、askKind、时间、粗粒度工具类别）；不发送提示词、回复、工具参数、路径、cwd、模型名或工具名原文。工具类别是插件本地归一后的固定枚举（未知工具落 `tool`），不是透传。标题单行 ≤80 字符，不写日志、不落盘。
- 桌面事件日志只在内存，最多 20 条；不落盘。
- 插件日志只记事件类型/错误码。
- 同用户本机进程可读配置伪造状态，属于本机信任边界；P0 不防御本机恶意进程。
- 声音在手机本地合成，不传输音频、不录音。

## 9. 失败与降级

| 场景 | 行为 |
| --- | --- |
| DSH 未装/无 profile | 页面提示；开关不可用；不创建目录 |
| 写 patch 失败 | 回滚；显示路径/错误；不半写 |
| DSH 未重启 | 页面等待；不谎报连接 |
| 插件导入失败 | DSH 只警告；Sidekick 显示未连接/无事件；可修复/移除 |
| DSH 退出 | 15s 超时 → 静态；恢复 10s 内复原 |
| 端口全占 | 页面报错；提示释放/重启 |
| 双 profile | 只选一个；脚本按 profile 自检 |
| 手机离线 | 桌面继续记录；重连快照；不补播完成 |
| 手机后台 | 静音；回前台请求快照；过期完成忽略 |
| 录音 | 录音中静音；麦克风释放 3 秒后补一声完成音（只补最近一次）；补音等待中又开录则顺延 |
| 陈旧 blocked asking | >10min 无 pending 按 idle，不再阻塞完成音；>24h 无事件的 idle 会话移除（D141） |
| 音效被系统静音/音乐焦点 | P0 不保证；文档提示；P1 原生提示音 |
| 会话列表过长 | 插件/桥截断 50 条；手机内部滚动，超出的不展示 |
| 旧插件/旧桥无 `tool` | 手机工作行显示「正在思考」；不报错、不丢整条会话 |
| 未知工具名 | 插件/桥折叠为通用 `tool`，手机显示「正在使用工具」；原文不外发 |
| 会话已归档 | 桌面桥按 `workspace.json` 过滤后不下发；聚合态按可见会话重算，必要时回落 idle |
| 归档文件读不到 | 按未归档处理（列表可能多一条，不影响其它功能） |
| 清除后无新事件 | 保持隐藏；重启 App 仍隐藏（本地标记） |
| focus 时手机离线 | 手机侧直接提示，不上报 |
| DSH 未安装/限频/非 macOS | 分别回 `launch_failed` / `rate_limited` / `unsupported_platform`，手机显示对应文案 |

## 10. 测试

- Rust：`cargo test --lib`（status 解析/token/body/timer/patch/端口/profile/工具白名单折叠）。
- 脚本：`node --check app/src/dsh-hook/sidekick-hook.mjs`；`cd app && pnpm exec vitest run src/dsh-hook`（事件矩阵、子代理、ask 命名、completed 节流、陈旧 asking/会话清理、工具类别归一）。
- 协议：`pnpm exec vitest run src/protocol`。
- 手机：`pnpm exec vitest run src/mobile`（ai-status/声音/四态/优先级/录音结束后补完成音/asking 轻提示/会话 store/会话卡/工作行工具动作）。
- 桌面：`pnpm exec vitest run src/desktop/features/hook`。
- 全量：`pnpm typecheck && pnpm lint && pnpm test && pnpm build`；`cargo test`；`node scripts/check-docs.mjs`；`node scripts/check-boundaries.mjs`。
- 真机：安装/重启/四态/声音/杀 DSH/重连/录音/夜间/减少动效。

## 11. 已知限制

- 首次开启必须重启 DSH 一次（profile patch 启动时加载；desktop profile 默认无 HMR）。
- 子代理 P0 不计数；父 turn 交给后台子代理时可能提前显示完成。
- 自由文本提问不识别；只认显式提问/审批。
- 关闭 App/后台无推送；只能重连拿快照。
- 同时跑 desktop/web 只支持选一个 profile。
- 音效 P0 合成音；系统静音/勿扰/音乐焦点不保证。
- 本机恶意进程可伪造状态；局域网 WS 仍无鉴权（现有 P1）。
- 手机只支持竖屏；focus 只唤起/启动 DSH，不定位到具体会话。
- 会话标题与粗粒度工具类别是本功能新增的外发字段（工具类别是固定枚举、不含工具名原文/参数/路径），用户需知悉；如后续要关闭标题同步，可加设置开关。
