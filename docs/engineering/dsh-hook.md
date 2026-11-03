---
doc: engineering/dsh-hook
title: DSH Hook 技术方案
status: active
updated: 2026-11-02
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
| `app/src/desktop/features/hook/` | 桌面 AI 联动页与 store |
| `app/src/mobile/features/pet/ai-status.ts` | 手机 AI 状态、完成定时器、优先级 |
| `app/src/mobile/features/sessions/session-store.ts` | 会话列表、排序、清除标记、focus 结果 |
| `app/src/mobile/features/sessions/session-panel.tsx` | 宠物页上方会话面板（收起 1 条 / 展开 5 条） |
| `app/src/mobile/features/sessions/session-storage.ts` | 本地清除标记（`sidekick-sessions.json`，只存 id + 时间） |
| `app/src-tauri/src/app_focus.rs` | 手机 focus 请求 → 激活/启动 DSH（macOS `open -a`） |
| `app/src/mobile/features/pet/sound.ts` | Web Audio 三音效 |
| `app/src/mobile/features/pet/pet-fallback.tsx` / `pet.module.css` | 四态动作、道具、减少动效 |

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
| `turn/start` | 会话 working；清空旧 ask/approval |
| `tool/call` 提问类 | 会话 asking；记录 callId |
| `tool/result` 对应 callId | 清 ask；回 working/idle |
| `approval/asked` | 会话 asking；记录 approval id |
| `approval/decided` | 清 approval；回 working/idle |
| `user/message` | 清该会话所有 ask/approval；按 turnActive 回 working/idle |
| `turn/end` reason completed | 完成脉冲（无 asking 时） |
| `turn/end` reason blocked | asking |
| `turn/end` 其他 reason | idle |
| `session/title` | 更新会话标题（单行 ≤80 字符） |
| `session/disposed` | 移除会话 |

子代理过滤：`session.header.origin === "subagent"` 或 `delegationDepth > 0` 不参与状态/计数（P0）。

聚合：

- 任一顶层会话 asking → `asking`。
- 否则任一 working → `working`。
- 否则最近 completed 脉冲未过期（3s）→ `completed`。
- 否则 `idle`。
- completed 脉冲 5s 内最多一次；有 asking 时不发 completed。
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
      "askKind": null, "lastEventAt": 1730000000000, "completedAt": null }
  ],
  "ts": 1730000000000
}
```

`sessionList`：最多 50 条；`state` 不含 completed，完成态由 `completedAt` 推导；旧客户端忽略。

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
  - 状态变化：更新状态 → `tx.send(status_json)` 广播 → `app.emit("dsh-hook-status")`。
  - completed 定时器：3s 后广播 resume；新状态/关闭/断开取消。
  - 心跳超时：15s 无 hello/state/heartbeat → connected=false + idle + 广播。
  - `snapshot_json()`：当前状态 + `remainingMs`；新连接/`status.request` 使用。
- `desktop_server.rs`：`AppState` 持有 `Arc<HookBridge>`；新 socket 在 spawn send task 之前直接发快照；收到 `status.request` 回快照。
- 端口：先绑定成功者生效；实际 endpoint 写回 `config.json`，脚本 1s 内切换。
- 单实例前提：桌面端由 `tauri-plugin-single-instance` 保证一台机器只有一个进程（D60）。多开时后启动实例会把 endpoint 改成自己的回环端口，它退出后 hook 上报全部打空，存活实例一直 idle；排查时先看 `lsof -nP -iTCP:47815-47819` 与 `config.json` 的 endpoint 是否指向活着的进程。
- 快照补发：新 WS 连接直发 `snapshot_json()`；手机上线/回前台发 `status.request`，服务端广播快照。手机重启不会丢状态。
- 列表：`BridgeInner.session_list` 随 state/heartbeat 替换；heartbeat 列表变化也要广播；hello/超时/关闭/移除清空。
- 命令：`dsh_hook_status/install/set_enabled/remove/test`；移动端注册 `send_status_request` 与 `send_focus_request`。

## 7. 手机端

- 协议解析：`parseStatusMessage(raw)`；在 `subscribeChat` 中先于 `parseMessage`，避免进入聊天。
- `ai-status.ts`：`AiState`、`AiStatus`、`reduceAiStatus`、`displayStateOf`。
  - completed：`remainingMs ?? 3000`；到点回 `resume ?? idle`；新状态取消旧定时器；超过 `remainingMs` 的旧 completed 忽略。
  - asking 持久；working 覆盖 sleep；away/listening/interacting/celebrating/concerned 优先。
- `pet-store.ts`：`ai` 内存状态；不落盘；进入 asking 两下轻震、completed 成功震；设置/前后台/麦克风门控。
- `sound.ts`：Web Audio 合成三音效；unlock；`playWork/playAsk/playComplete`；ask 12s 最多再响 1 次；录音/后台静音。
- `pet-fallback.tsx` / `pet.module.css`：`data-ai-state`；短爪层 + 道具层；四套 SVG 表情；只 transform/opacity。
- `pet-status-caption.tsx`：气泡位；working 5s、asking 持续、completed 3s；AI 状态优先。
- `app.tsx`：上线/回前台 `sendStatusRequest()`；状态不追加到聊天。
- 旧存档 schema 不变；AI 状态只存内存。
- 会话面板：`session-store` 过滤本地清除标记（`lastEventAt <= cleared.through` 隐藏）、排序 asking/working/completed/idle；首次快照不自动展开，新 asking 才展开。
- 清除标记存 `sidekick-sessions.json`（只存 id/at/through，7 天 TTL、最多 200 条），不存标题/列表；有更新事件自动解除。
- focus：手机生成 requestId 发 `focus.request`，3s 超时提示；`focus.result` 只处理匹配 requestId 的结果。

## 8. 隐私与安全

- 回环 only；token；body 限制；不广播非法请求。
- 只发 state/sessions/ts/resume/remainingMs/sessionList（id、标题、状态、askKind、时间）；不发送提示词、回复、工具参数、路径、cwd、模型名。标题单行 ≤80 字符，不写日志、不落盘。
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
| 录音/触摸 | 互动优先；录音静音；完成不补播 |
| 音效被系统静音/音乐焦点 | P0 不保证；文档提示；P1 原生提示音 |
| 会话列表过长 | 插件/桥截断 50 条；手机内部滚动，超出的不展示 |
| 清除后无新事件 | 保持隐藏；重启 App 仍隐藏（本地标记） |
| focus 时手机离线 | 手机侧直接提示，不上报 |
| DSH 未安装/限频/非 macOS | 分别回 `launch_failed` / `rate_limited` / `unsupported_platform`，手机显示对应文案 |

## 10. 测试

- Rust：`cargo test --lib`（status 解析/token/body/timer/patch/端口/profile）。
- 脚本：`node --check app/src/dsh-hook/sidekick-hook.mjs`；`cd app && pnpm exec vitest run src/dsh-hook`（事件矩阵、子代理、ask 命名、completed 节流）。
- 协议：`pnpm exec vitest run src/protocol`。
- 手机：`pnpm exec vitest run src/mobile`（ai-status/声音/四态/优先级/会话 store/面板）。
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
- 会话标题是本功能唯一新增的内容类字段，用户需知悉；如后续要关闭标题同步，可加设置开关。
