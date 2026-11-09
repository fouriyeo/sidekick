//! 桌面端英语角：Tauri 命令、状态、剪贴板候选。
//!
//! LLM Key 复用 `~/.sidekick/asr.json`（与语音同一个百炼 Key），不新增第三套凭据。

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::broadcast;

use super::db::WordDb;
use super::paths::WordPaths;
use super::types::{
    WordConfig, WordDetail, WordGenerateResult, WordRow, WordSource, WordStatusInfo, WordSummary,
};
use super::usage::{UsageStats, UsageStore};
use super::{MAX_GENERATE_WORDS, MODEL, PROMPT_VERSION, normalize, trim_context, validate_word};

pub struct WordHub {
    app: AppHandle,
    db: WordDb,
    usage: UsageStore,
    config_path: PathBuf,
    config: Mutex<WordConfig>,
    broadcaster: Mutex<Option<broadcast::Sender<String>>>,
}

impl WordHub {
    pub fn new(app: AppHandle) -> Result<Self, String> {
        let paths = WordPaths::desktop()?;
        let db = WordDb::open(&paths.db)?;
        let usage = UsageStore::new(paths.usage.clone());
        let config = load_config(&paths.config);
        let _ = db.purge_tombstones(super::now_ms() - 90 * 24 * 60 * 60 * 1000);
        Ok(Self {
            app,
            db,
            usage,
            config_path: paths.config,
            config: Mutex::new(config),
            broadcaster: Mutex::new(None),
        })
    }

    /// 由 `desktop_server::start` 注入 WS 广播句柄（手机端变更要推给桌面 UI 之外的对端）。
    pub fn set_broadcaster(&self, sender: broadcast::Sender<String>) {
        if let Ok(mut guard) = self.broadcaster.lock() {
            *guard = Some(sender);
        }
    }

    fn api_key(&self) -> Option<String> {
        crate::asr_config::load()
            .api_key
            .map(|key| key.trim().to_string())
            .filter(|key| !key.is_empty())
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

    /// 本地或对端变更后：通知 WebView 刷新 + 广播给其他端。
    pub fn changed(&self, words: Vec<Value>) {
        let _ = self.app.emit("word-changed", json!({}));
        if let Ok(guard) = self.broadcaster.lock() {
            if let Some(tx) = guard.as_ref() {
                let payload = json!({
                    "v": 1,
                    "type": "word.changed",
                    "words": words,
                    "ts": super::now_ms(),
                })
                .to_string();
                let _ = tx.send(payload);
            }
        }
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
        let row = self.db.insert_pending(
            &normalized,
            word.trim(),
            context.as_deref(),
            source,
        )?;
        self.changed(vec![super::types::row_to_sync_json(&row)]);
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

        // 已有解释且提示词版本一致：直接命中缓存，0 网络调用。
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
                WordSource::Manual,
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
                self.changed(vec![super::types::row_to_sync_json(&row)]);
                Ok(row.detail())
            }
            Err(error) => {
                let _ = self.db.mark_failed(&normalized, &error);
                if let Ok(Some(row)) = self.db.get(&normalized) {
                    self.changed(vec![super::types::row_to_sync_json(&row)]);
                }
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
        self.changed(vec![super::types::row_to_sync_json(&row)]);
        Ok(row.detail())
    }

    pub fn delete(&self, word: &str) -> Result<(), String> {
        let normalized = normalize(word);
        let row = self
            .db
            .soft_delete(&normalized)?
            .ok_or_else(|| "词条不存在".to_string())?;
        self.changed(vec![super::types::row_to_sync_json(&row)]);
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

    /// 导出全部词条为 Markdown（供「导出」弹层复制；不写文件、不联网）。
    pub fn export_markdown(&self) -> Result<String, String> {
        Ok(super::sync::to_markdown(&self.db.list(None)?))
    }

    pub fn status(&self) -> WordStatusInfo {
        WordStatusInfo {
            has_key: self.api_key().is_some(),
            agreed: self.agreed(),
            paired: None,
            model: self.model(),
            total: self.db.count().ok(),
        }
    }

    pub fn set_agreed(&self, agreed: bool) -> Result<WordStatusInfo, String> {
        {
            let mut config = self
                .config
                .lock()
                .map_err(|_| "配置锁异常".to_string())?;
            config.agreed = agreed;
        }
        self.save_config()?;
        Ok(self.status())
    }

    /// 同步：返回 `updated_at > since` 的词条（含墓碑），offset 分页。
    pub fn snapshot(
        &self,
        since: i64,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<WordRow>, String> {
        self.db.since_page(since, offset, limit)
    }

    /// 手机推送：逐条与本地合并后落库，返回被接受的 id。
    pub fn merge_incoming(&self, rows: Vec<WordRow>) -> Result<Vec<String>, String> {
        let mut ids = Vec::new();
        let mut changed = Vec::new();
        for incoming in rows {
            let local = self.db.get(&incoming.normalized)?;
            let mut merged = super::sync::merge(local.as_ref(), incoming);
            // 桌面不向手机推送自己的词条变更走 dirty；合并结果一律视为已同步。
            merged.dirty = false;
            self.db.upsert(&merged)?;
            ids.push(merged.normalized.clone());
            changed.push(super::types::row_to_sync_json(&merged));
        }
        if !changed.is_empty() {
            self.changed(changed);
        }
        Ok(ids)
    }
}

fn load_config(path: &std::path::Path) -> WordConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
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
pub fn word_list(hub: State<'_, Arc<WordHub>>, query: Option<String>) -> Result<Vec<WordSummary>, String> {
    hub.list(query.as_deref())
}

#[tauri::command]
pub fn word_get(hub: State<'_, Arc<WordHub>>, word: String) -> Result<Option<WordDetail>, String> {
    hub.get(&word)
}

#[tauri::command]
pub fn word_add(
    hub: State<'_, Arc<WordHub>>,
    word: String,
    context: Option<String>,
    source: Option<String>,
) -> Result<WordDetail, String> {
    let source = WordSource::parse(source.as_deref().unwrap_or("manual"));
    hub.add(&word, context.as_deref(), source)
}

#[tauri::command]
pub async fn word_explain(
    hub: State<'_, Arc<WordHub>>,
    word: String,
    context: Option<String>,
) -> Result<WordDetail, String> {
    hub.explain(&word, context.as_deref()).await
}

#[tauri::command]
pub fn word_set_note(
    hub: State<'_, Arc<WordHub>>,
    word: String,
    note: Option<String>,
) -> Result<WordDetail, String> {
    hub.set_note(&word, note.as_deref())
}

#[tauri::command]
pub fn word_delete(hub: State<'_, Arc<WordHub>>, word: String) -> Result<(), String> {
    hub.delete(&word)
}

#[tauri::command]
pub async fn word_generate(
    hub: State<'_, Arc<WordHub>>,
    words: Vec<String>,
) -> Result<WordGenerateResult, String> {
    hub.generate(&words).await
}

#[tauri::command]
pub fn word_usage(hub: State<'_, Arc<WordHub>>) -> UsageStats {
    hub.usage_stats()
}

#[tauri::command]
pub fn word_status(hub: State<'_, Arc<WordHub>>) -> WordStatusInfo {
    hub.status()
}

#[tauri::command]
pub fn word_consent(hub: State<'_, Arc<WordHub>>, agreed: bool) -> Result<WordStatusInfo, String> {
    hub.set_agreed(agreed)
}

/// macOS 系统发音（零依赖、离线、不联网）。
#[tauri::command]
pub fn word_speak(word: String) -> Result<(), String> {
    let text = word.trim();
    if text.is_empty() {
        return Err("invalid_word".into());
    }
    std::process::Command::new("say")
        .arg(text)
        .spawn()
        .map(|_| ())
        .map_err(|_| "speak_failed".to_string())
}

/// 导出全部词条为 Markdown 文本（前端负责展示与复制）。
#[tauri::command]
pub fn word_export_markdown(hub: State<'_, Arc<WordHub>>) -> Result<String, String> {
    hub.export_markdown()
}

/// 从剪贴板历史里提取英文候选词（只读；不自动入库、不存整段原文）。
#[tauri::command]
pub fn word_clipboard_candidates(
    clipboard: State<'_, Arc<crate::clipboard_manager::ClipboardManager>>,
) -> Vec<String> {
    let snapshot = clipboard.snapshot();
    let mut seen = Vec::new();
    for item in snapshot.items.iter().take(20) {
        for token in extract_english_tokens(&item.text) {
            if !seen.contains(&token) {
                seen.push(token);
            }
            if seen.len() >= 20 {
                return seen;
            }
        }
    }
    seen
}

/// 提取英文单词/短语：字母、连字符、撇号；长度 2–32，必须含元音。
pub fn extract_english_tokens(text: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    for raw in text.split(|ch: char| !(ch.is_ascii_alphabetic() || ch == '-' || ch == '\'')) {
        let token = raw.trim_matches(|ch| ch == '-' || ch == '\'');
        if token.len() < 2 || token.len() > 32 {
            continue;
        }
        if !token.chars().any(|ch| matches!(ch, 'a' | 'e' | 'i' | 'o' | 'u' | 'A' | 'E' | 'I' | 'O' | 'U')) {
            continue;
        }
        let lowered = token.to_lowercase();
        if !tokens.contains(&lowered) {
            tokens.push(lowered);
        }
        if tokens.len() >= 20 {
            break;
        }
    }
    tokens
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_english_words_from_mixed_text() {
        let tokens = extract_english_tokens("We need to run the tests, but 中文 and x1 are ignored.");
        assert!(tokens.contains(&"need".to_string()));
        assert!(tokens.contains(&"run".to_string()));
        assert!(tokens.contains(&"tests".to_string()));
        assert!(!tokens.iter().any(|token| token == "x"));
    }

    #[test]
    fn extract_limits_and_dedupes() {
        let tokens = extract_english_tokens("run run run walk walk");
        assert_eq!(tokens, vec!["run".to_string(), "walk".to_string()]);
    }

    #[test]
    fn tokens_cap_at_twenty() {
        let text = (0..40)
            .map(|index| format!("word{index}"))
            .collect::<Vec<_>>()
            .join(" ");
        assert!(extract_english_tokens(&text).len() <= 20);
    }
}
