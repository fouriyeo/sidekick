use tauri::Manager;

#[cfg(target_os = "macos")]
mod activation;
#[cfg(desktop)]
mod app_focus;
#[cfg(desktop)]
mod app_paths;
#[cfg(desktop)]
mod asr_cloud;
#[cfg(desktop)]
mod asr_config;
#[cfg(desktop)]
mod asr_keychain;
#[cfg(desktop)]
mod asr_pricing;
#[cfg(desktop)]
mod asr_usage;
#[cfg(desktop)]
mod bailian_asr;
#[cfg(desktop)]
mod clipboard_manager;
#[cfg(desktop)]
mod desktop_keys;
#[cfg(desktop)]
mod desktop_mic;
#[cfg(desktop)]
mod desktop_server;
mod discovery;
#[cfg(desktop)]
mod dsh_hook;
#[cfg(desktop)]
mod dsh_hook_install;
#[cfg(mobile)]
mod haptics;
#[cfg(mobile)]
mod keep_awake;
#[cfg(target_os = "macos")]
mod menu;
mod mic_protocol;
#[cfg(mobile)]
mod mobile_client;
#[cfg(desktop)]
mod tls;
#[cfg(desktop)]
mod token_pricing;
#[cfg(desktop)]
mod token_usage;
#[cfg(desktop)]
mod transcript;
#[cfg(desktop)]
mod tray;
#[cfg(desktop)]
mod usage_panel;
/// 看板卡片区的原生玻璃底衬（D120）。
#[cfg(all(desktop, target_os = "macos"))]
mod panel_glass;

#[cfg(desktop)]
#[tauri::command]
async fn server_info() -> Result<desktop_server::ServerInfo, String> {
    desktop_server::info().await
}

#[tauri::command]
fn app_role() -> &'static str {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        "mobile"
    } else {
        "desktop"
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    let builder = tauri::Builder::default()
        // 单实例插件必须最先注册：再次启动时只把已有窗口叫到前台，然后新进程退出。
        // 两个桌面实例会争抢 UDP 47820 发现端口、互相覆盖 DSH hook 端点，结果手机
        // 连到那个收不到 AI 状态的进程，宠物一直是 idle（D60）。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 托盘常驻后窗口可能只是被隐藏，二次启动要把主窗口叫回前台（D88）。
            tray::show_main_window(app);
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            // ASR 与模型价格抓取共用 ring CryptoProvider，必须在任何 TLS 握手前安装。
            tls::ensure_crypto_provider();

            let asr_cloud = std::sync::Arc::new(asr_cloud::AsrCloudState::new());
            app.manage(asr_cloud.clone());

            let usage = std::sync::Arc::new(asr_usage::UsageStore::new());
            app.manage(usage.clone());

            // Token 用量看板：价格表 + 本机账本聚合（只读，不写 DSH）。
            let pricing = std::sync::Arc::new(token_pricing::PricingStore::new());
            app.manage(pricing.clone());
            let token_usage = std::sync::Arc::new(token_usage::TokenUsageStore::new(pricing));
            app.manage(token_usage.clone());

            let clipboard =
                std::sync::Arc::new(clipboard_manager::ClipboardManager::new(handle.clone()));
            app.manage(clipboard.clone());
            clipboard.start();

            // DSH AI 联动：回环监听 + 状态广播桥，WS 与设置页共用。
            let hook = dsh_hook::HookBridge::new(handle.clone());
            app.manage(hook.clone());
            hook.start();

            tauri::async_runtime::spawn(desktop_server::start(
                clipboard,
                hook,
                asr_cloud,
                usage,
                token_usage,
            ));

            // 菜单栏常驻（D88）：隐藏 Dock 图标，入口只在菜单栏。
            #[cfg(target_os = "macos")]
            let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            if let Err(err) = tray::init(&handle) {
                // 托盘建不起来就退回「关窗即退出」，不能留下没有退出入口的隐藏窗口。
                eprintln!("[tray] 初始化失败，保持关窗即退出行为: {err}");
            } else if let Err(err) = usage_panel::init(&handle) {
                // 预创建失败不阻断启动：第一次左键 `toggle` 会再建一次。
                eprintln!("[panel] 预创建失败（首次点按再试）: {err}");
            }
            // 菜单栏中文化（D113）：在窗口出现前替换 Tauri 默认英文菜单。
            #[cfg(target_os = "macos")]
            if let Err(err) = menu::install(&handle) {
                eprintln!("[menu] 中文菜单安装失败，保留默认菜单: {err}");
            }
            // QA 预览开关（仅 debug 构建）：没有辅助功能权限时脚本点不到菜单栏图标，
            // 用 SIDEKICK_PANEL_PREVIEW=1 启动即弹面板，便于桌面截图验收。
            // 预览时**不弹主窗口**：面板后面要留桌面壁纸，截图才能看清玻璃糊到了什么。
            #[cfg(all(desktop, debug_assertions))]
            let panel_preview = std::env::var_os("SIDEKICK_PANEL_PREVIEW").is_some();
            #[cfg(not(all(desktop, debug_assertions)))]
            let panel_preview = false;

            // Accessory 应用启动时不会被系统自动带到前台，手动把窗口叫到前面。
            if !panel_preview {
                tray::show_main_window(&handle);
            }
            #[cfg(all(desktop, debug_assertions))]
            if panel_preview {
                // 主窗口由 tauri.conf.json 的 windows 自动创建并可见，这里显式收起来，
                // 面板后面才真的是桌面壁纸（否则玻璃糊的是一张白卡，截图看不出效果）。
                if let Some(main) = handle.get_webview_window("main") {
                    let _ = main.hide();
                }
                // SIDEKICK_PANEL_PREVIEW="x,y"（逻辑像素）可把面板放到任意位置，
                // 方便把玻璃挪到深色/彩色窗口前面截图对比；只写 1 用默认右上角。
                let custom = std::env::var("SIDEKICK_PANEL_PREVIEW")
                    .ok()
                    .and_then(|value| {
                        let (x, y) = value.split_once(',')?;
                        Some((x.trim().parse::<f64>().ok()?, y.trim().parse::<f64>().ok()?))
                    });
                let tray_rect = match custom {
                    Some((x, y)) => tauri::Rect {
                        position: tauri::Position::Logical(tauri::LogicalPosition::new(x, y)),
                        size: tauri::Size::Logical(tauri::LogicalSize::new(36.0, 24.0)),
                    },
                    None => tauri::Rect {
                        position: tauri::Position::Physical(tauri::PhysicalPosition::new(2518, 28)),
                        size: tauri::Size::Physical(tauri::PhysicalSize::new(72, 48)),
                    },
                };
                usage_panel::toggle(&handle, tray_rect);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // 关窗只隐藏（D88）：HTTP 服务、UDP 发现、DSH hook 桥继续跑，
                // 手机连接与 AI 状态不因用户关窗而断掉。退出走菜单栏右键菜单。
                tauri::WindowEvent::CloseRequested { api, .. }
                    if window.label() == "main" && tray::ready() =>
                {
                    api.prevent_close();
                    let _ = window.hide();
                    // 交还菜单栏（D112）：窗口没了就回到「只剩菜单栏图标」的形态。
                    #[cfg(target_os = "macos")]
                    activation::window_hidden(window.app_handle());
                }
                // 用量小看板（D108）：Cmd+W / Esc 一类关闭请求只收起，窗口留着下次秒开。
                tauri::WindowEvent::CloseRequested { api, .. }
                    if window.label() == usage_panel::PANEL_WINDOW =>
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
                // 点其它 App / 桌面：失焦即收起。右键菜单与托盘点击不会让面板失焦。
                tauri::WindowEvent::Focused(false)
                    if window.label() == usage_panel::PANEL_WINDOW =>
                {
                    // QA 预览时不收：预览一启动焦点就被别的 App 拿走，截图脚本又点不回来。
                    if !usage_panel::preview_holds_open() {
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_role,
            server_info,
            desktop_mic::accessibility_info,
            desktop_mic::accessibility_open_settings,
            desktop_mic::accessibility_request,
            desktop_mic::accessibility_reveal_app,
            asr_cloud::asr_cloud_status,
            asr_cloud::asr_cloud_save,
            asr_cloud::asr_cloud_test,
            asr_cloud::asr_cloud_clear,
            asr_cloud::asr_keywords_save,
            asr_usage::asr_usage_stats,
            asr_usage::asr_usage_clear,
            token_usage::token_usage_stats,
            token_pricing::token_pricing_status,
            token_pricing::token_pricing_refresh,
            token_pricing::token_pricing_set_auto,
            token_pricing::token_pricing_set_mobile_models,
            clipboard_manager::clipboard_list,
            clipboard_manager::clipboard_status,
            clipboard_manager::clipboard_copy,
            clipboard_manager::clipboard_toggle_pin,
            clipboard_manager::clipboard_delete,
            clipboard_manager::clipboard_clear,
            clipboard_manager::clipboard_set_enabled,
            dsh_hook::dsh_hook_status,
            dsh_hook::dsh_hook_install,
            dsh_hook::dsh_hook_set_enabled,
            dsh_hook::dsh_hook_remove,
            dsh_hook::dsh_hook_test,
            usage_panel::hide_usage_panel,
            usage_panel::open_usage_page,
            usage_panel::panel_glass_ready
        ]);

    #[cfg(mobile)]
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .on_permission_request(|_, kind| match kind {
            tauri::webview::PermissionKind::Microphone => tauri::webview::PermissionResponse::Allow,
            // 扫码连接要用后置相机；wry 的 grantPermissionRequest 会自动带出 Android 系统相机授权。
            tauri::webview::PermissionKind::Camera => tauri::webview::PermissionResponse::Allow,
            _ => tauri::webview::PermissionResponse::Default,
        })
        .setup(|app| {
            app.manage(mobile_client::ClientState::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_role,
            discovery::discover_servers,
            haptics::haptic,
            haptics::disable_webview_haptics,
            keep_awake::set_keep_screen_on,
            mobile_client::connect_server,
            mobile_client::send_chat,
            mobile_client::mic_start,
            mobile_client::mic_frame,
            mobile_client::mic_stop,
            mobile_client::send_status_request,
            mobile_client::send_usage_request,
            mobile_client::send_focus_request,
            mobile_client::send_key_request
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
