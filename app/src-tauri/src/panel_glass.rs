//! 菜单栏看板的「真玻璃」底衬（D120）。
//!
//! CSS 的 `backdrop-filter` 只能采样**本文档已经绘制**的像素（规范里的 backdrop root
//! 上界就是根元素），而看板窗口是 `transparent(true)`、`html/body` 全透明，
//! 背后一个像素都没有 → 纯 CSS 永远糊不到桌面壁纸。真正的磨砂只能由系统材质出：
//! 在 WebView **之下**垫一块 `NSVisualEffectView`，模糊由 WindowServer 合成。
//!
//! 关键取舍：这块 view **只铺卡片矩形**（320×432、圆角 18），不铺整个窗口。
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
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize};
use tauri::{Runtime, WebviewWindow};

use crate::usage_panel::{CARD_H, CARD_RADIUS, CARD_W, SIDE_PAD, TOP_PAD};

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
        Some("underWindowBackground") => Kind::Frosted(NSVisualEffectMaterial::UnderWindowBackground),
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

/// 把 `NSVisualEffectView` 垫到 WebView 下面，只覆盖卡片矩形。
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
    // contentView 默认是非翻转坐标系（原点左下），卡片距顶 `TOP_PAD`。
    let card_y = if content.isFlipped() {
        TOP_PAD
    } else {
        bounds.size.height - TOP_PAD - CARD_H
    };
    let frame = NSRect {
        origin: NSPoint::new(SIDE_PAD, card_y),
        size: NSSize::new(CARD_W, CARD_H),
    };

    match kind() {
        Kind::LiquidGlass(style) if liquid_glass_available() => {
            let glass = NSGlassEffectView::initWithFrame(mtm.alloc(), frame);
            glass.setStyle(style);
            glass.setCornerRadius(CARD_RADIUS);
            glass.setAutoresizingMask(NSAutoresizingMaskOptions::empty());
            content.addSubview_positioned_relativeTo(&glass, NSWindowOrderingMode::Below, None);
            return Ok(if style == NSGlassEffectViewStyle::Clear {
                "liquidGlassClear"
            } else {
                "liquidGlassRegular"
            });
        }
        // macOS 26 以下没有 NSGlassEffectView：退回经典磨砂，不报错。
        Kind::LiquidGlass(_) => {}
        Kind::Frosted(material) => {
            let glass = NSVisualEffectView::initWithFrame(mtm.alloc(), frame);
            // Popover = Apple 官方语义「popover 窗口的背景」，正是菜单栏小看板的形态。
            glass.setMaterial(material);
            // BehindWindow 才会采样窗口背后的桌面；WithinWindow 只糊本 App 自己的内容。
            glass.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
            // Active：面板是 show() 之后才 set_focus()，FollowsWindowActiveState 会先渲染
            // 一帧「未激活」灰再跳成激活态，肉眼能看见闪一下。
            glass.setState(NSVisualEffectState::Active);
            // 窗口 resizable(false)、尺寸固定，frame 不跟随父视图缩放。
            glass.setAutoresizingMask(NSAutoresizingMaskOptions::empty());

            // 圆角：材质画在 view 自己的 layer 里，圆角必须落在 layer 上并裁剪子层，
            // 否则卡片 18px 圆角下面会露出直角玻璃。
            glass.setWantsLayer(true);
            if let Some(layer) = glass.layer() {
                layer.setCornerRadius(CARD_RADIUS);
                layer.setMasksToBounds(true);
            }

            content.addSubview_positioned_relativeTo(&glass, NSWindowOrderingMode::Below, None);
            return Ok(frosted_label(material));
        }
    }

    // 只有「要 Liquid Glass 但系统不支持」会走到这里。
    let glass = NSVisualEffectView::initWithFrame(mtm.alloc(), frame);
    glass.setMaterial(NSVisualEffectMaterial::Popover);
    glass.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    glass.setState(NSVisualEffectState::Active);
    glass.setAutoresizingMask(NSAutoresizingMaskOptions::empty());
    glass.setWantsLayer(true);
    if let Some(layer) = glass.layer() {
        layer.setCornerRadius(CARD_RADIUS);
        layer.setMasksToBounds(true);
    }
    content.addSubview_positioned_relativeTo(&glass, NSWindowOrderingMode::Below, None);

    Ok("popover")
}
