//! 手机端英语角：Tauri 命令、同步客户端。
//!
//! Key 复用备忘录配对下发的 `SecureData.api_key`（`<app_data>/memo/secure.json`），
//! 不新增第三套凭据。同步方向：手机 ↔ 桌面（局域网 WS，`word.*`）。

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use super::db::WordDb;
use super::paths::WordPaths;
use super::types::{
    WordConfig, WordDetail, WordGenerateResult, WordRow, WordSource, WordStatusInfo, WordSummary,
    row_from_sync_json, row_to_sync_json,
};
use super::usage::{UsageStats, UsageStore};
use super::{MAX_GENERATE_WORDS, MODEL, PROMPT_VERSION, normalize, now_ms, trim_context, validate_word};

const PUSH_BATCH: usize = 200;
const SNAPSHOT_BATCH: usize = 100;

pub struct WordMobile {
    app: AppHandle,
    db: WordDb,
    usage: UsageStore,
    config_path: PathBuf,
    config: Mutex<WordConfig>,
    sync_path: PathBuf,
    cursor: Mutex<i64>,
    syncing: AtomicBool,
}

impl WordMobile {
    pub fn new(app: AppHandle) -> Result<Self, String> {
        let paths = WordPaths::mobile(&app)?;
        let db = WordDb::open(&paths.db)?;
        let usage = UsageStore::new(paths.usage.clone());
        let config = load_config(&paths.config);
        let sync_path = paths.root.join("word_sync.json");
        let cursor = load_cursor(&sync_path);
        let _ = db.purge_tombstones(now_ms() - 90 * 24 * 60 * 60 * 1000);
        Ok(Self {
            app,
            db,
            usage,
            config_path: paths.config,
            config: Mutex::new(config),
            sync_path,
            cursor: Mutex::new(cursor),
            syncing: AtomicBool::new(false),
        })
    }

    fn secure(&self) -> Result<crate::memo::mobile::keys::SecureData, String> {
        let paths = crate::memo::storage::MemoPaths::mobile(&self.app)?;
        Ok(crate::memo::mobile::keys::SecureData::load(&paths.secure))
    }

    fn api_key(&self) -> Option<String> {
        self.secure()
            .ok()
            .and_then(|secure| secure.api_key)
            .map(|key| key.trim().to_string())
            .filter(|key| !key.is_empty())
    }

    fn paired(&self) -> bool {
        self.secure()
            .ok()
            .and_then(|secure| secure.token)
            .is_some_and(|token| !token.trim().is_empty())
    }

    fn agreed(&self) -> bool {
        self.config
            .lock()
            .map(|guard| guard.agreed)
            .unwrap_or(false)
    }

    fn model(&self) -> String {
        self.config
            .lock()
            .ok()
            .and_then(|guard| guard.model.clone())
            .filter(|model| !model.trim().is_empty())
            .unwrap_or_else(|| MODEL.to_string())
    }

    fn save_config(&self) -> Result<(), String> {
        let config = self
            .config
            .lock()
            .map_err(|_| "配置锁异常".to_string())?
            .clone();
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| format!("创建配置目录失败: {error}"))?;
        }
        let bytes = serde_json::to_vec_pretty(&config).map_err(|error| error.to_string())?;
        std::fs::write(&self.config_path, bytes).map_err(|error| format!("保存配置失败: {error}"))?;
        set_private_permissions(&self.config_path);
        Ok(())
    }

    fn cursor(&self) -> i64 {
        self.cursor.lock().map(|guard| *guard).unwrap_or(0)
    }

    fn set_cursor(&self, cursor: i64) {
        if let Ok(mut guard) = self.cursor.lock() {
            *guard = cursor;
        }
        let body = json!({ "version": 1, "cursor": cursor });
        if let Some(parent) = self.sync_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(bytes) = serde_json::to_vec_pretty(&body) {
            if std::fs::write(&self.sync_path, bytes).is_ok() {
                set_private_permissions(&self.sync_path);
            }
        }
    }

    fn emit_changed(&self) {
        let _ = self.app.emit("word-changed", json!({}));
    }

    pub fn list(&self, query: Option<&str>) -> Result<Vec<WordSummary>, String> {
        Ok(self
            .db
            .list(query)?
            .iter()
            .map(WordRow::summary)
            .collect())
    }

    pub fn get(&self, word: &str) -> Result<Option<WordDetail>, String> {
        let normalized = normalize(word);
        Ok(self.db.get(&normalized)?.map(|row| row.detail()))
    }

    pub fn add(
        &self,
        word: &str,
        context: Option<&str>,
        source: WordSource,
    ) -> Result<WordDetail, String> {
        let normalized = validate_word(word)?;
        let context = trim_context(context);
        let row = self
            .db
            .insert_pending(&normalized, word.trim(), context.as_deref(), source)?;
        self.emit_changed();
        kick(self.app.clone());
        Ok(row.detail())
    }

    pub async fn explain(
        &self,
        word: &str,
        context: Option<&str>,
    ) -> Result<WordDetail, String> {
        let normalized = validate_word(word)?;
        if !self.agreed() {
            return Err("need_consent".into());
        }
        let key = self.api_key().ok_or_else(|| "no_key".to_string())?;
        let model = self.model();

        if let Some(row) = self.db.get(&normalized)? {
            let fresh = row.explanation.is_some()
                && row.prompt_version == Some(PROMPT_VERSION)
                && row.model.as_deref() == Some(model.as_str())
                && row.deleted_at.is_none();
            if fresh {
                return Ok(row.detail());
            }
        } else {
            self.db.insert_pending(
                &normalized,
                word.trim(),
                trim_context(context).as_deref(),
                WordSource::Mobile,
            )?;
        }

        let context = trim_context(context);
        match super::llm::explain(&key, word.trim(), context.as_deref()).await {
            Ok((explanation, completion)) => {
                let explanation_json =
                    serde_json::to_string(&explanation).map_err(|error| error.to_string())?;
                self.usage
                    .record(completion.prompt_tokens, completion.completion_tokens);
                let row = self
                    .db
                    .mark_ready(&normalized, &explanation_json, &model, PROMPT_VERSION)?
                    .ok_or_else(|| "词条不存在".to_string())?;
                self.emit_changed();
                kick(self.app.clone());
                Ok(row.detail())
            }
            Err(error) => {
                let _ = self.db.mark_failed(&normalized, &error);
                self.emit_changed();
                Err(error)
            }
        }
    }

    pub fn set_note(&self, word: &str, note: Option<&str>) -> Result<WordDetail, String> {
        let normalized = normalize(word);
        let row = self
            .db
            .set_note(&normalized, note)?
            .ok_or_else(|| "词条不存在".to_string())?;
        self.emit_changed();
        kick(self.app.clone());
        Ok(row.detail())
    }

    pub fn delete(&self, word: &str) -> Result<(), String> {
        let normalized = normalize(word);
        self.db
            .soft_delete(&normalized)?
            .ok_or_else(|| "词条不存在".to_string())?;
        self.emit_changed();
        kick(self.app.clone());
        Ok(())
    }

    pub async fn generate(&self, words: &[String]) -> Result<WordGenerateResult, String> {
        if !self.agreed() {
            return Err("need_consent".into());
        }
        let key = self.api_key().ok_or_else(|| "no_key".to_string())?;
        let mut selected = Vec::new();
        for word in words.iter().take(MAX_GENERATE_WORDS) {
            if let Ok(normalized) = validate_word(word) {
                if !selected.contains(&normalized) {
                    selected.push(normalized);
                }
            }
        }
        if selected.is_empty() {
            return Err("invalid_word".into());
        }
        let model = self.model();
        let (sentences, completion) = super::llm::generate(&key, &selected).await?;
        self.usage
            .record(completion.prompt_tokens, completion.completion_tokens);
        Ok(WordGenerateResult { sentences, model })
    }

    pub fn usage_stats(&self) -> UsageStats {
        self.usage.stats()
    }

    /// 导出全部词条为 Markdown（供「导出」弹层复制）。
    pub fn export_markdown(&self) -> Result<String, String> {
        Ok(super::sync::to_markdown(&self.db.list(None)?))
    }

    pub fn status(&self) -> WordStatusInfo {
        WordStatusInfo {
            has_key: self.api_key().is_some(),
            agreed: self.agreed(),
            paired: Some(self.paired()),
            model: self.model(),
            total: self.db.count().ok(),
        }
    }

    pub fn set_agreed(&self, agreed: bool) -> Result<WordStatusInfo, String> {
        {
            let mut config = self.config.lock().map_err(|_| "配置锁异常".to_string())?;
            config.agreed = agreed;
        }
        self.save_config()?;
        Ok(self.status())
    }

    // ── 同步 ──────────────────────────────────────────────────────────

    fn apply_rows(&self, values: &[Value]) {
        for value in values {
            let Ok(incoming) = row_from_sync_json(value) else {
                continue;
            };
            let local = self.db.get(&incoming.normalized).ok().flatten();
            let mut merged = super::sync::merge(local.as_ref(), incoming);
            // 本地未推送的改动继续保留 dirty，下一轮 push 补上。
            merged.dirty = local.as_ref().map(|row| row.dirty).unwrap_or(false);
            let _ = self.db.upsert(&merged);
        }
        self.emit_changed();
    }

    fn push_dirty(&self, token: &str, device_id: &str) -> Result<(), String> {
        let rows = self.db.dirty_rows(PUSH_BATCH)?;
        if rows.is_empty() {
            return Ok(());
        }
        let words: Vec<Value> = rows.iter().map(row_to_sync_json).collect();
        crate::mobile_client::send_memo_payload(
            &self.app,
            json!({
                "v": 1,
                "type": "word.push",
                "deviceId": device_id,
                "token": token,
                "words": words,
                "ts": now_ms(),
            }),
        )
    }

    fn send_hello(&self) -> Result<(), String> {
        let secure = self.secure()?;
        let token = secure
            .token
            .clone()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "not_paired".to_string())?;
        crate::mobile_client::send_memo_payload(
            &self.app,
            json!({
                "v": 1,
                "type": "word.hello",
                "deviceId": secure.device_id,
                "token": token,
                "since": self.cursor(),
                "ts": now_ms(),
            }),
        )
    }

    /// 收到服务端消息；返回 true 表示已被英语角消费。
    pub fn handle_server_message(&self, text: &str) -> bool {
        let Ok(value) = serde_json::from_str::<Value>(text) else {
            return false;
        };
        let Some(kind) = value.get("type").and_then(Value::as_str) else {
            return false;
        };
        if !kind.starts_with("word.") {
            return false;
        }
        match kind {
            "word.hello.ack" => {
                if value.get("ok").and_then(Value::as_bool) == Some(true) {
                    if let Ok(secure) = self.secure() {
                        if let Some(token) = secure.token.clone() {
                            let _ = self.push_dirty(&token, &secure.device_id);
                        }
                    }
                } else {
                    let code = value
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("sync_failed");
                    eprintln!("[word] 同步握手失败: {code}");
                }
            }
            "word.snapshot" => {
                let words = value
                    .get("words")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                self.apply_rows(&words);
                if value.get("done").and_then(Value::as_bool) == Some(true) {
                    let server_now = value.get("serverNow").and_then(Value::as_i64).unwrap_or(0);
                    if server_now > 0 {
                        self.set_cursor(server_now);
                    }
                }
            }
            "word.push.ack" => {
                let ids: Vec<String> = value
                    .get("ids")
                    .and_then(Value::as_array)
                    .map(|items| {
                        items
                            .iter()
                            .filter_map(Value::as_str)
                            .map(str::to_string)
                            .collect()
                    })
                    .unwrap_or_default();
                let _ = self.db.clear_dirty(&ids);
            }
            "word.changed" => {
                let words = value
                    .get("words")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                self.apply_rows(&words);
            }
            "word.error" => {
                let code = value
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or("sync_failed");
                eprintln!("[word] 同步错误: {code}");
            }
            _ => {}
        }
        true
    }
}

/// 触发一次词库同步；未连接/未配对是常态，静默返回。
pub fn kick(app: AppHandle) {
    let Some(state) = app.try_state::<Arc<WordMobile>>() else {
        return;
    };
    let state = state.inner().clone();
    if state.syncing.swap(true, Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let result = run(&state);
        state.syncing.store(false, Ordering::SeqCst);
        if let Err(error) = result {
            // 未连接/未配对是常态，不打日志刷屏。
            if error != "not-connected" && error != "not_paired" {
                eprintln!("[word] 同步失败: {error}");
            }
        }
    });
}

fn run(state: &WordMobile) -> Result<(), String> {
    state.send_hello().map_err(|error| {
        if error.contains("还没连接") {
            "not-connected".to_string()
        } else {
            error
        }
    })?;
    let secure = state.secure()?;
    if let Some(token) = secure.token.clone() {
        let _ = state.push_dirty(&token, &secure.device_id);
    }
    Ok(())
}

fn load_config(path: &std::path::Path) -> WordConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn load_cursor(path: &std::path::Path) -> i64 {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|value| value.get("cursor").and_then(Value::as_i64))
        .unwrap_or(0)
}

#[cfg(unix)]
fn set_private_permissions(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &std::path::Path) {}

// ── Tauri 命令 ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn word_list(
    state: State<'_, Arc<WordMobile>>,
    query: Option<String>,
) -> Result<Vec<WordSummary>, String> {
    state.list(query.as_deref())
}

#[tauri::command]
pub fn word_get(
    state: State<'_, Arc<WordMobile>>,
    word: String,
) -> Result<Option<WordDetail>, String> {
    state.get(&word)
}

#[tauri::command]
pub fn word_add(
    state: State<'_, Arc<WordMobile>>,
    word: String,
    context: Option<String>,
    source: Option<String>,
) -> Result<WordDetail, String> {
    let source = WordSource::parse(source.as_deref().unwrap_or("mobile"));
    state.add(&word, context.as_deref(), source)
}

#[tauri::command]
pub async fn word_explain(
    state: State<'_, Arc<WordMobile>>,
    word: String,
    context: Option<String>,
) -> Result<WordDetail, String> {
    state.explain(&word, context.as_deref()).await
}

#[tauri::command]
pub fn word_set_note(
    state: State<'_, Arc<WordMobile>>,
    word: String,
    note: Option<String>,
) -> Result<WordDetail, String> {
    state.set_note(&word, note.as_deref())
}

#[tauri::command]
pub fn word_delete(state: State<'_, Arc<WordMobile>>, word: String) -> Result<(), String> {
    state.delete(&word)
}

#[tauri::command]
pub async fn word_generate(
    state: State<'_, Arc<WordMobile>>,
    words: Vec<String>,
) -> Result<WordGenerateResult, String> {
    state.generate(&words).await
}

#[tauri::command]
pub fn word_usage(state: State<'_, Arc<WordMobile>>) -> UsageStats {
    state.usage_stats()
}

#[tauri::command]
pub fn word_status(state: State<'_, Arc<WordMobile>>) -> WordStatusInfo {
    state.status()
}

#[tauri::command]
pub fn word_consent(
    state: State<'_, Arc<WordMobile>>,
    agreed: bool,
) -> Result<WordStatusInfo, String> {
    state.set_agreed(agreed)
}

#[tauri::command]
pub fn word_export_markdown(state: State<'_, Arc<WordMobile>>) -> Result<String, String> {
    state.export_markdown()
}

/// 手机端暂不支持系统发音（WebView speechSynthesis 在 Android WebView 不可靠）。
#[tauri::command]
pub fn word_speak(_word: String) -> Result<(), String> {
    Err("unsupported_platform".into())
}

#[tauri::command]
pub fn word_sync_now(app: AppHandle, state: State<'_, Arc<WordMobile>>) -> Result<(), String> {
    let _ = state;
    kick(app);
    Ok(())
}

/// 供 `mobile_client` 读取：把一条服务端文本交给英语角消费。
pub fn handle_server_message(app: &AppHandle, text: &str) -> bool {
    match app.try_state::<Arc<WordMobile>>() {
        Some(state) => state.inner().handle_server_message(text),
        None => false,
    }
}

const _: usize = SNAPSHOT_BATCH;
