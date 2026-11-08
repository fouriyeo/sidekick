use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::memo::db::MemoRow;
use crate::memo::types::{MemoEvent, MemoStatus, MemoSummary, MemoType};
use crate::memo::wav::WavWriter;
use crate::memo::{MAX_RECORDING_MS, SEGMENT_MS, now_ms, pcm_duration_ms};

use super::{MemoState, pipeline};

/// 正在进行的录音。分片全部直接落盘，JS 侧不保留整段音频。
pub struct RecordingSession {
    pub id: String,
    pub started_at: i64,
    writer: WavWriter,
    tmp: PathBuf,
    bytes: u64,
    last_persisted_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStarted {
    pub session_id: String,
    pub started_at: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingStatus {
    pub session_id: String,
    pub started_at: i64,
    pub bytes: u64,
    pub duration_ms: i64,
    pub max_ms: i64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendResult {
    pub bytes: u64,
    pub duration_ms: i64,
    pub reached_max: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordingMarker {
    id: String,
    started_at: i64,
    bytes: u64,
}

fn marker_path(state: &MemoState) -> PathBuf {
    state.paths.tmp.join("recording.json")
}

fn persist_marker(state: &MemoState, session: &RecordingSession) -> Result<(), String> {
    let marker = RecordingMarker {
        id: session.id.clone(),
        started_at: session.started_at,
        bytes: session.bytes,
    };
    let body = serde_json::to_vec(&marker).map_err(|error| error.to_string())?;
    std::fs::write(marker_path(state), body).map_err(|error| format!("写录音状态失败: {error}"))
}

fn clear_marker(state: &MemoState) {
    let _ = std::fs::remove_file(marker_path(state));
}

pub fn start(state: &Arc<MemoState>) -> Result<RecordingStarted, String> {
    let mut guard = state.recording.lock().map_err(|_| "录音锁异常".to_string())?;
    if guard.is_some() {
        return Err("正在录音中".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let tmp = state.paths.tmp.join(format!("{id}.part"));
    let writer = WavWriter::create(&tmp).map_err(|error| format!("创建录音文件失败: {error}"))?;
    let started_at = now_ms();
    let session = RecordingSession {
        id: id.clone(),
        started_at,
        writer,
        tmp,
        bytes: 0,
        last_persisted_bytes: 0,
    };
    persist_marker(state, &session)?;
    *guard = Some(session);
    Ok(RecordingStarted { session_id: id, started_at })
}

pub fn append(state: &Arc<MemoState>, session_id: &str, pcm: &[u8]) -> Result<AppendResult, String> {
    let mut guard = state.recording.lock().map_err(|_| "录音锁异常".to_string())?;
    let session = guard.as_mut().ok_or_else(|| "没有正在进行的录音".to_string())?;
    if session.id != session_id {
        return Err("录音会话不匹配".into());
    }
    if session.bytes + pcm.len() as u64 > (MAX_RECORDING_MS as u64 * crate::memo::BYTES_PER_SECOND / 1000) {
        return Err("已达到单次录音上限（2 小时）".into());
    }
    session
        .writer
        .append(pcm)
        .map_err(|error| format!("写入录音失败: {error}"))?;
    session.bytes += pcm.len() as u64;
    // 每约 1 秒落一次状态；JS 按 1 秒 flush，这里做二次节流。
    if session.bytes.saturating_sub(session.last_persisted_bytes) >= 32_000 {
        session.last_persisted_bytes = session.bytes;
        let _ = persist_marker(state, session);
    }
    let duration_ms = pcm_duration_ms(session.bytes);
    Ok(AppendResult {
        bytes: session.bytes,
        duration_ms,
        reached_max: duration_ms >= MAX_RECORDING_MS,
    })
}

pub fn status(state: &Arc<MemoState>) -> Option<RecordingStatus> {
    state.recording.lock().ok().and_then(|guard| {
        guard.as_ref().map(|session| RecordingStatus {
            session_id: session.id.clone(),
            started_at: session.started_at,
            bytes: session.bytes,
            duration_ms: pcm_duration_ms(session.bytes),
            max_ms: MAX_RECORDING_MS,
        })
    })
}

pub fn finish(
    app: &AppHandle,
    state: &Arc<MemoState>,
) -> Result<MemoSummary, String> {
    let session = {
        let mut guard = state.recording.lock().map_err(|_| "录音锁异常".to_string())?;
        guard.take().ok_or_else(|| "没有正在进行的录音".to_string())?
    };
    let bytes = session
        .writer
        .finalize()
        .map_err(|error| format!("收尾录音失败: {error}"))?;
    let audio_path = state.paths.audio.join(format!("{}.wav", session.id));
    std::fs::rename(&session.tmp, &audio_path).map_err(|error| format!("保存录音失败: {error}"))?;
    clear_marker(state);

    let sha256 = sha256_file(&audio_path)?;
    let duration_ms = pcm_duration_ms(bytes);
    let created_at = session.started_at;
    let segments = (duration_ms + SEGMENT_MS - 1) / SEGMENT_MS;
    let row = MemoRow {
        id: session.id.clone(),
        created_at,
        updated_at: now_ms(),
        memo_type: MemoType::Memo,
        title: String::new(),
        summary: None,
        todos: Vec::new(),
        tags: Vec::new(),
        transcript: String::new(),
        duration_ms,
        audio_path: Some(audio_path.to_string_lossy().to_string()),
        audio_bytes: bytes as i64,
        audio_sha256: Some(sha256),
        status: MemoStatus::Pending,
        ai_status: None,
        failed_segment: None,
        last_error: None,
        segment_total: segments,
        deleted_at: None,
        synced_at: None,
        rev: 1,
    };
    state.db.insert(&row)?;
    let _ = app.emit("memo", MemoEvent::changed(&row.id));
    pipeline::kick(app.clone(), state.clone());
    super::sync::kick(app.clone(), state.clone());
    Ok(row.summary())
}

pub fn cancel(state: &Arc<MemoState>) -> Result<(), String> {
    let session = {
        let mut guard = state.recording.lock().map_err(|_| "录音锁异常".to_string())?;
        guard.take()
    };
    if let Some(session) = session {
        let _ = std::fs::remove_file(&session.tmp);
    }
    clear_marker(state);
    Ok(())
}

/// 启动恢复：上次进程被杀时留下的 `.part` 能修就修，转成待处理条目。
pub fn recover(app: &AppHandle, state: &Arc<MemoState>) -> Result<Option<String>, String> {
    let marker = std::fs::read_to_string(marker_path(state))
        .ok()
        .and_then(|raw| serde_json::from_str::<RecordingMarker>(&raw).ok());
    let Some(marker) = marker else { return Ok(None) };
    clear_marker(state);
    let tmp = state.paths.tmp.join(format!("{}.part", marker.id));
    if !tmp.exists() {
        return Ok(None);
    }
    let bytes = crate::memo::wav::repair(&tmp).map_err(|error| format!("恢复录音失败: {error}"))?;
    if bytes == 0 {
        let _ = std::fs::remove_file(&tmp);
        return Ok(None);
    }
    let audio_path = state.paths.audio.join(format!("{}.wav", marker.id));
    std::fs::rename(&tmp, &audio_path).map_err(|error| format!("恢复录音失败: {error}"))?;
    let sha256 = sha256_file(&audio_path)?;
    let duration_ms = pcm_duration_ms(bytes);
    let row = MemoRow {
        id: marker.id.clone(),
        created_at: marker.started_at,
        updated_at: now_ms(),
        memo_type: MemoType::Memo,
        title: String::new(),
        summary: None,
        todos: Vec::new(),
        tags: Vec::new(),
        transcript: String::new(),
        duration_ms,
        audio_path: Some(audio_path.to_string_lossy().to_string()),
        audio_bytes: bytes as i64,
        audio_sha256: Some(sha256),
        status: MemoStatus::Pending,
        ai_status: None,
        failed_segment: None,
        last_error: Some("上次录音中断，已自动保存".into()),
        segment_total: (duration_ms + SEGMENT_MS - 1) / SEGMENT_MS,
        deleted_at: None,
        synced_at: None,
        rev: 1,
    };
    state.db.insert(&row)?;
    let _ = app.emit("memo", MemoEvent::changed(&row.id));
    pipeline::kick(app.clone(), state.clone());
    Ok(Some(row.id))
}

pub fn sha256_file(path: &std::path::Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|error| format!("读取录音失败: {error}"))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).map_err(|error| format!("计算校验失败: {error}"))?;
    Ok(format!("{:x}", hasher.finalize()))
}
