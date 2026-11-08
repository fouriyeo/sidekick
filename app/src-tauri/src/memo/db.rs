use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;

use super::types::{
    MemoDetail, MemoSegment, MemoStatus, MemoStorageStats, MemoStructured, MemoSummary,
    MemoType,
};

/// 数据库行（内部用，导出成 `MemoSummary` / `MemoDetail`）。
#[derive(Clone, Debug)]
pub struct MemoRow {
    pub id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub memo_type: MemoType,
    pub title: String,
    pub summary: Option<String>,
    pub todos: Vec<String>,
    pub tags: Vec<String>,
    pub transcript: String,
    pub duration_ms: i64,
    pub audio_path: Option<String>,
    pub audio_bytes: i64,
    pub audio_sha256: Option<String>,
    pub status: MemoStatus,
    pub ai_status: Option<String>,
    pub failed_segment: Option<i64>,
    pub last_error: Option<String>,
    pub segment_total: i64,
    pub deleted_at: Option<i64>,
    pub synced_at: Option<i64>,
    pub rev: i64,
}

impl MemoRow {
    pub fn summary(&self) -> MemoSummary {
        MemoSummary {
            id: self.id.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
            memo_type: self.memo_type,
            title: self.title.clone(),
            summary: self.summary.clone(),
            todos: self.todos.clone(),
            tags: self.tags.clone(),
            duration_ms: self.duration_ms,
            status: self.status,
            ai_status: self.ai_status.clone(),
            has_audio: self.audio_path.is_some(),
            audio_bytes: self.audio_bytes,
            synced: self.synced_at.is_some(),
            failed_segment: self.failed_segment,
            last_error: self.last_error.clone(),
        }
    }

    pub fn detail(&self, segments: Vec<MemoSegment>) -> MemoDetail {
        MemoDetail {
            summary: self.summary(),
            transcript: self.transcript.clone(),
            segments,
            audio_path: self.audio_path.clone(),
        }
    }

    pub fn to_sync_json(&self) -> Value {
        serde_json::json!({
            "id": self.id,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "type": self.memo_type.as_str(),
            "title": self.title,
            "summary": self.summary,
            "todos": self.todos,
            "tags": self.tags,
            "transcript": self.transcript,
            "durationMs": self.duration_ms,
            "audioBytes": self.audio_bytes,
            "audioSha256": self.audio_sha256,
            "deletedAt": self.deleted_at,
            "rev": self.rev,
        })
    }
}

/// 语音备忘录本地库。所有读写走一把锁；调用方在阻塞线程里用（Tauri 命令的
/// `spawn_blocking` 或后台任务），不要在 axum/tokio 运行时里直接大段写。
pub struct MemoDb {
    conn: Mutex<Connection>,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS memos (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    todos_json TEXT NOT NULL DEFAULT '[]',
    tags_json TEXT NOT NULL DEFAULT '[]',
    transcript TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    audio_path TEXT,
    audio_bytes INTEGER NOT NULL DEFAULT 0,
    audio_sha256 TEXT,
    status TEXT NOT NULL,
    ai_status TEXT,
    failed_segment INTEGER,
    last_error TEXT,
    segment_total INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    synced_at INTEGER,
    rev INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS memos_created ON memos(created_at DESC);
CREATE TABLE IF NOT EXISTS memo_segments (
    memo_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    PRIMARY KEY (memo_id, idx)
);
CREATE TABLE IF NOT EXISTS memo_kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

impl MemoDb {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| format!("创建数据目录失败: {error}"))?;
        }
        let conn = Connection::open(path).map_err(|error| format!("打开备忘录库失败: {error}"))?;
        Self::from_conn(conn)
    }

    #[cfg(test)]
    pub fn open_memory() -> Result<Self, String> {
        Self::from_conn(Connection::open_in_memory().map_err(|error| error.to_string())?)
    }

    fn from_conn(conn: Connection) -> Result<Self, String> {
        conn.busy_timeout(std::time::Duration::from_secs(3))
            .map_err(|error| error.to_string())?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|error| error.to_string())?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(|error| error.to_string())?;
        conn.execute_batch(SCHEMA).map_err(|error| error.to_string())?;
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap_or(0);
        if version < 1 {
            conn.pragma_update(None, "user_version", 1)
                .map_err(|error| error.to_string())?;
        }
        Ok(Self { conn: Mutex::new(conn) })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn
            .lock()
            .map_err(|_| "备忘录库锁被污染".to_string())
    }

    pub fn insert(&self, row: &MemoRow) -> Result<(), String> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO memos (id, created_at, updated_at, type, title, summary, todos_json,
                tags_json, transcript, duration_ms, audio_path, audio_bytes, audio_sha256,
                status, ai_status, failed_segment, last_error, segment_total, deleted_at,
                synced_at, rev)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21)
             ON CONFLICT(id) DO UPDATE SET
                updated_at=excluded.updated_at, type=excluded.type, title=excluded.title,
                summary=excluded.summary, todos_json=excluded.todos_json,
                tags_json=excluded.tags_json, transcript=excluded.transcript,
                duration_ms=excluded.duration_ms,
                audio_path=COALESCE(excluded.audio_path, memos.audio_path),
                audio_bytes=CASE WHEN excluded.audio_path IS NULL THEN memos.audio_bytes ELSE excluded.audio_bytes END,
                audio_sha256=COALESCE(excluded.audio_sha256, memos.audio_sha256),
                status=excluded.status, ai_status=excluded.ai_status,
                failed_segment=excluded.failed_segment, last_error=excluded.last_error,
                segment_total=excluded.segment_total, deleted_at=excluded.deleted_at,
                synced_at=excluded.synced_at, rev=excluded.rev",
            params![
                row.id,
                row.created_at,
                row.updated_at,
                row.memo_type.as_str(),
                row.title,
                row.summary,
                serde_json::to_string(&row.todos).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&row.tags).unwrap_or_else(|_| "[]".into()),
                row.transcript,
                row.duration_ms,
                row.audio_path,
                row.audio_bytes,
                row.audio_sha256,
                row.status.as_str(),
                row.ai_status,
                row.failed_segment,
                row.last_error,
                row.segment_total,
                row.deleted_at,
                row.synced_at,
                row.rev,
            ],
        )
        .map_err(|error| format!("写入备忘录失败: {error}"))?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> Result<Option<MemoRow>, String> {
        let conn = self.lock()?;
        conn.query_row(
            "SELECT id, created_at, updated_at, type, title, summary, todos_json, tags_json,
                    transcript, duration_ms, audio_path, audio_bytes, audio_sha256, status,
                    ai_status, failed_segment, last_error, segment_total, deleted_at, synced_at, rev
             FROM memos WHERE id = ?1",
            params![id],
            row_from_query,
        )
        .optional()
        .map_err(|error| format!("读取备忘录失败: {error}"))
    }

    pub fn list(&self) -> Result<Vec<MemoSummary>, String> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, created_at, updated_at, type, title, summary, todos_json, tags_json,
                        transcript, duration_ms, audio_path, audio_bytes, audio_sha256, status,
                        ai_status, failed_segment, last_error, segment_total, deleted_at, synced_at, rev
                 FROM memos WHERE deleted_at IS NULL ORDER BY created_at DESC",
            )
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map([], row_from_query)
            .map_err(|error| error.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row.map_err(|error| error.to_string())?.summary());
        }
        Ok(out)
    }

    pub fn segments(&self, id: &str) -> Result<Vec<MemoSegment>, String> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare("SELECT idx, text, status FROM memo_segments WHERE memo_id = ?1 ORDER BY idx")
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(params![id], |row| {
                Ok(MemoSegment { idx: row.get(0)?, text: row.get(1)?, status: row.get(2)? })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn replace_segments(&self, id: &str, segments: &[(i64, String, String)]) -> Result<(), String> {
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(|error| error.to_string())?;
        tx.execute("DELETE FROM memo_segments WHERE memo_id = ?1", params![id])
            .map_err(|error| error.to_string())?;
        for (idx, text, status) in segments {
            tx.execute(
                "INSERT INTO memo_segments (memo_id, idx, text, status) VALUES (?1,?2,?3,?4)",
                params![id, idx, text, status],
            )
            .map_err(|error| error.to_string())?;
        }
        tx.commit().map_err(|error| error.to_string())
    }

    pub fn set_segment(&self, id: &str, idx: i64, text: &str, status: &str) -> Result<(), String> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT INTO memo_segments (memo_id, idx, text, status) VALUES (?1,?2,?3,?4)
             ON CONFLICT(memo_id, idx) DO UPDATE SET text=excluded.text, status=excluded.status",
            params![id, idx, text, status],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn update_meta(&self, id: &str, title: Option<&str>, memo_type: Option<MemoType>) -> Result<(), String> {
        let conn = self.lock()?;
        let mut sets = Vec::new();
        if title.is_some() {
            sets.push("title = ?2");
        }
        if memo_type.is_some() {
            sets.push("type = ?3");
        }
        if sets.is_empty() {
            return Ok(());
        }
        let sql = format!(
            "UPDATE memos SET {}, updated_at = ?4, rev = rev + 1, synced_at = NULL
             WHERE id = ?1 AND deleted_at IS NULL",
            sets.join(", ")
        );
        conn.execute(
            &sql,
            params![id, title, memo_type.map(|value| value.as_str()), super::now_ms()],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn set_status(&self, id: &str, status: MemoStatus, error: Option<&str>) -> Result<(), String> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE memos SET status = ?2, last_error = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, status.as_str(), error, super::now_ms()],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn set_progress(&self, id: &str, status: MemoStatus, failed_segment: Option<i64>) -> Result<(), String> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE memos SET status = ?2, failed_segment = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, status.as_str(), failed_segment, super::now_ms()],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn finish(
        &self,
        id: &str,
        transcript: &str,
        structured: &MemoStructured,
        ai_status: &str,
    ) -> Result<(), String> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE memos SET status = 'done', transcript = ?2, title = ?3, type = ?4,
                summary = ?5, todos_json = ?6, tags_json = ?7, ai_status = ?8,
                failed_segment = NULL, last_error = NULL, updated_at = ?9, synced_at = NULL
             WHERE id = ?1",
            params![
                id,
                transcript,
                structured.title,
                structured.memo_type.as_str(),
                structured.summary,
                serde_json::to_string(&structured.todos).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&structured.tags).unwrap_or_else(|_| "[]".into()),
                ai_status,
                super::now_ms(),
            ],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn set_audio(&self, id: &str, path: &str, bytes: i64, sha256: &str) -> Result<(), String> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE memos SET audio_path = ?2, audio_bytes = ?3, audio_sha256 = ?4, updated_at = ?5
             WHERE id = ?1",
            params![id, path, bytes, sha256, super::now_ms()],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn clear_audio(&self, id: &str) -> Result<(), String> {
        let conn = self.lock()?;
        conn.execute(
            "UPDATE memos SET audio_path = NULL, audio_bytes = 0, audio_sha256 = NULL,
                updated_at = ?2, synced_at = NULL
             WHERE id = ?1",
            params![id, super::now_ms()],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    /// 软删除：保留墓碑给同步用。
    pub fn soft_delete(&self, id: &str) -> Result<Option<String>, String> {
        let conn = self.lock()?;
        let path: Option<String> = conn
            .query_row("SELECT audio_path FROM memos WHERE id = ?1", params![id], |row| row.get(0))
            .optional()
            .map_err(|error| error.to_string())?
            .flatten();
        conn.execute(
            "UPDATE memos SET deleted_at = ?2, updated_at = ?2, rev = rev + 1, audio_path = NULL,
                audio_bytes = 0, audio_sha256 = NULL, synced_at = NULL
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id, super::now_ms()],
        )
        .map_err(|error| error.to_string())?;
        Ok(path)
    }

    pub fn mark_synced(&self, ids: &[String], now: i64) -> Result<(), String> {
        if ids.is_empty() {
            return Ok(());
        }
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(|error| error.to_string())?;
        for id in ids {
            tx.execute("UPDATE memos SET synced_at = ?2 WHERE id = ?1", params![id, now])
                .map_err(|error| error.to_string())?;
        }
        tx.commit().map_err(|error| error.to_string())
    }

    pub fn unsynced(&self) -> Result<Vec<MemoRow>, String> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, created_at, updated_at, type, title, summary, todos_json, tags_json,
                        transcript, duration_ms, audio_path, audio_bytes, audio_sha256, status,
                        ai_status, failed_segment, last_error, segment_total, deleted_at, synced_at, rev
                 FROM memos WHERE synced_at IS NULL ORDER BY created_at ASC",
            )
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map([], row_from_query)
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn resumable(&self) -> Result<Vec<String>, String> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id FROM memos WHERE deleted_at IS NULL AND status IN
                 ('pending','transcribing','structuring','offline') ORDER BY created_at ASC",
            )
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn storage_stats(&self) -> Result<MemoStorageStats, String> {
        let conn = self.lock()?;
        let (count, bytes, files): (i64, i64, i64) = conn
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(audio_bytes),0),
                        COALESCE(SUM(CASE WHEN audio_path IS NOT NULL THEN 1 ELSE 0 END),0)
                 FROM memos WHERE deleted_at IS NULL",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        Ok(MemoStorageStats { count, audio_bytes: bytes, audio_files: files })
    }
}

fn row_from_query(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemoRow> {
    let todos: String = row.get(6)?;
    let tags: String = row.get(7)?;
    Ok(MemoRow {
        id: row.get(0)?,
        created_at: row.get(1)?,
        updated_at: row.get(2)?,
        memo_type: MemoType::parse(&row.get::<_, String>(3)?),
        title: row.get(4)?,
        summary: row.get(5)?,
        todos: serde_json::from_str(&todos).unwrap_or_default(),
        tags: serde_json::from_str(&tags).unwrap_or_default(),
        transcript: row.get(8)?,
        duration_ms: row.get(9)?,
        audio_path: row.get(10)?,
        audio_bytes: row.get(11)?,
        audio_sha256: row.get(12)?,
        status: MemoStatus::parse(&row.get::<_, String>(13)?),
        ai_status: row.get(14)?,
        failed_segment: row.get(15)?,
        last_error: row.get(16)?,
        segment_total: row.get(17)?,
        deleted_at: row.get(18)?,
        synced_at: row.get(19)?,
        rev: row.get(20)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(id: &str, created_at: i64) -> MemoRow {
        MemoRow {
            id: id.into(),
            created_at,
            updated_at: created_at,
            memo_type: MemoType::Memo,
            title: "测试".into(),
            summary: None,
            todos: vec![],
            tags: vec![],
            transcript: String::new(),
            duration_ms: 0,
            audio_path: None,
            audio_bytes: 0,
            audio_sha256: None,
            status: MemoStatus::Pending,
            ai_status: None,
            failed_segment: None,
            last_error: None,
            segment_total: 0,
            deleted_at: None,
            synced_at: None,
            rev: 1,
        }
    }

    #[test]
    fn insert_list_get_update_delete() {
        let db = MemoDb::open_memory().unwrap();
        let mut first = sample("a", 10);
        first.todos = vec!["买牛奶".into()];
        db.insert(&first).unwrap();
        db.insert(&sample("b", 20)).unwrap();

        let list = db.list().unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "b"); // 新在前
        assert_eq!(list[1].todos, vec!["买牛奶".to_string()]);

        db.update_meta("a", Some("改了"), Some(MemoType::Todo)).unwrap();
        let row = db.get("a").unwrap().unwrap();
        assert_eq!(row.title, "改了");
        assert_eq!(row.memo_type, MemoType::Todo);
        assert_eq!(row.rev, 2);

        let deleted = db.soft_delete("a").unwrap();
        assert!(deleted.is_none());
        assert_eq!(db.list().unwrap().len(), 1);
        assert!(db.get("a").unwrap().unwrap().deleted_at.is_some());
        assert_eq!(db.unsynced().unwrap().len(), 2);
    }

    #[test]
    fn finish_and_stats() {
        let db = MemoDb::open_memory().unwrap();
        db.insert(&sample("a", 1)).unwrap();
        db.set_audio("a", "/tmp/a.wav", 48_000, "abc").unwrap();
        let structured = MemoStructured {
            title: "标题".into(),
            memo_type: MemoType::Idea,
            summary: Some("摘要".into()),
            todos: vec!["一".into()],
            tags: vec!["工作".into()],
        };
        db.finish("a", "全文", &structured, "ok").unwrap();
        let row = db.get("a").unwrap().unwrap();
        assert_eq!(row.status, MemoStatus::Done);
        assert_eq!(row.title, "标题");
        assert_eq!(row.memo_type, MemoType::Idea);
        assert_eq!(row.todos, vec!["一".to_string()]);

        let stats = db.storage_stats().unwrap();
        assert_eq!(stats.count, 1);
        assert_eq!(stats.audio_bytes, 48_000);
        assert_eq!(stats.audio_files, 1);
    }

    #[test]
    fn edits_and_deletes_clear_synced_at() {
        let db = MemoDb::open_memory().unwrap();
        db.insert(&sample("a", 1)).unwrap();
        db.mark_synced(&["a".to_string()], 100).unwrap();
        assert_eq!(db.get("a").unwrap().unwrap().synced_at, Some(100));
        db.update_meta("a", Some("新标题"), None).unwrap();
        assert_eq!(db.get("a").unwrap().unwrap().synced_at, None);
        db.mark_synced(&["a".to_string()], 200).unwrap();
        db.soft_delete("a").unwrap();
        let row = db.get("a").unwrap().unwrap();
        assert!(row.deleted_at.is_some());
        assert_eq!(row.synced_at, None);
    }

    #[test]
    fn segments_and_resumable() {
        let db = MemoDb::open_memory().unwrap();
        db.insert(&sample("a", 1)).unwrap();
        db.replace_segments("a", &[(0, "第一段".into(), "done".into())]).unwrap();
        db.set_segment("a", 1, "", "failed").unwrap();
        let segments = db.segments("a").unwrap();
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].text, "第一段");
        assert_eq!(segments[1].status, "failed");
        assert_eq!(db.resumable().unwrap(), vec!["a".to_string()]);
    }
}
