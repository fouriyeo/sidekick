//! 手机端（Phase 2–4）：录音、管道、Key、同步。

pub mod cloud;
pub mod keys;
pub mod llm;
pub mod pipeline;
pub mod recording;
pub mod sync;

use std::sync::{Arc, Mutex};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use tauri::{AppHandle, Emitter, State};

use crate::memo::db::{MemoDb, MemoRow};
use crate::memo::storage::MemoPaths;
use crate::memo::types::{
    MemoDetail, MemoEvent, MemoStatus, MemoStorageStats, MemoSummary, MemoType,
};
use crate::memo::now_ms;

use keys::{KeyStatus, SecureData};

pub struct MemoState {
    pub paths: MemoPaths,
    pub db: Arc<MemoDb>,
    pub recording: Mutex<Option<recording::RecordingSession>>,
    pub secure: Mutex<SecureData>,
    /// 单飞：同一时间只跑一个管道。
    pub processing: tokio::sync::Mutex<()>,
    /// 单飞：同一时间只跑一次镜像同步。
    pub syncing: std::sync::atomic::AtomicBool,
}

impl MemoState {
    pub fn new(app: &AppHandle) -> Result<Self, String> {
        let paths = MemoPaths::mobile(app)?;
        let db = Arc::new(MemoDb::open(&paths.db)?);
        let secure = SecureData::load(&paths.secure);
        if !paths.secure.exists() {
            let _ = secure.save(&paths.secure);
        }
        Ok(Self {
            paths,
            db,
            recording: Mutex::new(None),
            secure: Mutex::new(secure),
            processing: tokio::sync::Mutex::new(()),
            syncing: std::sync::atomic::AtomicBool::new(false),
        })
    }
}

fn emit(app: &AppHandle, event: MemoEvent) {
    let _ = app.emit("memo", event);
}

async fn block<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("任务执行失败: {error}"))?
}

#[tauri::command]
pub async fn memo_list(state: State<'_, Arc<MemoState>>) -> Result<Vec<MemoSummary>, String> {
    let db = state.db.clone();
    block(move || db.list()).await
}

#[tauri::command]
pub async fn memo_get(
    state: State<'_, Arc<MemoState>>,
    id: String,
) -> Result<MemoDetail, String> {
    let db = state.db.clone();
    block(move || {
        let row = db.get(&id)?.ok_or_else(|| "备忘录不存在".to_string())?;
        let segments = db.segments(&id)?;
        Ok(row.detail(segments))
    })
    .await
}

#[tauri::command]
pub async fn memo_update(
    app: AppHandle,
    state: State<'_, Arc<MemoState>>,
    id: String,
    title: Option<String>,
    memo_type: Option<String>,
) -> Result<MemoSummary, String> {
    let title = title.map(|text| text.trim().chars().take(60).collect::<String>());
    if title.as_deref().is_some_and(|text| text.is_empty()) {
        return Err("标题不能为空".into());
    }
    let memo_type = memo_type.map(|raw| MemoType::parse(&raw));
    let db = state.db.clone();
    let memo_id = id.clone();
    let row = block(move || {
        db.update_meta(&memo_id, title.as_deref(), memo_type)?;
        db.get(&memo_id)?.ok_or_else(|| "备忘录不存在".to_string())
    })
    .await?;
    emit(&app, MemoEvent::changed(&id));
    sync::kick(app.clone(), state.inner().clone());
    Ok(row.summary())
}

#[tauri::command]
pub async fn memo_delete(
    app: AppHandle,
    state: State<'_, Arc<MemoState>>,
    id: String,
) -> Result<(), String> {
    let db = state.db.clone();
    let memo_id = id.clone();
    let path = block(move || db.soft_delete(&memo_id)).await?;
    if let Some(path) = path {
        let _ = std::fs::remove_file(path);
    }
    emit(&app, MemoEvent::changed(&id));
    sync::kick(app.clone(), state.inner().clone());
    Ok(())
}

#[tauri::command]
pub async fn memo_delete_audio(
    app: AppHandle,
    state: State<'_, Arc<MemoState>>,
    id: String,
) -> Result<(), String> {
    let db = state.db.clone();
    let memo_id = id.clone();
    let row = block(move || {
        let row = db.get(&memo_id)?.ok_or_else(|| "备忘录不存在".to_string())?;
        db.clear_audio(&memo_id)?;
        Ok(row)
    })
    .await?;
    if let Some(path) = row.audio_path {
        let _ = std::fs::remove_file(path);
    }
    emit(&app, MemoEvent::changed(&id));
    sync::kick(app.clone(), state.inner().clone());
    Ok(())
}

#[tauri::command]
pub async fn memo_storage_stats(
    state: State<'_, Arc<MemoState>>,
) -> Result<MemoStorageStats, String> {
    let db = state.db.clone();
    block(move || db.storage_stats()).await
}

#[tauri::command]
pub fn memo_recording_start(
    state: State<'_, Arc<MemoState>>,
) -> Result<recording::RecordingStarted, String> {
    recording::start(state.inner())
}

#[tauri::command]
pub fn memo_recording_append(
    state: State<'_, Arc<MemoState>>,
    session: String,
    pcm: String,
) -> Result<recording::AppendResult, String> {
    let bytes = STANDARD
        .decode(&pcm)
        .map_err(|_| "音频分片无效".to_string())?;
    recording::append(state.inner(), &session, &bytes)
}

#[tauri::command]
pub fn memo_recording_finish(
    app: AppHandle,
    state: State<'_, Arc<MemoState>>,
) -> Result<MemoSummary, String> {
    recording::finish(&app, state.inner())
}

#[tauri::command]
pub fn memo_recording_cancel(state: State<'_, Arc<MemoState>>) -> Result<(), String> {
    recording::cancel(state.inner())
}

#[tauri::command]
pub fn memo_recording_status(
    state: State<'_, Arc<MemoState>>,
) -> Option<recording::RecordingStatus> {
    recording::status(state.inner())
}

#[tauri::command]
pub fn memo_recover(
    app: AppHandle,
    state: State<'_, Arc<MemoState>>,
) -> Result<Option<String>, String> {
    recording::recover(&app, state.inner())
}

#[tauri::command]
pub fn memo_sync_now(app: AppHandle, state: State<'_, Arc<MemoState>>) -> Result<(), String> {
    // 回前台/打开页面时顺带重试离线/待处理条目。
    pipeline::kick(app.clone(), state.inner().clone());
    sync::kick(app, state.inner().clone());
    Ok(())
}

#[tauri::command]
pub fn memo_sync_pending(state: State<'_, Arc<MemoState>>) -> Result<i64, String> {
    sync::pending_count(state.inner())
}

#[tauri::command]
pub fn memo_retry(
    app: AppHandle,
    state: State<'_, Arc<MemoState>>,
    id: String,
) -> Result<(), String> {
    let db = state.db.clone();
    db.set_status(&id, MemoStatus::Pending, None)?;
    pipeline::kick(app, state.inner().clone());
    Ok(())
}

#[tauri::command]
pub fn memo_key_status(state: State<'_, Arc<MemoState>>) -> Result<KeyStatus, String> {
    let secure = state.secure.lock().map_err(|_| "本地配置锁异常".to_string())?;
    Ok(secure.status())
}

#[tauri::command]
pub fn memo_key_save(
    app: AppHandle,
    state: State<'_, Arc<MemoState>>,
    key: String,
) -> Result<KeyStatus, String> {
    let key = key.trim().to_string();
    if key.len() < 8 || key.len() > 200 || key.contains(char::is_whitespace) {
        return Err("API Key 格式不正确".into());
    }
    let status = {
        let mut secure = state.secure.lock().map_err(|_| "本地配置锁异常".to_string())?;
        secure.api_key = Some(key);
        secure.save(&state.paths.secure)?;
        secure.status()
    };
    emit(&app, MemoEvent { kind: "key", id: None, status: None, message: None });
    // 配好 Key 后自动把因「无 Key」失败的条目重新排队。
    pipeline::kick(app.clone(), state.inner().clone());
    Ok(status)
}

#[tauri::command]
pub fn memo_key_clear(
    app: AppHandle,
    state: State<'_, Arc<MemoState>>,
) -> Result<KeyStatus, String> {
    let status = {
        let mut secure = state.secure.lock().map_err(|_| "本地配置锁异常".to_string())?;
        secure.api_key = None;
        secure.save(&state.paths.secure)?;
        secure.status()
    };
    emit(&app, MemoEvent { kind: "key", id: None, status: None, message: None });
    Ok(status)
}

/// 手机 → 电脑的一次性配对请求；结果走 `chat` 事件里的 `memo.pair.result`。
#[tauri::command]
pub fn memo_pair_request(
    app: AppHandle,
    state: State<'_, Arc<MemoState>>,
    code: String,
    name: Option<String>,
) -> Result<(), String> {
    let code = code.trim().to_string();
    if code.len() != 6 || !code.chars().all(|ch| ch.is_ascii_digit()) {
        return Err("配对码是 6 位数字".into());
    }
    let mut secure = state.secure.lock().map_err(|_| "本地配置锁异常".to_string())?;
    if let Some(name) = name.map(|value| value.trim().chars().take(40).collect::<String>()) {
        if !name.is_empty() {
            secure.device_name = Some(name);
        }
    }
    secure.save(&state.paths.secure)?;
    let payload = serde_json::json!({
        "v": 1,
        "type": "memo.pair.request",
        "code": code,
        "deviceId": secure.device_id.clone(),
        "deviceName": secure.device_name.clone(),
        "ts": now_ms(),
    });
    crate::mobile_client::send_memo_payload(&app, payload)
}

#[tauri::command]
pub fn memo_pair_apply(
    app: AppHandle,
    state: State<'_, Arc<MemoState>>,
    token: String,
    key: Option<String>,
) -> Result<KeyStatus, String> {
    if token.trim().len() < 16 {
        return Err("配对凭据无效".into());
    }
    let status = apply_pair_result(state.inner(), token.trim(), key.as_deref())?;
    emit(&app, MemoEvent { kind: "key", id: None, status: None, message: None });
    Ok(status)
}

/// 电脑确认配对后，把 token / Key 落盘。
pub fn apply_pair_result(
    state: &MemoState,
    token: &str,
    key: Option<&str>,
) -> Result<KeyStatus, String> {
    let mut secure = state.secure.lock().map_err(|_| "本地配置锁异常".to_string())?;
    secure.token = Some(token.to_string());
    if let Some(key) = key.filter(|value| !value.trim().is_empty()) {
        secure.api_key = Some(key.trim().to_string());
    }
    secure.save(&state.paths.secure)?;
    Ok(secure.status())
}

/// 供录制页/调试读取内部行（暂未暴露成命令）。
#[allow(dead_code)]
pub fn row_for(state: &MemoState, id: &str) -> Result<Option<MemoRow>, String> {
    state.db.get(id)
}
