//! 手机端「后台待命」原生麦克风：待命 FGS + AudioRecord + PCM 文件 tail。
//!
//! 数据流：
//! `Mac 快捷键 → 桌面 mic_remote → WS mic.remote → 本模块`
//! `→ RemoteMicService（Kotlin，microphone FGS）→ remote-mic/<session>.pcm`
//! `→ 本模块按 100ms 组帧 → 现有 mic.start / SK01 / mic.stop → 桌面 ASR`
//!
//! 只在手机开启了「后台待命」时接管；否则 `mic.remote` 仍交给 WebView 的前台路径，
//! 保持旧行为与旧错误码。

use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::plugin::{Builder, TauriPlugin};
#[cfg(target_os = "android")]
use tauri::plugin::PluginHandle;
use tauri::{AppHandle, Emitter, Manager};

/// 100ms @ 16k mono PCM16。
const FRAME_BYTES: usize = 3_200;
const FRAME_MS: u32 = 100;
const MAX_MS: u64 = 60_000;
const POLL: Duration = Duration::from_millis(20);
const FILE_WAIT: Duration = Duration::from_millis(1_500);
const IDLE_FAIL: Duration = Duration::from_millis(3_000);
const STOP_SUFFIX: &str = ".stop";

struct Inner {
    standby: AtomicBool,
    /// 是否在宠物页/前台；后台且未待命时直接回 standby_off，不让桌面干等 2 秒。
    foreground: AtomicBool,
    /// 每次断线递增；旧重连循环看到代际变化就退出，避免旧任务卡死后永远不再重连。
    reconnect_gen: AtomicU64,
    session: Mutex<Option<Session>>,
}

impl Inner {
    fn new() -> Self {
        Self {
            standby: AtomicBool::new(false),
            foreground: AtomicBool::new(true),
            reconnect_gen: AtomicU64::new(0),
            session: Mutex::new(None),
        }
    }
}

struct Session {
    id: String,
    stop: Arc<AtomicBool>,
    reason: Arc<Mutex<String>>,
}

pub struct RemoteMicState {
    inner: Arc<Inner>,
    #[cfg(target_os = "android")]
    handle: PluginHandle<tauri::Wry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PluginResult {
    #[serde(default)]
    ok: bool,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    standby: bool,
    #[serde(default)]
    recording: bool,
    #[serde(default)]
    session: Option<String>,
    #[serde(default)]
    bytes: u64,
    #[serde(default)]
    mic: bool,
    #[serde(default)]
    notifications: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartArgs {
    session: String,
    path: String,
    max_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct StopArgs {
    reason: String,
}

pub fn init() -> TauriPlugin<tauri::Wry> {
    #[cfg(target_os = "android")]
    {
        Builder::new("remote-mic")
            .setup(|app, api| {
                let handle = api
                    .register_android_plugin("dev.sidekick.app", "RemoteMicPlugin")
                    .map_err(|error| std::io::Error::other(error.to_string()))?;
                app.manage(RemoteMicState {
                    inner: Arc::new(Inner::new()),
                    handle,
                });
                Ok(())
            })
            .build()
    }
    #[cfg(not(target_os = "android"))]
    {
        Builder::new("remote-mic")
            .setup(|app, _api| {
                app.manage(RemoteMicState {
                    inner: Arc::new(Inner::new()),
                });
                Ok(())
            })
            .build()
    }
}

fn inner(app: &AppHandle) -> Option<Arc<Inner>> {
    app.try_state::<RemoteMicState>().map(|state| state.inner.clone())
}

#[cfg(target_os = "android")]
fn handle(app: &AppHandle) -> Option<PluginHandle<tauri::Wry>> {
    app.try_state::<RemoteMicState>()
        .map(|state| state.handle.clone())
}

/// 读到 `mic.remote` 时由 `mobile_client` 先调用。
///
/// 返回 true 表示本模块已接管（不再 emit 给 WebView）；false 表示继续走原来的前端路径。
pub fn handle_server_message(app: &AppHandle, text: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return false;
    };
    if value.get("type").and_then(Value::as_str) != Some("mic.remote") {
        return false;
    }
    let Some(inner) = inner(app) else {
        return false;
    };

    if inner.standby.load(Ordering::Relaxed) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            handle_remote(app, value).await;
        });
        return true;
    }
    if inner.foreground.load(Ordering::Relaxed) {
        return false;
    }

    // 后台且未开待命：立即给桌面一个稳定错误码，避免 2 秒 ack 超时。
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some((request_id, action)) = meta(&value) {
            ack(&app, &request_id, &action, false, Some("standby_off"));
        }
    });
    true
}

fn meta(value: &Value) -> Option<(String, String)> {
    let request_id = value.get("requestId")?.as_str()?.trim().to_string();
    let action = value.get("action")?.as_str()?.trim().to_string();
    if request_id.is_empty()
        || request_id.chars().count() > 64
        || !matches!(action.as_str(), "start" | "stop" | "cancel")
    {
        return None;
    }
    Some((request_id, action))
}

async fn handle_remote(app: AppHandle, value: Value) {
    let Some((request_id, action)) = meta(&value) else {
        return;
    };
    #[cfg(target_os = "android")]
    {
        match action.as_str() {
            "start" => start_remote(&app, &request_id).await,
            "stop" => stop_remote(&app, &request_id, "stop", "release").await,
            "cancel" => stop_remote(&app, &request_id, "cancel", "cancel").await,
            _ => {}
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        ack(&app, &request_id, &action, false, Some("service_failed"));
    }
}

#[cfg(target_os = "android")]
async fn start_remote(app: &AppHandle, request_id: &str) {
    let Some(inner) = inner(app) else {
        ack(app, request_id, "start", false, Some("service_failed"));
        return;
    };
    let Some(handle) = handle(app) else {
        ack(app, request_id, "start", false, Some("service_failed"));
        return;
    };

    let status = match handle
        .run_mobile_plugin_async::<PluginResult>("status", ())
        .await
    {
        Ok(status) => status,
        Err(error) => {
            eprintln!("[remote-mic] status failed: {error}");
            ack(app, request_id, "start", false, Some("service_failed"));
            return;
        }
    };
    if !status.standby {
        inner.standby.store(false, Ordering::Relaxed);
        ack(app, request_id, "start", false, Some("standby_off"));
        return;
    }
    if status.recording || inner.session.lock().map(|slot| slot.is_some()).unwrap_or(true) {
        ack(app, request_id, "start", false, Some("busy"));
        return;
    }

    let id = uuid::Uuid::new_v4().to_string();
    let dir = match app.path().app_data_dir() {
        Ok(dir) => dir.join("remote-mic"),
        Err(error) => {
            eprintln!("[remote-mic] app_data_dir failed: {error}");
            ack(app, request_id, "start", false, Some("service_failed"));
            return;
        }
    };
    if let Err(error) = fs::create_dir_all(&dir) {
        eprintln!("[remote-mic] create dir failed: {error}");
        ack(app, request_id, "start", false, Some("service_failed"));
        return;
    }
    let path = dir.join(format!("{id}.pcm"));
    let path_text = path.to_string_lossy().to_string();

    let started = match handle
        .run_mobile_plugin_async::<PluginResult>(
            "startCapture",
            StartArgs {
                session: id.clone(),
                path: path_text,
                max_ms: MAX_MS,
            },
        )
        .await
    {
        Ok(result) if result.ok => result,
        Ok(result) => {
            ack(
                app,
                request_id,
                "start",
                false,
                Some(result.code.as_deref().unwrap_or("service_failed")),
            );
            return;
        }
        Err(error) => {
            eprintln!("[remote-mic] start capture failed: {error}");
            ack(app, request_id, "start", false, Some("service_failed"));
            return;
        }
    };
    let _ = started;

    if let Err(error) = crate::mobile_client::mic_start(app.clone(), id.clone(), 16_000, FRAME_MS)
    {
        eprintln!("[remote-mic] mic.start failed: {error}");
        let _ = handle
            .run_mobile_plugin_async::<PluginResult>(
                "stopCapture",
                StopArgs {
                    reason: "cancel".into(),
                },
            )
            .await;
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(format!("{}{}", path.display(), STOP_SUFFIX));
        ack(app, request_id, "start", false, Some("disconnected"));
        return;
    }

    let stop = Arc::new(AtomicBool::new(false));
    let reason = Arc::new(Mutex::new("release".to_string()));
    *inner.session.lock().unwrap() = Some(Session {
        id: id.clone(),
        stop: stop.clone(),
        reason: reason.clone(),
    });
    let reader = spawn_reader(
        app.clone(),
        inner.clone(),
        id.clone(),
        path.clone(),
        stop,
        reason,
    );
    if reader.is_none() {
        cancel_session(&inner, "cancel");
        let _ = crate::mobile_client::mic_stop(app.clone(), id.clone(), "cancel".to_string());
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(format!("{}{}", path.display(), STOP_SUFFIX));
        let _ = handle
            .run_mobile_plugin_async::<PluginResult>(
                "stopCapture",
                StopArgs {
                    reason: "cancel".into(),
                },
            )
            .await;
        ack(app, request_id, "start", false, Some("service_failed"));
        return;
    }

    ack(app, request_id, "start", true, None);
}

#[cfg(target_os = "android")]
async fn stop_remote(app: &AppHandle, request_id: &str, action: &str, reason: &str) {
    let Some(inner) = inner(app) else {
        ack(app, request_id, action, false, Some("service_failed"));
        return;
    };
    let Some(session) = inner.session.lock().ok().and_then(|mut slot| slot.take()) else {
        ack(app, request_id, action, false, Some("not_recording"));
        return;
    };
    *session.reason.lock().unwrap() = reason.to_string();
    session.stop.store(true, Ordering::Relaxed);

    #[cfg(target_os = "android")]
    if let Some(handle) = handle(app) {
        let _ = handle
            .run_mobile_plugin_async::<PluginResult>(
                "stopCapture",
                StopArgs {
                    reason: reason.to_string(),
                },
            )
            .await;
    }
    ack(app, request_id, action, true, None);
}

fn cancel_session(inner: &Arc<Inner>, reason: &str) {
    if let Some(session) = inner.session.lock().ok().and_then(|mut slot| slot.take()) {
        *session.reason.lock().unwrap() = reason.to_string();
        session.stop.store(true, Ordering::Relaxed);
    }
}

fn spawn_reader(
    app: AppHandle,
    inner: Arc<Inner>,
    id: String,
    path: PathBuf,
    stop: Arc<AtomicBool>,
    reason: Arc<Mutex<String>>,
) -> Option<std::thread::JoinHandle<()>> {
    std::thread::Builder::new()
        .name(format!("remote-mic-{id}"))
        .spawn(move || {
            read_tail(app, inner, id, path, stop, reason);
        })
        .ok()
}

fn read_tail(
    app: AppHandle,
    inner: Arc<Inner>,
    id: String,
    path: PathBuf,
    stop: Arc<AtomicBool>,
    reason: Arc<Mutex<String>>,
) {
    let started = Instant::now();
    let mut file = open_with_retry(&path, FILE_WAIT);
    let mut pending: Vec<u8> = Vec::with_capacity(FRAME_BYTES * 2);
    let mut sequence = 0u32;
    let mut last_data = Instant::now();
    let mut done: Option<String> = None;

    while done.is_none() {
        if stop.load(Ordering::Relaxed) {
            done = Some(reason_value(&reason));
        }
        if let Some(marker) = read_marker(&path) {
            done = Some(marker);
        }
        if started.elapsed() >= Duration::from_millis(MAX_MS + 500) {
            done = Some("timeout".to_string());
        }
        if file.is_none() && started.elapsed() >= FILE_WAIT {
            done = Some("mic_lost".to_string());
        }
        if last_data.elapsed() >= IDLE_FAIL && file.is_some() {
            done = Some("mic_lost".to_string());
        }
        if done.is_some() {
            break;
        }

        if let Some(handle) = file.as_mut() {
            let mut buffer = [0u8; 4096];
            match handle.read(&mut buffer) {
                Ok(0) => std::thread::sleep(POLL),
                Ok(read) => {
                    last_data = Instant::now();
                    pending.extend_from_slice(&buffer[..read]);
                    flush_frames(&app, &id, &mut pending, &mut sequence, false);
                }
                Err(error) => {
                    eprintln!("[remote-mic] read failed: {error}");
                    done = Some("mic_lost".to_string());
                }
            }
        } else {
            std::thread::sleep(POLL);
        }
    }

    // 把最后一段读干净，再强制发一个（可能不足 100ms 的）尾帧。
    if let Some(handle) = file.as_mut() {
        loop {
            let mut buffer = [0u8; 4096];
            match handle.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => pending.extend_from_slice(&buffer[..read]),
                Err(_) => break,
            }
        }
    }
    flush_frames(&app, &id, &mut pending, &mut sequence, true);

    let reason = done.unwrap_or_else(|| reason_value(&reason));
    let reason = match reason.as_str() {
        "cancel" | "timeout" | "mic_lost" | "disconnect" => reason.as_str(),
        _ => "release",
    };
    let _ = crate::mobile_client::mic_stop(app.clone(), id.clone(), reason.to_string());
    let _ = fs::remove_file(&path);
    let _ = fs::remove_file(format!("{}{}", path.display(), STOP_SUFFIX));

    if let Ok(mut slot) = inner.session.lock() {
        if slot.as_ref().map(|session| session.id == id).unwrap_or(false) {
            *slot = None;
        }
    }
}

fn flush_frames(
    app: &AppHandle,
    session: &str,
    pending: &mut Vec<u8>,
    sequence: &mut u32,
    force: bool,
) {
    if force && pending.len() % 2 == 1 {
        pending.pop();
    }
    loop {
        let ready = pending.len() >= FRAME_BYTES || (force && !pending.is_empty());
        if !ready {
            break;
        }
        let take = pending.len().min(FRAME_BYTES);
        let frame: Vec<u8> = pending.drain(..take).collect();
        if frame.is_empty() {
            break;
        }
        let level = level_of(&frame);
        let _ = crate::mobile_client::send_mic_frame(app, session, *sequence, &frame, Some(level));
        *sequence = (*sequence).wrapping_add(1);
    }
}

fn level_of(pcm: &[u8]) -> f32 {
    let mut sum = 0.0f64;
    let mut count = 0u32;
    for chunk in pcm.chunks_exact(2) {
        let sample = i16::from_le_bytes([chunk[0], chunk[1]]) as f64 / 32_768.0;
        sum += sample * sample;
        count += 1;
    }
    if count == 0 {
        return 0.0;
    }
    (((sum / count as f64).sqrt() * 10.0).min(1.0)) as f32
}

fn open_with_retry(path: &Path, wait: Duration) -> Option<File> {
    let started = Instant::now();
    loop {
        if let Ok(file) = File::open(path) {
            return Some(file);
        }
        if started.elapsed() >= wait {
            return None;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn read_marker(path: &Path) -> Option<String> {
    let raw = fs::read_to_string(format!("{}{}", path.display(), STOP_SUFFIX)).ok()?;
    let value = raw.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn reason_value(reason: &Arc<Mutex<String>>) -> String {
    reason
        .lock()
        .map(|value| value.clone())
        .unwrap_or_else(|_| "release".to_string())
}

fn ack(app: &AppHandle, request_id: &str, action: &str, ok: bool, code: Option<&str>) {
    let _ = crate::mobile_client::send_remote_mic_ack(
        app.clone(),
        request_id.to_string(),
        action.to_string(),
        ok,
        code.map(str::to_string),
    );
}

pub fn is_standby(app: &AppHandle) -> bool {
    inner(app)
        .map(|inner| inner.standby.load(Ordering::Relaxed))
        .unwrap_or(false)
}

/// 后台 WebView 可能冻结；后台不要 emit，否则 Tauri 事件可能卡住 Rust 重连任务。
pub fn is_foreground(app: &AppHandle) -> bool {
    inner(app)
        .map(|inner| inner.foreground.load(Ordering::Relaxed))
        .unwrap_or(false)
}

/// 连接断开：停采集，但**保留待命服务**并在后台自动重连。
///
/// 之前的实现一断线就 standbyStop，手机在后台又起不了 FGS，只能等用户打开 App
/// 或点一次录音——表现就是「快捷键有时失灵，点一下录音又好了」。
pub fn on_disconnect(app: &AppHandle) {
    let Some(inner) = inner(app) else {
        return;
    };
    cancel_session(&inner, "disconnect");
    let standby = inner.standby.load(Ordering::Relaxed);
    if !standby {
        println!("[remote-mic] disconnect standby=false");
        return;
    }
    let generation = inner.reconnect_gen.fetch_add(1, Ordering::Relaxed) + 1;
    println!("[remote-mic] disconnect standby=true reconnect_gen={generation}");

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // 2 秒一次，最多 3 分钟；桌面重启/路由器抖动通常几秒内恢复。
        for tick in 0..90 {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let connected = crate::mobile_client::is_connected(&app);
            if tick % 10 == 0 {
                println!("[remote-mic] reconnect tick={tick} gen={generation} standby={} connected={connected}", is_standby(&app));
            }
            if inner.reconnect_gen.load(Ordering::Relaxed) != generation
                || !is_standby(&app)
                || connected
            {
                return;
            }
            let Some(url) = crate::mobile_client::last_url(&app) else {
                println!("[remote-mic] reconnect no last url");
                break;
            };
            let _ = crate::mobile_client::connect_server(app.clone(), url).await;
            if crate::mobile_client::is_connected(&app) {
                return;
            }
        }
        println!("[remote-mic] reconnect give up");
        if is_standby(&app) {
            stop_standby_inner(&app).await;
        }
    });
}

async fn stop_standby_inner(app: &AppHandle) {
    let Some(inner) = inner(app) else {
        return;
    };
    inner.standby.store(false, Ordering::Relaxed);
    inner.reconnect_gen.fetch_add(1, Ordering::Relaxed);
    cancel_session(&inner, "cancel");
    #[cfg(target_os = "android")]
    if let Some(handle) = handle(app) {
        let _ = handle
            .run_mobile_plugin_async::<PluginResult>("standbyStop", ())
            .await;
    }
}

// ---- Tauri 命令（手机端）------------------------------------------------------

#[tauri::command]
pub async fn remote_mic_prepare(app: AppHandle) -> Result<Value, String> {
    #[cfg(target_os = "android")]
    {
        let handle = handle(&app).ok_or_else(|| "后台待命插件未注册".to_string())?;
        let result = handle
            .run_mobile_plugin_async::<PluginResult>("prepare", ())
            .await
            .map_err(|error| format!("权限申请失败：{error}"))?;
        Ok(json!({
            "ok": result.ok,
            "mic": result.mic,
            "notifications": result.notifications,
            "code": result.code,
        }))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("仅 Android 支持后台待命".to_string())
    }
}

#[tauri::command]
pub async fn remote_mic_standby_start(app: AppHandle) -> Result<Value, String> {
    let Some(inner) = inner(&app) else {
        return Err("后台待命状态未初始化".to_string());
    };
    #[cfg(target_os = "android")]
    {
        let handle = handle(&app).ok_or_else(|| "后台待命插件未注册".to_string())?;
        let mut result = handle
            .run_mobile_plugin_async::<PluginResult>("standbyStart", ())
            .await
            .map_err(|error| format!("待命启动失败：{error}"))?;
        // startForegroundService 是异步的；插件返回时 service 可能还没进 onStartCommand。
        // 轮询到真正 standby 再回报，避免桌面拿到 standby:false 而不敢下发快捷键。
        if result.ok && !result.standby {
            for _ in 0..10 {
                tokio::time::sleep(Duration::from_millis(50)).await;
                if let Ok(status) = handle
                    .run_mobile_plugin_async::<PluginResult>("status", ())
                    .await
                {
                    if status.standby {
                        result.standby = true;
                        result.recording = status.recording;
                        break;
                    }
                }
            }
        }
        if result.ok && !result.standby {
            result.ok = false;
            result.code = Some("service_failed".to_string());
        }
        if result.ok {
            inner.standby.store(true, Ordering::Relaxed);
        }
        Ok(json!({
            "ok": result.ok,
            "code": result.code,
            "standby": result.standby,
        }))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = inner;
        Err("仅 Android 支持后台待命".to_string())
    }
}

#[tauri::command]
pub async fn remote_mic_standby_stop(app: AppHandle) -> Result<Value, String> {
    if inner(&app).is_none() {
        return Err("后台待命状态未初始化".to_string());
    }
    stop_standby_inner(&app).await;
    Ok(json!({ "ok": true, "standby": false }))
}

#[tauri::command]
pub async fn remote_mic_standby_status(app: AppHandle) -> Result<Value, String> {
    #[cfg(target_os = "android")]
    {
        let handle = handle(&app).ok_or_else(|| "后台待命插件未注册".to_string())?;
        let result = handle
            .run_mobile_plugin_async::<PluginResult>("status", ())
            .await
            .map_err(|error| format!("读取待命状态失败：{error}"))?;
        Ok(json!({
            "ok": result.ok,
            "standby": result.standby,
            "recording": result.recording,
            "session": result.session,
            "bytes": result.bytes,
        }))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(json!({ "ok": true, "standby": false, "recording": false }))
    }
}

/// 供 `app.tsx` 的 visibilitychange 调用；后台且未待命时直接回 standby_off。
#[tauri::command]
pub fn remote_mic_set_foreground(app: AppHandle, foreground: bool) {
    if let Some(inner) = inner(&app) {
        inner.foreground.store(foreground, Ordering::Relaxed);
    }
    // 后台重连时故意不 emit（WebView 可能冻结）；回前台补一条权威连接状态，
    // 让 connection-store 不会一直停在旧 online/offline。
    if foreground {
        let online = crate::mobile_client::is_connected(&app);
        let url = crate::mobile_client::last_url(&app).unwrap_or_default();
        let _ = app.emit("conn", json!({ "online": online, "url": url }));
    }
}
