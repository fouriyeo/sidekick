//! 激活策略：窗口可见时接管菜单栏（D112）。
//!
//! D88 为了「菜单栏常驻、不占 Dock」把桌面端设成
//! `ActivationPolicy::Accessory`，但 macOS 的 Accessory 应用**没有自己的菜单栏**：
//! 主窗口聚焦时左上角显示的还是上一个普通 App 的菜单（⌘Q / 编辑菜单都不属于
//! Sidekick）。所以改成按窗口状态切换：
//!
//! - 主窗口显示 → `Regular`：Dock 图标 + 完整菜单栏（关于/文件/编辑/显示/窗口/帮助）
//!   + 出现在 Cmd+Tab；普通 Mac 软件的手感。
//! - 关窗隐藏 → `Accessory`：交还菜单栏，只剩菜单栏图标，保持 D88 的常驻行为。
//!
//! 调用点只有两处：`tray::show_main_window`（显示）与 `lib.rs` 里主窗口的
//! `CloseRequested`（隐藏）。菜单本身用 Tauri 的 macOS 默认菜单，不另建。

use tauri::{AppHandle, Runtime};

/// 主窗口显示：切到普通 App，让系统把菜单栏和 Dock 图标交还给它。
pub fn window_shown<R: Runtime>(app: &AppHandle<R>) {
    if let Err(err) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
        eprintln!("[activation] 切到 Regular 失败: {err}");
    }
}

/// 主窗口隐藏：切回菜单栏常驻（无 Dock、无 App 菜单、无 Cmd+Tab）。
pub fn window_hidden<R: Runtime>(app: &AppHandle<R>) {
    if let Err(err) = app.set_activation_policy(tauri::ActivationPolicy::Accessory) {
        eprintln!("[activation] 切回 Accessory 失败: {err}");
    }
}
