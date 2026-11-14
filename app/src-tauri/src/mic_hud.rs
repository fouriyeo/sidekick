//! 桌面顶部的麦克风状态 HUD（always-on-top、非激活、不抢焦点）。
//!
//! 为什么需要它：快捷键流程里手机不在用户视野内，录音发生在「看不见的地方」，
//! 而主窗口的 `MicStatusOverlay` 只在 Sidekick 窗口内、关窗即隐藏（D88）。
//! PRD 铁律「录音时始终有可见指示」因此必须由这个独立窗口满足。
//!
//! 约束：
//! - 窗口**不能抢焦点**：插入链路靠「前台应用与插入前一致」才自动粘贴，HUD 一抢
//!   焦点就会退化成「只复制」；
//! - HUD 自己**不开 WS**：它只收 Rust 事件，否则 `system.clients` 会多算一台手机；
//! - 惰性创建、长期复用（同菜单栏看板 `usage_panel` 的做法），避免没人用的机器白占内存。

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// 窗口 label，与 `capabilities/mic-hud.json`、前端 `?window=mic-hud` 对齐。
pub const HUD_WINDOW: &str = "mic-hud";
/// 前端监听的事件名。
pub const HUD_EVENT: &str = "mic-hud";

const HUD_W: f64 = 460.0;
const HUD_H: f64 = 116.0;
/// 距屏幕上沿的逻辑像素（让开 macOS 菜单栏）。
const HUD_TOP: f64 = 44.0;

/// 每次 show 自增；`hide_later` 只在没被新状态覆盖时才收起。
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// 推一个状态给 HUD 并显示窗口。可从任意线程调用。
pub fn show(_app: &AppHandle, payload: Value) {
    // 已被原生 NSPanel（mic_panel）取代：普通 NSWindow 在全屏 Space 里不可见。
    // 保留模块只为回滚，不再显示。
    let _ = payload;
    return;
}

#[allow(dead_code)]
fn show_legacy(app: &AppHandle, payload: Value) {
    eprintln!("[hud] show {}", payload);
    GENERATION.fetch_add(1, Ordering::SeqCst);
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        let window = match ensure_window(&app) {
            Ok(window) => window,
            Err(error) => {
                eprintln!("[hud] 创建状态窗失败: {error}");
                return;
            }
        };
        let _ = position(&app, &window);
        let _ = window.show();
        #[cfg(target_os = "macos")]
        pin_over_fullscreen(&window);
        let _ = app.emit_to(HUD_WINDOW, HUD_EVENT, payload);
    });
}

/// 延迟收起；期间若有新状态（generation 变化）就不收。
pub fn hide_later(app: &AppHandle, delay: Duration) {
    let generation = GENERATION.load(Ordering::SeqCst);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(delay).await;
        if GENERATION.load(Ordering::SeqCst) != generation {
            return;
        }
        let app = app.clone();
        let _ = app.clone().run_on_main_thread(move || {
            if let Some(window) = app.get_webview_window(HUD_WINDOW) {
                let _ = window.hide();
            }
        });
    });
}

fn ensure_window(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window(HUD_WINDOW) {
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(
        app,
        HUD_WINDOW,
        WebviewUrl::App("index.html?window=mic-hud".into()),
    )
    .title("Sidekick 麦克风")
    .inner_size(HUD_W, HUD_H)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    // 用户可能把 Sidekick 放在 1 号桌面、在 2 号桌面干活：HUD 必须出现在所有桌面
    // （macOS 的 Space），否则「看不见反馈」会被误判成「没反应」。
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    // 不接受鼠标：HUD 只做提示，任何点击都该落到下面的应用上。
    .accept_first_mouse(false)
    .visible(false)
    .focused(false)
    .build()?;

    eprintln!("[hud] 已创建顶栏状态窗 {HUD_W}×{HUD_H}");
    Ok(window)
}

/// 鼠标所在屏幕的顶部居中：用户在哪块屏幕打字，提示就出现在哪块。
/// 让 HUD 能压在所有 Space 之上，**包括全屏 App 所在的 Space**。
///
/// Tauri 的 `visible_on_all_workspaces` 只设 `canJoinAllSpaces`，进不了全屏 Space；
/// 必须补 `NSWindowCollectionBehaviorFullScreenAuxiliary`。窗口本身是非激活的，
/// 所以不会把用户从全屏 App 里踢出来。
#[cfg(target_os = "macos")]
fn pin_over_fullscreen(window: &tauri::WebviewWindow) {
    use objc2_app_kit::{NSScreenSaverWindowLevel, NSWindow, NSWindowCollectionBehavior};

    let Ok(ptr) = window.ns_window() else {
        return;
    };
    if ptr.is_null() {
        return;
    }
    let ns_window: &NSWindow = unsafe { &*ptr.cast::<NSWindow>() };
    ns_window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    // 全屏 App 的窗口会被系统抬高；普通 floating 层仍可能被压在下面，
    // 用状态栏层（25）保证盖在它上面。窗口本来就不接鼠标，抬高不影响操作。
    // 屏保层（1000）比状态栏层更高：这是少数能盖在全屏 App 之上的窗口层。
    ns_window.setLevel(NSScreenSaverWindowLevel);
    ns_window.setHidesOnDeactivate(false);
    ns_window.setCanHide(false);
    ns_window.orderFrontRegardless();
}

fn position(app: &AppHandle, window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let cursor = app.cursor_position().ok();
    let monitor = cursor
        .and_then(|point| app.monitor_from_point(point.x, point.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return Ok(());
    };
    let scale = monitor.scale_factor();
    let position = monitor.position();
    let size = monitor.size();
    let x = position.x as f64 + (size.width as f64 - HUD_W * scale) / 2.0;
    let y = position.y as f64 + HUD_TOP * scale;
    window.set_position(tauri::PhysicalPosition::new(x.round() as i32, y.round() as i32))?;
    Ok(())
}
