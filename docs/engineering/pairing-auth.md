---
doc: engineering/pairing-auth
title: 扫码配对与 WS 鉴权
status: active
updated: 2026-11-15
load: on-demand
owner: engineering
---

# 扫码配对与 WS 鉴权

## 1. 解决什么

之前局域网 WS 没有任何身份校验：同网段任何人都能连 `/ws`，看广播、发消息，甚至触发 `mic.remote`（后来加了后台待命，风险更大）。现在：

- 手机首次连接必须**扫电脑上的二维码**，用一次性 6 位码换长期 token；
- 之后每次连接用 token 做**挑战应答**，token 不上线；
- 未通过鉴权的 LAN 连接只能收到 `auth.required`，不订阅广播、不拿 AI 状态/桌面状态，也不能发 `mic.*` / `memo.*` / `word.*` / `chat`。

**边界**：这是身份鉴权，不是加密。局域网仍是明文 WS；正式公网/不可信网络要先做 TLS。桌面本机 WebView（127.0.0.1/::1）直通，不受配对阻塞。

## 2. 配对流程

1. 桌面打开「设置 › 手机连接」的二维码；主进程调用 `pairing_code_create` 生成一次性码（6 位、5 分钟、错 3 次作废），二维码内容 `http://<ip>:<port>/?pair=<code>`。
2. 手机扫码，`parseScanPayload` 解析出 `addr` + `pairCode`，`connectServer(addr, pairCode)`。
3. 手机 Rust 连上 WS 后等桌面 `auth.required {nonce}`；有扫码码就发 `auth.pair {code, deviceId, deviceName}`。
4. 桌面校验码后签发 64 hex token，落 `~/.sidekick/paired-devices.json`（0600），回 `auth.ok {token, deviceId, desktopId}`。
5. 手机把 token 存 App 私有 `pairing.json`（0600），后续连接发 `auth.token {deviceId, proof}`，`proof = sha256(token + nonce)`。
6. 桌面校验通过才进入正常会话：AI 状态快照、`desktop.status`、广播、`mic.remote`、备忘录/英语角同步。

## 3. 协议

| 方向 | type | 字段 |
| --- | --- | --- |
| 桌面 → 手机 | `auth.required` | `nonce`、`desktopId`、`ts` |
| 手机 → 桌面 | `auth.pair` | `code`、`deviceId`、`deviceName`、`ts` |
| 手机 → 桌面 | `auth.token` | `deviceId`、`proof`、`ts` |
| 桌面 → 手机 | `auth.ok` | `deviceId`、`desktopId`、`token`（仅配对时）、`ts` |
| 桌面 → 手机 | `auth.error` | `code`（`pair_failed` / `unauthorized` / `bad_request`）、`message`、`ts` |

- 鉴权握手 10 秒超时；错误超过 3–5 次断开。
- `auth.pair` 的码一次性；成功即作废。
- `auth.token` 的 nonce 每连接新生成，proof 不能跨连接重放。
- 手机收到 `auth.error{code:"unauthorized"}` 清本地 token，提示重新扫码。

## 4. 本机回环

桌面主窗口是 `ws://127.0.0.1:<port>/ws`，服务端通过 `ConnectInfo<SocketAddr>` 判断 `peer.ip().is_loopback()`，回环直通。否则必须先过 `authenticate()`。这样不会把桌面自己的 UI 锁死。

## 5. 文件与命令

- `app/src-tauri/src/pairing.rs`：PairingStore（配对码/token/挑战校验/0600 持久化）+ `pairing_code_create` / `pairing_devices` / `pairing_revoke`。
- `app/src-tauri/src/desktop_server.rs`：`ws_handler(ConnectInfo, ...)`、`authenticate()`、`serve_authenticated()`。
- `app/src-tauri/src/mobile_client.rs`：`connect_server(addr, pairCode)`、`PairingData`（`pairing.json`）、客户端挑战应答。
- `app/src/desktop/features/connect/components/connection-section.tsx`：二维码带 `?pair=`、显示 6 位码。
- `app/src/mobile/features/connect/scan-payload.ts` / `scan-view.tsx`：解析并传递 `pairCode`。
- 协议：`protocol/README.md` §鉴权。

## 6. 验收要点

- 未配对 LAN 连接：第一条消息必须是 `auth.required`，不能收到 AI 状态快照/`desktop.status`。
- 错误码 3 次作废；过期码拒绝。
- 配对成功 → token 重连 → 挑战应答通过；错误 proof/未知设备拒绝。
- 手机删除/清数据后 token 丢失，重新扫码可配。
- 桌面本机窗口正常，不被 `auth.required` 阻塞。
- 不把 token、配对码写日志；token 文件 0600。
- 只解决可信局域网身份；不做 TLS/公网承诺。

## 7. 后续

- 桌面 UI 的「已配对设备」列表/撤销入口（命令已具备）。
- 可选：TLS 或消息级加密；扫码二维码的屏幕截图提示。
- 多电脑多 token 管理；当前手机只保留最近一台电脑 token。
