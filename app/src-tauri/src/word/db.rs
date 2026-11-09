//! 英语角的本地 SQLite（`words.db`）。
//!
//! 两端同 schema；桌面在 `~/.sidekick/words.db`，手机在 `<app_data>/word/words.db`。
//! 只做本机读写，不参与协议编解码（见 `sync.rs`）。

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};

use super::types::{WordRow, WordSource, WordStatus};
use super::now_ms;

pub struct WordDb {
    conn: Mutex<Connection>,
}

impl WordDb {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|error| format!("打开词库失败: {error}"))?;
        Self::from_connection(conn)
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory().map_err(|error| error.to_string())?;
        Self::from_connection(conn)
    }

    fn from_connection(conn: Connection) -> Result<Self, String> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS words(
               id TEXT PRIMARY KEY,
               word TEXT NOT NULL,
               normalized TEXT NOT NULL UNIQUE,
               status TEXT NOT NULL,
               explanation TEXT,
               note TEXT,
               context TEXT,
               source TEXT NOT NULL,
               created_at INTEGER NOT NULL,
               updated_at INTEGER NOT NULL,
               explained_at INTEGER,
               deleted_at INTEGER,
               model TEXT,
               prompt_version INTEGER,
               rev INTEGER NOT NULL DEFAULT 1,
               last_error TEXT,
               dirty INTEGER NOT NULL DEFAULT 0
             );
             CREATE INDEX IF NOT EXISTS words_updated ON words(updated_at);
             CREATE INDEX IF NOT EXISTS words_status ON words(status);",
        )
        .map_err(|error| format!("初始化词库失败: {error}"))?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|_| "词库锁异常".to_string())
    }

    /// 新增（或复活/更新已有）词条为 pending；已有解释保持不变。
    pub fn insert_pending(
        &self,
        normalized: &str,
        word: &str,
        context: Option<&str>,
        source: WordSource,
    ) -> Result<WordRow, String> {
        let now = now_ms();
        {
            let conn = self.lock()?;
            let existing: Option<(i64, Option<String>)> = conn
                .query_row(
                    "SELECT created_at, explanation FROM words WHERE normalized = ?1",
                    params![normalized],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .optional()
                .map_err(|error| error.to_string())?;

            match existing {
                Some((created_at, explanation)) => {
                    let status = if explanation.is_some() {
                        WordStatus::Ready
                    } else {
                        WordStatus::Pending
                    };
                    conn.execute(
                        "UPDATE words SET word = ?2, status = ?3, context = COALESCE(?4, context),
                           source = ?5, updated_at = ?6, deleted_at = NULL, last_error = NULL,
                           rev = rev + 1, dirty = 1
                         WHERE normalized = ?1",
                        params![normalized, word, status.as_str(), context, source.as_str(), now],
                    )
                    .map_err(|error| error.to_string())?;
                    // 词条早已存在：保留原 created_at。
                    let _ = created_at;
                }
                None => {
                    conn.execute(
                        "INSERT INTO words(id, word, normalized, status, context, source,
                           created_at, updated_at, rev)
                         VALUES(?1, ?2, ?1, 'pending', ?3, ?4, ?5, ?5, 1)",
                        params![normalized, word, context, source.as_str(), now],
                    )
                    .map_err(|error| error.to_string())?;
                    conn.execute(
                        "UPDATE words SET dirty = 1 WHERE normalized = ?1",
                        params![normalized],
                    )
                    .map_err(|error| error.to_string())?;
                }
            }
        }
        self.get(normalized)?
            .ok_or_else(|| "词条写入后读取失败".to_string())
    }

    pub fn get(&self, normalized: &str) -> Result<Option<WordRow>, String> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT * FROM words WHERE normalized = ?1",
            params![normalized],
            row_to_word,
        )
        .optional()
        .map_err(|error| error.to_string())
    }

    /// 列表：`query` 为空返回全部；按 updated_at 倒序，最多 2000 条。
    pub fn list(&self, query: Option<&str>) -> Result<Vec<WordRow>, String> {
        let conn = self.lock()?;
        let limit = 2000_i64;
        let mut rows = Vec::new();
        match query.map(str::trim).filter(|text| !text.is_empty()) {
            Some(text) => {
                let pattern = format!("%{}%", text.to_lowercase());
                let mut statement = conn
                    .prepare(
                        "SELECT * FROM words WHERE deleted_at IS NULL
                         AND (normalized LIKE ?1 OR word LIKE ?1)
                         ORDER BY updated_at DESC LIMIT ?2",
                    )
                    .map_err(|error| error.to_string())?;
                let iter = statement
                    .query_map(params![pattern, limit], row_to_word)
                    .map_err(|error| error.to_string())?;
                for row in iter {
                    rows.push(row.map_err(|error| error.to_string())?);
                }
            }
            None => {
                let mut statement = conn
                    .prepare(
                        "SELECT * FROM words WHERE deleted_at IS NULL
                         ORDER BY updated_at DESC LIMIT ?1",
                    )
                    .map_err(|error| error.to_string())?;
                let iter = statement
                    .query_map(params![limit], row_to_word)
                    .map_err(|error| error.to_string())?;
                for row in iter {
                    rows.push(row.map_err(|error| error.to_string())?);
                }
            }
        }
        Ok(rows)
    }

    /// 解释成功：写 explanation + model + 版本，状态转 ready。
    pub fn mark_ready(
        &self,
        normalized: &str,
        explanation_json: &str,
        model: &str,
        prompt_version: i64,
    ) -> Result<Option<WordRow>, String> {
        let now = now_ms();
        {
            let conn = self.lock()?;
            conn.execute(
                "UPDATE words SET status = 'ready', explanation = ?2, explained_at = ?3,
                   model = ?4, prompt_version = ?5, last_error = NULL, updated_at = ?3,
                   rev = rev + 1, dirty = 1
                 WHERE normalized = ?1",
                params![normalized, explanation_json, now, model, prompt_version],
            )
            .map_err(|error| error.to_string())?;
        }
        self.get(normalized)
    }

    /// 解释失败：状态转 failed 并记错误码（不覆盖已有解释）。
    pub fn mark_failed(&self, normalized: &str, error: &str) -> Result<Option<WordRow>, String> {
        let now = now_ms();
        {
            let conn = self.lock()?;
            conn.execute(
                "UPDATE words SET status = CASE WHEN explanation IS NULL THEN 'failed' ELSE status END,
                   last_error = ?2, updated_at = ?3, rev = rev + 1, dirty = 1
                 WHERE normalized = ?1",
                params![normalized, error, now],
            )
            .map_err(|error| error.to_string())?;
        }
        self.get(normalized)
    }

    pub fn set_note(&self, normalized: &str, note: Option<&str>) -> Result<Option<WordRow>, String> {
        let now = now_ms();
        {
            let conn = self.lock()?;
            conn.execute(
                "UPDATE words SET note = ?2, updated_at = ?3, rev = rev + 1, dirty = 1 WHERE normalized = ?1",
                params![normalized, note, now],
            )
            .map_err(|error| error.to_string())?;
        }
        self.get(normalized)
    }

    /// 墓碑删除；重复删除幂等。
    pub fn soft_delete(&self, normalized: &str) -> Result<Option<WordRow>, String> {
        let now = now_ms();
        {
            let conn = self.lock()?;
            conn.execute(
                "UPDATE words SET deleted_at = ?2, updated_at = ?2, rev = rev + 1, dirty = 1
                 WHERE normalized = ?1 AND deleted_at IS NULL",
                params![normalized, now],
            )
            .map_err(|error| error.to_string())?;
        }
        self.get(normalized)
    }

    pub fn count(&self) -> Result<i64, String> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT COUNT(*) FROM words WHERE deleted_at IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())
    }

    /// 同步下行：`updated_at > since` 的条目（含墓碑），按更新时间升序、offset 分页。
    pub fn since_page(
        &self,
        since: i64,
        offset: usize,
        limit: usize,
    ) -> Result<Vec<WordRow>, String> {
        let conn = self.lock()?;
        let mut statement = conn
            .prepare(
                "SELECT * FROM words WHERE updated_at > ?1
                 ORDER BY updated_at ASC, id ASC LIMIT ?2 OFFSET ?3",
            )
            .map_err(|error| error.to_string())?;
        let iter = statement
            .query_map(params![since, limit as i64, offset as i64], row_to_word)
            .map_err(|error| error.to_string())?;
        let mut rows = Vec::new();
        for row in iter {
            rows.push(row.map_err(|error| error.to_string())?);
        }
        Ok(rows)
    }

    /// 整行写入（同步合并用）；不做业务判断，合并规则在 `sync::merge`。
    pub fn upsert(&self, row: &WordRow) -> Result<(), String> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO words(id, word, normalized, status, explanation, note, context, source,
               created_at, updated_at, explained_at, deleted_at, model, prompt_version, rev, last_error, dirty)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
             ON CONFLICT(id) DO UPDATE SET
               word = excluded.word, normalized = excluded.normalized, status = excluded.status,
               explanation = excluded.explanation, note = excluded.note, context = excluded.context,
               source = excluded.source, created_at = excluded.created_at,
               updated_at = excluded.updated_at, explained_at = excluded.explained_at,
               deleted_at = excluded.deleted_at, model = excluded.model,
               prompt_version = excluded.prompt_version, rev = excluded.rev,
               last_error = excluded.last_error, dirty = excluded.dirty",
            params![
                row.id,
                row.word,
                row.normalized,
                row.status.as_str(),
                row.explanation,
                row.note,
                row.context,
                row.source.as_str(),
                row.created_at,
                row.updated_at,
                row.explained_at,
                row.deleted_at,
                row.model,
                row.prompt_version,
                row.rev,
                row.last_error,
                if row.dirty { 1 } else { 0 }
            ],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    /// 待推送的本地变更（手机同步上行用）。
    #[cfg_attr(desktop, allow(dead_code))]
    pub fn dirty_rows(&self, limit: usize) -> Result<Vec<WordRow>, String> {
        let conn = self.lock()?;
        let mut statement = conn
            .prepare("SELECT * FROM words WHERE dirty = 1 ORDER BY updated_at ASC LIMIT ?1")
            .map_err(|error| error.to_string())?;
        let iter = statement
            .query_map(params![limit as i64], row_to_word)
            .map_err(|error| error.to_string())?;
        let mut rows = Vec::new();
        for row in iter {
            rows.push(row.map_err(|error| error.to_string())?);
        }
        Ok(rows)
    }

    #[cfg_attr(desktop, allow(dead_code))]
    pub fn clear_dirty(&self, ids: &[String]) -> Result<(), String> {
        let conn = self.lock()?;
        for id in ids {
            conn.execute("UPDATE words SET dirty = 0 WHERE id = ?1", params![id])
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    /// 清理过期墓碑（默认 90 天）。
    pub fn purge_tombstones(&self, before: i64) -> Result<usize, String> {
        let conn = self.lock()?;
        conn.execute(
            "DELETE FROM words WHERE deleted_at IS NOT NULL AND deleted_at < ?1",
            params![before],
        )
        .map_err(|error| error.to_string())
    }
}

fn row_to_word(row: &rusqlite::Row<'_>) -> rusqlite::Result<WordRow> {
    Ok(WordRow {
        id: row.get("id")?,
        word: row.get("word")?,
        normalized: row.get("normalized")?,
        status: WordStatus::parse(row.get::<_, String>("status")?.as_str()),
        explanation: row.get("explanation")?,
        note: row.get("note")?,
        context: row.get("context")?,
        source: WordSource::parse(row.get::<_, String>("source")?.as_str()),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        explained_at: row.get("explained_at")?,
        deleted_at: row.get("deleted_at")?,
        model: row.get("model")?,
        prompt_version: row.get("prompt_version")?,
        rev: row.get("rev")?,
        last_error: row.get("last_error")?,
        dirty: row.get::<_, i64>("dirty")? != 0,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_is_idempotent_and_dedupes() {
        let db = WordDb::in_memory().unwrap();
        let first = db
            .insert_pending("run", "Run", Some("run the tests"), WordSource::Manual)
            .unwrap();
        assert_eq!(first.status, WordStatus::Pending);
        let second = db
            .insert_pending("run", "run", None, WordSource::Paste)
            .unwrap();
        assert_eq!(second.created_at, first.created_at);
        assert_eq!(db.count().unwrap(), 1);
        // 旧语境保留（COALESCE），来源更新。
        assert_eq!(second.context.as_deref(), Some("run the tests"));
        assert_eq!(second.source, WordSource::Paste);
    }

    #[test]
    fn mark_ready_and_failed_transitions() {
        let db = WordDb::in_memory().unwrap();
        db.insert_pending("run", "run", None, WordSource::Manual).unwrap();
        let explanation = serde_json::json!({
            "word": "run",
            "definitions": [{ "zh": "跑" }],
            "examples": [{ "en": "I run.", "zh": "我跑。" }]
        })
        .to_string();
        let ready = db.mark_ready("run", &explanation, "qwen3.8-flash", 1).unwrap().unwrap();
        assert_eq!(ready.status, WordStatus::Ready);
        assert!(ready.explained_at.is_some());
        assert_eq!(ready.first_definition().as_deref(), Some("跑"));

        // 失败不覆盖已有解释，只记错误码。
        let failed = db.mark_failed("run", "timeout").unwrap().unwrap();
        assert_eq!(failed.status, WordStatus::Ready);
        assert_eq!(failed.last_error.as_deref(), Some("timeout"));
    }

    #[test]
    fn list_search_delete_and_since() {
        let db = WordDb::in_memory().unwrap();
        db.insert_pending("alpha", "alpha", None, WordSource::Manual).unwrap();
        db.insert_pending("beta", "beta", None, WordSource::Manual).unwrap();
        assert_eq!(db.list(None).unwrap().len(), 2);
        assert_eq!(db.list(Some("alp")).unwrap().len(), 1);
        db.soft_delete("alpha").unwrap();
        assert_eq!(db.list(None).unwrap().len(), 1);
        assert_eq!(db.count().unwrap(), 1);
        assert!(db.get("alpha").unwrap().unwrap().deleted_at.is_some());
        // since 包含墓碑（下行同步需要它传播删除）。
        assert!(db
            .since_page(0, 0, 10)
            .unwrap()
            .iter()
            .any(|row| row.normalized == "alpha"));
    }

    #[test]
    fn upsert_replaces_row() {
        let db = WordDb::in_memory().unwrap();
        let mut row = db.insert_pending("gamma", "gamma", None, WordSource::Manual).unwrap();
        row.status = WordStatus::Failed;
        row.last_error = Some("model_error".into());
        db.upsert(&row).unwrap();
        assert_eq!(db.get("gamma").unwrap().unwrap().status, WordStatus::Failed);
    }
}
