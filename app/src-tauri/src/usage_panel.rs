//! 菜单栏 Token 用量小看板（D108）。
//!
//! 左键点菜单栏图标 → 在图标正下方弹出一个约 320×392 的只读小窗；
//! 再点图标 / 点其它应用（失焦）/ Esc 收起；右键菜单仍是主窗口与退出入口。
//!
//! 目的是「扫一眼今天花了多少」，不是第二个主界面：小窗只渲染紧凑面板，
//! 数据仍走已有的 `token_usage_stats`（只读本机 DSH 账本，不新增协议/不写账本）。
//!
//! 窗口是运行时创建的普通 `WebviewWindow`（不是 NSPanel）：`transparent(true)` 只为了
//! 用 CSS 做圆角与阴影，卡片本身不透明（D86：内容层不透明）。窗口在启动时预创建并隐藏，
//! 换取第一次点按也「点开即出」；创建失败时左键回退显示主窗口，不能出现「点了没反应」。
//!
//! 位置取自托盘事件里的 `rect`（tauri/tray-icon 在 macOS 上已换算成顶部原点的物理坐标），
//! 再按图标所在显示器夹取，避免贴边时越界。

use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Rect, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::tray;

/// 面板窗口 label：capabilities/panel.json 必须与它一致。
pub const PANEL_WINDOW: &str = "usage-panel";
/// 打开主窗口并落到「用量」页的事件名（桌面 app.tsx 订阅）。
pub const NAVIGATE_EVENT: &str = "sidekick-navigate";

/// 可见卡片尺寸（逻辑像素）。用户要求「不要太大」，320 宽是菜单栏 popover 的常见尺度。
const CARD_W: f64 = 320.0;
const CARD_H: f64 = 432.0;
/// 窗口四周的透明留白：只用来放 CSS 阴影，不参与视觉卡片。
pub const PADDING: f64 = 14.0;
/// 卡片顶边与菜单栏图标底边的间距。
const GAP: f64 = 6.0;
/// 夹取时与显示器左右边缘保留的安全边。
const EDGE: f64 = 8.0;

/// 窗口整体尺寸 = 卡片 + 两侧透明留白。
pub const WINDOW_W: f64 = CARD_W + PADDING * 2.0;
pub const WINDOW_H: f64 = CARD_H + PADDING * 2.0;

/// 启动时预创建隐藏窗口。失败只打日志：第一次点按 `toggle` 会再试一次。
pub fn init<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    ensure_window(app).map(|_| ())
}

/// 左键菜单栏图标：可见则收起，否则定位并显示。
///
/// 任何失败都回退到显示主窗口——左键是用户唯一看得到的入口，不能静默失效。
pub fn toggle<R: Runtime>(app: &AppHandle<R>, tray_rect: Rect) {
    let window = match ensure_window(app) {
        Ok(window) => window,
        Err(error) => {
            eprintln!("[panel] 创建面板窗口失败，回退主窗口: {error}");
            tray::show_main_window(app);
            return;
        }
    };

    if window.is_visible().unwrap_or(false) {
        hide(app);
        return;
    }

    if let Err(error) = position_window(app, &window, &tray_rect) {
        // 定位失败仍要显示（会出现在主屏默认位置），只是不贴着图标。
        eprintln!("[panel] 定位失败，按默认位置显示: {error}");
    }
    if let Err(error) = window.show() {
        eprintln!("[panel] 显示失败，回退主窗口: {error}");
        tray::show_main_window(app);
        return;
    }
    // Accessory 应用需要显式 set_focus 才会成为 key window；失焦收起也依赖它。
    if let Err(error) = window.set_focus() {
        eprintln!("[panel] 聚焦失败（面板仍可见）: {error}");
    }
    eprintln!("[panel] 显示");
}

/// 收起面板（Esc / 失焦 / 点按图标共用）。
///
/// 只在「确实可见」时打一条日志：失焦事件、重复 hide 都不会刷屏。
pub fn hide<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(PANEL_WINDOW) {
        let visible = window.is_visible().unwrap_or(false);
        let _ = window.hide();
        if visible {
            eprintln!("[panel] 收起");
        }
    }
}

/// 主窗口显示并切到「用量」页。
pub fn open_main_usage<R: Runtime>(app: &AppHandle<R>) {
    tray::show_main_window(app);
    if let Err(error) = app.emit_to("main", NAVIGATE_EVENT, "usage") {
        eprintln!("[panel] 发送导航事件失败: {error}");
    }
}

/// Esc 收起（前端命令）：不做「关窗即销毁」，窗口留着下次秒开。
#[tauri::command]
pub fn hide_usage_panel(app: AppHandle) {
    hide(&app);
}

/// 「打开用量页」按钮：唤起主窗口并导航。
#[tauri::command]
pub fn open_usage_page(app: AppHandle) {
    open_main_usage(&app);
}

fn ensure_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(PANEL_WINDOW) {
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(
        app,
        PANEL_WINDOW,
        // `?window=panel` 由 main.tsx 识别并挂载紧凑面板（dev 下是 Vite 地址 + 同一路径）。
        WebviewUrl::App("index.html?window=panel".into()),
    )
    .title("Sidekick 用量")
    .inner_size(WINDOW_W, WINDOW_H)
    .resizable(false)
    .decorations(false)
    // 透明只用于圆角与 CSS 阴影；卡片背景在 panel.css 里是不透明的。
    .transparent(true)
    .shadow(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .accept_first_mouse(true)
    .visible(false)
    .focused(false)
    .build()?;

    eprintln!("[panel] 已创建隐藏窗口 {WINDOW_W}×{WINDOW_H}");
    Ok(window)
}

fn position_window<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    tray_rect: &Rect,
) -> tauri::Result<()> {
    let window_scale = window.scale_factor().unwrap_or(1.0);
    let size = window.outer_size()?;
    // 托盘事件里的 Rect 是 dpi::Position/dpi::Size 枚举（macOS 上实际是 Physical；
    // Physical 分支会忽略 scale）。先用窗口 scale 估一个中心点找显示器。
    let (center_x, center_y) = {
        let (x, y, w, h) = physical_tray_rect(tray_rect, window_scale);
        (x + w / 2.0, y + h / 2.0)
    };

    let monitor = app
        .monitor_from_point(center_x, center_y)
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());

    // gap/padding 的物理换算要用**图标所在显示器**的 scale，而不是窗口当前所在屏：
    // 混合 DPI 双屏时窗口可能还在主屏、图标已经跑到副屏。
    let scale = monitor
        .as_ref()
        .map(|monitor| monitor.scale_factor())
        .filter(|scale| scale.is_finite() && *scale > 0.0)
        .unwrap_or(window_scale);
    // 用最终 scale 再换算一次 Rect（Logical 分支才会用到），Physical 分支结果不变。
    let (tray_x, tray_y, tray_w, tray_h) = physical_tray_rect(tray_rect, scale);

    let bounds = monitor.as_ref().map(|monitor| {
        let position = monitor.position();
        let size = monitor.size();
        (position.x, position.y, size.width, size.height)
    });

    let (x, y) = panel_origin(
        tray_x,
        tray_y,
        tray_w,
        tray_h,
        size.width,
        size.height,
        bounds,
        scale,
    );
    window.set_position(PhysicalPosition::new(x, y))
}

/// 托盘图标矩形 → 物理像素 `(x, y, w, h)`。
fn physical_tray_rect(rect: &Rect, scale: f64) -> (f64, f64, f64, f64) {
    let position = rect.position.to_physical::<f64>(scale);
    let size = rect.size.to_physical::<f64>(scale);
    (position.x, position.y, size.width, size.height)
}

/// 面板左上角位置（物理像素）的纯数学部分，单测覆盖。
///
/// - 水平：图标中心对齐窗口中心，再夹到显示器左右安全边内；
/// - 垂直：卡片顶边 = 图标底边 + `GAP`，窗口顶边再减掉透明留白；
/// - `bounds` 为 None（拿不到显示器）时不夹取。
#[allow(clippy::too_many_arguments)]
fn panel_origin(
    tray_x: f64,
    tray_y: f64,
    tray_w: f64,
    tray_h: f64,
    win_w: u32,
    win_h: u32,
    bounds: Option<(i32, i32, u32, u32)>,
    scale: f64,
) -> (i32, i32) {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let win_w_f = f64::from(win_w);
    let win_h_f = f64::from(win_h);

    let mut x = tray_x + tray_w / 2.0 - win_w_f / 2.0;
    // 卡片顶边贴图标底边，窗口顶边回退一个透明留白。
    let mut y = tray_y + tray_h + GAP * scale - PADDING * scale;

    if let Some((monitor_x, monitor_y, monitor_w, monitor_h)) = bounds {
        let left = f64::from(monitor_x) + EDGE * scale;
        let right = f64::from(monitor_x) + f64::from(monitor_w) - EDGE * scale - win_w_f;
        if right >= left {
            x = x.clamp(left, right);
        } else {
            x = f64::from(monitor_x);
        }

        let top = f64::from(monitor_y);
        let bottom = f64::from(monitor_y) + f64::from(monitor_h) - EDGE * scale - win_h_f;
        if bottom >= top {
            y = y.clamp(top, bottom);
        } else {
            y = top;
        }
    }

    (x.round() as i32, y.round() as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 主屏 1920×1080@2x，图标 36×24（物理 72×48）位于 x=1700。
    fn primary_tray() -> (f64, f64, f64, f64) {
        (1700.0, 0.0, 72.0, 48.0)
    }

    fn window_size() -> (u32, u32) {
        ((WINDOW_W * 2.0) as u32, (WINDOW_H * 2.0) as u32)
    }

    #[test]
    fn centers_under_tray_icon() {
        let (tx, ty, tw, th) = primary_tray();
        let (ww, wh) = window_size();
        let (x, y) = panel_origin(tx, ty, tw, th, ww, wh, Some((0, 0, 3840, 2160)), 2.0);

        // 图标中心 1736，窗口宽 696 → 左上角 1388；卡片顶边 = 48 + 12，窗口顶边再 -28。
        assert_eq!(x, 1388);
        assert_eq!(y, 32);
    }

    #[test]
    fn clamps_when_tray_is_at_right_edge() {
        let (ww, wh) = window_size();
        let (x, _) = panel_origin(
            3800.0,
            0.0,
            72.0,
            48.0,
            ww,
            wh,
            Some((0, 0, 3840, 2160)),
            2.0,
        );
        // 右边缘 = 3840 - 16 - 696 = 3128。
        assert_eq!(x, 3128);
    }

    #[test]
    fn clamps_when_tray_is_at_left_edge() {
        let (ww, wh) = window_size();
        let (x, _) = panel_origin(0.0, 0.0, 72.0, 48.0, ww, wh, Some((0, 0, 3840, 2160)), 2.0);
        // 左边缘 = 0 + 16；居中的 -312 会被夹回 16。
        assert_eq!(x, 16);
    }

    #[test]
    fn handles_secondary_monitor_with_negative_origin() {
        let (ww, wh) = window_size();
        // 副屏在主屏左侧：x = -1920，图标贴其右边缘。
        let (x, y) = panel_origin(
            -120.0,
            0.0,
            72.0,
            48.0,
            ww,
            wh,
            Some((-1920, 0, 1920, 2160)),
            2.0,
        );
        // 副屏右边缘 = -1920 + 1920 - 16 - 696 = -712。
        assert_eq!(x, -712);
        assert_eq!(y, 32);
    }

    #[test]
    fn falls_back_without_monitor_bounds() {
        let (ww, wh) = window_size();
        let (x, y) = panel_origin(100.0, 0.0, 72.0, 48.0, ww, wh, None, 2.0);
        assert_eq!(x, -212);
        assert_eq!(y, 32);
    }

    #[test]
    fn tolerates_broken_scale_factor() {
        let (ww, wh) = window_size();
        let (_, y) = panel_origin(100.0, 0.0, 72.0, 48.0, ww, wh, None, 0.0);
        // scale 非法时按 1.0：48 + 6 - 14。
        assert_eq!(y, 40);
    }
}
