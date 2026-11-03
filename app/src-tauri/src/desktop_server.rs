use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
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

use crate::app_focus::{self, FocusLimiter, FocusRequest};
use crate::asr_cloud::AsrCloudState;
use crate::asr_pricing::{self, Pricing};
use crate::asr_usage::UsageStore;
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
    clipboard: Arc<ClipboardManager>,
    hook: Arc<HookBridge>,
    asr_cloud: Arc<AsrCloudState>,
    usage: Arc<UsageStore>,
    /// 「一键唤起电脑」的全局 1.5s 限频。
    focus_limiter: Arc<FocusLimiter>,
}

struct ActiveMic {
    owner: u64,
    session: String,
    pcm: Vec<u8>,
    frames: u64,
    last_sequence: u32,
    started: Instant,
    front_app: Option<FrontApp>,
    pricing: Pricing,
    cloud: CloudHandle,
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
                        // focus.request 最先识别：它不进聊天广播，也不打印会话内容。
                        if kind == "focus.request" {
                            if let Some(request) = begin_focus_request(
                                &recv_state.tx,
                                &recv_state.focus_limiter,
                                &text,
                            ) {
                                let focus_state = recv_state.clone();
                                tokio::spawn(async move {
                                    finish_focus_request(focus_state, request).await;
                                });
                            }
                            continue;
                        }
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

/// 校验并受理一条 focus.request：非法请求回 bad_request，限频回 rate_limited，
/// 通过则返回待执行请求（真正的 `open` 在 [`finish_focus_request`] 里异步做）。
fn begin_focus_request(
    tx: &broadcast::Sender<String>,
    limiter: &FocusLimiter,
    text: &str,
) -> Option<FocusRequest> {
    let value: Value = match serde_json::from_str(text) {
        Ok(value) => value,
        Err(_) => return None,
    };
    // requestId 非法时无法回包关联，直接丢弃（不打印任何会话内容）。
    let Some(request_id) = app_focus::request_id_of(&value) else {
        eprintln!("[focus] 丢弃 requestId 非法的请求");
        return None;
    };
    let request = match app_focus::parse_focus_request(&value) {
        Ok(request) => request,
        Err(code) => {
            let _ = tx.send(
                app_focus::focus_result_json(&request_id, "dsh", false, Some(code), now_ms())
                    .to_string(),
            );
            return None;
        }
    };
    if !limiter.try_acquire(Instant::now()) {
        let _ = tx.send(
            app_focus::focus_result_json(
                &request.request_id,
                &request.source,
                false,
                Some("rate_limited"),
                now_ms(),
            )
            .to_string(),
        );
        return None;
    }
    Some(request)
}

/// 在阻塞线程里执行 `open -a`，再把 focus.result 广播给所有客户端。
async fn finish_focus_request(state: AppState, request: FocusRequest) {
    let source = request.source.clone();
    let launched = tokio::task::spawn_blocking(move || app_focus::activate(&source)).await;
    let (ok, error) = match launched {
        Ok(Ok(())) => (true, None),
        Ok(Err(code)) => (false, Some(code)),
        // 阻塞任务 panic/取消：按启动失败处理，手机可以重试。
        Err(_) => (false, Some("launch_failed")),
    };
    if let Some(code) = error {
        eprintln!("[focus] activate failed: {code}");
    }
    send_json(
        &state,
        app_focus::focus_result_json(&request.request_id, &request.source, ok, error, now_ms()),
    );
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

    let config = match state.asr_cloud.session_config() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("[mic] cloud not ready: {} ({})", error.code, error.message);
            send_json(state, mic_error(Some(&message.session), error.code));
            return;
        }
    };
    let model = config.model.clone();
    let pricing = asr_pricing::for_endpoint(&config.endpoint);
    let cloud = bailian_asr::spawn(config, message.session.clone(), state.tx.clone());
    let front_app = desktop_mic::front_app();

    {
        let mut mic = state.mic.lock().unwrap();
        if mic.is_some() {
            cloud.abort();
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
            pricing,
            cloud,
        });
    }

    println!(
        "[mic] start session={} engine=bailian model={model}",
        short_session(&message.session)
    );
    send_json(
        state,
        json!({
            "v": 1,
            "type": "mic.ready",
            "session": message.session,
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
        "[mic] stop session={} frames={} bytes={} seq={} transcribe={}",
        short_session(&active.session),
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
        active.cloud.abort();
        send_json(state, mic_state(&active.session, "cancelled"));
    }
}

struct SessionOutcome {
    outcome: &'static str,
    reason: Option<&'static str>,
    text: Option<String>,
    truncated: bool,
    usage: Option<bailian_asr::CloudUsage>,
}

impl SessionOutcome {
    fn failed(code: &'static str, usage: Option<bailian_asr::CloudUsage>) -> Self {
        Self {
            outcome: "failed",
            reason: Some(code),
            text: None,
            truncated: false,
            usage,
        }
    }
}

async fn finish_session(state: AppState, active: ActiveMic) {
    let session = active.session.clone();
    let started = Instant::now();
    let expected = active.front_app;
    let pricing = active.pricing;

    active.cloud.stop();
    let outcome = match active.cloud.wait().await {
        Ok(transcript) => {
            if let Some(usage) = transcript.usage.as_ref() {
                // 只要百炼返回了 usage 就计费入账，即使后续插入失败/空结果。
                state.usage.record(usage, pricing);
            }
            if transcript.text.trim().is_empty() {
                SessionOutcome::failed("empty_transcript", transcript.usage)
            } else {
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
                        usage: transcript.usage,
                    },
                    Err(failure) => {
                        eprintln!(
                            "[mic] insert failed: {} ({})",
                            failure.code, failure.message
                        );
                        SessionOutcome::failed(failure.code, transcript.usage)
                    }
                }
            }
        }
        Err(error) => {
            eprintln!("[mic] cloud failed: {} ({})", error.code, error.detail);
            SessionOutcome::failed(error.code, None)
        }
    };

    let latency = started.elapsed().as_millis() as u64;
    println!(
        "[mic] result session={} engine=bailian outcome={} reason={} latency={}ms",
        short_session(&session),
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

    if !active.cloud.send_frame(frame.payload.to_vec()) {
        eprintln!("[mic] cloud session closed while forwarding audio");
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
        active.cloud.abort();
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
    clipboard: Arc<ClipboardManager>,
    hook: Arc<HookBridge>,
    asr_cloud: Arc<AsrCloudState>,
    usage: Arc<UsageStore>,
) {
    let state = AppState {
        tx: hook.sender(),
        clients: Arc::new(AtomicUsize::new(0)),
        next_client: Arc::new(AtomicU64::new(1)),
        mic: Arc::new(Mutex::new(None)),
        clipboard,
        hook,
        asr_cloud,
        usage,
        focus_limiter: Arc::new(FocusLimiter::new()),
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

#[cfg(test)]
mod tests {
    use super::*;

    fn focus_channel() -> broadcast::Sender<String> {
        let (tx, _rx) = broadcast::channel(8);
        tx
    }

    fn focus_request_json(request_id: &str, source: &str, session_id: &str) -> String {
        serde_json::json!({
            "type": "focus.request",
            "v": 1,
            "requestId": request_id,
            "source": source,
            "sessionId": session_id,
            "ts": 1,
        })
        .to_string()
    }

    fn next_result(receiver: &mut broadcast::Receiver<String>) -> Value {
        serde_json::from_str(&receiver.try_recv().expect("应有 focus.result 广播")).unwrap()
    }

    #[test]
    fn focus_request_validates_fields_without_launching() {
        let tx = focus_channel();
        let limiter = FocusLimiter::new();
        let mut receiver = tx.subscribe();

        // 非 JSON / 缺 requestId：无法关联回包，直接丢弃。
        assert!(begin_focus_request(&tx, &limiter, "not-json").is_none());
        assert!(receiver.try_recv().is_err());
        assert!(begin_focus_request(&tx, &limiter, r#"{"type":"focus.request","v":1}"#).is_none());
        assert!(receiver.try_recv().is_err());

        // sessionId 超长：回 bad_request（带 requestId/source，不启动 App）。
        let long_session = "x".repeat(app_focus::MAX_SESSION_ID_CHARS + 1);
        assert!(
            begin_focus_request(
                &tx,
                &limiter,
                &focus_request_json("f-1", "dsh", &long_session)
            )
            .is_none()
        );
        let result = next_result(&mut receiver);
        assert_eq!(result["type"], "focus.result");
        assert_eq!(result["v"], 1);
        assert_eq!(result["requestId"], "f-1");
        assert_eq!(result["source"], "dsh");
        assert_eq!(result["ok"], false);
        assert_eq!(result["error"], "bad_request");
        assert!(result["ts"].as_u64().unwrap() > 0);

        // 协议版本不对也是 bad_request。
        let wrong_version = serde_json::json!({
            "type": "focus.request",
            "v": 2,
            "requestId": "f-2",
            "source": "dsh",
            "sessionId": "s-1",
            "ts": 1,
        })
        .to_string();
        assert!(begin_focus_request(&tx, &limiter, &wrong_version).is_none());
        let result = next_result(&mut receiver);
        assert_eq!(result["requestId"], "f-2");
        assert_eq!(result["error"], "bad_request");

        // 合法请求：校验通过并返回待执行请求（不会真的 open）。
        let request = begin_focus_request(
            &tx,
            &limiter,
            &focus_request_json("f-3", "dsh", "session-1"),
        )
        .expect("合法请求应受理");
        assert_eq!(request.request_id, "f-3");
        assert_eq!(request.source, "dsh");
        assert_eq!(request.session_id, "session-1");
    }

    #[test]
    fn focus_requests_are_rate_limited_globally() {
        let tx = focus_channel();
        let limiter = FocusLimiter::new();
        let mut receiver = tx.subscribe();

        assert!(
            begin_focus_request(&tx, &limiter, &focus_request_json("f-1", "dsh", "s-1")).is_some()
        );
        // 1.5s 内第二次：回 rate_limited，不再执行。
        assert!(
            begin_focus_request(&tx, &limiter, &focus_request_json("f-2", "dsh", "s-2")).is_none()
        );
        let result = next_result(&mut receiver);
        assert_eq!(result["requestId"], "f-2");
        assert_eq!(result["ok"], false);
        assert_eq!(result["error"], "rate_limited");
    }

    #[test]
    fn unknown_sources_are_accepted_here_and_rejected_by_activate() {
        // 长度合法但未知的 source 由 app_focus::activate 回 unsupported_source，
        // 这里只做字段校验，不应提前变成 bad_request。
        let tx = focus_channel();
        let limiter = FocusLimiter::new();
        let request = begin_focus_request(
            &tx,
            &limiter,
            &focus_request_json("f-1", "claude-code", "s-1"),
        )
        .expect("已知长度合法的 source 应受理");
        assert_eq!(request.source, "claude-code");
        assert_eq!(
            app_focus::activate_with(&request.source, &|_| Ok(())),
            Err("unsupported_source")
        );
    }
}
