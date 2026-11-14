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
/// 全局快捷键（桌面）：裸修饰键双击 / 组合键按住。
#[cfg(desktop)]
mod hotkey;
/// 桌面顶部麦克风状态 HUD：always-on-top、非激活、不抢焦点。
#[cfg(desktop)]
mod mic_hud;
/// 全屏也能看见的状态条：原生 NSPanel（非激活 + fullScreenAuxiliary）。
#[cfg(desktop)]
mod mic_panel;
/// 快捷键 → 手机录音的遥控层（只允许后端发起命令）。
#[cfg(desktop)]
mod mic_remote;
#[cfg(mobile)]
mod haptics;
#[cfg(mobile)]
mod keep_awake;
#[cfg(target_os = "macos")]
mod menu;
mod memo;
mod memo_protocol;
mod word;
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

            // 语音备忘录镜像（D115/D118）：桌面只读，手机单写者。
            let memo = std::sync::Arc::new(
                memo::desktop::MemoHub::new(handle.clone()).map_err(std::io::Error::other)?,
            );
            app.manage(memo.clone());

            // 英语角（生词本）：本地词库 + 百炼解释；WS 广播由 server 注入。
            let word = std::sync::Arc::new(
                word::desktop::WordHub::new(handle.clone()).map_err(std::io::Error::other)?,
            );
            app.manage(word.clone());

            // DSH AI 联动：回环监听 + 状态广播桥，WS 与设置页共用。
            let hook = dsh_hook::HookBridge::new(handle.clone());
            app.manage(hook.clone());
            hook.start();

            // 桌面快捷键遥控手机录音：命令只由桌面后端发起，绝不接受 WS 输入。
            let remote = mic_remote::RemoteMic::new(handle.clone());
            app.manage(remote.clone());
            // 全局键盘监听：macOS 用 NSEvent 旁听（不吞键），其它平台是空实现。
            hotkey::init(&handle);

            // 自检：SIDEKICK_HUD_PREVIEW=1 启动 3 秒后直接把状态条亮出来，便于截图检查排版。
            if std::env::var_os("SIDEKICK_HUD_PREVIEW").is_some() {
                let preview_handle = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(3));
                    mic_panel::show_recording(&preview_handle);
                });
            }

            tauri::async_runtime::spawn(desktop_server::start(
                handle.clone(),
                clipboard,
                hook,
                asr_cloud,
                usage,
                token_usage,
                memo,
                word,
                remote,
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
            tray::show_main_window(&handle);
            #[cfg(all(desktop, debug_assertions))]
            if panel_preview {
                // 主窗口留着但挪到屏幕外：**不能 hide**——Accessory 应用没有激活窗口时，
                // 面板窗口 show() 了也不会被合成到屏幕上（截图就是一片空白）。
                // 挪走之后面板背后的背景才干净（桌面壁纸/其它 App），玻璃效果看得清。
                if let Some(main) = handle.get_webview_window("main") {
                    let _ = main.set_position(tauri::PhysicalPosition::new(-20000, -20000));
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
                // 点其它 App / 桌面：失焦即收起；钉住（D135）或 QA 预览时不收。
                // 右键菜单与托盘点击不会让面板失焦。
                tauri::WindowEvent::Focused(false)
                    if window.label() == usage_panel::PANEL_WINDOW =>
                {
                    // 预览：一启动焦点就被别的 App 拿走，截图脚本又点不回来。
                    // 钉住：用户明确要求它一直挂在那儿，只有 Esc / 再点图标 / Cmd+W 能收。
                    if usage_panel::should_hide_on_blur(
                        usage_panel::preview_holds_open(),
                        usage_panel::pinned(),
                    ) {
                        let _ = window.hide();
                    }
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_role,
            server_info,
            hotkey::hotkey_status,
            hotkey::hotkey_save,
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
            clipboard_manager::clipboard_set_max_items,
            dsh_hook::dsh_hook_status,
            dsh_hook::dsh_hook_install,
            dsh_hook::dsh_hook_set_enabled,
            dsh_hook::dsh_hook_remove,
            dsh_hook::dsh_hook_test,
            usage_panel::hide_usage_panel,
            usage_panel::open_usage_page,
            usage_panel::panel_glass_ready,
            usage_panel::usage_panel_pinned,
            usage_panel::set_usage_panel_pinned,
            usage_panel::usage_panel_arrow_x,
            usage_panel::usage_panel_arrow_enabled,
            memo::desktop::memo_list,
            memo::desktop::memo_get,
            memo::desktop::memo_pair_code_create,
            word::desktop::word_list,
            word::desktop::word_get,
            word::desktop::word_add,
            word::desktop::word_explain,
            word::desktop::word_set_note,
            word::desktop::word_delete,
            word::desktop::word_generate,
            word::desktop::word_usage,
            word::desktop::word_status,
            word::desktop::word_consent,
            word::desktop::word_clipboard_candidates,
            word::desktop::word_tts,
            word::desktop::word_export_markdown
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
            // 语音备忘录（D115/D118）：本地库 + 上次未完成录音恢复。
            let memo_state = std::sync::Arc::new(
                memo::mobile::MemoState::new(app.handle()).map_err(std::io::Error::other)?,
            );
            app.manage(memo_state.clone());
            // 英语角（生词本）：本地词库 + 百炼解释 + 局域网同步。
            let word_state = std::sync::Arc::new(
                word::mobile::WordMobile::new(app.handle().clone()).map_err(std::io::Error::other)?,
            );
            app.manage(word_state);
            // 恢复可能要修 WAV 头/算 sha256，放到阻塞线程，别卡启动。
            let recover_handle = app.handle().clone();
            let recover_state = memo_state.clone();
            tauri::async_runtime::spawn_blocking(move || {
                if let Err(error) =
                    memo::mobile::recording::recover(&recover_handle, &recover_state)
                {
                    eprintln!("[memo] 恢复未完成录音失败: {error}");
                }
            });
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
            mobile_client::send_key_request,
            mobile_client::send_remote_mic_status,
            mobile_client::send_remote_mic_ack,
            memo::mobile::memo_list,
            memo::mobile::memo_get,
            memo::mobile::memo_update,
            memo::mobile::memo_delete,
            memo::mobile::memo_delete_audio,
            memo::mobile::memo_storage_stats,
            memo::mobile::memo_recording_start,
            memo::mobile::memo_recording_append,
            memo::mobile::memo_recording_finish,
            memo::mobile::memo_recording_cancel,
            memo::mobile::memo_recording_status,
            memo::mobile::memo_recover,
            memo::mobile::memo_retry,
            memo::mobile::memo_key_status,
            memo::mobile::memo_key_save,
            memo::mobile::memo_key_clear,
            memo::mobile::memo_pair_request,
            memo::mobile::memo_pair_apply,
            memo::mobile::memo_sync_now,
            memo::mobile::memo_sync_pending,
            word::mobile::word_list,
            word::mobile::word_get,
            word::mobile::word_add,
            word::mobile::word_explain,
            word::mobile::word_set_note,
            word::mobile::word_delete,
            word::mobile::word_generate,
            word::mobile::word_usage,
            word::mobile::word_status,
            word::mobile::word_consent,
            word::mobile::word_sync_now,
            word::mobile::word_tts,
            word::mobile::word_export_markdown
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
