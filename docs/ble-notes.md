# 蓝牙预研笔记（暂停，非当前主线）

日期：2026-10-31

## 结论

- macOS 可以当 BLE 外设（peripheral）：用 Python `bless` 实测成功广播自定义 GATT 服务。
- 推荐角色：**电脑当外设（GATT server）、手机当中心设备（GATT client）**。
  - 手机端中心设备生态成熟（Flutter 用 `flutter_blue_plus`；原生 Kotlin 也简单）。
  - 当前 Tauri 安卓端做蓝牙需要自写 Tauri mobile plugin（Kotlin 封装 Android BLE）。
- 当前主线是局域网；蓝牙留作后续传输方案。

## 关键坑

- CoreBluetooth 报错 `NSInternalInconsistencyException - Characteristics with cached values must be read-only`：
  创建**可写**特征时初始值必须传 `None`（不要传 `b""`）。
- 首次访问蓝牙会触发系统权限（TCC）弹窗。
- Tauri 2 的移动端 BLE 生态很弱：
  - 方案 A：写 Tauri 移动插件（Kotlin/JNI），工程量大但纯 Tauri；
  - 方案 B：保留 Python sidecar 做 BLE，再桥接到本地 WS（与现有 Rust 服务并行）。

## 验证代码（要点）

```python
from bless import BlessServer, GATTCharacteristicProperties, GATTAttributePermissions

server = BlessServer(name="Sidekick")
server.read_request_func = read_request
server.write_request_func = write_request

await server.add_new_service(SERVICE_UUID)
await server.add_new_characteristic(
    SERVICE_UUID, RX_UUID,
    GATTCharacteristicProperties.write | GATTCharacteristicProperties.write_without_response,
    None,  # 必须 None，不能 b""
    GATTAttributePermissions.writeable,
)
await server.add_new_characteristic(
    SERVICE_UUID, TX_UUID,
    GATTCharacteristicProperties.notify,
    None,
    GATTAttributePermissions.readable,
)
await server.start()
```

- POC UUID（非最终协议）：
  - 服务：`0000A000-0000-1000-8000-00805F9B34FB`
  - 手机→电脑 RX：`0000A001-0000-1000-8000-00805F9B34FB`
  - 电脑→手机 TX：`0000A002-0000-1000-8000-00805F9B34FB`
- 若重启蓝牙路线：先用 nRF Connect 验证手机能连上 Mac 广播、双向读写，再决定插件还是 sidecar。

## 历史环境备注

- 曾尝试 Homebrew cask 安装 Flutter，因 `storage.googleapis.com` 下载卡住放弃；如回归 Flutter，可改用 `storage.flutter-io.cn` / `pub.flutter-io.cn` 镜像。
- Python 实验环境曾建在 `daemon/.venv`（已 gitignore，可随时重建：`python3.11 -m venv .venv && pip install bless`）。
