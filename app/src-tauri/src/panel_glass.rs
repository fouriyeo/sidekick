//! 菜单栏看板的「真玻璃」底衬（D120）。
//!
//! CSS 的 `backdrop-filter` 只能采样**本文档已经绘制**的像素（规范里的 backdrop root
//! 上界就是根元素），而看板窗口是 `transparent(true)`、`html/body` 全透明，
//! 背后一个像素都没有 → 纯 CSS 永远糊不到桌面壁纸。真正的磨砂只能由系统材质出：
//! 在 WebView **之下**垫一块 `NSVisualEffectView`，模糊由 WindowServer 合成。
//!
//! 关键取舍：这块 view **只铺卡片轮廓**（320×432 圆角 18 + 顶部 16×8 的指引尖，D138），
//! 不铺整个窗口。
//! 窗口四周 20/8/28 的透明留白是留给 CSS 阴影的：
//! - 整窗铺 → 留白变成一圈磨砂（和 D116 修掉的「卡片外一圈别的颜色」是同一类观感问题）；
//! - 阴影会叠在模糊壁纸上发灰发脏，深色主题直接糊成一团。
//!
//! 这样铺完，CSS 侧只需要把卡片底色从实色换成一层薄 tint，留白/阴影/圆角全不动。
//!
//! 任何失败都静默降级：不铺 view，`panel_glass_ready` 返回 `false`，
//! 前端保持不透明实色卡（D116 的样子），绝不阻断弹面板。

use std::sync::atomic::{AtomicBool, Ordering};

use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSGlassEffectView, NSGlassEffectViewStyle, NSView,
    NSVisualEffectBlendingMode, NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView,
    NSWindowOrderingMode,
};
use objc2_core_foundation::{CFRetained, CGPoint, CGRect, CGSize};
use objc2_core_graphics::CGMutablePath;
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize, NSString};
use objc2_quartz_core::CAShapeLayer;
use tauri::{Runtime, WebviewWindow};

use crate::usage_panel::{
    ARROW_H, ARROW_W, CARD_H, CARD_RADIUS, CARD_W, PAD_TOP, SIDE_PAD, arrow_enabled, arrow_x,
};

/// 底衬是否真的铺上了。前端 `panel_glass_ready` 读它决定卡片用 tint 还是实色。
static INSTALLED: AtomicBool = AtomicBool::new(false);

/// 玻璃底衬是否已就位。
pub fn ready() -> bool {
    INSTALLED.load(Ordering::Relaxed)
}

/// 底衬用哪种系统材质。
enum Kind {
    /// 经典磨砂（macOS 10.10+）：`NSVisualEffectView`，密集模糊，观感接近系统 popover。
    Frosted(NSVisualEffectMaterial),
    /// macOS 26「Liquid Glass」：`NSGlassEffectView`，更透、带折射高光，最接近 iOS 26。
    LiquidGlass(NSGlassEffectViewStyle),
}

/// 材质档位。默认 `popover`，可用 `SIDEKICK_GLASS_MATERIAL` 换档对比：
/// `liquidGlass` / `liquidGlassClear`（需 macOS 26，否则自动退回磨砂）、
/// `underWindowBackground` / `sidebar` / `menu` / `contentBackground`。
fn kind() -> Kind {
    match std::env::var("SIDEKICK_GLASS_MATERIAL").ok().as_deref() {
        Some("liquidGlass") | Some("liquidglass") | Some("liquidGlassRegular") => {
            Kind::LiquidGlass(NSGlassEffectViewStyle::Regular)
        }
        Some("liquidGlassClear") => Kind::LiquidGlass(NSGlassEffectViewStyle::Clear),
        Some("underWindowBackground") => {
            Kind::Frosted(NSVisualEffectMaterial::UnderWindowBackground)
        }
        Some("sidebar") => Kind::Frosted(NSVisualEffectMaterial::Sidebar),
        Some("menu") => Kind::Frosted(NSVisualEffectMaterial::Menu),
        Some("contentBackground") => Kind::Frosted(NSVisualEffectMaterial::ContentBackground),
        Some("popover") => Kind::Frosted(NSVisualEffectMaterial::Popover),
        // 默认档：macOS 26+ 用 Liquid Glass（最接近 iOS 26），老系统在 install 里退回磨砂。
        _ => Kind::LiquidGlass(NSGlassEffectViewStyle::Regular),
    }
}

/// 磨砂档位的名字（只用于日志）。
fn frosted_label(material: NSVisualEffectMaterial) -> &'static str {
    if material == NSVisualEffectMaterial::UnderWindowBackground {
        "underWindowBackground"
    } else if material == NSVisualEffectMaterial::Sidebar {
        "sidebar"
    } else if material == NSVisualEffectMaterial::Menu {
        "menu"
    } else if material == NSVisualEffectMaterial::ContentBackground {
        "contentBackground"
    } else {
        "popover"
    }
}

/// `NSGlassEffectView` 是 macOS 26 才有的类，低版本上直接调用会崩，所以先查类存不存在。
fn liquid_glass_available() -> bool {
    objc2::runtime::AnyClass::get(c"NSGlassEffectView").is_some()
}

/// 回退开关：`SIDEKICK_UI_VIBRANCY=off` 完全不铺原生材质，等价 D116 的实色卡片。
///
/// 为什么开关必须在 Rust 侧：原生 view 一旦插进 contentView，CSS 关不掉它
/// （不像主窗口的 `.dsl-vibrancy` 只是改样式）。
pub fn enabled() -> bool {
    !matches!(
        std::env::var("SIDEKICK_UI_VIBRANCY").ok().as_deref(),
        Some("off" | "0" | "false")
    )
}

/// 给面板铺底衬玻璃。窗口是预创建 + 复用的，所以只在 `ensure_window` 里调一次。
pub fn apply<R: Runtime>(window: &WebviewWindow<R>) {
    if !enabled() {
        eprintln!("[panel] 玻璃底衬已关闭（SIDEKICK_UI_VIBRANCY），使用实色卡片");
        return;
    }
    match install(window) {
        Ok(name) => {
            INSTALLED.store(true, Ordering::Relaxed);
            eprintln!("[panel] 卡片区玻璃已就位（{name} · 圆角 {CARD_RADIUS}）");
        }
        Err(error) => eprintln!("[panel] 玻璃底衬失败，退回实色卡片: {error}"),
    }
}

/// 蒙版 layer 的名字：定位后靠它从 contentView 里找回这块玻璃。
const GLASS_LAYER: &str = "sidekick.panel.glass";

/// 卡片 + 尖的合成路径（holder 坐标系：原点左下，卡片占 y = 0..CARD_H）。
///
/// 尖是卡片轮廓的一部分：原生玻璃与 CSS 三角用同一组尺寸，形状对不齐会在尖端
/// 露出一条「有磨砂 / 没磨砂」的缝。
fn shape_path(anchor: f64) -> CFRetained<CGMutablePath> {
    let path = CGMutablePath::new();
    let card = CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(CARD_W, CARD_H));
    // SAFETY: transform 传 null；path 是本函数刚创建的可变路径，调用期间一直存活。
    unsafe {
        CGMutablePath::add_rounded_rect(
            Some(&path),
            std::ptr::null(),
            card,
            CARD_RADIUS,
            CARD_RADIUS,
        );
        if arrow_enabled() {
            // 三角底边正好压在卡片顶边上，两个子路径同向 → 非零填充就是并集，无缝。
            CGMutablePath::move_to_point(
                Some(&path),
                std::ptr::null(),
                anchor - ARROW_W / 2.0,
                CARD_H,
            );
            CGMutablePath::add_line_to_point(
                Some(&path),
                std::ptr::null(),
                anchor,
                CARD_H + ARROW_H,
            );
            CGMutablePath::add_line_to_point(
                Some(&path),
                std::ptr::null(),
                anchor + ARROW_W / 2.0,
                CARD_H,
            );
        }
    }
    CGMutablePath::close_subpath(Some(&path));
    path
}

/// 把 holder 的裁剪换成「圆角矩形 + 三角」蒙版。
fn apply_mask(holder: &NSView, anchor: f64) {
    let Some(layer) = holder.layer() else {
        return;
    };
    let shape = CAShapeLayer::new();
    shape.setFrame(CGRect::new(
        CGPoint::new(0.0, 0.0),
        CGSize::new(CARD_W, CARD_H + ARROW_H),
    ));
    shape.setPath(Some(&shape_path(anchor)));
    // SAFETY: 只在主线程、holder 已挂进 contentView 之后调用；shape 由本层持有。
    unsafe { layer.setMask(Some(&shape)) };
}

/// 定位后把尖挪到图标正下方（CSS 三角与玻璃蒙版共用同一个 x）。
///
/// 卡片会被夹在显示器安全边内，图标不会——贴边时两者错位，所以每次定位都要重算。
/// 必须在主线程调用；没铺玻璃 / 找不到 holder 时静默跳过（尖退回中间）。
pub fn set_arrow_anchor<R: Runtime>(window: &WebviewWindow<R>, anchor: f64) {
    if !INSTALLED.load(Ordering::Relaxed) || MainThreadMarker::new().is_none() {
        return;
    }
    let Ok(view_ptr) = window.ns_view() else {
        return;
    };
    if view_ptr.is_null() {
        return;
    }
    // SAFETY: 主线程 + 窗口存活；contentView 指针在窗口生命周期内有效。
    let content: &NSView = unsafe { &*(view_ptr as *const NSView) };
    for subview in content.subviews().iter() {
        let ours = subview
            .layer()
            .and_then(|layer| layer.name())
            .is_some_and(|name| name.to_string() == GLASS_LAYER);
        if ours {
            apply_mask(&subview, anchor);
        }
    }
}

/// 铺一块只在 macOS 上有意义的磨砂底衬（material 是已选好的档位）。
fn add_frosted(
    mtm: MainThreadMarker,
    holder: &NSView,
    glass_frame: NSRect,
    material: NSVisualEffectMaterial,
) {
    let glass = NSVisualEffectView::initWithFrame(mtm.alloc(), glass_frame);
    // Popover = Apple 官方语义「popover 窗口的背景」，正是菜单栏小看板的形态。
    glass.setMaterial(material);
    // BehindWindow 才会采样窗口背后的桌面；WithinWindow 只糊本 App 自己的内容。
    glass.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    // Active：面板是 show() 之后才 set_focus()，FollowsWindowActiveState 会先渲染
    // 一帧「未激活」灰再跳成激活态，肉眼能看见闪一下。
    glass.setState(NSVisualEffectState::Active);
    // 窗口 resizable(false)、尺寸固定，frame 不跟随父视图缩放。
    glass.setAutoresizingMask(NSAutoresizingMaskOptions::empty());
    // 圆角：材质画在 view 自己的 layer 里，蒙版之外的圆角由 holder 的蒙版负责；
    // 这里保留圆角作为蒙版失效时的兜底。
    glass.setWantsLayer(true);
    if let Some(layer) = glass.layer() {
        layer.setCornerRadius(CARD_RADIUS);
        layer.setMasksToBounds(true);
    }
    holder.addSubview(&glass);
}

/// 把玻璃垫到 WebView 下面，形状 = 卡片圆角矩形 + 顶部指引尖。
///
/// 只能在主线程、窗口 build 完成之后调用（`ensure_window` 里正好满足）。
fn install<R: Runtime>(window: &WebviewWindow<R>) -> Result<&'static str, String> {
    let mtm = MainThreadMarker::new().ok_or("必须在主线程调用")?;
    let view_ptr = window.ns_view().map_err(|error| error.to_string())?;
    if view_ptr.is_null() {
        return Err("拿不到窗口 contentView".into());
    }
    // SAFETY: `ns_view()` 返回的是窗口 contentView 的裸指针，窗口存活期间有效；
    // 本函数在主线程、窗口刚 build 完成时执行，contentView 一定存在。
    let content: &NSView = unsafe { &*(view_ptr as *const NSView) };

    let bounds = content.bounds();
    // holder 的包围盒 = 卡片 + 顶部尖；形状由蒙版裁，矩形本身不出现在画面上。
    let holder_h = CARD_H + ARROW_H;
    let holder_y = if content.isFlipped() {
        PAD_TOP - ARROW_H
    } else {
        bounds.size.height - PAD_TOP - CARD_H
    };
    let holder = NSView::initWithFrame(
        mtm.alloc(),
        NSRect {
            origin: NSPoint::new(SIDE_PAD, holder_y),
            size: NSSize::new(CARD_W, holder_h),
        },
    );
    holder.setWantsLayer(true);
    if let Some(layer) = holder.layer() {
        // 蒙版万一没生效，至少保住圆角与裁剪，不会露出直角玻璃。
        layer.setCornerRadius(CARD_RADIUS);
        layer.setMasksToBounds(true);
        layer.setName(Some(&NSString::from_str(GLASS_LAYER)));
    }
    holder.setAutoresizingMask(NSAutoresizingMaskOptions::empty());

    // 玻璃要盖住尖所在的那 8pt，否则尖那一块没有采样、只有 CSS 的薄 tint。
    let glass_frame = NSRect {
        origin: NSPoint::new(0.0, 0.0),
        size: NSSize::new(CARD_W, holder_h),
    };

    let label = match kind() {
        Kind::LiquidGlass(style) if liquid_glass_available() => {
            let glass = NSGlassEffectView::initWithFrame(mtm.alloc(), glass_frame);
            glass.setStyle(style);
            glass.setCornerRadius(CARD_RADIUS);
            glass.setAutoresizingMask(NSAutoresizingMaskOptions::empty());
            holder.addSubview(&glass);
            if style == NSGlassEffectViewStyle::Clear {
                "liquidGlassClear"
            } else {
                "liquidGlassRegular"
            }
        }
        Kind::Frosted(material) => {
            add_frosted(mtm, &holder, glass_frame, material);
            frosted_label(material)
        }
        // 只有「要 Liquid Glass 但系统不支持」会走到这里。
        Kind::LiquidGlass(_) => {
            add_frosted(mtm, &holder, glass_frame, NSVisualEffectMaterial::Popover);
            "popover"
        }
    };

    apply_mask(&holder, arrow_x());
    content.addSubview_positioned_relativeTo(&holder, NSWindowOrderingMode::Below, None);
    Ok(label)
}
