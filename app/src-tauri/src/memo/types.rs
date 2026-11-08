use serde::{Deserialize, Serialize};

/// 备忘录类型：备忘 / 待办 / 灵感。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoType {
    Memo,
    Todo,
    Idea,
}

impl MemoType {
    pub fn as_str(self) -> &'static str {
        match self {
            MemoType::Memo => "memo",
            MemoType::Todo => "todo",
            MemoType::Idea => "idea",
        }
    }

    /// 未知值/旧值一律按「备忘」兜底，不造新类型。
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "todo" => MemoType::Todo,
            "idea" => MemoType::Idea,
            _ => MemoType::Memo,
        }
    }
}

/// 条目状态。`offline` 表示等待网络；`failed` 可重试。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoStatus {
    Pending,
    Transcribing,
    Structuring,
    Done,
    Failed,
    Offline,
}

impl MemoStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            MemoStatus::Pending => "pending",
            MemoStatus::Transcribing => "transcribing",
            MemoStatus::Structuring => "structuring",
            MemoStatus::Done => "done",
            MemoStatus::Failed => "failed",
            MemoStatus::Offline => "offline",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw {
            "transcribing" => MemoStatus::Transcribing,
            "structuring" => MemoStatus::Structuring,
            "done" => MemoStatus::Done,
            "failed" => MemoStatus::Failed,
            "offline" => MemoStatus::Offline,
            _ => MemoStatus::Pending,
        }
    }

    /// 还可以继续处理的状态（启动/回前台时重新入队）。
    pub fn is_resumable(self) -> bool {
        matches!(
            self,
            MemoStatus::Pending | MemoStatus::Transcribing | MemoStatus::Structuring | MemoStatus::Offline
        )
    }
}

/// 列表行（手机与桌面共用）。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoSummary {
    pub id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub memo_type: MemoType,
    pub title: String,
    pub summary: Option<String>,
    pub todos: Vec<String>,
    pub tags: Vec<String>,
    pub duration_ms: i64,
    pub status: MemoStatus,
    pub ai_status: Option<String>,
    pub has_audio: bool,
    pub audio_bytes: i64,
    pub synced: bool,
    pub failed_segment: Option<i64>,
    pub last_error: Option<String>,
}

/// 详情（多了全文、分段与音频路径）。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoDetail {
    #[serde(flatten)]
    pub summary: MemoSummary,
    pub transcript: String,
    pub segments: Vec<MemoSegment>,
    pub audio_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoSegment {
    pub idx: i64,
    pub text: String,
    pub status: String,
}

/// 结构化结果（LLM 输出，已做兜底）。
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoStructured {
    pub title: String,
    pub memo_type: MemoType,
    pub summary: Option<String>,
    pub todos: Vec<String>,
    pub tags: Vec<String>,
}

impl Default for MemoType {
    fn default() -> Self {
        MemoType::Memo
    }
}

/// 前端读设置时用的存储统计。
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoStorageStats {
    pub count: i64,
    pub audio_bytes: i64,
    pub audio_files: i64,
}

/// 手机 → 前端的事件载荷。
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoEvent {
    pub kind: &'static str,
    pub id: Option<String>,
    pub status: Option<&'static str>,
    pub message: Option<String>,
}

impl MemoEvent {
    pub fn changed(id: &str) -> Self {
        Self { kind: "changed", id: Some(id.to_string()), status: None, message: None }
    }

    pub fn progress(id: &str, status: MemoStatus) -> Self {
        Self { kind: "progress", id: Some(id.to_string()), status: Some(status.as_str()), message: None }
    }

    pub fn error(id: &str, message: &str) -> Self {
        Self { kind: "error", id: Some(id.to_string()), status: None, message: Some(message.to_string()) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_types_and_falls_back() {
        assert_eq!(MemoType::parse("todo"), MemoType::Todo);
        assert_eq!(MemoType::parse("IDEA"), MemoType::Idea);
        assert_eq!(MemoType::parse("meeting"), MemoType::Memo);
        assert_eq!(MemoType::parse(""), MemoType::Memo);
    }

    #[test]
    fn status_roundtrip() {
        for status in [
            MemoStatus::Pending,
            MemoStatus::Transcribing,
            MemoStatus::Structuring,
            MemoStatus::Done,
            MemoStatus::Failed,
            MemoStatus::Offline,
        ] {
            assert_eq!(MemoStatus::parse(status.as_str()), status);
        }
        assert_eq!(MemoStatus::parse("weird"), MemoStatus::Pending);
    }

    #[test]
    fn resumable_statuses() {
        assert!(MemoStatus::Pending.is_resumable());
        assert!(MemoStatus::Offline.is_resumable());
        assert!(!MemoStatus::Done.is_resumable());
        assert!(!MemoStatus::Failed.is_resumable());
    }
}
