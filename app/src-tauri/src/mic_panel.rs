//! 全屏也能看见的顶部状态条：`NSPanel` + 内嵌 `WKWebView` 渲染设计稿 HTML。
//!
//! 为什么这么绕：
//! - 普通 `NSWindow` 在 macOS 上不保证能叠在全屏 App 的 Space，必须 `NSPanel`
//!   （`.nonactivatingPanel` + `fullScreenAuxiliary`），所以窗口只能自己建；
//! - 原生控件做不出设计稿的观感（毛玻璃跟随背景、没有平滑波形、圆角/阴影要手搓），
//!   所以内容交给 `WKWebView` 渲染和 `docs/design/hud-mock.html` 同一套 HTML/CSS。
//!
//! 这一层只负责「怎么画」；「画什么」由 `mic_hud` 根据 `mic-hud` 事件翻译，
//! 避免提示文案散落在状态机里。

#[cfg(target_os = "macos")]
mod imp {
    use std::cell::RefCell;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;

    use objc2::rc::Retained;
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{NSColor, NSPanel, NSView, NSWindowCollectionBehavior, NSWindowStyleMask};
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
    use objc2_web_kit::{WKWebView, WKWebViewConfiguration};
    use serde_json::json;
    use tauri::AppHandle;

    const W: f64 = 520.0;
    const H: f64 = 60.0;
    /// 距屏幕上沿的逻辑像素（让开 macOS 菜单栏）。
    const TOP: f64 = 44.0;

    /// 每次状态变化自增；延迟收起只收自己那一代，避免新状态被旧定时器收走。
    static GENERATION: AtomicU64 = AtomicU64::new(0);

    /// 设计稿 C（顶栏细条）+ 第二行提示：录音时显示波形/计时，失败时能说清楚原因。
    const HTML: &str = r#"<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;height:100%;overflow:hidden;background:#1b212b;
      -webkit-user-select:none;user-select:none}
    .pill{height:100%;display:flex;align-items:center;gap:11px;padding:0 17px;
      box-sizing:border-box;border-radius:18px;
      background:linear-gradient(180deg,rgba(38,45,58,.94) 0%,rgba(27,33,43,.96) 100%);
      border:.5px solid rgba(255,255,255,.09);
      box-shadow:0 8px 24px rgba(0,0,0,.32);
      font:12.5px/1.25 -apple-system,"PingFang SC",sans-serif;color:#e9eef5}
    .dot{width:7px;height:7px;border-radius:50%;background:#5fd6a4;
      box-shadow:0 0 9px rgba(95,214,164,.7);flex:none}
    .body{display:flex;flex-direction:column;justify-content:center;gap:3px;
      min-width:0;flex:1}
    .title-row{display:flex;align-items:center;gap:8px;min-width:0}
    .t{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .d{font-size:11px;line-height:1.25;color:#94a2b4;white-space:nowrap;
      overflow:hidden;text-overflow:ellipsis}
    .pill[data-detail="0"] .d{display:none}
    .wave{display:none;align-items:center;gap:2px;height:24px;flex:none}
    .pill[data-state="listening"] .wave{display:flex}
    .wave i{width:3px;height:24px;border-radius:2px;background:#5fd6a4;
      transform-origin:center;transform:scaleY(.12);transition:transform 75ms linear}
    .time{display:none;font:600 12px/1 ui-monospace,monospace;color:#8b99ab;
      min-width:40px;text-align:right;flex:none}
    .pill[data-state="listening"] .time{display:block}
    .pill[data-state="wait"] .dot{background:#fbbf24;box-shadow:0 0 10px rgba(251,191,36,.9)}
    .pill[data-state="error"] .dot{background:#ff5a5f;box-shadow:0 0 10px rgba(255,90,95,.9)}
    .pill[data-state="success"] .dot{background:#5fd6a4;box-shadow:0 0 10px rgba(95,214,164,.9)}
    </style></head><body>
    <div class="pill" id="pill" data-state="listening" data-detail="0">
      <span class="dot"></span>
      <div class="body">
        <div class="title-row"><span class="t" id="t">正在听</span></div>
        <div class="d" id="d"></div>
      </div>
      <span class="wave" id="wave"></span>
      <span class="time" id="time">00:00</span>
    </div>
    <script>
      const BARS = 24;
      const wave = document.getElementById('wave');
      for (let i = 0; i < BARS; i++) wave.appendChild(document.createElement('i'));
      const bars = Array.from(wave.children);

      let started = Date.now();
      let latest = 0.08;
      let lastAt = 0;
      const history = new Array(BARS).fill(0.08);
      let lastSample = 0;

      function paint() {
        bars.forEach((el, i) => {
          const value = history[i] || 0;
          // 与手机端同款：每根柱子有一点固定的形状差异，不会整块一起跳。
          const variation = 0.62 + ((i * 7) % 10) / 24;
          el.style.transform = 'scaleY(' + Math.max(0.08, Math.min(1, value * variation)).toFixed(3) + ')';
        });
      }

      function tick(now) {
        if (now - lastSample >= 50) {
          lastSample = now;
          const idle = Date.now() - lastAt > 700;
          const value = idle ? 0.08 : latest;
          history.push(value);
          history.shift();
          paint();
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);

      setInterval(() => {
        const s = Math.floor((Date.now() - started) / 1000);
        document.getElementById('time').textContent =
          String(Math.floor(s / 60)).padStart(2,'0') + ':' + String(s % 60).padStart(2,'0');
      }, 250);

      window.hud = {
        level(v) { latest = Math.max(0, Math.min(1, v)); lastAt = Date.now(); },
        status(state, title, detail) {
          const pill = document.getElementById('pill');
          pill.dataset.state = state;
          pill.dataset.detail = detail ? '1' : '0';
          document.getElementById('t').textContent = title || '';
          document.getElementById('d').textContent = detail || '';
          if (state === 'listening') started = Date.now();
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
            layer.setCornerRadius(18.0);
            layer.setMasksToBounds(true);
        }

        let config = unsafe { WKWebViewConfiguration::new(mtm) };
        let webview =
            unsafe { WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), rect, &config) };
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
                    frame.origin.y + frame.size.height - H - TOP,
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

    /// 显示一条状态。`state`: `listening` / `wait` / `error` / `success`。
    pub fn show_status(app: &AppHandle, state: &str, title: &str, detail: &str) {
        GENERATION.fetch_add(1, Ordering::SeqCst);
        let js = format!(
            "window.hud && window.hud.status({}, {}, {})",
            json!(state),
            json!(title),
            json!(detail)
        );
        run(app, js);
    }

    pub fn show_recording(app: &AppHandle) {
        show_status(app, "listening", "正在听", "再按一次结束 · Esc 取消");
    }

    /// 把真实电平（0–1）推给 HTML 里的波形。
    pub fn set_level(app: &AppHandle, level: f32) {
        let level = level.clamp(0.0, 1.0);
        run(app, format!("window.hud && window.hud.level({level:.3})"));
    }

    fn hide_now(app: &AppHandle) {
        let app = app.clone();
        let _ = app.clone().run_on_main_thread(move || {
            PANEL.with(|slot| {
                if let Some(panel) = slot.borrow().as_ref() {
                    panel.orderOut(None);
                }
            });
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
            hide_now(&app);
        });
    }
}

#[cfg(target_os = "macos")]
pub use imp::{hide_later, set_level, show_recording, show_status};

#[cfg(not(target_os = "macos"))]
pub fn show_recording(_app: &tauri::AppHandle) {}
#[cfg(not(target_os = "macos"))]
pub fn show_status(_app: &tauri::AppHandle, _state: &str, _title: &str, _detail: &str) {}
#[cfg(not(target_os = "macos"))]
pub fn set_level(_app: &tauri::AppHandle, _level: f32) {}
#[cfg(not(target_os = "macos"))]
pub fn hide_later(_app: &tauri::AppHandle, _delay: std::time::Duration) {}
