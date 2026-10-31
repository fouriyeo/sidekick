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
                        println!("[ws] recv: {text}");
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
        .plugin(tauri_plugin_opener::init())
        .setup(|_app| {
            tauri::async_runtime::spawn(desktop_server::start());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_role, server_info]);

    #[cfg(mobile)]
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(mobile_client::ClientState(std::sync::Mutex::new(None)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_role,
            mobile_client::connect_server,
            mobile_client::send_chat
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
