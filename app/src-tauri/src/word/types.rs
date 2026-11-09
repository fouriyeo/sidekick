//! 英语角的数据形状：数据库行、解释 JSON、命令出参、同步载荷。
//!
//! 前端对应 `app/src/protocol/words.ts`；字段统一 camelCase。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 词条状态。数据库存小写字符串。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WordStatus {
    Pending,
    Ready,
    Failed,
}

impl WordStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Ready => "ready",
            Self::Failed => "failed",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "ready" => Self::Ready,
            "failed" => Self::Failed,
            _ => Self::Pending,
        }
    }
}

/// 词条来源。
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WordSource {
    Manual,
    Paste,
    Clipboard,
    Mobile,
}

impl WordSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Paste => "paste",
            Self::Clipboard => "clipboard",
            Self::Mobile => "mobile",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "paste" => Self::Paste,
            "clipboard" => Self::Clipboard,
            "mobile" => Self::Mobile,
            _ => Self::Manual,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordDefinition {
    pub zh: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub en: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordExample {
    pub en: String,
    pub zh: String,
}

/// AI 解释（严格 JSON 解析后的形状）。不确定的字段允许缺失，不编造。
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordExplanation {
    pub word: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phonetic: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pos: Option<String>,
    #[serde(default)]
    pub definitions: Vec<WordDefinition>,
    #[serde(default)]
    pub examples: Vec<WordExample>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collocations: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mistakes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub roots: Option<String>,
}

/// 造句结果里的一句。
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordSentence {
    pub en: String,
    pub zh: String,
    #[serde(default)]
    pub words: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordGenerateResult {
    pub sentences: Vec<WordSentence>,
    pub model: String,
}

/// 数据库行（内部用，导出成 Summary / Detail）。
#[derive(Clone, Debug, PartialEq)]
pub struct WordRow {
    pub id: String,
    pub word: String,
    pub normalized: String,
    pub status: WordStatus,
    /// 解释 JSON 原文；解析失败保留原文以便重试。
    pub explanation: Option<String>,
    pub note: Option<String>,
    pub context: Option<String>,
    pub source: WordSource,
    pub created_at: i64,
    pub updated_at: i64,
    pub explained_at: Option<i64>,
    pub deleted_at: Option<i64>,
    pub model: Option<String>,
    pub prompt_version: Option<i64>,
    pub rev: i64,
    pub last_error: Option<String>,
    /// 本地有未推送的变更（手机同步上行用；桌面恒为 false）。
    pub dirty: bool,
}

impl WordRow {
    /// 解析后的解释；坏 JSON 视为没有解释（调用方按 `bad_json` 处理）。
    pub fn explanation_value(&self) -> Option<WordExplanation> {
        self.explanation
            .as_deref()
            .and_then(|raw| serde_json::from_str::<WordExplanation>(raw).ok())
    }

    #[cfg(test)]
    pub fn first_definition(&self) -> Option<String> {
        self.explanation_value()
            .and_then(|value| value.definitions.first().map(|item| item.zh.clone()))
    }

    pub fn summary(&self) -> WordSummary {
        let explanation = self.explanation_value();
        WordSummary {
            id: self.id.clone(),
            word: self.word.clone(),
            status: self.status,
            source: self.source,
            created_at: self.created_at,
            updated_at: self.updated_at,
            phonetic: explanation.as_ref().and_then(|value| value.phonetic.clone()),
            pos: explanation.as_ref().and_then(|value| value.pos.clone()),
            first_definition: explanation
                .as_ref()
                .and_then(|value| value.definitions.first().map(|item| item.zh.clone())),
            note: self.note.clone(),
            deleted_at: self.deleted_at,
        }
    }

    pub fn detail(&self) -> WordDetail {
        WordDetail {
            summary: self.summary(),
            explanation: self.explanation_value(),
            context: self.context.clone(),
            last_error: self.last_error.clone(),
            model: self.model.clone(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordSummary {
    pub id: String,
    pub word: String,
    pub status: WordStatus,
    pub source: WordSource,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phonetic: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pos: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub first_definition: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default)]
    pub deleted_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordDetail {
    #[serde(flatten)]
    pub summary: WordSummary,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explanation: Option<WordExplanation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// `word.json`：同意标记 + 可选的模型覆盖（两端共用）。
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordConfig {
    #[serde(default)]
    pub agreed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// 英语角就绪状态（命令 `word_status`）。
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordStatusInfo {
    pub has_key: bool,
    pub agreed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paired: Option<bool>,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub total: Option<i64>,
}

/// 同步用的词条 JSON：字段与数据库一一对应，解释按对象外发（没有就是 null）。
pub fn row_to_sync_json(row: &WordRow) -> Value {
    serde_json::json!({
        "id": row.id,
        "word": row.word,
        "normalized": row.normalized,
        "status": row.status.as_str(),
        "explanation": row.explanation_value().map(|value| serde_json::to_value(value).unwrap_or(Value::Null)),
        "note": row.note,
        "context": row.context,
        "source": row.source.as_str(),
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
        "explainedAt": row.explained_at,
        "deletedAt": row.deleted_at,
        "model": row.model,
        "promptVersion": row.prompt_version,
        "rev": row.rev,
        "lastError": row.last_error,
        "dirty": row.dirty,
    })
}

/// 从同步 JSON 还原词条；非法条目直接拒绝（不落库）。
pub fn row_from_sync_json(value: &Value) -> Result<WordRow, String> {
    let word = value
        .get("word")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if word.is_empty() || word.chars().count() > super::MAX_WORD_CHARS {
        return Err("invalid_word".into());
    }
    let normalized = value
        .get("normalized")
        .and_then(Value::as_str)
        .map(|text| super::normalize(text))
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| super::normalize(&word));
    let explanation = value.get("explanation").filter(|item| !item.is_null()).map(|item| {
        // 对端发来的是对象；统一转成字符串落库。
        item.to_string()
    });
    Ok(WordRow {
        id: normalized.clone(),
        word,
        normalized,
        status: WordStatus::parse(value.get("status").and_then(Value::as_str).unwrap_or("pending")),
        explanation,
        note: value.get("note").and_then(Value::as_str).map(str::to_string),
        context: value
            .get("context")
            .and_then(Value::as_str)
            .map(str::to_string),
        source: WordSource::parse(value.get("source").and_then(Value::as_str).unwrap_or("mobile")),
        created_at: value.get("createdAt").and_then(Value::as_i64).unwrap_or(0),
        updated_at: value.get("updatedAt").and_then(Value::as_i64).unwrap_or(0),
        explained_at: value.get("explainedAt").and_then(Value::as_i64),
        deleted_at: value.get("deletedAt").and_then(Value::as_i64),
        model: value.get("model").and_then(Value::as_str).map(str::to_string),
        prompt_version: value.get("promptVersion").and_then(Value::as_i64),
        rev: value.get("rev").and_then(Value::as_i64).unwrap_or(1),
        last_error: value
            .get("lastError")
            .and_then(Value::as_str)
            .map(str::to_string),
        dirty: value.get("dirty").and_then(Value::as_bool).unwrap_or(false),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_row() -> WordRow {
        WordRow {
            id: "run".into(),
            word: "run".into(),
            normalized: "run".into(),
            status: WordStatus::Ready,
            explanation: Some(
                serde_json::json!({
                    "word": "run",
                    "phonetic": "/rʌn/",
                    "pos": "v.",
                    "definitions": [{ "zh": "跑" }],
                    "examples": [{ "en": "I run.", "zh": "我跑。" }]
                })
                .to_string(),
            ),
            note: None,
            context: None,
            source: WordSource::Manual,
            created_at: 1,
            updated_at: 2,
            explained_at: Some(2),
            deleted_at: None,
            model: Some("qwen3.8-flash".into()),
            prompt_version: Some(1),
            rev: 1,
            last_error: None,
            dirty: false,
        }
    }

    #[test]
    fn summary_exposes_first_definition() {
        let summary = sample_row().summary();
        assert_eq!(summary.first_definition.as_deref(), Some("跑"));
        assert_eq!(summary.status, WordStatus::Ready);
    }

    #[test]
    fn sync_json_round_trips() {
        let row = sample_row();
        let value = row_to_sync_json(&row);
        let back = row_from_sync_json(&value).unwrap();
        assert_eq!(back.normalized, row.normalized);
        assert_eq!(back.status, row.status);
        assert_eq!(back.explanation_value().unwrap().word, "run");
    }

    #[test]
    fn sync_json_rejects_empty_word() {
        assert_eq!(row_from_sync_json(&serde_json::json!({})), Err("invalid_word".into()));
    }
}
