//! 全屏也能看见的顶部状态条：`NSPanel` + 内嵌 `WKWebView` 渲染设计稿 HTML。
//!
//! 为什么这么绕：
//! - 普通 `NSWindow` 在 macOS 上不保证能叠在全屏 App 的 Space，必须 `NSPanel`
//!   （`.nonactivatingPanel` + `fullScreenAuxiliary`），所以窗口只能自己建；
//! - 原生控件做不出设计稿的观感（毛玻璃跟随背景、没有平滑波形、圆角/阴影要手搓），
//!   所以内容交给 `WKWebView` 渲染和 `docs/design/hud-mock.html` 同一套 HTML/CSS。

#[cfg(target_os = "macos")]
mod imp {
    use std::cell::RefCell;

    use objc2::rc::Retained;
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSColor, NSPanel, NSView, NSWindowCollectionBehavior, NSWindowStyleMask,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
    use objc2_web_kit::{WKWebView, WKWebViewConfiguration};
    use tauri::AppHandle;

    const W: f64 = 320.0;
    const H: f64 = 40.0;

    /// 设计稿 A（胶囊）：与 `docs/design/hud-mock.html` 同一套配色与动效。
    const HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#0e131b;
      -webkit-user-select:none;user-select:none}
    .pill{height:100%;display:flex;align-items:center;gap:10px;padding:0 16px;
      box-sizing:border-box;border-radius:20px;
      background:linear-gradient(180deg,#1a2230 0%,#10161f 100%);
      border:.5px solid rgba(110,231,183,.22);
      font:12.5px/1 -apple-system,"PingFang SC",sans-serif;color:#e9eef5}
    .dot{width:8px;height:8px;border-radius:50%;background:#6ee7b7;
      box-shadow:0 0 10px rgba(110,231,183,.9);flex:none}
    .t{font-weight:500;white-space:nowrap}
    .wave{display:flex;align-items:flex-end;gap:2px;height:16px;margin:0 2px;flex:none}
    .wave i{width:3px;border-radius:2px;background:#6ee7b7;animation:pump .9s ease-in-out infinite}
    .wave i:nth-child(1){height:40%;animation-delay:-.10s}
    .wave i:nth-child(2){height:70%;animation-delay:-.25s}
    .wave i:nth-child(3){height:100%;animation-delay:-.40s}
    .wave i:nth-child(4){height:55%;animation-delay:-.55s}
    .wave i:nth-child(5){height:80%;animation-delay:-.70s}
    .wave i:nth-child(6){height:45%;animation-delay:-.85s}
    @keyframes pump{0%,100%{transform:scaleY(.45)}50%{transform:scaleY(1)}}
    .time{font:600 12px/1 ui-monospace,monospace;color:#9fb3c8;min-width:42px;text-align:right}
    .hint{color:#8b97a8;font-size:11.5px;margin-left:auto;white-space:nowrap}
    .pill[data-state="listening"] .t{color:#e9eef5}
    .pill[data-state="error"] .dot{background:#ff5a5f;box-shadow:0 0 10px rgba(255,90,95,.9)}
    .pill[data-state="wait"] .dot{background:#fbbf24;box-shadow:0 0 10px rgba(251,191,36,.9)}
    .wave{display:none}.pill[data-state="listening"] .wave{display:flex}
    </style></head><body>
    <div class="pill" id="pill" data-state="listening">
      <span class="dot"></span><span class="t" id="t">正在听</span>
      <span class="wave"><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <span class="time" id="time">00:0</span><span class="hint" id="hint">再按一下结束</span>
    </div>
    <script>
      let started = Date.now();
      setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000);
        const el = document.getElementById('time');
        if (el) el.textContent = String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');
      }, 250);
      window.hud = {
        state(name, text, hint) {
          const pill = document.getElementById('pill');
          pill.dataset.state = name;
          if (text) document.getElementById('t').textContent = text;
          document.getElementById('hint').textContent = hint || '';
          if (name === 'listening') started = Date.now();
        }
      };
    </script></body></html>"#;

    thread_local! {
        static PANEL: RefCell<Option<Retained<NSPanel>>> = const { RefCell::new(None) };
        static VIEW: RefCell<Option<Retained<WKWebView>>> = const { RefCell::new(None) };
    }

    fn build(mtm: MainThreadMarker) -> (Retained<NSPanel>, Retained<WKWebView>) {
        let rect = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(W, H));
        let panel = unsafe { NSPanel::new(mtm) };
        panel.setStyleMask(NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel);
        panel.setFrame_display(rect, true);
        panel.setOpaque(false);
        panel.setBackgroundColor(Some(&NSColor::clearColor()));
        panel.setHasShadow(true);
        panel.setFloatingPanel(true);
        panel.setBecomesKeyOnlyIfNeeded(true);
        panel.setHidesOnDeactivate(false);
        panel.setCanHide(false);
        panel.setLevel(unsafe { objc2_app_kit::NSScreenSaverWindowLevel });
        panel.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::Stationary
                | NSWindowCollectionBehavior::IgnoresCycle,
        );

        // 圆角裁切交给容器层：WebView 自己是不透明的，靠这里裁出胶囊形状。
        let container = NSView::new(mtm);
        container.setFrame(rect);
        container.setWantsLayer(true);
        if let Some(layer) = container.layer() {
            layer.setCornerRadius(H / 2.0);
            layer.setMasksToBounds(true);
        }

        let config = unsafe { WKWebViewConfiguration::new(mtm) };
        let webview = unsafe {
            WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), rect, &config)
        };
        unsafe {
            webview.loadHTMLString_baseURL(&NSString::from_str(HTML), None);
        }
        container.addSubview(&webview);
        panel.setContentView(Some(&container));
        (panel, webview)
    }

    fn place(panel: &NSPanel) {
        let origin = MainThreadMarker::new()
            .and_then(|mtm| objc2_app_kit::NSScreen::mainScreen(mtm))
            .map_or(NSPoint::new(0.0, 0.0), |screen| {
                let frame = screen.frame();
                NSPoint::new(
                    frame.origin.x + (frame.size.width - W) / 2.0,
                    frame.origin.y + frame.size.height - H - 44.0,
                )
            });
        panel.setFrame_display(NSRect::new(origin, NSSize::new(W, H)), true);
        panel.orderFrontRegardless();
    }

    fn run(app: &AppHandle, js: String) {
        let app = app.clone();
        let _ = app.clone().run_on_main_thread(move || {
            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };
            PANEL.with(|slot| {
                let mut guard = slot.borrow_mut();
                if guard.is_none() {
                    let (panel, view) = build(mtm);
                    VIEW.with(|v| *v.borrow_mut() = Some(view));
                    *guard = Some(panel);
                }
                if let Some(panel) = guard.as_ref() {
                    place(panel);
                }
                VIEW.with(|v| {
                    if let Some(view) = v.borrow().as_ref() {
                        unsafe {
                            view.evaluateJavaScript_completionHandler(
                                &NSString::from_str(&js),
                                None,
                            );
                        }
                    }
                });
            });
        });
    }

    pub fn show_recording(app: &AppHandle) {
        run(
            app,
            "window.hud.state('listening','正在听','再按一下结束')".to_string(),
        );
    }

    pub fn show(app: &AppHandle, text: &str) {
        let text = text.replace('\'', " ");
        run(
            app,
            format!("window.hud.state('wait','{text}','')"),
        );
    }

    pub fn hide(app: &AppHandle) {
        let app = app.clone();
        let _ = app.clone().run_on_main_thread(move || {
            PANEL.with(|slot| {
                if let Some(panel) = slot.borrow().as_ref() {
                    panel.orderOut(None);
                }
            });
        });
    }
}

#[cfg(target_os = "macos")]
pub use imp::{hide, show, show_recording};

#[cfg(not(target_os = "macos"))]
pub fn show(_app: &tauri::AppHandle, _text: &str) {}
#[cfg(not(target_os = "macos"))]
pub fn show_recording(_app: &tauri::AppHandle) {}
#[cfg(not(target_os = "macos"))]
pub fn hide(_app: &tauri::AppHandle) {}
