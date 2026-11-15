use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairingData {
    device_id: String,
    #[serde(default)]
    token: Option<String>,
    #[serde(default)]
    desktop_id: Option<String>,
}

impl Default for PairingData {
    fn default() -> Self {
        Self {
            device_id: uuid::Uuid::new_v4().to_string(),
            token: None,
            desktop_id: None,
        }
    }
}

pub struct ClientState {
    conn: Mutex<Option<Conn>>,
    connect_lock: tokio::sync::Mutex<()>,
    generation: AtomicU64,
    /// 最近一次尝试/成功的地址；后台待命断线重连用它，不依赖 WebView。
    last_url: Mutex<Option<String>>,
    /// 扫码/配对换来的长期身份，存 App 私有目录；不经过 WebView。
    pairing: Mutex<PairingData>,
    pairing_path: PathBuf,
    /// 本次扫码带来的配对码；成功或失败后清掉。
    pending_code: Mutex<Option<String>>,
}

impl ClientState {
    pub fn new(app: &tauri::AppHandle) -> Self {
        let pairing_path = app
            .path()
            .app_data_dir()
            .map(|dir| dir.join("pairing.json"))
            .unwrap_or_else(|_| PathBuf::from("pairing.json"));
        let pairing = std::fs::read_to_string(&pairing_path)
            .ok()
            .and_then(|raw| serde_json::from_str::<PairingData>(&raw).ok())
            .filter(|data| !data.device_id.trim().is_empty())
            .unwrap_or_default();
        Self {
            conn: Mutex::new(None),
            connect_lock: tokio::sync::Mutex::new(()),
            generation: AtomicU64::new(0),
            last_url: Mutex::new(None),
            pairing: Mutex::new(pairing),
            pairing_path,
            pending_code: Mutex::new(None),
        }
    }

    fn save_pairing(&self) {
        let Ok(data) = self.pairing.lock().map(|data| data.clone()) else {
            return;
        };
        let Ok(raw) = serde_json::to_string_pretty(&data) else {
            return;
        };
        if let Some(parent) = self.pairing_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if std::fs::write(&self.pairing_path, raw).is_ok() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(
                    &self.pairing_path,
                    std::fs::Permissions::from_mode(0o600),
                );
            }
        }
    }

    fn set_pending_code(&self, code: Option<String>) {
        if let Ok(mut pending) = self.pending_code.lock() {
            *pending = code.filter(|value| !value.trim().is_empty());
        }
    }

    fn take_pending_code(&self) -> Option<String> {
        self.pending_code.lock().ok()?.take()
    }

    fn token(&self) -> Option<String> {
        self.pairing
            .lock()
            .ok()
            .and_then(|data| data.token.clone())
    }

    fn set_token(&self, token: String, desktop_id: Option<String>) {
        if let Ok(mut data) = self.pairing.lock() {
            data.token = Some(token);
            data.desktop_id = desktop_id;
        }
        self.save_pairing();
    }

    fn clear_token(&self) {
        if let Ok(mut data) = self.pairing.lock() {
            data.token = None;
            data.desktop_id = None;
        }
        self.save_pairing();
    }

    fn device_id(&self) -> String {
        self.pairing
            .lock()
            .map(|data| data.device_id.clone())
            .unwrap_or_default()
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

/// 语音备忘录（D115）：手机 → 电脑的配对/同步 JSON 消息。
pub fn send_memo_payload(
    app: &tauri::AppHandle,
    payload: serde_json::Value,
) -> Result<(), String> {
    send_payload(app, payload)
}

/// 语音备忘录同步：SK02 音频分块二进制帧。
pub fn send_memo_binary(app: &tauri::AppHandle, frame: Vec<u8>) -> Result<(), String> {
    send_binary(app, frame)
}

fn emit_offline(app: &tauri::AppHandle) {
    // 后台 WebView 可能冻结；emit 在后台可能卡住调用者（断线清理/重连循环）。
    if !crate::remote_mic::is_foreground(app) {
        return;
    }
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

fn proof_for(token: &str, nonce: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hasher.update(nonce.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// 扫码/长期 token 的客户端握手：桌面先发 auth.required(nonce)，手机证明身份后才允许数据。
async fn authenticate_mobile<S>(socket: &mut S, app: &tauri::AppHandle) -> Result<(), String>
where
    S: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error>
        + futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>>
        + Unpin,
{
    let first = tokio::time::timeout(Duration::from_secs(5), socket.next())
        .await
        .map_err(|_| "等待电脑鉴权超时".to_string())?
        .ok_or_else(|| "电脑没有响应鉴权".to_string())?
        .map_err(|error| format!("鉴权连接失败：{error}"))?;
    let Message::Text(text) = first else {
        return Err("电脑端鉴权格式不对，请更新桌面端".into());
    };
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "电脑端鉴权格式不对".to_string())?;
    if value.get("type").and_then(serde_json::Value::as_str) != Some("auth.required") {
        return Err("桌面端需要更新才能配对".into());
    }
    let nonce = value
        .get("nonce")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 128)
        .ok_or_else(|| "电脑端鉴权 nonce 无效".to_string())?;

    let state = app.state::<ClientState>();
    let device_id = state.device_id();
    let pending_code = state.take_pending_code();
    let token = state.token();
    let payload = if let Some(code) = pending_code {
        serde_json::json!({
            "v": 1, "type": "auth.pair", "code": code,
            "deviceId": device_id, "deviceName": "Sidekick 手机", "ts": 0,
        })
    } else if let Some(token) = token {
        serde_json::json!({
            "v": 1, "type": "auth.token", "deviceId": device_id,
            "proof": proof_for(&token, nonce), "ts": 0,
        })
    } else {
        return Err("这台电脑还没配对：请在电脑端打开「手机连接」扫二维码".into());
    };
    socket
        .send(Message::Text(payload.to_string().into()))
        .await
        .map_err(|error| format!("发送鉴权失败：{error}"))?;

    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err("等待电脑确认配对超时".into());
        }
        let message = tokio::time::timeout(remaining, socket.next())
            .await
            .map_err(|_| "等待电脑确认配对超时".to_string())?
            .ok_or_else(|| "电脑在鉴权时断开".to_string())?
            .map_err(|error| format!("鉴权失败：{error}"))?;
        let Message::Text(text) = message else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        match value.get("type").and_then(serde_json::Value::as_str) {
            Some("auth.ok") => {
                if let Some(new_token) = value.get("token").and_then(serde_json::Value::as_str) {
                    let desktop_id = value
                        .get("desktopId")
                        .and_then(serde_json::Value::as_str)
                        .map(str::to_string);
                    state.set_token(new_token.to_string(), desktop_id);
                }
                return Ok(());
            }
            Some("auth.error") => {
                let code = value
                    .get("code")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("");
                if code == "unauthorized" {
                    state.clear_token();
                }
                let message = value
                    .get("message")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("配对失败");
                return Err(message.to_string());
            }
            _ => {}
        }
    }
}

#[tauri::command]
pub async fn connect_server(
    app: tauri::AppHandle,
    addr: String,
    pair_code: Option<String>,
) -> Result<(), String> {
    let url = normalize_addr(&addr);
    let state = app.state::<ClientState>();
    state.set_pending_code(pair_code);
    if let Ok(mut last) = state.last_url.lock() {
        *last = Some(url.clone());
    }

    // 后台待命中 JS 可能被冻结，connectServer 任务会一直占着 connect_lock；
    // 给锁加超时，避免 Rust 自动重连被一个挂起的旧命令永久卡死。
    let _serial = match tokio::time::timeout(Duration::from_secs(6), state.connect_lock.lock()).await {
        Ok(guard) => guard,
        Err(_) => {
            eprintln!("[mobile] 连接忙：等待 connect_lock 超时");
            return Err("上一次连接还在进行，稍后重试".to_string());
        }
    };
    let generation = state.next_generation();

    {
        let mut guard = state.conn.lock().unwrap();
        if let Some(old) = guard.take() {
            old.cancel();
            println!("[mobile] 已取消旧连接");
        }
    }

    println!("[mobile] connecting to {url}");
    let (mut socket, _) = match tokio::time::timeout(CONNECT_TIMEOUT, connect_async(&url)).await {
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

    if let Err(error) = authenticate_mobile(&mut socket, &app).await {
        eprintln!("[mobile] 配对鉴权失败：{error}");
        emit_offline(&app);
        return Err(error);
    }

    let (mut write, mut read) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Outbound>();

    let read_app = app.clone();
    let read_generation = generation;
    let read_task = tauri::async_runtime::spawn(async move {
        while let Some(Ok(message)) = read.next().await {
            match message {
                Message::Text(text) => {
                    // 备忘录同步 ack 由 Rust 消费（落 synced_at），不进入聊天记录。
                    let text = text.to_string();
                    if crate::word::mobile::handle_server_message(&read_app, &text) {
                        continue;
                    }
                    if crate::memo::mobile::sync::handle_server_message(&read_app, &text) {
                        continue;
                    }
                    // 键盘遥控后台待命：Rust 先接管；未开启待命时仍交给 WebView 前台路径。
                    if crate::remote_mic::handle_server_message(&read_app, &text) {
                        continue;
                    }
                    if text.contains("\"type\":\"status\"") {
                        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
                            println!(
                                "[mobile] status recv state={} sessions={} list={}",
                                value.get("state").and_then(|item| item.as_str()).unwrap_or("-"),
                                value
                                    .get("sessions")
                                    .and_then(|item| item.as_u64())
                                    .unwrap_or(0),
                                value
                                    .get("sessionList")
                                    .and_then(|item| item.as_array())
                                    .map(|list| list.len())
                                    .unwrap_or(0),
                            );
                        }
                    }
                    let _ = read_app.emit("chat", text);
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
        crate::remote_mic::on_disconnect(&read_app);
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
    // 后台待命由 Rust 保活：先补发 status（桌面重新登记），再做可能卡住的 WebView emit。
    if crate::remote_mic::is_standby(&app) {
        let _ = send_remote_mic_status(app.clone(), true, Some(true));
    }
    if crate::remote_mic::is_foreground(&app) {
        let _ = app.emit("conn", serde_json::json!({ "online": true, "url": url }));
        // 连上后补一次英语角同步（未配对会静默跳过）；后台不碰 WebView。
        crate::word::mobile::kick(app.clone());
    }

    Ok(())
}

/// 手机 Rust 侧自己的连接状态；后台待命重连用，不依赖 WebView。
pub fn is_connected(app: &tauri::AppHandle) -> bool {
    app.state::<ClientState>()
        .conn
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

/// 最近一次连接地址（后台待命断线重连用）。
pub fn last_url(app: &tauri::AppHandle) -> Option<String> {
    app.state::<ClientState>()
        .last_url
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
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

/// 手机端请求一次 Token 用量快照；桌面端收到后广播一条 usage。
#[tauri::command]
pub fn send_usage_request(app: tauri::AppHandle, range: String) -> Result<(), String> {
    let range = match range.as_str() {
        "today" | "7d" | "30d" | "180d" => range,
        _ => return Err("用量区间无效".to_string()),
    };
    send_payload(
        &app,
        serde_json::json!({
            "v": 1,
            "type": "usage.request",
            "range": range,
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
    level: Option<f32>,
) -> Result<(), String> {
    let bytes = STANDARD
        .decode(pcm)
        .map_err(|_| "音频数据无效".to_string())?;
    send_mic_frame(&app, &session, sequence, &bytes, level)
}

/// 原生采集路径复用同一套 `SK01` 组帧与电平上报，避免两份协议实现。
pub fn send_mic_frame(
    app: &tauri::AppHandle,
    session: &str,
    sequence: u32,
    pcm: &[u8],
    level: Option<f32>,
) -> Result<(), String> {
    let frame = mic_protocol::build_audio_frame(session, sequence, pcm)?;
    send_binary(app, frame)?;

    // 电平跟着每帧一起送（约 8Hz）：桌面用它把顶部状态条的波形画成真的。
    if let Some(level) = level {
        let percent = (level.clamp(0.0, 1.0) * 100.0).round() as u32;
        send_payload(
            app,
            serde_json::json!({
                "v": 1,
                "type": "mic.level",
                "session": session,
                "level": percent,
                "ts": now_ms(),
            }),
        )?;
    }
    Ok(())
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

/// 手机 → 桌面：上报本机是否响应「电脑遥控录音」。
///
/// 桌面靠这条消息决定快捷键按下去时是「发命令」还是「弹未连接提示」；
/// `standby` 表示后台待命服务是否已挂起（手机切后台/锁屏也能开麦）。
#[tauri::command]
pub fn send_remote_mic_status(
    app: tauri::AppHandle,
    enabled: bool,
    standby: Option<bool>,
) -> Result<(), String> {
    send_payload(
        &app,
        serde_json::json!({
            "v": 1,
            "type": "mic.remote.status",
            "enabled": enabled,
            "standby": standby.unwrap_or(false),
            "ts": now_ms(),
        }),
    )
}

/// 手机 → 桌面：回执 `mic.remote` 命令（只带稳定错误码，不带任何内容）。
#[tauri::command]
pub fn send_remote_mic_ack(
    app: tauri::AppHandle,
    request_id: String,
    action: String,
    ok: bool,
    code: Option<String>,
) -> Result<(), String> {
    let request_id = request_id.trim();
    let action = action.trim();
    if request_id.is_empty()
        || request_id.chars().count() > 64
        || !matches!(action, "start" | "stop" | "cancel")
    {
        return Err("遥控参数无效".to_string());
    }
    let code = code.filter(|value| !value.trim().is_empty());
    send_payload(
        &app,
        serde_json::json!({
            "v": 1,
            "type": "mic.remote.ack",
            "requestId": request_id,
            "action": action,
            "ok": ok,
            "code": code,
            "ts": now_ms(),
        }),
    )
}
