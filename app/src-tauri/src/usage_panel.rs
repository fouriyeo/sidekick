//! 菜单栏 Token 用量小看板（D108）。
//!
//! 左键点菜单栏图标 → 在图标正下方弹出一个 320×432 的只读小窗；
//! 再点图标 / 点其它应用（失焦）/ Esc 收起；右键菜单仍是主窗口与退出入口。
//! 钉住（D135）后失焦不再收起，Esc / 再点图标 / Cmd+W 仍照收。
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
//!
//! D135：顶部间隙从 8pt 收到 4pt，并新增「钉住」（钉住后失焦不收，Esc / 再点图标仍收）。

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

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
pub const CARD_W: f64 = 320.0;
pub const CARD_H: f64 = 432.0;
/// 卡片圆角。原生玻璃底衬必须用同一个值（`panel_glass.rs` 铺 layer 圆角），
/// 否则卡片圆角下面会露出直角玻璃；两边不一致时以这里为准。
pub const CARD_RADIUS: f64 = 18.0;
/// 左右透明留白：只用来让卡片阴影向外延伸、自然淡出，不参与视觉卡片。
pub const SIDE_PAD: f64 = 20.0;
/// 窗口顶边相对托盘图标矩形底边的上举量。
///
/// 窗口顶边必须停在菜单栏底线附近：再往上，透明窗口会盖住托盘图标下半区，
/// 再点图标就关不掉面板。它只决定窗口位置，不再兼任卡片间距。
pub const WINDOW_LIFT: f64 = 8.0;
/// 顶部指引尖：宽 16、高 8，指向菜单栏图标（D138）。
///
/// 尖是卡片轮廓的一部分（原生玻璃蒙版与 CSS 三角用同一组尺寸），
/// 所以尺寸只在这里定义。
pub const ARROW_W: f64 = 16.0;
pub const ARROW_H: f64 = 8.0;
/// 尖顶到窗口顶边的留白（菜单栏与尖之间那一丝缝）。
pub const ARROW_TOP_GAP: f64 = 2.0;
/// 卡片顶边到窗口顶边的透明留白 = 尖高 + 尖顶留白。
///
/// `panel.css` 里 `.dsl-panel { padding-top }` 必须与它保持一致，
/// 否则玻璃底衬、三角与卡片三者错位。
pub const PAD_TOP: f64 = ARROW_H + ARROW_TOP_GAP;
/// 底部留白最大：阴影向下偏移，需要空间淡出。
pub const BOTTOM_PAD: f64 = 28.0;
/// 夹取时与显示器左右边缘保留的安全边。
const EDGE: f64 = 8.0;

/// 窗口整体尺寸 = 卡片 + 非对称透明留白（360×470）。
pub const WINDOW_W: f64 = CARD_W + SIDE_PAD * 2.0;
pub const WINDOW_H: f64 = CARD_H + PAD_TOP + BOTTOM_PAD;

/// 尖的横向中心（相对卡片左边，逻辑像素）。
///
/// 卡片会被夹在屏幕左右安全边内，图标却不是——贴着屏幕右边时卡片会左移、
/// 图标仍在原处。所以尖的位置每次定位时按「图标中心 − 卡片左边」重算，
/// 玻璃蒙版与 CSS 三角共用这个值。
static ARROW_X: AtomicU32 = AtomicU32::new((CARD_W / 2.0) as u32);

/// 尖允许的横向范围：别压到卡片圆角，也别顶到边。
pub fn arrow_x_bounds() -> (f64, f64) {
    let inset = CARD_RADIUS + ARROW_W / 2.0 + 2.0;
    (inset, CARD_W - inset)
}

/// 尖角开关（应急）：`SIDEKICK_PANEL_ARROW=off` 回退到「只有卡片、没有尖」。
pub fn arrow_enabled() -> bool {
    !matches!(
        std::env::var("SIDEKICK_PANEL_ARROW").ok().as_deref(),
        Some("off" | "0" | "false")
    )
}

/// 当前尖的横向中心（逻辑像素，相对卡片左边）。
pub fn arrow_x() -> f64 {
    f64::from(ARROW_X.load(Ordering::Relaxed))
}

/// 按图标中心算尖的位置：图标中心对齐卡片左边 + 返回值，全套逻辑像素。
fn arrow_anchor(tray_x: f64, tray_w: f64, window_x: i32, scale: f64) -> f64 {
    let scale = if scale.is_finite() && scale > 0.0 {
        scale
    } else {
        1.0
    };
    let icon_center = tray_x + tray_w / 2.0;
    let card_left = f64::from(window_x) + SIDE_PAD * scale;
    let anchor = (icon_center - card_left) / scale;
    let (min, max) = arrow_x_bounds();
    anchor.clamp(min, max)
}

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
    // 尖的位置先在 WebView 里落成 CSS 变量，再 show：窗口一出现就是对的，
    // 不会先画在中间再跳一下（前端挂载/聚焦时还会用命令校准一次兜底）。
    let _ = window.eval(&format!(
        "document.documentElement.style.setProperty('--panel-arrow-x','{:.1}px')",
        arrow_x()
    ));
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

/// QA 预览期间不要因失焦自动收起。
///
/// 只有 debug 构建 + `SIDEKICK_PANEL_PREVIEW` 时成立：截图脚本没法把面板再点回来，
/// 而预览一启动窗口焦点就会被别的 App 拿走，`Focused(false)` 会立刻把面板收掉。
pub fn preview_holds_open() -> bool {
    #[cfg(all(desktop, debug_assertions))]
    let holds = std::env::var_os("SIDEKICK_PANEL_PREVIEW").is_some();
    #[cfg(not(all(desktop, debug_assertions)))]
    let holds = false;
    holds
}

/// 卡片区玻璃底衬是否已就位（D120）。
///
/// 前端据此决定卡片用半透明 tint 还是不透明实色：原生材质垫不上时（非 macOS /
/// `SIDEKICK_UI_VIBRANCY=off` / AppKit 调用失败）必须退回实色，否则卡片会变成
/// 一层薄纱、桌面直接透过正文。
#[tauri::command]
pub fn panel_glass_ready() -> bool {
    #[cfg(target_os = "macos")]
    let ready = crate::panel_glass::ready();
    #[cfg(not(target_os = "macos"))]
    let ready = false;
    ready
}

/// 面板钉住状态（D135）。
///
/// 钉住 = 失焦不收：点其它 App / 桌面时面板继续挂在最上层（建窗时已是
/// `always_on_top(true)`）。Esc、再点菜单栏图标、Cmd+W 仍然照收，钉住状态保留。
///
/// 状态放 Rust 而不是只放前端：收起判断在窗口事件（`Focused(false)`）里，
/// 前端按钮只是这个开关的遥控器；面板窗口 hide 不销毁，所以状态跨「收起再点开」保留，
/// 重启进程重置为未钉住。
static PANEL_PINNED: AtomicBool = AtomicBool::new(false);

pub fn pinned() -> bool {
    PANEL_PINNED.load(Ordering::Relaxed)
}

/// 失焦时是否要收起：QA 预览态与钉住态都不收。
pub(crate) fn should_hide_on_blur(holds_open: bool, pinned: bool) -> bool {
    !holds_open && !pinned
}

/// 读钉住状态：面板挂载时校准按钮（WebView 重载后 JS 状态会清零）。
#[tauri::command]
pub fn usage_panel_pinned() -> bool {
    pinned()
}

/// 写钉住状态，回显生效后的值，前端据此收敛按钮态。
#[tauri::command]
pub fn set_usage_panel_pinned(pinned: bool) -> bool {
    PANEL_PINNED.store(pinned, Ordering::Relaxed);
    eprintln!("[panel] 钉住={pinned}");
    pinned
}

/// 尖的横向中心（逻辑像素，相对卡片左边）：前端 CSS 变量用它。
#[tauri::command]
pub fn usage_panel_arrow_x() -> f64 {
    arrow_x()
}

/// 尖是否启用（`SIDEKICK_PANEL_ARROW=off` 时前端不画三角）。
#[tauri::command]
pub fn usage_panel_arrow_enabled() -> bool {
    arrow_enabled()
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

    // 卡片区真玻璃底衬（D120）：失败只打日志，CSS 会继续用不透明实色卡。
    #[cfg(target_os = "macos")]
    crate::panel_glass::apply(&window);

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

    // 尖要指回图标：卡片被夹取后，图标相对卡片的位置会偏移，每次定位都重算。
    let anchor = arrow_anchor(tray_x, tray_w, x, scale);
    ARROW_X.store(anchor.round() as u32, Ordering::Relaxed);
    #[cfg(target_os = "macos")]
    crate::panel_glass::set_arrow_anchor(window, anchor);

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
/// - 垂直：窗口顶边 = 图标矩形底边 − `WINDOW_LIFT`；卡片在窗口内再下移 `PAD_TOP`，
///   所以「卡片到菜单栏的间隙」就是 `PAD_TOP`（窗口顶边贴在菜单栏底线附近）；
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
    // 窗口顶边比图标矩形底边高 `WINDOW_LIFT`（卡片间距由 `PAD_TOP` 决定，不在这里加）。
    let mut y = tray_y + tray_h - WINDOW_LIFT * scale;

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

        // 图标中心 1736，窗口宽 720 → 左上角 1376；窗口顶边 = 48 − 8×2 = 32。
        assert_eq!(x, 1376);
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
        // 右边缘 = 3840 - 16 - 720 = 3104。
        assert_eq!(x, 3104);
    }

    #[test]
    fn clamps_when_tray_is_at_left_edge() {
        let (ww, wh) = window_size();
        let (x, _) = panel_origin(0.0, 0.0, 72.0, 48.0, ww, wh, Some((0, 0, 3840, 2160)), 2.0);
        // 左边缘 = 0 + 16；居中的 -324 会被夹回 16。
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
        // 副屏右边缘 = -1920 + 1920 - 16 - 720 = -736。
        assert_eq!(x, -736);
        assert_eq!(y, 32);
    }

    #[test]
    fn falls_back_without_monitor_bounds() {
        let (ww, wh) = window_size();
        let (x, y) = panel_origin(100.0, 0.0, 72.0, 48.0, ww, wh, None, 2.0);
        assert_eq!(x, -224);
        assert_eq!(y, 32);
    }

    #[test]
    fn tolerates_broken_scale_factor() {
        let (ww, wh) = window_size();
        let (_, y) = panel_origin(100.0, 0.0, 72.0, 48.0, ww, wh, None, 0.0);
        // scale 非法时按 1.0：48 + 0 - 8。
        assert_eq!(y, 40);
    }

    #[test]
    fn arrow_tip_sits_two_points_below_window_top() {
        // D138：窗口位置只由 WINDOW_LIFT 决定（与 D135 完全一致）；
        // 顶部 10pt = 尖高 8 + 尖顶留白 2，卡片从窗口顶边下 10pt 开始。
        let (tx, ty, tw, th) = primary_tray();
        let (ww, wh) = window_size();
        let (_, y) = panel_origin(tx, ty, tw, th, ww, wh, Some((0, 0, 3840, 2160)), 2.0);

        // 窗口顶边 32（48 − 8×2），卡片顶边 52（+10×2）。
        assert_eq!(y, 32);
        assert_eq!(f64::from(y) + PAD_TOP * 2.0, 52.0);
        // 窗口高度：432 + 10 + 28。
        assert_eq!(WINDOW_H, 470.0);
    }

    #[test]
    fn arrow_anchor_follows_icon_and_clamps_at_edges() {
        // 主屏：图标中心 1736、窗口左边 1376 + 左右留白 40 → 卡片左边 1416，尖正好在卡片中心。
        assert_eq!(arrow_anchor(1700.0, 72.0, 1376, 2.0), 160.0);

        // 贴屏幕右边：窗口被夹到 3104，图标中心仍在 3836 → 尖被夹到右边界。
        let (_, max) = arrow_x_bounds();
        assert_eq!(arrow_anchor(3800.0, 72.0, 3104, 2.0), max);

        // 贴屏幕左边：窗口被夹到 16，图标中心 36 → 尖被夹到左边界。
        let (min, _) = arrow_x_bounds();
        assert_eq!(arrow_anchor(0.0, 72.0, 16, 2.0), min);
    }

    #[test]
    fn blur_hide_skipped_when_pinned_or_previewing() {
        assert!(should_hide_on_blur(false, false));
        assert!(!should_hide_on_blur(false, true));
        assert!(!should_hide_on_blur(true, false));
        assert!(!should_hide_on_blur(true, true));
    }

    #[test]
    fn pin_state_round_trips() {
        assert!(!pinned());
        assert!(set_usage_panel_pinned(true));
        assert!(pinned());
        assert!(!set_usage_panel_pinned(false));
        assert!(!pinned());
    }
}
