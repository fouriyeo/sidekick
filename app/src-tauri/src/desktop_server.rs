use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
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

use crate::app_focus::{self, FocusLimiter, FocusRequest, IntervalLimiter};
use crate::asr_cloud::AsrCloudState;
use crate::asr_pricing::{self, Pricing};
use crate::asr_usage::UsageStore;
use crate::bailian_asr::{self, CloudHandle};
use crate::clipboard_manager::ClipboardManager;
use crate::desktop_keys::{self, KeyAction, KeyRegistry};
use crate::desktop_mic::{self, FrontApp};
use crate::discovery;
use crate::dsh_hook::HookBridge;
use crate::mic_protocol::{self, MicStartMessage, MicStopReason};
use crate::token_usage::TokenUsageStore;

static MOBILE_PAGE: &str = include_str!("../mobile/index.html");
// 编译期嵌入的 Android 安装包（由 build.rs 生成；没打过安卓包时为 None）。
include!(concat!(env!("OUT_DIR"), "/embedded_apk.rs"));
/// 旧环境兜底：仓库里的 debug 构建产物（release 包不可用时才用）。
const DEBUG_APK_REL_PATH: &str =
    "gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk";
const APK_FILE_NAME: &str = "Sidekick-Android.apk";
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
    token_usage: Arc<TokenUsageStore>,
    /// 「一键唤起电脑」的全局 1.5s 限频。
    focus_limiter: Arc<FocusLimiter>,
    /// 结果卡片手动按键：最近一次「插入成功」的目标窗口。
    keys: Arc<KeyRegistry>,
    /// 结果卡片手动按键的 500ms 限频。
    key_limiter: Arc<IntervalLimiter>,
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

/// 虚拟/隧道网卡前缀：VPN（utun）、桥接、AirDrop 等地址不该出现在二维码里。
const VIRTUAL_INTERFACE_PREFIXES: [&str; 8] =
    ["utun", "gif", "stf", "bridge", "awdl", "llw", "anpi", "ap"];

fn is_virtual_interface(name: &str) -> bool {
    VIRTUAL_INTERFACE_PREFIXES
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

/// 从网卡列表里挑一个局域网可用的 IPv4：物理网卡（en*）优先，其次是其他非虚拟
/// 接口；回环/自分配地址/虚拟接口都跳过。这样开了 VPN 时也不会把隧道地址当成本机地址。
fn pick_lan_ip(interfaces: impl IntoIterator<Item = (String, IpAddr)>) -> Option<IpAddr> {
    let mut best: Option<(u8, IpAddr)> = None;
    for (name, ip) in interfaces {
        let IpAddr::V4(ipv4) = ip else {
            continue;
        };
        if ipv4.is_loopback() || ipv4.is_link_local() || ipv4.is_unspecified() {
            continue;
        }
        if is_virtual_interface(&name) {
            continue;
        }
        let score = if name.starts_with("en") { 0 } else { 1 };
        if best.is_none_or(|(best_score, _)| score < best_score) {
            best = Some((score, ip));
        }
    }
    best.map(|(_, ip)| ip)
}

/// 本机对外的局域网 IPv4（IP 不写死，每次启动按网卡实时取）。
fn local_ip() -> String {
    local_ip_address::list_afinet_netifas()
        .ok()
        .and_then(pick_lan_ip)
        .map(|ip| ip.to_string())
        .or_else(|| local_ip_address::local_ip().ok().map(|ip| ip.to_string()))
        .unwrap_or_else(|| "127.0.0.1".to_string())
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

/// app 包里的资源目录（打包后是 `Sidekick.app/Contents/Resources`）；开发态返回 None。
fn bundle_resources_dir() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let macos = exe.parent()?;
    if macos.file_name()? != "MacOS" {
        return None;
    }
    let resources = macos.parent()?.join("Resources");
    resources.is_dir().then_some(resources)
}

/// 手机安装包候选路径（按优先级）：
/// 1. `SIDEKICK_APK_PATH`：本地调试自定义；
/// 2. app 包 Resources 里的安装包（以后打进去时不用改代码）；
/// 3. 仓库 `release/Sidekick-Android.apk`：开发机上通常比嵌入副本新；
/// 4. 旧的 debug 构建产物：只给没有 release 包的老环境兜底。
fn apk_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = std::env::var_os("SIDEKICK_APK_PATH") {
        candidates.push(PathBuf::from(path));
    }
    if let Some(resources) = bundle_resources_dir() {
        candidates.push(resources.join(APK_FILE_NAME));
    }
    let repo = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    candidates.push(repo.join("release").join(APK_FILE_NAME));
    candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join(DEBUG_APK_REL_PATH));
    candidates
}

fn apk_response(body: Body, length: u64) -> Response {
    let mut response = body.into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/vnd.android.package-archive"),
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"Sidekick-Android.apk\""),
    );
    // Content-Length 让手机浏览器能显示进度、也便于断点判断（不支持 Range）。
    headers.insert(header::CONTENT_LENGTH, HeaderValue::from(length));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

fn apk_not_found() -> Response {
    const PAGE: &str = r#"<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>安装包还没准备好</title></head>
  <body style="font-family:-apple-system,'PingFang SC',sans-serif;background:#0f1115;color:#e8eaf0;padding:24px;line-height:1.7">
    <h1 style="font-size:18px;margin:0 0 8px">安装包还没准备好</h1>
    <p style="font-size:14px;color:#8a90a0;margin:0">电脑端没找到 Android 安装包。请在项目里执行
      <code style="color:#aab0c0">scripts/package-android.sh</code> 重新打包后再刷新本页。</p>
  </body>
</html>"#;
    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        PAGE,
    )
        .into_response()
}

async fn download_apk() -> Response {
    for path in apk_candidates() {
        let Ok(metadata) = tokio::fs::metadata(&path).await else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let Ok(file) = tokio::fs::File::open(&path).await else {
            continue;
        };
        println!("[server] 下发 Android 安装包 {}", path.display());
        return apk_response(Body::from_stream(ReaderStream::new(file)), metadata.len());
    }

    // 磁盘上都没有时用编译期嵌入的那份：换电脑 / 源码目录被移走也能下载。
    if let Some(bytes) = EMBEDDED_APK {
        println!(
            "[server] 下发 Android 安装包（编译期嵌入，{} 字节）",
            bytes.len()
        );
        return apk_response(Body::from(bytes), bytes.len() as u64);
    }

    eprintln!("[server] 找不到 Android 安装包，/download/apk 返回 404");
    apk_not_found()
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
    // 首用清单 ③④：手机拿不到电脑端真实状态，只能固定显示「在电脑上完成」。
    // 这里在 hook 快照之后直发一条 desktop.status（只含布尔与时间戳，不含 Key/掩码/路径）。
    let asr_status = state.asr_cloud.status();
    let desktop_status = desktop_status_message(
        asr_status.configured,
        asr_status.has_key,
        desktop_mic::accessibility_trusted(),
    );
    if sender
        .send(Message::Text(desktop_status.into()))
        .await
        .is_err()
    {
        println!("[ws] 发送桌面状态快照失败，连接即将关闭");
    }
    let _ = state.tx.send(system_message_with_clients(
        format!("客户端已连接，当前 {count} 个"),
        count,
    ));

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
                        // 控制类消息最先识别：它们不进聊天广播，也不打印会话内容。
                        if kind == "key.request" {
                            // 结果卡片的手动按键：不进聊天广播，也不打印任何内容。
                            handle_key_request(&recv_state, client_id, &text);
                            continue;
                        }
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
                            // 同时补一条电脑端真实状态（首用清单 ③④），只含布尔与时间戳。
                            let asr = recv_state.asr_cloud.status();
                            let _ = recv_state.tx.send(desktop_status_message(
                                asr.configured,
                                asr.has_key,
                                desktop_mic::accessibility_trusted(),
                            ));
                            continue;
                        }
                        if kind == "usage.request" {
                            // 手机用量页打开/切区间时请求一次；只广播聚合快照，
                            // 不包含提示词、路径或 cwd。模型名按 D83 开关决定是否下发。
                            let range = serde_json::from_str::<serde_json::Value>(&text)
                                .ok()
                                .and_then(|value| {
                                    value
                                        .get("range")
                                        .and_then(|range| range.as_str())
                                        .map(|range| range.to_string())
                                })
                                .unwrap_or_else(|| "7d".to_string());
                            let store = recv_state.token_usage.clone();
                            let tx = recv_state.tx.clone();
                            tokio::task::spawn_blocking(move || {
                                let snapshot = store.stats(&range).mobile_json();
                                let _ = tx.send(
                                    serde_json::json!({
                                        "type": "usage",
                                        "v": 1,
                                        "ts": now_ms(),
                                        "data": snapshot,
                                    })
                                    .to_string(),
                                );
                            });
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
    let _ = state.tx.send(system_message_with_clients(
        format!("客户端断开，当前 {count} 个"),
        count,
    ));
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

/// 通过校验、等待执行的按键请求。
struct PendingKey {
    request_id: String,
    action: KeyAction,
    session: String,
    expected_app: FrontApp,
}

fn reply_key_error(
    tx: &broadcast::Sender<String>,
    request_id: &str,
    action: KeyAction,
    code: &str,
) {
    let _ = tx.send(
        desktop_keys::key_result_json(request_id, action, false, Some(code), now_ms()).to_string(),
    );
}

/// 回包里的 action：解析不到就用 enter 占位（只影响错误回包字段）。
fn action_hint(value: &Value) -> KeyAction {
    value
        .get("action")
        .and_then(Value::as_str)
        .and_then(KeyAction::parse)
        .unwrap_or(KeyAction::Enter)
}

/// 校验并受理一条 key.request：非法请求回 bad_request，限频回 rate_limited，
/// 没有可操作目标回 no_target / session_mismatch；通过则返回待执行请求。
///
/// 真正的按键合成在 [`handle_key_request`] 的阻塞线程里做，单测只覆盖到这里。
fn begin_key_request(
    tx: &broadcast::Sender<String>,
    limiter: &IntervalLimiter,
    registry: &KeyRegistry,
    client_id: u64,
    text: &str,
) -> Option<PendingKey> {
    let value: Value = match serde_json::from_str(text) {
        Ok(value) => value,
        Err(_) => return None,
    };
    // requestId 非法时无法回包关联，直接丢弃（不打印任何内容）。
    let Some(request_id) = app_focus::request_id_of(&value) else {
        eprintln!("[key] 丢弃 requestId 非法的请求");
        return None;
    };
    // 出错时 action 只用于回包字段，取不到就按 enter 占位。
    let action_hint = action_hint(&value);

    let request = match desktop_keys::parse_key_request(&value) {
        Ok(request) => request,
        Err(code) => {
            reply_key_error(tx, &request_id, action_hint, code);
            return None;
        }
    };
    if !limiter.try_acquire(Instant::now()) {
        reply_key_error(tx, &request.request_id, request.action, "rate_limited");
        return None;
    }
    let expected_app = match registry.authorize(client_id, &request.session, Instant::now()) {
        Ok(app) => app,
        Err(code) => {
            reply_key_error(tx, &request.request_id, request.action, code);
            return None;
        }
    };
    Some(PendingKey {
        request_id: request.request_id,
        action: request.action,
        session: request.session,
        expected_app,
    })
}

/// 在阻塞线程里合成按键，再把 key.result 广播给所有客户端。
fn handle_key_request(state: &AppState, client_id: u64, text: &str) {
    if !desktop_keys::supported() {
        // 目前只有 macOS 桌面支持合成按键；仍要用 requestId 回包。
        if let Ok(value) = serde_json::from_str::<Value>(text) {
            if let Some(request_id) = app_focus::request_id_of(&value) {
                reply_key_error(
                    &state.tx,
                    &request_id,
                    action_hint(&value),
                    "unsupported_platform",
                );
            }
        }
        return;
    }

    let Some(pending) =
        begin_key_request(&state.tx, &state.key_limiter, &state.keys, client_id, text)
    else {
        return;
    };

    let tx = state.tx.clone();
    let registry = state.keys.clone();
    tokio::task::spawn_blocking(move || {
        let PendingKey {
            request_id,
            action,
            session,
            expected_app,
        } = pending;
        let gates = desktop_keys::KeyGates {
            current_app: desktop_mic::front_app(),
            secure_input: desktop_mic::secure_input_enabled(),
            accessibility: desktop_mic::accessibility_trusted(),
        };
        let same_app = gates
            .current_app
            .as_ref()
            .is_some_and(|current| expected_app.same_as(current));
        let result = desktop_keys::execute(action, &expected_app, &gates, &|strokes| {
            desktop_keys::post_sequence(strokes)
        });

        match &result {
            Ok(()) => {
                // 成功一次即作废，避免重复事件/重复回车。
                registry.consume(client_id, &session);
                println!(
                    "[key] action={} outcome=ok same_app={same_app}",
                    action.as_str()
                );
            }
            Err(code) => {
                eprintln!(
                    "[key] action={} outcome={code} same_app={same_app} secure={} trusted={}",
                    action.as_str(),
                    gates.secure_input,
                    gates.accessibility
                );
            }
        }

        let _ = tx.send(
            desktop_keys::key_result_json(
                &request_id,
                action,
                result.is_ok(),
                result.err(),
                now_ms(),
            )
            .to_string(),
        );
    });
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
        "mic.cancel" => handle_mic_cancel(state, &value),
        _ => {}
    }
}

/// 同端重复 `mic.start` 时的处理策略。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StartAction {
    /// 当前没有 active 会话，直接接受。
    Accept,
    /// 同一个客户端重新开始：以最新会话为准，旧会话中止。
    Replace,
    /// 另一个客户端正在录音：返回 session_busy，不抢会话。
    Busy,
}

fn resolve_mic_start(active_owner: Option<u64>, client_id: u64) -> StartAction {
    match active_owner {
        None => StartAction::Accept,
        Some(owner) if owner == client_id => StartAction::Replace,
        Some(_) => StartAction::Busy,
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

    let replaced = {
        let mut mic = state.mic.lock().unwrap();
        let action = resolve_mic_start(mic.as_ref().map(|active| active.owner), client_id);
        if action == StartAction::Busy {
            drop(mic);
            cloud.abort();
            send_json(state, mic_error(Some(&message.session), "session_busy"));
            return;
        }

        let old = if action == StartAction::Replace {
            mic.take()
        } else {
            None
        };
        let old_session = old.as_ref().map(|active| active.session.clone());
        if let Some(old) = old {
            old.cloud.abort();
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
        old_session
    };

    if let Some(old_session) = replaced {
        println!(
            "[mic] replaced stale session old={} new={}",
            short_session(&old_session),
            short_session(&message.session)
        );
        send_json(state, mic_state(&old_session, "cancelled"));
    }

    // 看门狗：正常路径手机会在 60 秒前发 stop；这里兜底「手机卡死/停止消息丢失」。
    spawn_mic_watchdog(state, message.session.clone(), message.max_ms);

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
        // 取消是安全方向：没有 active 时也广播一次 cancelled，清掉可能残留的浮层。
        if reason == MicStopReason::Cancel {
            send_json(state, mic_state(session, "cancelled"));
        }
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

/// 人工取消当前录音：不限制 owner（桌面 UI 是另一个回环客户端），
/// 也允许 session 已过期时兜底清理——取消是安全方向。
fn handle_mic_cancel(state: &AppState, value: &Value) {
    let requested = value.get("session").and_then(Value::as_str).unwrap_or("");

    if let Some(active) = take_active(state, None) {
        println!(
            "[mic] host cancel session={}",
            short_session(&active.session)
        );
        active.cloud.abort();
        send_json(state, mic_state(&active.session, "cancelled"));
        send_json(state, mic_cancel(&active.session, "desktop"));
        return;
    }

    if requested.is_empty() {
        return;
    }

    // 没有 active 也回一次：让可能卡住的桌面浮层/手机本地采集自愈。
    send_json(state, mic_state(requested, "cancelled"));
    send_json(state, mic_cancel(requested, "desktop"));
}

/// 取当前 active 会话；`expected` 非空时只在 session 匹配时取走。
fn take_active(state: &AppState, expected: Option<&str>) -> Option<ActiveMic> {
    let mut mic = state.mic.lock().unwrap();
    let matches = mic
        .as_ref()
        .map(|active| expected.is_none_or(|session| active.session == session))
        .unwrap_or(false);
    if matches { mic.take() } else { None }
}

/// 看门狗：`maxMs + 3s` 内没等到 stop 就中止会话并广播权威取消。
fn spawn_mic_watchdog(state: &AppState, session: String, max_ms: u32) {
    let state = state.clone();
    let delay = Duration::from_millis(u64::from(max_ms) + 3_000);
    tokio::spawn(async move {
        tokio::time::sleep(delay).await;
        let Some(active) = take_active(&state, Some(&session)) else {
            return;
        };
        println!(
            "[mic] watchdog cancel session={}",
            short_session(&active.session)
        );
        active.cloud.abort();
        send_json(&state, mic_state(&active.session, "cancelled"));
        send_json(&state, mic_cancel(&active.session, "timeout"));
    });
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
    let owner = active.owner;
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
                    Ok(insert) => {
                        // 只有真正插入成功才有可操作目标；结果卡片上的「回车/清空」
                        // 会校验 owner、会话与 30 秒时效，再核对前台应用。
                        if insert.outcome == "inserted" {
                            if let Some(app) = expected.clone() {
                                state.keys.record(owner, &session, app, Instant::now());
                            }
                        }
                        SessionOutcome {
                            outcome: insert.outcome,
                            reason: insert.reason,
                            text: Some(insert.text),
                            truncated: insert.truncated,
                            usage: transcript.usage,
                        }
                    }
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
    // 断开后不再允许该连接触发按键，避免目标记录过期后仍被复用。
    state.keys.clear_owner(client_id);

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

/// 桌面端权威取消：手机/UI 收到后停止采集并清空录音状态。
fn mic_cancel(session: &str, reason: &str) -> Value {
    json!({
        "v": 1,
        "type": "mic.cancel",
        "session": session,
        "reason": reason,
        "ts": now_ms(),
    })
}

fn short_session(session: &str) -> &str {
    session.get(0..8).unwrap_or("?")
}

fn system_message(text: String) -> String {
    serde_json::json!({ "type": "system", "text": text }).to_string()
}

/// 连接/断开用：附带在线客户端数（可选字段，旧客户端忽略）。
fn system_message_with_clients(text: String, clients: usize) -> String {
    serde_json::json!({ "type": "system", "text": text, "clients": clients }).to_string()
}

/// 桌面 → 手机：首用清单 ③（百炼 Key）与 ④（辅助功能）的真实状态。
///
/// 只下发布尔值与时间戳，**绝不包含 API Key、掩码、文件路径、提示词**；
/// 字段名按协议固定为 camelCase 字面量，便于单测与旧客户端忽略未知消息。
fn desktop_status_message(
    asr_configured: bool,
    asr_has_key: bool,
    accessibility_trusted: bool,
) -> String {
    serde_json::json!({
        "type": "desktop.status",
        "v": 1,
        "asrConfigured": asr_configured,
        "asrHasKey": asr_has_key,
        "accessibilityTrusted": accessibility_trusted,
        "ts": now_ms(),
    })
    .to_string()
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
    token_usage: Arc<TokenUsageStore>,
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
        token_usage,
        focus_limiter: Arc::new(FocusLimiter::focus()),
        keys: Arc::new(KeyRegistry::new()),
        key_limiter: Arc::new(IntervalLimiter::with_interval(
            desktop_keys::KEY_MIN_INTERVAL,
        )),
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

    fn v4(a: u8, b: u8, c: u8, d: u8) -> IpAddr {
        IpAddr::V4(std::net::Ipv4Addr::new(a, b, c, d))
    }

    #[test]
    fn pick_lan_ip_prefers_physical_interface_over_vpn() {
        let interfaces = vec![
            ("utun3".to_string(), v4(10, 8, 0, 2)),
            ("bridge0".to_string(), v4(192, 168, 64, 1)),
            ("awdl0".to_string(), v4(169, 254, 10, 2)),
            ("anpi0".to_string(), v4(169, 254, 20, 2)),
            ("en1".to_string(), v4(192, 168, 3, 14)),
        ];
        assert_eq!(pick_lan_ip(interfaces), Some(v4(192, 168, 3, 14)));
    }

    #[test]
    fn pick_lan_ip_skips_unusable_addresses() {
        let interfaces = vec![
            ("lo0".to_string(), v4(127, 0, 0, 1)),
            ("en0".to_string(), v4(169, 254, 3, 9)),
            ("utun0".to_string(), v4(10, 0, 0, 1)),
        ];
        assert_eq!(pick_lan_ip(interfaces), None);
    }

    #[test]
    fn pick_lan_ip_accepts_non_en_physical_interface() {
        let interfaces = vec![
            ("utun0".to_string(), v4(10, 8, 0, 6)),
            ("eth0".to_string(), v4(192, 168, 1, 20)),
        ];
        assert_eq!(pick_lan_ip(interfaces), Some(v4(192, 168, 1, 20)));
    }

    #[test]
    fn apk_response_sets_download_headers() {
        let response = apk_response(Body::empty(), 7_379_538);
        let headers = response.headers();
        assert_eq!(
            headers.get(header::CONTENT_TYPE).unwrap(),
            "application/vnd.android.package-archive"
        );
        assert_eq!(
            headers.get(header::CONTENT_DISPOSITION).unwrap(),
            "attachment; filename=\"Sidekick-Android.apk\""
        );
        assert_eq!(headers.get(header::CONTENT_LENGTH).unwrap(), "7379538");
    }

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
        let limiter = FocusLimiter::focus();
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
        let limiter = FocusLimiter::focus();
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
        let limiter = FocusLimiter::focus();
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

    fn key_request_json(request_id: &str, session: &str, action: &str) -> String {
        serde_json::json!({
            "type": "key.request",
            "v": 1,
            "requestId": request_id,
            "session": session,
            "action": action,
            "ts": 1,
        })
        .to_string()
    }

    fn key_limiter() -> IntervalLimiter {
        IntervalLimiter::with_interval(desktop_keys::KEY_MIN_INTERVAL)
    }

    fn target_app() -> FrontApp {
        FrontApp {
            bundle_id: Some("com.other".to_string()),
            name: Some("Other".to_string()),
        }
    }

    fn key_registry(owner: u64, session: &str) -> KeyRegistry {
        let registry = KeyRegistry::new();
        registry.record(owner, session, target_app(), Instant::now());
        registry
    }

    #[test]
    fn key_request_requires_a_recent_insert_target() {
        let tx = focus_channel();
        let registry = KeyRegistry::new();
        let mut receiver = tx.subscribe();

        assert!(
            begin_key_request(
                &tx,
                &key_limiter(),
                &registry,
                7,
                &key_request_json("k-1", "session-1", "enter")
            )
            .is_none()
        );
        let result = next_result(&mut receiver);
        assert_eq!(result["type"], "key.result");
        assert_eq!(result["v"], 1);
        assert_eq!(result["requestId"], "k-1");
        assert_eq!(result["action"], "enter");
        assert_eq!(result["ok"], false);
        assert_eq!(result["error"], "no_target");
        assert!(result["ts"].as_u64().unwrap() > 0);
    }

    #[test]
    fn key_request_rejects_other_clients_sessions_and_bad_actions() {
        let tx = focus_channel();
        let registry = key_registry(7, "session-1");
        let mut receiver = tx.subscribe();

        // 别的连接（owner 不符）。
        assert!(
            begin_key_request(
                &tx,
                &key_limiter(),
                &registry,
                8,
                &key_request_json("k-1", "session-1", "enter")
            )
            .is_none()
        );
        assert_eq!(next_result(&mut receiver)["error"], "session_mismatch");

        // 会话不符。
        assert!(
            begin_key_request(
                &tx,
                &key_limiter(),
                &registry,
                7,
                &key_request_json("k-2", "session-2", "clear")
            )
            .is_none()
        );
        assert_eq!(next_result(&mut receiver)["error"], "session_mismatch");

        // action 非法：bad_request，不查 registry。
        assert!(
            begin_key_request(
                &tx,
                &key_limiter(),
                &registry,
                7,
                &key_request_json("k-3", "session-1", "submit")
            )
            .is_none()
        );
        let result = next_result(&mut receiver);
        assert_eq!(result["requestId"], "k-3");
        assert_eq!(result["error"], "bad_request");

        // 合法请求：返回待执行请求，目标应用就是插入时记录的那个。
        let pending = begin_key_request(
            &tx,
            &key_limiter(),
            &registry,
            7,
            &key_request_json("k-4", "session-1", "clear"),
        )
        .expect("合法请求应受理");
        assert_eq!(pending.request_id, "k-4");
        assert_eq!(pending.action, KeyAction::Clear);
        assert_eq!(pending.session, "session-1");
        assert_eq!(pending.expected_app, target_app());
    }

    #[test]
    fn key_requests_are_rate_limited() {
        let tx = focus_channel();
        let limiter = key_limiter();
        let registry = key_registry(7, "session-1");
        let mut receiver = tx.subscribe();

        assert!(
            begin_key_request(
                &tx,
                &limiter,
                &registry,
                7,
                &key_request_json("k-1", "session-1", "enter")
            )
            .is_some()
        );
        assert!(
            begin_key_request(
                &tx,
                &limiter,
                &registry,
                7,
                &key_request_json("k-2", "session-1", "enter")
            )
            .is_none()
        );
        let result = next_result(&mut receiver);
        assert_eq!(result["requestId"], "k-2");
        assert_eq!(result["error"], "rate_limited");
    }

    #[test]
    fn key_request_without_request_id_is_dropped_silently() {
        let tx = focus_channel();
        let registry = KeyRegistry::new();
        let mut receiver = tx.subscribe();

        assert!(begin_key_request(&tx, &key_limiter(), &registry, 7, "not-json").is_none());
        assert!(
            begin_key_request(
                &tx,
                &key_limiter(),
                &registry,
                7,
                r#"{"type":"key.request","v":1}"#
            )
            .is_none()
        );
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn mic_start_replaces_same_owner_and_rejects_other_clients() {
        // 同端重复 start 属于客户端异常（快速连按/旧版本竞态）：以最新会话为准，
        // 不能永远回 session_busy，否则手机 stop 会一直对不上桌面 active 会话。
        assert_eq!(resolve_mic_start(None, 7), StartAction::Accept);
        assert_eq!(resolve_mic_start(Some(7), 7), StartAction::Replace);
        // 另一个客户端（另一台手机/网页）不抢当前会话。
        assert_eq!(resolve_mic_start(Some(7), 8), StartAction::Busy);
        assert_eq!(resolve_mic_start(Some(8), 7), StartAction::Busy);
    }

    #[test]
    fn mic_cancel_payload_carries_session_and_reason() {
        let payload = mic_cancel("session-1", "timeout");
        assert_eq!(payload["v"], 1);
        assert_eq!(payload["type"], "mic.cancel");
        assert_eq!(payload["session"], "session-1");
        assert_eq!(payload["reason"], "timeout");
        assert!(payload["ts"].as_u64().unwrap() > 0);
    }
}

#[cfg(test)]
mod clients_message_tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn client_count_system_message_has_structured_clients() {
        let raw = system_message_with_clients("客户端已连接，当前 2 个".to_string(), 2);
        let value: Value = serde_json::from_str(&raw).expect("应是合法 JSON");
        assert_eq!(value["type"], "system");
        assert_eq!(value["text"], "客户端已连接，当前 2 个");
        assert_eq!(value["clients"], 2);
    }

    #[test]
    fn desktop_status_message_has_expected_shape() {
        let raw = desktop_status_message(true, true, false);
        let value: Value = serde_json::from_str(&raw).expect("应是合法 JSON");
        assert_eq!(value["type"], "desktop.status");
        assert_eq!(value["v"], 1);
        assert_eq!(value["asrConfigured"], true);
        assert_eq!(value["asrHasKey"], true);
        assert_eq!(value["accessibilityTrusted"], false);
        assert!(value["ts"].as_u64().unwrap() > 0);
    }

    #[test]
    fn desktop_status_message_reflects_false_state() {
        let raw = desktop_status_message(false, false, false);
        let value: Value = serde_json::from_str(&raw).expect("应是合法 JSON");
        assert_eq!(value["asrConfigured"], false);
        assert_eq!(value["asrHasKey"], false);
        assert_eq!(value["accessibilityTrusted"], false);
    }

    #[test]
    fn desktop_status_message_has_no_secret_material() {
        let raw = desktop_status_message(true, true, true);
        let value: Value = serde_json::from_str(&raw).expect("应是合法 JSON");
        let object = value.as_object().expect("应是 JSON 对象");
        let mut keys: Vec<&str> = object.keys().map(|key| key.as_str()).collect();
        keys.sort_unstable();
        // 字段集合精确匹配：只有 type/v/asrConfigured/asrHasKey/accessibilityTrusted/ts。
        assert_eq!(
            keys,
            [
                "accessibilityTrusted",
                "asrConfigured",
                "asrHasKey",
                "ts",
                "type",
                "v",
            ]
        );
        for forbidden in [
            "apiKey",
            "api_key",
            "keyMasked",
            "keyHint",
            "path",
            "endpoint",
            "model",
            "prompt",
        ] {
            assert!(
                !object.contains_key(forbidden),
                "desktop.status 不应包含字段 {forbidden}"
            );
        }
        assert!(!raw.contains("apiKey"));
        assert!(!raw.contains("keyMasked"));
        assert!(!raw.contains("keyHint"));
    }
}
