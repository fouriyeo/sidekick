use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::Body;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{Value, json};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_util::io::ReaderStream;

use crate::asr_cloud::AsrCloudState;
use crate::asr_models::ModelManager;
use crate::bailian_asr::{self, CloudHandle};
use crate::clipboard_manager::ClipboardManager;
use crate::desktop_mic::{self, FrontApp};
use crate::discovery;
use crate::dsh_hook::HookBridge;
use crate::mic_protocol::{self, MicStartMessage, MicStopReason};

static MOBILE_PAGE: &str = include_str!("../mobile/index.html");
const APK_REL_PATH: &str =
    "gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk";
const MAX_SESSION_BYTES: usize = 2_200_000;
const MAX_SESSION_SECONDS: u64 = 65;
const SERVER_INFO_TIMEOUT: Duration = Duration::from_secs(3);
const SERVER_NOT_READY: &str = "电脑端服务还没起来，请点重试";

static BOUND_PORT: OnceLock<u16> = OnceLock::new();
static DISCOVERY_PORT_STATE: OnceLock<Option<u16>> = OnceLock::new();
static PORT_READY: tokio::sync::Notify = tokio::sync::Notify::const_new();

#[derive(Clone)]
struct AppState {
    tx: broadcast::Sender<String>,
    clients: Arc<AtomicUsize>,
    next_client: Arc<AtomicU64>,
    mic: Arc<Mutex<Option<ActiveMic>>>,
    models: Arc<ModelManager>,
    clipboard: Arc<ClipboardManager>,
    hook: Arc<HookBridge>,
    asr_cloud: Arc<AsrCloudState>,
}

struct ActiveMic {
    owner: u64,
    session: String,
    pcm: Vec<u8>,
    frames: u64,
    last_sequence: u32,
    started: Instant,
    front_app: Option<FrontApp>,
    engine: String,
    model: String,
    cloud: Option<CloudHandle>,
    /// 云端配置在会话开始时不可用、已静默改用本机时记录原因。
    start_fallback: Option<String>,
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
    let client_id = state.next_client.fetch_add(1, Ordering::Relaxed);
    let (mut sender, mut receiver) = socket.split();
    // 先订阅广播，再直发当前 AI 状态快照：新连接（手机/网页）立刻拿到四态，
    // 不会因为快照和广播的先后顺序丢状态。
    let mut rx = state.tx.subscribe();

    let count = state.clients.fetch_add(1, Ordering::SeqCst) + 1;
    println!("[ws] client connected ({count} online)");
    if sender
        .send(Message::Text(state.hook.snapshot_json().into()))
        .await
        .is_err()
    {
        println!("[ws] 发送 AI 状态快照失败，连接即将关闭");
    }
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

    let recv_state = state.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = receiver.next().await {
            match message {
                Message::Text(text) => {
                    let text = text.to_string();
                    if let Some(kind) = message_type(&text) {
                        if kind.starts_with("mic.") {
                            handle_mic_text(&recv_state, client_id, &text);
                            continue;
                        }
                        if kind == "status.request" {
                            // 手机要一次当前 AI 状态快照；广播给所有客户端即可。
                            let _ = recv_state.tx.send(recv_state.hook.snapshot_json());
                            continue;
                        }
                    }
                    println!("[ws] recv: {text}");
                    let _ = recv_state.tx.send(text);
                }
                Message::Binary(data) => {
                    handle_audio_frame(&recv_state, client_id, &data);
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

    cleanup_session(&state, client_id);
    let count = state.clients.fetch_sub(1, Ordering::SeqCst) - 1;
    println!("[ws] client disconnected ({count} online)");
    let _ = state
        .tx
        .send(system_message(format!("客户端断开，当前 {count} 个")));
}

fn message_type(text: &str) -> Option<String> {
    let value: Value = serde_json::from_str(text).ok()?;
    value
        .get("type")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn handle_mic_text(state: &AppState, client_id: u64, text: &str) {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return;
    };
    let Some(kind) = value.get("type").and_then(Value::as_str) else {
        return;
    };

    match kind {
        "mic.start" => handle_mic_start(state, client_id, &value),
        "mic.stop" => handle_mic_stop(state, client_id, &value),
        _ => {}
    }
}

fn handle_mic_start(state: &AppState, client_id: u64, value: &Value) {
    let message = match MicStartMessage::from_value(value) {
        Ok(message) => message,
        Err(_) => {
            send_json(state, mic_error(None, "bad_request"));
            return;
        }
    };

    let local_ready = state.models.selected_available();
    let local_model = state
        .models
        .selected_id()
        .unwrap_or_else(|| "whisper".to_string());

    let mut start_fallback: Option<String> = None;
    let (engine, model, cloud) = if state.asr_cloud.cloud_selected() {
        match state.asr_cloud.session_config(state.models.as_ref()) {
            Ok(config) => {
                let model = config.model.clone();
                let handle = bailian_asr::spawn(config, message.session.clone(), state.tx.clone());
                ("bailian".to_string(), model, Some(handle))
            }
            Err(error) if local_ready => {
                start_fallback = Some(error.code.to_string());
                println!(
                    "[mic] cloud unavailable ({}), fallback local: {}",
                    error.code, error.message
                );
                ("local".to_string(), local_model, None)
            }
            Err(error) => {
                send_json(state, mic_error(Some(&message.session), error.code));
                return;
            }
        }
    } else if local_ready {
        ("local".to_string(), local_model, None)
    } else {
        send_json(state, mic_error(Some(&message.session), "model_missing"));
        return;
    };

    let front_app = desktop_mic::front_app();
    {
        let mut mic = state.mic.lock().unwrap();
        if mic.is_some() {
            send_json(state, mic_error(Some(&message.session), "session_busy"));
            return;
        }
        *mic = Some(ActiveMic {
            owner: client_id,
            session: message.session.clone(),
            pcm: Vec::new(),
            frames: 0,
            last_sequence: 0,
            started: Instant::now(),
            front_app,
            engine: engine.clone(),
            model: model.clone(),
            cloud,
            start_fallback,
        });
    }

    println!(
        "[mic] start session={} engine={engine} model={model}",
        short_session(&message.session)
    );
    send_json(
        state,
        json!({
            "v": 1,
            "type": "mic.ready",
            "session": message.session,
            "engine": engine,
            "model": model,
            "ts": now_ms(),
        }),
    );
    send_json(state, mic_state(&message.session, "listening"));
}

fn handle_mic_stop(state: &AppState, client_id: u64, value: &Value) {
    let Some(session) = value.get("session").and_then(Value::as_str) else {
        return;
    };
    let Some(reason) = value
        .get("reason")
        .and_then(Value::as_str)
        .and_then(MicStopReason::parse)
    else {
        send_json(state, mic_error(Some(session), "bad_request"));
        return;
    };

    let active = {
        let mut mic = state.mic.lock().unwrap();
        match mic.as_ref() {
            Some(active) if active.owner == client_id && active.session == session => mic.take(),
            Some(_) => {
                send_json(state, mic_error(Some(session), "session_mismatch"));
                None
            }
            None => None,
        }
    };

    let Some(active) = active else {
        return;
    };

    println!(
        "[mic] stop session={} engine={} frames={} bytes={} seq={} transcribe={}",
        short_session(&active.session),
        active.engine,
        active.frames,
        active.pcm.len(),
        active.last_sequence,
        reason.should_transcribe()
    );

    if reason.should_transcribe() {
        send_json(state, mic_state(&active.session, "processing"));
        let state = state.clone();
        tokio::spawn(async move {
            finish_session(state, active).await;
        });
    } else {
        if let Some(cloud) = active.cloud.as_ref() {
            cloud.abort();
        }
        send_json(state, mic_state(&active.session, "cancelled"));
    }
}

struct SessionOutcome {
    outcome: &'static str,
    reason: Option<&'static str>,
    text: Option<String>,
    truncated: bool,
    engine: &'static str,
    model: String,
    fallback: bool,
    usage: Option<bailian_asr::CloudUsage>,
}

impl SessionOutcome {
    fn failed(
        code: &'static str,
        model: String,
        engine: &'static str,
        fallback: bool,
        usage: Option<bailian_asr::CloudUsage>,
    ) -> Self {
        Self {
            outcome: "failed",
            reason: Some(code),
            text: None,
            truncated: false,
            engine,
            model,
            fallback,
            usage,
        }
    }
}

async fn finish_session(state: AppState, active: ActiveMic) {
    let session = active.session.clone();
    let started = Instant::now();
    let expected = active.front_app;
    let start_fallback = active.start_fallback.clone();
    let fallback_allowed = state.asr_cloud.fallback_to_local();
    let local_ready = state.models.selected_available();
    let local_model = state
        .models
        .selected_id()
        .unwrap_or_else(|| "whisper".to_string());

    let outcome = if let Some(cloud) = active.cloud {
        cloud.stop();
        match cloud.wait().await {
            Ok(transcript) if !transcript.text.trim().is_empty() => {
                match desktop_mic::insert_transcript(
                    &state.clipboard,
                    &transcript.text,
                    transcript.truncated,
                    expected.as_ref(),
                ) {
                    Ok(insert) => SessionOutcome {
                        outcome: insert.outcome,
                        reason: insert.reason,
                        text: Some(insert.text),
                        truncated: insert.truncated,
                        engine: "bailian",
                        model: active.model.clone(),
                        fallback: false,
                        usage: transcript.usage,
                    },
                    Err(failure) => SessionOutcome::failed(
                        failure.code,
                        active.model.clone(),
                        "bailian",
                        false,
                        transcript.usage,
                    ),
                }
            }
            Ok(_) => {
                if fallback_allowed && local_ready {
                    println!("[mic] cloud returned empty transcript, fallback local");
                    local_fallback(&state, active.pcm, expected, local_model.clone()).await
                } else {
                    SessionOutcome::failed(
                        "empty_transcript",
                        active.model.clone(),
                        "bailian",
                        false,
                        None,
                    )
                }
            }
            Err(error) => {
                eprintln!("[mic] cloud failed: {} ({})", error.code, error.detail);
                if fallback_allowed && local_ready {
                    local_fallback(&state, active.pcm, expected, local_model.clone()).await
                } else {
                    SessionOutcome::failed(error.code, active.model.clone(), "bailian", false, None)
                }
            }
        }
    } else {
        match run_local(&state, active.pcm, expected).await {
            Ok(insert) => SessionOutcome {
                outcome: insert.outcome,
                reason: insert.reason,
                text: Some(insert.text),
                truncated: insert.truncated,
                engine: "local",
                model: local_model,
                fallback: start_fallback.is_some(),
                usage: None,
            },
            Err(failure) => {
                eprintln!("[mic] local failed: {} ({})", failure.code, failure.message);
                SessionOutcome::failed(
                    failure.code,
                    active.model.clone(),
                    "local",
                    start_fallback.is_some(),
                    None,
                )
            }
        }
    };

    let latency = started.elapsed().as_millis() as u64;
    println!(
        "[mic] result session={} engine={} fallback={} outcome={} reason={} latency={}ms",
        short_session(&session),
        outcome.engine,
        outcome.fallback,
        outcome.outcome,
        outcome.reason.unwrap_or("ok"),
        latency
    );

    let usage = outcome
        .usage
        .as_ref()
        .and_then(|usage| serde_json::to_value(usage).ok());

    send_json(
        &state,
        json!({
            "v": 1,
            "type": "mic.result",
            "session": session,
            "outcome": outcome.outcome,
            "reason": outcome.reason,
            "text": outcome.text,
            "truncated": outcome.truncated,
            "latencyMs": latency,
            "engine": outcome.engine,
            "model": outcome.model,
            "fallback": outcome.fallback,
            "usage": usage,
            "ts": now_ms(),
        }),
    );
    send_json(
        &state,
        mic_state(
            &session,
            if outcome.outcome == "failed" {
                "error"
            } else {
                "delivered"
            },
        ),
    );
}

async fn local_fallback(
    state: &AppState,
    pcm: Vec<u8>,
    expected: Option<FrontApp>,
    model: String,
) -> SessionOutcome {
    match run_local(state, pcm, expected).await {
        Ok(insert) => SessionOutcome {
            outcome: insert.outcome,
            reason: insert.reason,
            text: Some(insert.text),
            truncated: insert.truncated,
            engine: "local",
            model,
            fallback: true,
            usage: None,
        },
        Err(failure) => {
            eprintln!(
                "[mic] local fallback failed: {} ({})",
                failure.code, failure.message
            );
            SessionOutcome::failed(failure.code, model, "local", true, None)
        }
    }
}

async fn run_local(
    state: &AppState,
    pcm: Vec<u8>,
    expected: Option<FrontApp>,
) -> Result<desktop_mic::MicInsertResult, desktop_mic::MicFailure> {
    let models = Arc::clone(&state.models);
    let clipboard = Arc::clone(&state.clipboard);
    let cancel = Arc::new(AtomicBool::new(false));
    let task_cancel = Arc::clone(&cancel);
    let join = tokio::task::spawn_blocking(move || {
        desktop_mic::transcribe_and_insert(
            &models,
            &clipboard,
            &pcm,
            expected.as_ref(),
            &task_cancel,
        )
    });

    match tokio::time::timeout(Duration::from_secs(10), join).await {
        Ok(Ok(result)) => result,
        Ok(Err(error)) => Err(desktop_mic::MicFailure {
            code: "asr_failed",
            message: format!("worker failed: {error}"),
        }),
        Err(_) => {
            cancel.store(true, Ordering::Relaxed);
            Err(desktop_mic::MicFailure {
                code: "asr_timeout",
                message: "转写超时".to_string(),
            })
        }
    }
}

fn handle_audio_frame(state: &AppState, client_id: u64, data: &[u8]) {
    let frame = match mic_protocol::parse_audio_frame(data) {
        Ok(frame) => frame,
        Err(error) => {
            println!("[mic] rejected frame: {error:?}");
            return;
        }
    };

    let mut mic = state.mic.lock().unwrap();
    let Some(active) = mic.as_mut() else {
        return;
    };
    if active.owner != client_id || active.session != frame.session_string() {
        return;
    }
    if active.started.elapsed() > Duration::from_secs(MAX_SESSION_SECONDS) {
        return;
    }
    if active.pcm.len() + frame.payload.len() > MAX_SESSION_BYTES {
        return;
    }

    active.pcm.extend_from_slice(frame.payload);
    active.frames += 1;
    active.last_sequence = frame.sequence;
    let _last_flag = frame.flags & 0x01;

    if let Some(cloud) = active.cloud.as_ref() {
        if !cloud.send_frame(frame.payload.to_vec()) {
            eprintln!("[mic] cloud session closed while forwarding audio");
        }
    }
}

fn cleanup_session(state: &AppState, client_id: u64) {
    let active = {
        let mut mic = state.mic.lock().unwrap();
        match mic.as_ref() {
            Some(active) if active.owner == client_id => mic.take(),
            _ => None,
        }
    };

    if let Some(active) = active {
        println!(
            "[mic] session cancelled on disconnect session={}",
            short_session(&active.session)
        );
        if let Some(cloud) = active.cloud.as_ref() {
            cloud.abort();
        }
        send_json(state, mic_state(&active.session, "cancelled"));
    }
}

fn send_json(state: &AppState, value: Value) {
    let _ = state.tx.send(value.to_string());
}

fn mic_state(session: &str, state: &str) -> Value {
    json!({
        "v": 1,
        "type": "mic.state",
        "session": session,
        "state": state,
        "ts": now_ms(),
    })
}

fn mic_error(session: Option<&str>, code: &str) -> Value {
    json!({
        "v": 1,
        "type": "mic.error",
        "session": session,
        "code": code,
        "ts": now_ms(),
    })
}

fn short_session(session: &str) -> &str {
    session.get(0..8).unwrap_or("?")
}

fn system_message(text: String) -> String {
    serde_json::json!({ "type": "system", "text": text }).to_string()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub async fn start(
    models: Arc<ModelManager>,
    clipboard: Arc<ClipboardManager>,
    hook: Arc<HookBridge>,
    asr_cloud: Arc<AsrCloudState>,
) {
    let state = AppState {
        tx: hook.sender(),
        clients: Arc::new(AtomicUsize::new(0)),
        next_client: Arc::new(AtomicU64::new(1)),
        mic: Arc::new(Mutex::new(None)),
        models,
        clipboard,
        hook,
        asr_cloud,
    };
    let app = Router::new()
        .route("/", get(mobile_page))
        .route("/ws", get(ws_handler))
        .route("/download/apk", get(download_apk))
        .with_state(state);

    for port in discovery::SERVICE_PORTS {
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        let listener = match TcpListener::bind(addr).await {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("[server] 端口 {port} 绑定失败: {error}，尝试下一个候选端口");
                continue;
            }
        };

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
            eprintln!("[discovery] UDP 响应器未启动，手机将无法自动发现（discoveryPort = null）");
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
