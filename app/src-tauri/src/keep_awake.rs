//! 手机端屏幕常亮：宠物页面在前台时阻止系统自动熄屏。
//!
//! 走 Android 原生窗口标志 `FLAG_KEEP_SCREEN_ON`，不依赖 WebView 的 Screen Wake Lock
//! （Android System WebView 上可用性/权限前提不确定），也不需要 `WAKE_LOCK` 权限。
//! 该标志只在窗口对用户可见时生效：App 退到后台或切到聊天页释放后，系统照常休眠。

/// Android `WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON`。
#[cfg(target_os = "android")]
const FLAG_KEEP_SCREEN_ON: i32 = 0x0000_0080;

#[cfg(target_os = "android")]
fn apply(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use jni::objects::JValue;
    use tauri::Manager;

    let window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next())
        .ok_or_else(|| "找不到主窗口".to_string())?;

    // with_webview 把闭包投递到 Android 主线程，本身不等待执行结果；
    // JNI 失败只记日志，不让前端因为一个可降级的显示能力报错。
    window
        .with_webview(move |webview| {
            webview.jni_handle().exec(move |env, activity, _webview| {
                let result = (|| -> jni::errors::Result<()> {
                    let window = env
                        .call_method(activity, "getWindow", "()Landroid/view/Window;", &[])?
                        .l()?;
                    let method = if enabled { "addFlags" } else { "clearFlags" };
                    env.call_method(&window, method, "(I)V", &[JValue::Int(FLAG_KEEP_SCREEN_ON)])?;
                    Ok(())
                })();

                if let Err(error) = result {
                    eprintln!("[keep-awake] 设置屏幕常亮失败: {error}");
                }
            });
        })
        .map_err(|error| format!("设置屏幕常亮失败: {error}"))
}

#[cfg(not(target_os = "android"))]
fn apply(_app: &tauri::AppHandle, _enabled: bool) -> Result<(), String> {
    // iOS 尚未开工（后续用 isIdleTimerDisabled 补）；桌面端不需要窗口常亮。
    Ok(())
}

/// 开关宠物页面屏幕常亮。`enabled` 为 true 时加窗口标志，false 时清除。
#[tauri::command]
pub fn set_keep_screen_on(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    apply(&app, enabled)
}
