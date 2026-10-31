#[cfg(mobile)]
use tauri::Manager;

mod discovery;

#[cfg(desktop)]
mod desktop_server {
    use std::net::SocketAddr;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, OnceLock};
    use std::time::Duration;

    use axum::Router;
    use axum::body::Body;
    use axum::extract::State;
    use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
    use axum::http::{HeaderValue, StatusCode, header};
    use axum::response::{Html, IntoResponse, Response};
    use axum::routing::get;
    use futures_util::{SinkExt, StreamExt};
    use serde::Serialize;
    use tokio::net::TcpListener;
    use tokio::sync::broadcast;
    use tokio_util::io::ReaderStream;

    use crate::discovery;

    static MOBILE_PAGE: &str = include_str!("../mobile/index.html");
    const APK_REL_PATH: &str =
        "gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk";

    /// `server_info` 等待服务就绪的上限。
    const SERVER_INFO_TIMEOUT: Duration = Duration::from_secs(3);
    /// 服务没起来时给前端的错误文案。
    const SERVER_NOT_READY: &str = "电脑端服务还没起来，请点重试";

    /// 实际生效的服务端口：某个候选端口 bind 成功后写入。
    static BOUND_PORT: OnceLock<u16> = OnceLock::new();
    /// UDP 发现端口状态：响应器 bind 成功才是 `Some(47820)`，否则 `None`。
    static DISCOVERY_PORT_STATE: OnceLock<Option<u16>> = OnceLock::new();
    /// 服务端口就绪通知，供 `server_info` 等待。
    static PORT_READY: tokio::sync::Notify = tokio::sync::Notify::const_new();

    #[derive(Clone)]
    struct AppState {
        tx: broadcast::Sender<String>,
        clients: Arc<AtomicUsize>,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ServerInfo {
        pub ip: String,
        pub port: u16,
        pub url: String,
        pub discovery_port: Option<u16>,
    }

    fn local_ip() -> String {
        local_ip_address::local_ip()
            .map(|ip| ip.to_string())
            .unwrap_or_else(|_| "127.0.0.1".to_string())
    }

    /// 等端口就绪（最多 `SERVER_INFO_TIMEOUT`）后返回服务信息。
    pub async fn info() -> Result<ServerInfo, String> {
        let port = wait_for_bound_port(SERVER_INFO_TIMEOUT)
            .await
            .ok_or_else(|| SERVER_NOT_READY.to_string())?;
        let discovery_port = DISCOVERY_PORT_STATE.get().copied().flatten();
        let ip = local_ip();
        Ok(ServerInfo {
            url: format!("http://{ip}:{port}"),
            ip,
            port,
            discovery_port,
        })
    }

    /// 等待首个候选端口 bind 成功；超时返回 `None`。
    ///
    /// 先创建 `notified()`（`enable()` 注册等待者）再查 `BOUND_PORT`，
    /// 避免「检查为空 → 就绪通知已发出 → 丢唤醒」的竞态。
    async fn wait_for_bound_port(timeout: Duration) -> Option<u16> {
        if let Some(port) = BOUND_PORT.get() {
            return Some(*port);
        }

        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let notified = PORT_READY.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();

            if let Some(port) = BOUND_PORT.get() {
                return Some(*port);
            }

            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return BOUND_PORT.get().copied();
            }

            match tokio::time::timeout(remaining, &mut notified).await {
                Ok(()) => {
                    if let Some(port) = BOUND_PORT.get() {
                        return Some(*port);
                    }
                }
                Err(_) => return BOUND_PORT.get().copied(),
            }
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

        // 候选端口按序尝试：第一个 bind 成功者生效（被占用时自动回退）。
        for port in discovery::SERVICE_PORTS {
            let addr = SocketAddr::from(([0, 0, 0, 0], port));
            let listener = match TcpListener::bind(addr).await {
                Ok(listener) => listener,
                Err(error) => {
                    eprintln!("[server] 端口 {port} 绑定失败: {error}，尝试下一个候选端口");
                    continue;
                }
            };

            // 先启动 UDP 响应器再标记就绪，保证 server_info 返回的 discoveryPort 准确。
            let discovery_ready = discovery::spawn_responder(port).await;
            let _ = DISCOVERY_PORT_STATE.set(if discovery_ready {
                Some(discovery::DISCOVERY_PORT)
            } else {
                None
            });
            let _ = BOUND_PORT.set(port);
            PORT_READY.notify_waiters();

            println!("[server] listening on http://0.0.0.0:{port}");
            if discovery_ready {
                println!(
                    "[discovery] UDP 响应器已启动，监听 0.0.0.0:{}",
                    discovery::DISCOVERY_PORT
                );
            } else {
                eprintln!(
                    "[discovery] UDP 响应器未启动，手机将无法自动发现（discoveryPort = null）"
                );
            }

            if let Err(error) = axum::serve(listener, app).await {
                eprintln!("[server] error: {error}");
            }
            return;
        }

        eprintln!(
            "[server] 所有候选端口都绑定失败（{:?}），无法启动服务",
            discovery::SERVICE_PORTS
        );
    }
}

#[cfg(desktop)]
#[tauri::command]
async fn server_info() -> Result<desktop_server::ServerInfo, String> {
    desktop_server::info().await
}

#[cfg(mobile)]
mod mobile_client {
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    use futures_util::{SinkExt, StreamExt};
    use tauri::{Emitter, Manager};
    use tokio::sync::mpsc;
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message;

    /// 连接超时：连不上电脑时 4s 内给出中文提示。
    const CONNECT_TIMEOUT: Duration = Duration::from_secs(4);
    /// 只写裸 IP 时的缺省端口（与桌面首选端口一致）。
    const DEFAULT_PORT: u16 = 47810;

    /// 一条已建立的连接：发送通道 + generation + 读写任务句柄。
    struct Conn {
        tx: mpsc::UnboundedSender<String>,
        generation: u64,
        read_task: tauri::async_runtime::JoinHandle<()>,
        write_task: tauri::async_runtime::JoinHandle<()>,
    }

    impl Conn {
        /// 取消该连接的两个后台任务。
        fn cancel(&self) {
            self.read_task.abort();
            self.write_task.abort();
        }
    }

    pub struct ClientState {
        /// 当前连接；未连接为 `None`。
        conn: Mutex<Option<Conn>>,
        /// 串行化 `connect_server`，避免并发建连互相踩状态。
        connect_lock: tokio::sync::Mutex<()>,
        /// 单调递增编号：旧连接退出时据此判断自己是否还是当前连接。
        generation: AtomicU64,
    }

    impl ClientState {
        pub fn new() -> Self {
            ClientState {
                conn: Mutex::new(None),
                connect_lock: tokio::sync::Mutex::new(()),
                generation: AtomicU64::new(0),
            }
        }

        fn next_generation(&self) -> u64 {
            self.generation.fetch_add(1, Ordering::SeqCst) + 1
        }
    }

    fn now_ms() -> u128 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0)
    }

    fn send_payload(app: &tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
        let state = app.state::<ClientState>();
        let guard = state.conn.lock().unwrap();
        let conn = guard.as_ref().ok_or("还没连接电脑")?;
        conn.tx
            .send(payload.to_string())
            .map_err(|_| "连接已断开".to_string())
    }

    fn emit_offline(app: &tauri::AppHandle) {
        let _ = app.emit("conn", serde_json::json!({ "online": false }));
    }

    /// 只写裸 IP 时补缺省端口 47810；显式端口（含旧的 `IP:8848`）原样保留。
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
                format!("{addr}:{DEFAULT_PORT}")
            };
            format!("ws://{with_port}/ws")
        }
    }

    #[tauri::command]
    pub async fn connect_server(app: tauri::AppHandle, addr: String) -> Result<(), String> {
        let url = normalize_addr(&addr);
        let state = app.state::<ClientState>();

        // 串行化：上一次连接流程没结束前，这次先排队。
        let _serial = state.connect_lock.lock().await;
        let generation = state.next_generation();

        // 先取消旧连接（abort 任务）。generation 守卫保证旧任务退出时
        // 不会清空新连接状态、也不会发 conn:false 覆盖新连接。
        {
            let mut guard = state.conn.lock().unwrap();
            if let Some(old) = guard.take() {
                old.cancel();
                println!("[mobile] 已取消旧连接");
            }
        }

        println!("[mobile] connecting to {url}");
        let (socket, _) = match tokio::time::timeout(CONNECT_TIMEOUT, connect_async(&url)).await {
            Ok(Ok(pair)) => pair,
            Ok(Err(error)) => {
                eprintln!("[mobile] 连接 {url} 失败: {error}");
                emit_offline(&app);
                return Err(format!("连接失败: {error}"));
            }
            Err(_) => {
                eprintln!("[mobile] 连接 {url} 超时（{}s）", CONNECT_TIMEOUT.as_secs());
                emit_offline(&app);
                return Err("连接超时，确认电脑端已打开".to_string());
            }
        };

        let (mut write, mut read) = socket.split();
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        // 读任务：把收到的消息转给前端；连接结束时只有 generation 仍最新
        // 才清理状态并广播离线（旧连接退出不影响新连接）。
        let read_app = app.clone();
        let read_generation = generation;
        let read_task = tauri::async_runtime::spawn(async move {
            while let Some(Ok(message)) = read.next().await {
                match message {
                    Message::Text(text) => {
                        let _ = read_app.emit("chat", text.to_string());
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }

            let Some(state) = read_app.try_state::<ClientState>() else {
                return;
            };
            let mut guard = state.conn.lock().unwrap();
            let is_current = guard.as_ref().map(|conn| conn.generation) == Some(read_generation);
            if !is_current {
                println!("[mobile] 旧连接（generation {read_generation}）已退出，忽略状态清理");
                return;
            }
            let conn = guard.take();
            drop(guard);
            if let Some(conn) = conn {
                conn.write_task.abort();
            }
            println!("[mobile] 连接已断开");
            emit_offline(&read_app);
        });

        // 写任务：把前端发出的消息写到 WS。
        let write_task = tauri::async_runtime::spawn(async move {
            while let Some(text) = rx.recv().await {
                if write.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        });

        {
            let mut guard = state.conn.lock().unwrap();
            *guard = Some(Conn {
                tx,
                generation,
                read_task,
                write_task,
            });
        }
        println!("[mobile] connected to {url}");
        let _ = app.emit("conn", serde_json::json!({ "online": true, "url": url }));

        Ok(())
    }

    #[tauri::command]
    pub fn send_chat(app: tauri::AppHandle, text: String) -> Result<(), String> {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        send_payload(
            &app,
            serde_json::json!({
                "type": "chat",
                "from": "phone",
                "text": text,
                "ts": ts,
            }),
        )
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

    use base64::{Engine as _, engine::general_purpose::STANDARD};
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
        let base =
            std::env::temp_dir().join(format!("sidekick-voice-{}-{stamp}", std::process::id()));
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

        let text = text.trim().chars().take(2000).collect::<String>();
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
            Ok(VoiceResult { outcome: "copied" })
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
