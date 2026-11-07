//! macOS 菜单栏常驻（D88）。
//!
//! 关窗只隐藏窗口，进程（HTTP 服务、UDP 发现、剪贴板监听、DSH hook 回环桥、
//! 语音/价格后台任务）继续跑——这是「手机在电脑窗口关掉后还能连上、AI 状态
//! 还能推」的前提。入口只在菜单栏：**左键弹用量小看板，右键菜单显示主窗口/退出**；
//! Dock 图标隐藏（`ActivationPolicy::Accessory`），不出现在 Cmd+Tab。
//!
//! 图标是单色模板图（`icons/tray.png`，猫头剪影 + 眼睛镂空），
//! `icon_as_template(true)` 让系统按浅色/深色菜单栏自动反色。
//!
//! 托盘创建失败时下面 `lib.rs` 的关闭处理会退回旧行为（关窗即退出），
//! 否则会出现「窗口没了、菜单栏也没有、还退不掉」的死局。
//!
//! 2026-11-07（D108）：左键改为弹出「Token 用量小看板」（`usage_panel`），
//! 主窗口改走右键菜单「显示主窗口」或看板底部「打开用量页」；右键菜单不变。

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    AppHandle, Manager, Runtime,
    image::Image,
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::usage_panel;

const MAIN_WINDOW: &str = "main";
const TRAY_ID: &str = "sidekick-tray";
const MENU_SHOW: &str = "sidekick.tray.show";
const MENU_QUIT: &str = "sidekick.tray.quit";

/// 托盘是否真的建起来了。没建起来时关窗必须走默认的「退出」，
/// 不能让窗口隐藏后没有任何退出入口。
static TRAY_READY: AtomicBool = AtomicBool::new(false);

pub fn ready() -> bool {
    TRAY_READY.load(Ordering::Relaxed)
}

/// 显示并激活主窗口：托盘左键、菜单「显示主窗口」、单实例二次启动都走这里。
pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        eprintln!("[tray] 找不到主窗口 {MAIN_WINDOW}");
        return;
    };
    let _ = window.show();
    let _ = window.unminimize();
    // set_focus 在 macOS 上会 makeKeyAndOrderFront + activate，Accessory 应用也能到前台。
    let _ = window.set_focus();
}

pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, MENU_SHOW, "显示主窗口", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "退出 Sidekick", true, None::<&str>)?;
    let menu = MenuBuilder::new(app).items(&[&show, &sep, &quit]).build()?;

    let icon = Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("小跟班 Sidekick · 点按查看用量")
        .menu(&menu)
        // 左键开用量小看板（D108），菜单（含退出）只在右键弹出。
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_SHOW => show_main_window(app),
            MENU_QUIT => {
                eprintln!("[tray] 从菜单栏退出");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                rect,
                ..
            } = event
            {
                // 看板自己处理「可见则收起 / 否则定位显示」，失败会回退主窗口。
                usage_panel::toggle(tray.app_handle(), rect);
            }
        })
        .build(app)?;

    TRAY_READY.store(true, Ordering::Relaxed);
    eprintln!("[tray] 菜单栏图标已就绪（左键用量看板 / 右键菜单：主窗口·退出）");
    Ok(())
}
