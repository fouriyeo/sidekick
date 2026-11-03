use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use futures_util::{SinkExt, StreamExt};
use tauri::{Emitter, Manager};
use tokio::sync::mpsc;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::mic_protocol::{self, MicStopReason};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(4);
const DEFAULT_PORT: u16 = 47810;

enum Outbound {
    Text(String),
    Binary(Vec<u8>),
}

struct Conn {
    tx: mpsc::UnboundedSender<Outbound>,
    generation: u64,
    read_task: tauri::async_runtime::JoinHandle<()>,
    write_task: tauri::async_runtime::JoinHandle<()>,
}

impl Conn {
    fn cancel(&self) {
        self.read_task.abort();
        self.write_task.abort();
    }
}

pub struct ClientState {
    conn: Mutex<Option<Conn>>,
    connect_lock: tokio::sync::Mutex<()>,
    generation: AtomicU64,
}

impl ClientState {
    pub fn new() -> Self {
        Self {
            conn: Mutex::new(None),
            connect_lock: tokio::sync::Mutex::new(()),
            generation: AtomicU64::new(0),
        }
    }

    fn next_generation(&self) -> u64 {
        self.generation.fetch_add(1, Ordering::SeqCst) + 1
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn send_outbound(app: &tauri::AppHandle, outbound: Outbound) -> Result<(), String> {
    let state = app.state::<ClientState>();
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("还没连接电脑")?;
    conn.tx.send(outbound).map_err(|_| "连接已断开".to_string())
}

fn send_payload(app: &tauri::AppHandle, payload: serde_json::Value) -> Result<(), String> {
    send_outbound(app, Outbound::Text(payload.to_string()))
}

fn send_binary(app: &tauri::AppHandle, payload: Vec<u8>) -> Result<(), String> {
    send_outbound(app, Outbound::Binary(payload))
}

fn emit_offline(app: &tauri::AppHandle) {
    let _ = app.emit("conn", serde_json::json!({ "online": false }));
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
            format!("{addr}:{DEFAULT_PORT}")
        };
        format!("ws://{with_port}/ws")
    }
}

#[tauri::command]
pub async fn connect_server(app: tauri::AppHandle, addr: String) -> Result<(), String> {
    let url = normalize_addr(&addr);
    let state = app.state::<ClientState>();

    let _serial = state.connect_lock.lock().await;
    let generation = state.next_generation();

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
    let (tx, mut rx) = mpsc::unbounded_channel::<Outbound>();

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

    let write_task = tauri::async_runtime::spawn(async move {
        while let Some(outbound) = rx.recv().await {
            let result = match outbound {
                Outbound::Text(text) => write.send(Message::Text(text.into())).await,
                Outbound::Binary(bytes) => write.send(Message::Binary(bytes.into())).await,
            };
            if result.is_err() {
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
    send_payload(
        &app,
        serde_json::json!({
            "type": "chat",
            "from": "phone",
            "text": text,
            "ts": now_ms(),
        }),
    )
}

/// 手机端请求一次当前 AI 状态快照；桌面端收到后广播一条 status。
#[tauri::command]
pub fn send_status_request(app: tauri::AppHandle) -> Result<(), String> {
    send_payload(
        &app,
        serde_json::json!({
            "v": 1,
            "type": "status.request",
            "ts": now_ms(),
        }),
    )
}

/// 手机端请求电脑把某个会话对应的软件切到前台；结果走桌面的 focus.result。
///
/// 这里只做基本的非空/长度校验（与协议一致：requestId ≤64、source ≤32、
/// sessionId ≤128），真正的 source 映射与限频由桌面端负责。
#[tauri::command]
pub fn send_focus_request(
    app: tauri::AppHandle,
    source: String,
    session_id: String,
    request_id: String,
) -> Result<(), String> {
    let source = source.trim();
    let session_id = session_id.trim();
    let request_id = request_id.trim();
    if source.is_empty()
        || session_id.is_empty()
        || request_id.is_empty()
        || source.chars().count() > 32
        || session_id.chars().count() > 128
        || request_id.chars().count() > 64
    {
        return Err("唤起参数无效".to_string());
    }
    send_payload(
        &app,
        serde_json::json!({
            "v": 1,
            "type": "focus.request",
            "requestId": request_id,
            "source": source,
            "sessionId": session_id,
            "ts": now_ms(),
        }),
    )
}

/// 手机结果卡片的「回车 / 清空」：请求桌面在最近一次输入的目标应用里按一次键。
///
/// 只做参数非空/长度/枚举校验（session ≤128、requestId ≤64）；目标窗口、30 秒时效、
/// 限频与安全闸门全部由桌面端负责，手机无法指定应用或按键序列。
#[tauri::command]
pub fn send_key_request(
    app: tauri::AppHandle,
    session: String,
    action: String,
    request_id: String,
) -> Result<(), String> {
    let session = session.trim();
    let action = action.trim();
    let request_id = request_id.trim();
    if session.is_empty()
        || request_id.is_empty()
        || !matches!(action, "enter" | "clear")
        || session.chars().count() > 128
        || request_id.chars().count() > 64
    {
        return Err("按键参数无效".to_string());
    }
    send_payload(
        &app,
        serde_json::json!({
            "v": 1,
            "type": "key.request",
            "requestId": request_id,
            "session": session,
            "action": action,
            "ts": now_ms(),
        }),
    )
}

#[tauri::command]
pub fn mic_start(
    app: tauri::AppHandle,
    session: String,
    sample_rate: u32,
    frame_ms: u32,
) -> Result<(), String> {
    send_payload(
        &app,
        serde_json::json!({
            "v": 1,
            "type": "mic.start",
            "session": session,
            "codec": "pcm16",
            "sampleRate": sample_rate,
            "channels": 1,
            "frameMs": frame_ms,
            "maxMs": 60000,
            "ts": now_ms(),
        }),
    )
}

#[tauri::command]
pub fn mic_frame(
    app: tauri::AppHandle,
    session: String,
    sequence: u32,
    pcm: String,
) -> Result<(), String> {
    let bytes = STANDARD
        .decode(pcm)
        .map_err(|_| "音频数据无效".to_string())?;
    let frame = mic_protocol::build_audio_frame(&session, sequence, &bytes)?;
    send_binary(&app, frame)
}

#[tauri::command]
pub fn mic_stop(app: tauri::AppHandle, session: String, reason: String) -> Result<(), String> {
    if MicStopReason::parse(&reason).is_none() {
        return Err("无效的停止原因".to_string());
    }
    send_payload(
        &app,
        serde_json::json!({
            "v": 1,
            "type": "mic.stop",
            "session": session,
            "reason": reason,
            "ts": now_ms(),
        }),
    )
}
