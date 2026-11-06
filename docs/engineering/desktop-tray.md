---
doc: engineering/desktop-tray
title: 电脑端菜单栏常驻（后台运行 + 状态栏图标）
status: active
updated: 2026-11-06
load: on-demand
owner: engineering
related:
  - ./desktop-ios-ui.md
  - ../decisions.md
  - ../../app/src-tauri/src/tray.rs
  - ../../app/src-tauri/src/lib.rs
---

# 电脑端菜单栏常驻（D88）

> 一句话：电脑端从一个「窗口应用」变成「常驻服务 + 菜单栏图标」——**关窗只隐藏窗口，进程继续跑**。
> 动机不是「加个小图标」，而是现在 `关窗即退出` 会把 HTTP 服务（47810+）、UDP 发现（47820）、
> DSH hook 回环桥（47815–47819）一起带走：用户关窗后手机连不上、AI 状态断更。

## 1. 行为契约

| 动作 | 行为 |
| --- | --- |
| 点窗口关闭按钮 | 隐藏窗口（`prevent_close` + `hide`），进程、服务、hook 桥、托盘都不退出 |
| 左键点菜单栏图标 | 显示并激活主窗口（`show` + `unminimize` + `set_focus`） |
| 右键点菜单栏图标 | 弹出菜单：`显示主窗口` / 分隔线 / `退出 Sidekick` |
| 再次启动 App（Finder/Spotlight/命令行） | 单实例插件把已有主窗口叫回前台，新进程退出（D60 不变） |
| 菜单「退出 Sidekick」 | `app.exit(0)`，进程结束、托盘图标消失 |
| Dock / Cmd+Tab | 不出现（`ActivationPolicy::Accessory`），Dock 图标常驻隐藏 |

**唯一退出入口是菜单栏右键菜单**：Accessory 应用没有 App 菜单，关窗后 ⌘Q 也收不到；
文档、排障提示、给用户的说明里都不要再写「关掉窗口就退出」。

## 2. 实现位置

| 文件 | 职责 |
| --- | --- |
| `app/src-tauri/src/tray.rs` | 托盘图标/菜单/点击事件；`TRAY_READY` 全局开关；`show_main_window()` |
| `app/src-tauri/src/lib.rs` | setup 里设 Accessory、建托盘、首次把窗口叫到前台；`on_window_event` 拦 `CloseRequested`；单实例回调复用 `show_main_window` |
| `app/src-tauri/Cargo.toml` | **桌面目标**才开 `tauri` 的 `tray-icon` + `image-png` feature（Android 不带 tray 依赖） |
| `app/src-tauri/icons/tray.png` | 36×36 单色模板图（随身卡剪影：卡身实心 + 挂孔与灯镂空），18pt @2x |
| `scripts/gen-brand-mark.py` | 从「随身卡」几何唯一事实源重新生成 `tray.png`（含 Android 自适应前景层与 favicon，只依赖 Pillow） |

图标必须是**模板图**：`icon_as_template(true)` 后系统只用 alpha 着色，浅色菜单栏画黑、深色画白、
窗口失焦自动变淡。彩色 logo 直接缩放会变成一块纯色方块；菜单栏高度只有 18pt，细节要能去掉圆角底色单独成立。

## 3. 回退链（重要）

1. 托盘创建失败（`tray::init` 返回 Err）→ 打 `[tray] 初始化失败，保持关窗即退出行为: …`，`TRAY_READY` 保持 false，
   `CloseRequested` 不拦截 → 退回旧行为「关窗即退出」。**绝不能出现「窗口没了、菜单栏没有、还退不掉」的死局。**
2. 非 macOS：`set_activation_policy` 用 `#[cfg(target_os = "macos")]` 包住；托盘代码本身跨平台可编译，但产品只承诺 macOS。
3. Android：`tray-icon` / `image-png` feature 只在桌面目标启用，手机包不受影响（构建时验证 `cargo check --target aarch64-linux-android` 或直接打 APK）。

## 4. 已知代价 / 风险

- **没有 Dock 图标与 App 菜单**：Cmd+Q / Cmd+Tab / 顶部 App 菜单都用不了，这是用户明确选择（D88）。
- **隐藏窗口的 WebView 仍在内存里**（约 100–200MB）；Rust 侧服务不受影响，隐藏期间 WebView 定时器可能被系统节流，
  与「连接/AI 状态」无关（那些都在 Rust）。
- `window.set_focus()` 在 macOS 上会 `makeKeyAndOrderFront` + `activate`；Accessory 应用也能到前台，不需要额外私有 API。
- 托盘是单例：重复 `init` 会创建第二个状态栏图标，`TRAY_READY` 兜住重复初始化路径（目前只在 setup 调一次）。
- 图标/菜单文案改动只影响电脑端，手机无感；**状态文字（如「等你回答」）v1 明确不做**，菜单栏只放图标。

## 5. 验证清单（无头环境截不到菜单栏，必须人工）

**已在本机验证（2026-11-06，dev 二进制无头冒烟）**：

- 启动日志出现 `[tray] 菜单栏图标已就绪（左键显示窗口 / 右键菜单退出）`，`[server] listening on …:47810`、`[discovery] UDP 响应器已启动`、`[dsh-hook] listening on 127.0.0.1:47815/hook/dsh` 同时在线；
- `lsappinfo info -only ApplicationType` 返回 `"UIElement"` → Accessory 生效（Dock 隐藏、无 App 菜单）；
- 单实例二次启动：第二个进程 exit 0、只剩一个进程；杀进程后 47810/47820 端口释放；
- `cargo check` / `cargo fmt --check` / `cargo tree --target aarch64-linux-android -i tray-icon`（无输出=Android 不带托盘依赖）均通过。

仍必须人工目检（屏幕录制权限拿不到，截图全黑）：

1. `cd app && pnpm tauri dev` → 菜单栏出现随身卡剪影（浅色/深色各看一次）。
2. 点窗口关闭按钮 → 窗口消失、**Dock 里没有 Sidekick**、菜单栏图标还在；`lsof -nP -iTCP:47810` 仍有进程监听。
3. 手机 App 在关窗后仍显示「已连接」，AI 状态仍随 DSH 活动变化。
4. 左键点图标 → 窗口回来且可输入；再关窗 → 再左键 → 还能回来。
5. 右键 → 菜单三项正确；点「退出 Sidekick」→ 进程退出、图标消失、`lsof` 端口释放。
6. 窗口隐藏时再次 `open -a Sidekick`（或 `pnpm tauri dev` 二次启动）→ 旧进程把窗口叫回前台，不出现第二个实例。
7. 菜单栏图标在「浅色菜单栏 / 深色菜单栏 / 窗口失焦」三种状态下都清晰（模板图自动反色）。
