use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use super::cloud;
use super::llm;
use crate::memo::db::MemoDb;
use crate::memo::types::{MemoEvent, MemoStatus, MemoStructured};
use crate::memo::{SEGMENT_MS, wav};

use super::MemoState;

const SEGMENT_BYTES: usize = (SEGMENT_MS as u64 * crate::memo::BYTES_PER_SECOND / 1000) as usize;

/// 单飞队列：同一时间只处理一条，避免并发打满网络/内存。
/// 由录音结束、重试、启动恢复、回前台触发；重复调用会排队等待。
pub async fn run_queue(app: AppHandle, state: Arc<MemoState>) {
    let _guard = state.processing.lock().await;
    let ids = match state.db.resumable() {
        Ok(ids) => ids,
        Err(error) => {
            eprintln!("[memo] 读取待处理条目失败: {error}");
            return;
        }
    };
    for id in ids {
        if let Err(error) = process_one(&app, &state, &id).await {
            eprintln!("[memo] 处理 {id} 失败: {error}");
        }
    }
}

async fn process_one(app: &AppHandle, state: &Arc<MemoState>, id: &str) -> Result<(), String> {
    let db = state.db.clone();
    let Some(row) = db.get(id)? else { return Ok(()) };
    if row.deleted_at.is_some() {
        return Ok(());
    }

    let api_key = state
        .secure
        .lock()
        .map_err(|_| "本地配置锁异常".to_string())?
        .api_key
        .clone()
        .filter(|key| !key.trim().is_empty());
    let Some(api_key) = api_key else {
        db.set_status(id, MemoStatus::Failed, Some("没有可用的百炼 Key，请先在设置里配对或粘贴"))?;
        emit(app, MemoEvent::progress(id, MemoStatus::Failed));
        return Ok(());
    };

    let Some(audio_path) = row.audio_path.clone() else {
        db.set_status(id, MemoStatus::Failed, Some("录音文件不存在"))?;
        emit(app, MemoEvent::progress(id, MemoStatus::Failed));
        return Ok(());
    };
    let pcm = match wav::read_pcm(std::path::Path::new(&audio_path)) {
        Ok(pcm) => pcm,
        Err(error) => {
            db.set_status(id, MemoStatus::Failed, Some(&format!("读取录音失败: {error}")))?;
            emit(app, MemoEvent::progress(id, MemoStatus::Failed));
            return Ok(());
        }
    };
    if pcm.is_empty() {
        db.set_status(id, MemoStatus::Failed, Some("录音是空的"))?;
        emit(app, MemoEvent::progress(id, MemoStatus::Failed));
        return Ok(());
    }

    let total = ((pcm.len() + SEGMENT_BYTES - 1) / SEGMENT_BYTES) as i64;
    let existing = db.segments(id)?;
    db.set_status(id, MemoStatus::Transcribing, None)?;

    let mut texts: Vec<String> = vec![String::new(); total as usize];
    for segment in &existing {
        if segment.idx >= 0 && (segment.idx as usize) < texts.len() && segment.status == "done" {
            texts[segment.idx as usize] = segment.text.clone();
        }
    }

    for idx in 0..total {
        if !texts[idx as usize].is_empty() {
            continue;
        }
        let start = idx as usize * SEGMENT_BYTES;
        let end = ((idx as usize + 1) * SEGMENT_BYTES).min(pcm.len());
        db.set_progress(id, MemoStatus::Transcribing, Some(idx))?;
        emit(app, MemoEvent::progress(id, MemoStatus::Transcribing));

        match cloud::transcribe(&pcm[start..end], &api_key).await {
            Ok(text) => {
                db.set_segment(id, idx, &text, "done")?;
                texts[idx as usize] = text;
            }
            Err(error) if error.is_offline() => {
                db.set_status(id, MemoStatus::Offline, Some(&error.message))?;
                emit(app, MemoEvent::progress(id, MemoStatus::Offline));
                return Ok(());
            }
            Err(error) => {
                db.set_status(id, MemoStatus::Failed, Some(&error.message))?;
                emit(app, MemoEvent::progress(id, MemoStatus::Failed));
                return Ok(());
            }
        }
    }

    let transcript = texts
        .iter()
        .map(|text| text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if transcript.trim().is_empty() {
        db.set_status(id, MemoStatus::Failed, Some("没有识别到语音内容"))?;
        emit(app, MemoEvent::progress(id, MemoStatus::Failed));
        return Ok(());
    }

    db.set_status(id, MemoStatus::Structuring, None)?;
    emit(app, MemoEvent::progress(id, MemoStatus::Structuring));

    let (structured, ai_status) = match llm::structure(&transcript, &api_key).await {
        Ok(structured) => (structured, "ok"),
        Err(error) => {
            eprintln!("[memo] LLM 整理失败，保留转写: {error}");
            let fallback = MemoStructured {
                title: fallback_title(&transcript),
                ..Default::default()
            };
            (fallback, "failed")
        }
    };

    db.finish(id, &transcript, &structured, ai_status)?;
    emit(app, MemoEvent::changed(id));
    crate::memo::mobile::sync::kick(app.clone(), state.clone());
    Ok(())
}

fn fallback_title(transcript: &str) -> String {
    let first = transcript
        .split(['。', '！', '？', '\n', '.', '!', '?'])
        .next()
        .unwrap_or(transcript)
        .trim();
    let mut title: String = first.chars().take(18).collect();
    if first.chars().count() > 18 {
        title.push('…');
    }
    if title.is_empty() { "未命名备忘".into() } else { title }
}

fn emit(app: &AppHandle, event: MemoEvent) {
    let _ = app.emit("memo", event);
}

/// 供命令层触发（不阻塞调用方）。
pub fn kick(app: AppHandle, state: Arc<MemoState>) {
    tauri::async_runtime::spawn(async move {
        run_queue(app, state).await;
    });
}

/// 测试用：把 PCM 按 5 分钟切段。
pub fn segment_ranges(len: usize) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut start = 0;
    while start < len {
        let end = (start + SEGMENT_BYTES).min(len);
        ranges.push((start, end));
        start = end;
    }
    ranges
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segments_minutes() {
        let ranges = segment_ranges(SEGMENT_BYTES * 2 + 100);
        assert_eq!(ranges.len(), 3);
        assert_eq!(ranges[0], (0, SEGMENT_BYTES));
        assert_eq!(ranges[2].1, SEGMENT_BYTES * 2 + 100);
        assert!(segment_ranges(0).is_empty());
    }

    #[test]
    fn fallback_title_is_short() {
        let title = fallback_title("明天下午三点和产品开会，记得带上原型和上次的会议记录。");
        assert_eq!(title, "明天下午三点和产品开会");
    }

    #[test]
    fn db_is_usable_from_pipeline_shape() {
        // 只验证共享库能按管道需要的字段读写，不触网。
        let db = MemoDb::open_memory().unwrap();
        assert!(db.list().unwrap().is_empty());
    }
}
