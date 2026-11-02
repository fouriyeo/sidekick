use tauri::Manager;

#[cfg(desktop)]
mod app_paths;
#[cfg(desktop)]
mod asr_cloud;
#[cfg(desktop)]
mod asr_config;
#[cfg(desktop)]
mod asr_keychain;
#[cfg(desktop)]
mod asr_models;
#[cfg(desktop)]
mod bailian_asr;
#[cfg(desktop)]
mod clipboard_manager;
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
mod mic_protocol;
#[cfg(mobile)]
mod mobile_client;

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
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();

            let models = std::sync::Arc::new(asr_models::ModelManager::new(handle.clone()));
            app.manage(models.clone());
            models.prewarm();

            let asr_cloud = std::sync::Arc::new(asr_cloud::AsrCloudState::new());
            app.manage(asr_cloud.clone());

            let clipboard =
                std::sync::Arc::new(clipboard_manager::ClipboardManager::new(handle.clone()));
            app.manage(clipboard.clone());
            clipboard.start();

            // DSH AI 联动：回环监听 + 状态广播桥，WS 与设置页共用。
            let hook = dsh_hook::HookBridge::new(handle.clone());
            app.manage(hook.clone());
            hook.start();

            tauri::async_runtime::spawn(desktop_server::start(models, clipboard, hook, asr_cloud));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_role,
            server_info,
            desktop_mic::accessibility_info,
            desktop_mic::accessibility_open_settings,
            desktop_mic::accessibility_request,
            desktop_mic::accessibility_reveal_app,
            asr_models::asr_status,
            asr_models::asr_select_model,
            asr_models::asr_download_model,
            asr_models::asr_cancel_download,
            asr_models::asr_delete_model,
            asr_models::asr_reveal_dir,
            asr_cloud::asr_cloud_status,
            asr_cloud::asr_cloud_save,
            asr_cloud::asr_cloud_test,
            asr_cloud::asr_cloud_clear,
            asr_cloud::asr_engine_select,
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
            dsh_hook::dsh_hook_test
        ]);

    #[cfg(mobile)]
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .on_permission_request(|_, kind| match kind {
            tauri::webview::PermissionKind::Microphone => tauri::webview::PermissionResponse::Allow,
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
            mobile_client::send_status_request
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
