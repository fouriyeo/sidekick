//! 手机端触感：接管 WebView 默认长按触感，并提供 App 自己的轻/中/成功/失败震动。
//!
//! 不申请 `VIBRATE` 权限：Android 官方文档明确 `View.performHapticFeedback` +
//! `HapticFeedbackConstants` 不需要该权限（与 `Vibrator` / WebView 的 Vibration API 不同），
//! 并且跟随系统「触摸振动」开关——用户关掉系统触感时 App 静默不震，不绕过用户选择。
//!
//! 两个入口：
//! - `disable_webview_haptics`：关掉 WebView 这套系统触感，长按不再由系统代发震动；
//! - `haptic`：App 主动触发触感（按下开始录音、取消、成功、失败）。
//!
//! 都通过 `WebviewWindow::with_webview` + `jni_handle().exec` 在 Android 主线程执行，
//! JNI 失败只记日志，静默降级为「没有触感」，不影响业务。

/// Android `HapticFeedbackConstants`：轻触。
#[cfg(target_os = "android")]
const EFFECT_LIGHT: i32 = 1; // VIRTUAL_KEY
/// Android `HapticFeedbackConstants`：中等（常用作上下文点击）。
#[cfg(target_os = "android")]
const EFFECT_MEDIUM: i32 = 6; // CONTEXT_CLICK
/// Android `HapticFeedbackConstants`：成功（API 30+）。
#[cfg(target_os = "android")]
const EFFECT_SUCCESS: i32 = 16; // CONFIRM
/// Android `HapticFeedbackConstants`：失败（API 30+）。
#[cfg(target_os = "android")]
const EFFECT_ERROR: i32 = 17; // REJECT

/// Android 系统版本；拿不到时按 0 处理（走兼容降级）。
#[cfg(target_os = "android")]
fn sdk_int(env: &mut jni::JNIEnv) -> i32 {
    let result = (|| -> jni::errors::Result<i32> {
        let class = env.find_class("android/os/Build$VERSION")?;
        let value = env.get_static_field(&class, "SDK_INT", "I")?;
        value.i()
    })();

    match result {
        Ok(value) => value,
        Err(error) => {
            eprintln!("[haptics] 读取 SDK_INT 失败: {error}");
            0
        }
    }
}

/// 把前端语义映射成 `HapticFeedbackConstants`；API 30 以下降级到旧常量。
#[cfg(target_os = "android")]
fn effect_for(style: &str, sdk: i32) -> i32 {
    match style {
        "success" => {
            if sdk >= 30 {
                EFFECT_SUCCESS
            } else {
                EFFECT_MEDIUM
            }
        }
        "error" => {
            if sdk >= 30 {
                EFFECT_ERROR
            } else {
                // 旧版本没有 REJECT，用 LONG_PRESS(0) 作为「重」的替代。
                0
            }
        }
        "medium" => EFFECT_MEDIUM,
        _ => EFFECT_LIGHT,
    }
}

#[cfg(target_os = "android")]
fn run_on_webview<F>(app: &tauri::AppHandle, on_ready: F) -> Result<(), String>
where
    F: FnOnce(&mut jni::JNIEnv, &jni::objects::JObject, &jni::objects::JObject) + Send + 'static,
{
    use tauri::Manager;

    let window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next())
        .ok_or_else(|| "找不到主窗口".to_string())?;

    window
        .with_webview(move |webview| {
            webview
                .jni_handle()
                .exec(move |env, activity, webview_obj| {
                    let raw = **webview_obj;
                    if raw.is_null() {
                        eprintln!("[haptics] WebView 尚未就绪，本次调用跳过");
                        return;
                    }
                    on_ready(env, activity, webview_obj);
                });
        })
        .map_err(|error| format!("触感调用失败: {error}"))
}

/// App 主动触感：`light` / `medium` / `success` / `error`。
#[tauri::command]
pub fn haptic(app: tauri::AppHandle, style: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        run_on_webview(&app, move |env, activity, _webview| {
            let sdk = sdk_int(env);
            let effect = effect_for(&style, sdk);

            let result = (|| -> jni::errors::Result<()> {
                let window = env
                    .call_method(activity, "getWindow", "()Landroid/view/Window;", &[])?
                    .l()?;
                let decor = env
                    .call_method(&window, "getDecorView", "()Landroid/view/View;", &[])?
                    .l()?;
                // 用 decorView 而不是 WebView：WebView 的系统触感已被
                // `disable_webview_haptics` 关掉，decorView 仍保持默认开启。
                env.call_method(
                    &decor,
                    "performHapticFeedback",
                    "(I)Z",
                    &[jni::objects::JValue::Int(effect)],
                )?;
                Ok(())
            })();

            if let Err(error) = result {
                eprintln!("[haptics] 触发触感失败: {error}");
            }
        })
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, style);
        Ok(())
    }
}

/// 关闭 WebView 的系统触感：长按（文本选择 / 上下文菜单）不再由系统代发震动。
/// 只影响 WebView 这个 View 的 `performHapticFeedback`，不影响 App 自己的 `haptic`。
#[tauri::command]
pub fn disable_webview_haptics(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        run_on_webview(&app, |env, _activity, webview_obj| {
            let result = (|| -> jni::errors::Result<()> {
                // jni 的 jboolean 是 u8：0 = false。
                let haptics_enabled = jni::objects::JValue::Bool(0);
                env.call_method(
                    webview_obj,
                    "setHapticFeedbackEnabled",
                    "(Z)V",
                    &[haptics_enabled],
                )?;
                Ok(())
            })();

            if let Err(error) = result {
                eprintln!("[haptics] 关闭 WebView 默认触感失败: {error}");
            }
        })
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(())
    }
}
