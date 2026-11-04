---
doc: engineering/lan-discovery
title: 局域网自动发现（UDP）与端口策略
status: active
updated: 2026-11-01
load: on-demand
owner: engineering
related:
  - ../architecture.md
  - ../../protocol/README.md
---

# 局域网自动发现（UDP）与端口策略

> 一句话：手机不用知道电脑端口，靠一次 UDP 广播探测拿到「电脑名 + 真实端口」；服务端口改用不常用端口并自动回退，桌面不再常驻大二维码。

## 1. 为什么这么做

- 用户痛点是「每次都要填 `IP:端口` 或扫码」，而电脑 IP/端口都可能变，大二维码长期占桌面。
- 同网段发现不需要配对服务器：手机广播一次、电脑单播回一次即可，**零新增依赖**。
- 不用 mDNS/Bonjour：需引入 crate，Android 还要 MulticastLock，收益与成本不匹配；广播探测 + 单播回包用标准库就能稳定工作。

## 2. 端口

| 用途 | 端口 | 说明 |
| --- | --- | --- |
| HTTP/WS 服务首选 | `47810` | 不常用；低于临时端口段（49152–65535） |
| 服务候选回退 | `47811`–`47814`，`8848` | 依次 bind，第一个成功者生效；8848 仅为兼容兜底 |
| UDP 发现 | `47820` | 固定；桌面只收探测，回包走单播 |

- 服务端口被占用时自动顺延，日志打印每个候选的失败原因；全部失败时 `server_info` 超时返回错误，桌面面板展示错误与「重试」。
- 手机端 `connect_server` 只写裸 IP 时缺省用 `47810`；显式写端口（含旧的 `IP:8848`）仍然可用。

## 3. 拓扑

```
手机 App（Tauri Android）
  │ discover_servers（Rust，std::net::UdpSocket，阻塞线程）
  │   ① 广播 probe → 255.255.255.255:47820（0/400/800ms 各一次）
  ▼
桌面 App（Tauri，Rust）
  │   ② UDP 响应器 0.0.0.0:47820 收到 probe → 单播 reply 回手机源地址
  ▼
手机 App
  │   ③ 校验/去重 → Vec<DiscoveredServer>
  │   ④ 1 台自动连；多台列表点选；0 台提示 + 手动地址/上次地址兜底
  ▼
桌面 axum 服务 0.0.0.0:<真实端口>（WS /ws、HTTP /）
```

## 4. 报文（UDP 文本帧，UTF-8 JSON）

### 4.1 probe（手机 → 广播）

```json
{ "sk": "sidekick.discover", "v": 1, "id": "6f1c2a9d" }
```

### 4.2 reply（桌面 → 单播回 probe 源地址）

```json
{ "sk": "sidekick", "v": 1, "id": "6f1c2a9d", "name": "jiangtao-mbp", "port": 47810 }
```

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `sk` | string | `sidekick.discover`（探测）/ `sidekick`（响应），用于丢弃无关 UDP 包 |
| `v` | number | 协议版本，当前 `1`；不匹配直接忽略 |
| `id` | string | 手机生成的随机 hex，响应回显；用于丢弃过期/伪造回包 |
| `name` | string | 电脑短主机名，清洗后 ≤32 字符；取不到用「我的电脑」 |
| `port` | number | 桌面服务真实端口（可能因回退不是 47810） |

安全规则：

- 手机**只用 UDP 源 IP + 报文 `port`** 拼连接地址，忽略报文里任何 IP 字段，避免被引到第三方地址。
- 只接受 `sk` 正确、`v == 1`、`port` 在 1–65535 的 JSON；非法包丢弃。
- 结果按 `ip:port` 去重，最多 8 台，按 IP 排序；`name` 去控制字符、压成单行。
- 发现本身不鉴权：只暴露「同一网段有人在跑 Sidekick + 主机名 + 端口」，与现有「同网段可连 WS」的信任模型一致；配对鉴权仍按路线图实现，届时在 reply 增加 token/版本字段。

## 5. 实现映射

| 层 | 位置 | 行为 |
| --- | --- | --- |
| Rust 共用 | `app/src-tauri/src/discovery.rs` | 常量、报文编解码、`sanitize_name`、`scan_once(target, timeout)` |
| Rust 桌面 | 同上 `spawn_responder(bound_port)` | `tokio::net::UdpSocket` 绑 `0.0.0.0:47820`，循环 `recv_from` → 回 `send_to`；启动失败仅记日志 |
| Rust 手机 | 同上 `discover_servers` 命令 | `spawn_blocking(scan_once)`；异常只记日志、返回空数组 |
| Rust 桌面 | `desktop_server::start()` | 候选端口 bind → 记录 `BOUND_PORT` → 通知就绪 → 启动响应器 → `axum::serve` |
| Tauri 命令 | 桌面 `server_info` | 等就绪（≤3s），返回 `{ip, port, url, discoveryPort}`；失败返回中文错误 |
| 前端手机 | `mobile/features/connect/connection-store.ts` | `discover()`：并发保护、单台自动连、0 台提示 |
| 前端桌面 | `desktop/features/connect/components/connection-panel.tsx` | 地址 + 复制 + 自动发现状态；二维码移入按需展开区 |

扫描参数：探测 3 次（0/400/800ms），读超时 100ms，总窗口 1500ms；手机 UI 期间显示「正在找电脑…」。

## 6. 断连自动重连（退避）

断连（手机 Rust 读循环结束 → 发出 `conn{online:false}`）后，手机前端自动进入重连循环，不需要用户操作：

| 项 | 规则 |
| --- | --- |
| 触发 | App 启动后搜索未连上；已连接后断开；手动连接失败（电脑可能只是晚开机）；App 回到前台 |
| 每次重试做什么 | 先静默 UDP 重新发现（1.5s 窗口，不显示「正在找电脑…」），拿到唯一电脑就连它；发现不到就退回上次地址；多台电脑时回上次连过的那台，没有上次地址就停下等用户选 |
| 退避 | 1s → 2s → 4s → 8s → 16s → 30s，之后固定 30s；连上或手动操作后清零 |
| 手动优先 | 手动连接/「重新搜索」立刻取消排期（generation 守卫，在途重连续跑失效）；手动连接失败后从头退避 |
| 后台 | App 切后台暂停排期并取消在途重连；回前台立即重试一次（退避清零，避免熄屏期间计时器被冻结） |
| UI | 未连接时连接页显示「N 秒后自动重连（第 K 次）」+「立即重连」+「重新搜索」；消息页保留断连折叠块（D79：连接页是排障主入口） |
| 停止 | 连上即停止；多台电脑且从未连过时不替用户选；其余情况不停止（长期找不到也每 30s 静默试一次） |
| 已知限制 | 协议没有心跳：进程退出/网络断开靠 FIN/RST 立刻发现（实测约 0.5s），但电脑睡眠、路由器静默丢包等半开连接可能长时间仍显示「已连接」，直到写失败或 TCP keepalive 生效；心跳方案见第 9 节 |

实现：`app/src/mobile/features/connect/connection-store.ts`（`bootstrap` / `scheduleRetry` / `retryNow` / `pauseRetry` / `resumeRetry`，模块级单一定时器），UI 在 `connection-bar.tsx`。

## 7. 失败模式

| 场景 | 现象 | 处理 |
| --- | --- | --- |
| 路由器禁止广播 / AP 隔离 | 发现 0 台 | 提示同一 Wi-Fi + 「重新搜索」+「手动输入地址」；自动重连会继续静默重试（最长 30s 一次） |
| macOS 防火墙拦 UDP | 同上 | 提示允许 Sidekick 传入连接；面板显示「自动发现未开启/未找到」 |
| 手机在蜂窝网 | 无广播出口 | 空结果，走手动地址 |
| 服务端口全被占用 | 桌面 `[server]` 报错 | `server_info` 返回错误，面板错误态 +「重试」；日志列出各候选失败原因 |
| 发现端口 47820 被占用 | 响应器不启动 | `discoveryPort = null`，桌面面板提示改用二维码/手动地址 |
| 桌面端多开 | 不会发生：第二个进程只聚焦已有窗口后退出（D60） | 单实例插件兜底；历史上多开会让后启动实例抢走 DSH hook endpoint，退出后状态断流 |
| 伪造/乱序 UDP 包 | 无 | 校验 `sk`/`v`/`port`；`id` 回显不匹配则丢弃 |
| 重复连接（自动 + 手动） | 不会双连接 | Rust 连接串行化 + generation 守卫，旧连接不覆盖新状态 |
| 连上但 WS 握手失败 | 状态 `error` + 中文原因 | `connect_server` 4s 超时；自动重连继续；用户也可重新搜索或手动输入 |

## 8. 测试

- Rust：`cd app/src-tauri && cargo test`
  - 报文编解码往返；异 `sk`、坏 JSON、越界端口被忽略；响应以 UDP 源 IP 覆盖报文 IP。
  - `sanitize_name` 截断/空/控制字符；端口候选唯一且均在 1024–49151。
  - `scan_once` 集成测试：响应器绑 `127.0.0.1:0`，target 指向该端口，断言发现成功且端口正确。
- 前端：`cd app && pnpm test`
  - `protocol/discovery` guard；`tauri.discoverServers` 过滤；连接 store 的单台自动连/多台不连/0 台提示/并发保护；Chat 页发现 UI 与手动兜底。
  - 自动重连（fake timers）：断连 1s 后重新发现并连上；找不到按 1→2→4s 退避、上限 30s；发现不到退回上次地址；多台回上次那台/无地址时停止；连上清空倒计时；立即重连取消剩余等待；切后台暂停、回前台立即重试；手动连接取消排期；启动搜不到自动重试。
- 真机：Realme RMX3370（Android 13）打开 App ≤3s 自动连上；端口回退（先占用 47810）后仍能自动连上。

## 9. 后续

- 配对鉴权落地时：reply 增加 `pairRequired`/`token`，首次连接走配对流程。
- WS 心跳（如 15s ping、连续 2 次失败判死）覆盖半开连接，让「电脑睡眠/路由器静默丢包」也能尽快进入重连。
- 多网卡/多桌面选择优化、iOS 本地网络权限（`NSLocalNetworkUsageDescription` + Multicast entitlement）另开阶段。
