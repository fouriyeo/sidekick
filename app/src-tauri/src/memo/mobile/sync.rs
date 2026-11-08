use std::io::Read;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager};

use crate::memo::types::MemoEvent;
use crate::memo::now_ms;

use super::MemoState;

const CHUNK: usize = 64 * 1024;
const PUSH_BATCH: usize = 50;

/// 触发一次镜像同步（手机单写者 → 电脑只读）。
///
/// 串行执行：连接上线、录音完成、打开备忘录页都会调用；重复调用直接返回。
pub fn kick(app: AppHandle, state: Arc<MemoState>) {
    if state.syncing.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let result = run(&app, &state).await;
        state.syncing.store(false, Ordering::SeqCst);
        if let Err(error) = result {
            // 没连电脑/没配对是常态，不打错误日志刷屏；只有真正发送失败才提示。
            if error != "not-connected" && error != "not-paired" {
                eprintln!("[memo] 同步失败: {error}");
            }
        }
    });
}

async fn run(app: &AppHandle, state: &Arc<MemoState>) -> Result<(), String> {
    let (token, device_id) = {
        let secure = state.secure.lock().map_err(|_| "配置锁异常".to_string())?;
        (
            secure.token.clone().filter(|value| !value.trim().is_empty()),
            secure.device_id.clone(),
        )
    };
    let Some(token) = token else { return Err("not-paired".into()) };

    // hello：桌面按 token 把这条连接标记为已配对；后续 push 才被接受。
    crate::mobile_client::send_memo_payload(
        app,
        json!({
            "v": 1,
            "type": "memo.hello",
            "deviceId": device_id,
            "token": token,
            "ts": now_ms(),
        }),
    )
    .map_err(|error| {
        if error.contains("还没连接") {
            "not-connected".to_string()
        } else {
            error
        }
    })?;

    let unsynced = state.db.unsynced()?;
    if unsynced.is_empty() {
        return Ok(());
    }

    // 元数据分批推送；音频随后单独按 SK02 分块上传。
    for batch in unsynced.chunks(PUSH_BATCH) {
        let memos: Vec<Value> = batch.iter().map(|row| row.to_sync_json()).collect();
        crate::mobile_client::send_memo_payload(
            app,
            json!({ "v": 1, "type": "memo.push", "memos": memos, "ts": now_ms() }),
        )?;
    }

    for row in &unsynced {
        if row.deleted_at.is_some() {
            continue;
        }
        let Some(path) = row.audio_path.as_deref() else { continue };
        let path = std::path::Path::new(path);
        if !path.exists() {
            // 音频被手动删掉时，把行修正成「无音频」，推送后 push.ack 即可标记同步。
            let _ = state.db.clear_audio(&row.id);
            continue;
        }
        let bytes = std::fs::metadata(path)
            .map_err(|error| format!("读取音频失败: {error}"))?
            .len() as i64;
        if bytes <= 0 {
            continue;
        }
        let sha256 = row
            .audio_sha256
            .clone()
            .ok_or_else(|| "音频缺少校验值".to_string())?;
        crate::mobile_client::send_memo_payload(
            app,
            json!({
                "v": 1,
                "type": "memo.audio.begin",
                "memoId": row.id,
                "bytes": bytes,
                "sha256": sha256,
                "ts": now_ms(),
            }),
        )?;

        let mut file = std::fs::File::open(path).map_err(|error| format!("打开音频失败: {error}"))?;
        let mut buffer = vec![0u8; CHUNK];
        let mut offset: u64 = 0;
        loop {
            let read = file
                .read(&mut buffer)
                .map_err(|error| format!("读取音频失败: {error}"))?;
            if read == 0 {
                break;
            }
            let frame = crate::memo_protocol::build(&row.id, offset, &buffer[..read])
                .ok_or_else(|| "音频分块无效".to_string())?;
            crate::mobile_client::send_memo_binary(app, frame)?;
            offset += read as u64;
            tokio::task::yield_now().await;
        }
        crate::mobile_client::send_memo_payload(
            app,
            json!({ "v": 1, "type": "memo.audio.commit", "memoId": row.id, "ts": now_ms() }),
        )?;
    }

    // 同步成功后的 `synced_at` 由桌面 ack 回填，见 `handle_server_message`。
    Ok(())
}

/// 手机 Rust 侧截获桌面回包：同步 ack 不进聊天记录，只更新本地状态。
/// 返回 true 表示这条消息已被消费。
pub fn handle_server_message(app: &AppHandle, text: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return false;
    };
    let kind = value.get("type").and_then(Value::as_str).unwrap_or("");
    if !kind.starts_with("memo.") {
        return false;
    }
    let Some(state) = app.try_state::<Arc<MemoState>>() else {
        return true;
    };
    let state = state.inner().clone();

    match kind {
        // 配对结果在 Rust 直接落盘：Key 不经过 WebView，只把结果事件发给前端。
        "memo.pair.result" => {
            let ok = value.get("ok").and_then(Value::as_bool) == Some(true);
            if ok {
                let token = value.get("token").and_then(Value::as_str).unwrap_or("");
                let key = value.get("key").and_then(Value::as_str);
                if token.trim().len() < 16 {
                    let _ = app.emit(
                        "memo",
                        MemoEvent {
                            kind: "error",
                            id: None,
                            status: None,
                            message: Some("电脑返回的配对凭据无效".into()),
                        },
                    );
                    return true;
                }
                match super::apply_pair_result(&state, token, key) {
                    Ok(_) => {
                        let _ = app.emit(
                            "memo",
                            MemoEvent {
                                kind: "key",
                                id: None,
                                status: None,
                                message: Some("paired".into()),
                            },
                        );
                        // 刚配对完立即补一次镜像同步。
                        kick(app.clone(), state.clone());
                    }
                    Err(error) => {
                        let _ = app.emit(
                            "memo",
                            MemoEvent {
                                kind: "error",
                                id: None,
                                status: None,
                                message: Some(error),
                            },
                        );
                    }
                }
            } else {
                let message = value
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("配对失败");
                let _ = app.emit(
                    "memo",
                    MemoEvent {
                        kind: "error",
                        id: None,
                        status: None,
                        message: Some(message.to_string()),
                    },
                );
            }
        }
        "memo.push.ack" => {
            let ids: Vec<String> = value
                .get("ids")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(|item| item.to_string())
                        .collect()
                })
                .unwrap_or_default();
            // 有音频的条目要等 committed 才算同步；没有音频（或已删除）的现在就能标记。
            let mut done = Vec::new();
            for id in ids {
                match state.db.get(&id) {
                    Ok(Some(row)) if row.audio_path.is_none() || row.deleted_at.is_some() => {
                        done.push(id);
                    }
                    _ => {}
                }
            }
            mark_synced(app, &state, done);
        }
        "memo.audio.committed" => {
            if value.get("ok").and_then(Value::as_bool) == Some(true) {
                if let Some(id) = value.get("memoId").and_then(Value::as_str) {
                    mark_synced(app, &state, vec![id.to_string()]);
                }
            }
        }
        "memo.delete.ack" => {
            if value.get("ok").and_then(Value::as_bool) == Some(true) {
                if let Some(id) = value.get("memoId").and_then(Value::as_str) {
                    mark_synced(app, &state, vec![id.to_string()]);
                }
            }
        }
        "memo.error" => {
            let message = value
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("同步失败");
            let _ = app.emit(
                "memo",
                MemoEvent {
                    kind: "error",
                    id: None,
                    status: None,
                    message: Some(message.to_string()),
                },
            );
        }
        _ => {}
    }
    true
}

fn mark_synced(app: &AppHandle, state: &Arc<MemoState>, ids: Vec<String>) {
    if ids.is_empty() {
        return;
    }
    if state.db.mark_synced(&ids, now_ms()).is_err() {
        return;
    }
    for id in ids {
        let _ = app.emit("memo", MemoEvent::changed(&id));
    }
}

/// 当前是否有待同步条目（设置页展示用）。
pub fn pending_count(state: &MemoState) -> Result<i64, String> {
    Ok(state
        .db
        .unsynced()?
        .iter()
        .filter(|row| row.deleted_at.is_none())
        .count() as i64)
}
