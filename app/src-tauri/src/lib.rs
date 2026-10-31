#[cfg(mobile)]
use tauri::Manager;

#[cfg(desktop)]
mod desktop_server {
    use std::net::SocketAddr;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use axum::body::Body;
    use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
    use axum::extract::State;
    use axum::http::{header, HeaderValue, StatusCode};
    use axum::response::{Html, IntoResponse, Response};
    use axum::routing::get;
    use axum::Router;
    use futures_util::{SinkExt, StreamExt};
    use serde::Serialize;
    use tokio::net::TcpListener;
    use tokio::sync::broadcast;
    use tokio_util::io::ReaderStream;

    pub const PORT: u16 = 8848;
    static MOBILE_PAGE: &str = include_str!("../mobile/index.html");
    const APK_REL_PATH: &str =
        "gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk";

    #[derive(Clone)]
    struct AppState {
        tx: broadcast::Sender<String>,
        clients: Arc<AtomicUsize>,
    }

    #[derive(Serialize)]
    pub struct ServerInfo {
        pub ip: String,
        pub port: u16,
        pub url: String,
    }

    pub fn info() -> ServerInfo {
        let ip = local_ip_address::local_ip()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|_| "127.0.0.1".to_string());
        ServerInfo {
            url: format!("http://{ip}:{PORT}"),
            ip,
            port: PORT,
        }
    }

    async fn mobile_page() -> Html<&'static str> {
        Html(MOBILE_PAGE)
    }

    async fn download_apk() -> Response {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(APK_REL_PATH);
        match tokio::fs::File::open(&path).await {
            Ok(file) => {
                let body = Body::from_stream(ReaderStream::new(file));
                let mut response = body.into_response();
                response.headers_mut().insert(
                    header::CONTENT_TYPE,
                    HeaderValue::from_static("application/vnd.android.package-archive"),
                );
                response.headers_mut().insert(
                    header::CONTENT_DISPOSITION,
                    HeaderValue::from_static("attachment; filename=\"sidekick-debug.apk\""),
                );
                response
            }
            Err(_) => (
                StatusCode::NOT_FOUND,
                "APK 还没构建好，请先在项目里执行安卓构建",
            )
                .into_response(),
        }
    }

    async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
        ws.on_upgrade(move |socket| handle_socket(socket, state))
    }

    async fn handle_socket(socket: WebSocket, state: AppState) {
        let (mut sender, mut receiver) = socket.split();
        let mut rx = state.tx.subscribe();

        let count = state.clients.fetch_add(1, Ordering::SeqCst) + 1;
        println!("[ws] client connected ({count} online)");
        let _ = state
            .tx
            .send(system_message(format!("客户端已连接，当前 {count} 个")));

        let mut send_task = tokio::spawn(async move {
            while let Ok(text) = rx.recv().await {
                if sender.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        });

        let tx = state.tx.clone();
        let mut recv_task = tokio::spawn(async move {
            while let Some(Ok(msg)) = receiver.next().await {
                match msg {
                    Message::Text(text) => {
                        let text = text.to_string();
                        if text.contains("\"type\":\"voice\"") {
                            println!("[ws] recv: [voice message, {} bytes]", text.len());
                        } else {
                            println!("[ws] recv: {text}");
                        }
                        let _ = tx.send(text);
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        });

        tokio::select! {
            _ = (&mut send_task) => recv_task.abort(),
            _ = (&mut recv_task) => send_task.abort(),
        }

        let count = state.clients.fetch_sub(1, Ordering::SeqCst) - 1;
        println!("[ws] client disconnected ({count} online)");
        let _ = state
            .tx
            .send(system_message(format!("客户端断开，当前 {count} 个")));
    }

    fn system_message(text: String) -> String {
        serde_json::json!({ "type": "system", "text": text }).to_string()
    }

    pub async fn start() {
        let (tx, _rx) = broadcast::channel::<String>(64);
        let state = AppState {
            tx,
            clients: Arc::new(AtomicUsize::new(0)),
        };
        let app = Router::new()
            .route("/", get(mobile_page))
            .route("/ws", get(ws_handler))
            .route("/download/apk", get(download_apk))
            .with_state(state);

        let addr = SocketAddr::from(([0, 0, 0, 0], PORT));
        match TcpListener::bind(addr).await {
            Ok(listener) => {
                println!("[server] listening on http://0.0.0.0:{PORT}");
                if let Err(err) = axum::serve(listener, app).await {
                    eprintln!("[server] error: {err}");
                }
            }
            Err(err) => {
                eprintln!("[server] failed to bind port {PORT}: {err}");
            }
        }
    }
}

#[cfg(desktop)]
#[tauri::command]
fn server_info() -> desktop_server::ServerInfo {
    desktop_server::info()
}

#[cfg(mobile)]
mod mobile_client {
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    use futures_util::{SinkExt, StreamExt};
    use tauri::{Emitter, Manager};
    use tokio::sync::mpsc;
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message;

    pub struct ClientState(pub Mutex<Option<mpsc::UnboundedSender<String>>>);

    fn now_ms() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0)
    }

    fn send_payload(app: &tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
        let state = app.state::<ClientState>();
        let guard = state.0.lock().unwrap();
        let tx = guard.as_ref().ok_or("还没连接电脑")?;
        tx.send(payload.to_string())
            .map_err(|_| "连接已断开".to_string())
    }

    fn normalize_addr(addr: &str) -> String {
        let addr = addr.trim().trim_end_matches('/');
        if addr.starts_with("ws://") || addr.starts_with("wss://") {
            if addr.ends_with("/ws") {
                addr.to_string()
            } else {
                format!("{addr}/ws")
            }
        } else {
            let with_port = if addr.contains(':') {
                addr.to_string()
            } else {
                format!("{addr}:8848")
            };
            format!("ws://{with_port}/ws")
        }
    }

    #[tauri::command]
    pub async fn connect_server(app: tauri::AppHandle, addr: String) -> Result<(), String> {
        let url = normalize_addr(&addr);
        let (socket, _) = connect_async(&url)
            .await
            .map_err(|err| format!("连接失败: {err}"))?;
        let (mut write, mut read) = socket.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        {
            let state = app.state::<ClientState>();
            *state.0.lock().unwrap() = Some(tx);
        }
        let _ = app.emit("conn", serde_json::json!({ "online": true, "url": url }));

        let app_read = app.clone();
        tauri::async_runtime::spawn(async move {
            while let Some(Ok(msg)) = read.next().await {
                match msg {
                    Message::Text(text) => {
                        let _ = app_read.emit("chat", text.to_string());
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            if let Some(state) = app_read.try_state::<ClientState>() {
                *state.0.lock().unwrap() = None;
            }
            let _ = app_read.emit("conn", serde_json::json!({ "online": false }));
        });

        tauri::async_runtime::spawn(async move {
            while let Some(text) = rx.recv().await {
                if write.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        });

        Ok(())
    }

    #[tauri::command]
    pub fn send_chat(app: tauri::AppHandle, text: String) -> Result<(), String> {
        let state = app.state::<ClientState>();
        let guard = state.0.lock().unwrap();
        let tx = guard.as_ref().ok_or("还没连接电脑")?;
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let payload = serde_json::json!({
            "type": "chat",
            "from": "phone",
            "text": text,
            "ts": ts,
        })
        .to_string();
        tx.send(payload).map_err(|_| "连接已断开".to_string())
    }

    #[tauri::command]
    pub fn send_voice_start(app: tauri::AppHandle) -> Result<(), String> {
        send_payload(
            &app,
            serde_json::json!({
                "type": "voice.start",
                "from": "phone",
                "ts": now_ms(),
            }),
        )
    }

    #[tauri::command]
    pub fn send_voice_cancel(app: tauri::AppHandle) -> Result<(), String> {
        send_payload(
            &app,
            serde_json::json!({
                "type": "voice.cancel",
                "from": "phone",
                "ts": now_ms(),
            }),
        )
    }

    #[tauri::command]
    pub fn send_voice(
        app: tauri::AppHandle,
        audio: String,
        sample_rate: u32,
        duration_ms: u32,
    ) -> Result<(), String> {
        send_payload(
            &app,
            serde_json::json!({
                "type": "voice",
                "from": "phone",
                "audio": audio,
                "sampleRate": sample_rate,
                "durationMs": duration_ms,
                "ts": now_ms(),
            }),
        )
    }
}

#[cfg(desktop)]
mod desktop_mic {
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use serde::Serialize;

    #[cfg(target_os = "macos")]
    #[link(name = "Carbon", kind = "framework")]
    unsafe extern "C" {
        fn IsSecureEventInputEnabled() -> bool;
    }

    #[derive(Serialize)]
    pub struct VoiceResult {
        pub outcome: &'static str,
    }

    fn front_app() -> Option<String> {
        let asn = Command::new("lsappinfo").arg("front").output().ok()?;
        let asn = String::from_utf8_lossy(&asn.stdout).trim().to_string();
        if asn.is_empty() {
            return None;
        }

        let info = Command::new("lsappinfo")
            .args(["info", "-only", "name", &asn])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&info.stdout);
        let marker = "\"LSDisplayName\"=\"";
        let start = text.find(marker)? + marker.len();
        let rest = &text[start..];
        let end = rest.find('"')?;
        Some(rest[..end].to_string())
    }

    fn secure_input_enabled() -> bool {
        #[cfg(target_os = "macos")]
        {
            unsafe { IsSecureEventInputEnabled() }
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }

    fn copy_to_clipboard(text: &str) -> Result<(), String> {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|error| format!("剪贴板不可用: {error}"))?;
        clipboard
            .set_text(text)
            .map_err(|error| format!("写入剪贴板失败: {error}"))?;
        Ok(())
    }

    fn paste_from_clipboard() -> bool {
        Command::new("osascript")
            .args([
                "-e",
                "tell application \"System Events\" to keystroke \"v\" using command down",
            ])
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    #[tauri::command]
    pub fn capture_front_app() -> Option<String> {
        front_app()
    }

    #[tauri::command]
    pub async fn transcribe_and_insert(
        audio_base64: String,
        expected_app: Option<String>,
    ) -> Result<VoiceResult, String> {
        tauri::async_runtime::spawn_blocking(move || {
            transcribe_and_insert_blocking(audio_base64, expected_app)
        })
        .await
        .map_err(|error| format!("转写任务失败: {error}"))?
    }

    fn transcribe_and_insert_blocking(
        audio_base64: String,
        expected_app: Option<String>,
    ) -> Result<VoiceResult, String> {
        let bytes = STANDARD
            .decode(audio_base64)
            .map_err(|_| "音频数据无效".to_string())?;
        eprintln!("[mic] decode {} bytes", bytes.len());
        if bytes.len() < 44 {
            return Err("音频太短".to_string());
        }

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        let base = std::env::temp_dir().join(format!(
            "sidekick-voice-{}-{stamp}",
            std::process::id()
        ));
        let wav_path = base.with_extension("wav");
        let txt_path = base.with_extension("txt");

        std::fs::write(&wav_path, &bytes).map_err(|error| format!("临时音频写入失败: {error}"))?;

        let cli = std::env::var("SIDEKICK_WHISPER_CLI")
            .unwrap_or_else(|_| "/opt/homebrew/bin/whisper-cli".to_string());
        let home = std::env::var("HOME").unwrap_or_default();
        let model = std::env::var("SIDEKICK_WHISPER_MODEL").unwrap_or_else(|_| {
            format!("{home}/Library/Application Support/Sidekick/models/ggml-base.bin")
        });
        let lang = std::env::var("SIDEKICK_WHISPER_LANG").unwrap_or_else(|_| "auto".to_string());

        let output = Command::new(&cli)
            .arg("-m")
            .arg(&model)
            .arg("-f")
            .arg(&wav_path)
            .arg("-l")
            .arg(&lang)
            .arg("-nt")
            .arg("-otxt")
            .arg("-of")
            .arg(&base)
            .output();

        let text = match output {
            Ok(result) if result.status.success() => {
                std::fs::read_to_string(&txt_path).unwrap_or_default()
            }
            Ok(result) => {
                let _ = std::fs::remove_file(&wav_path);
                let _ = std::fs::remove_file(&txt_path);
                let detail = String::from_utf8_lossy(&result.stderr)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_string();
                return Err(format!("语音转写失败: {detail}"));
            }
            Err(error) => {
                let _ = std::fs::remove_file(&wav_path);
                let _ = std::fs::remove_file(&txt_path);
                return Err(format!("找不到本地语音转写工具: {error}"));
            }
        };

        let _ = std::fs::remove_file(&wav_path);
        let _ = std::fs::remove_file(&txt_path);

        let text = text
            .trim()
            .chars()
            .take(2000)
            .collect::<String>();
        eprintln!("[mic] transcript {} chars", text.chars().count());
        if text.is_empty() {
            return Err("没听清，再说一次？".to_string());
        }

        copy_to_clipboard(&text)?;

        let current_app = front_app();
        let same_app = expected_app.is_some() && current_app.as_deref() == expected_app.as_deref();
        let can_paste = same_app && !secure_input_enabled();
        eprintln!(
            "[mic] paste target {} secure={}",
            if same_app { "matched" } else { "changed" },
            secure_input_enabled()
        );

        if can_paste && paste_from_clipboard() {
            eprintln!("[mic] outcome inserted");
            Ok(VoiceResult {
                outcome: "inserted",
            })
        } else {
            eprintln!("[mic] outcome copied");
            Ok(VoiceResult {
                outcome: "copied",
            })
        }
    }
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
        .setup(|_app| {
            tauri::async_runtime::spawn(desktop_server::start());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_role,
            server_info,
            desktop_mic::capture_front_app,
            desktop_mic::transcribe_and_insert
        ]);

    #[cfg(mobile)]
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .on_permission_request(|_, kind| match kind {
            tauri::webview::PermissionKind::Microphone => {
                tauri::webview::PermissionResponse::Allow
            }
            _ => tauri::webview::PermissionResponse::Default,
        })
        .setup(|app| {
            app.manage(mobile_client::ClientState(std::sync::Mutex::new(None)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_role,
            mobile_client::connect_server,
            mobile_client::send_chat,
            mobile_client::send_voice_start,
            mobile_client::send_voice_cancel,
            mobile_client::send_voice
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
