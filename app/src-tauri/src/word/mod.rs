//! 英语角（生词本）共享核心。
//!
//! 两端共用：类型、SQLite、LLM 管道、用量、同步载荷。
//! 桌面（`desktop`）负责 Tauri 命令与剪贴板候选；手机（`mobile`）负责命令与同步。
//! 产品规则见 `docs/prd/english-corner/`，技术方案见 `docs/engineering/english-corner.md`。

pub mod db;
pub mod llm;
pub mod paths;
pub mod sync;
pub mod types;
pub mod usage;

#[cfg(desktop)]
pub mod desktop;
#[cfg(mobile)]
pub mod mobile;

/// 百炼兼容模式端点（与语音备忘录同一套 Key）。
pub const ENDPOINT: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

/// 默认模型：2026-11-09 用真实 AK 探测可用（HTTP 200，解释 2.2–4.6s）。
pub const MODEL: &str = "qwen3.8-flash";

/// 提示词版本；改提示词必须 +1，否则缓存会命中旧解释。
pub const PROMPT_VERSION: i64 = 1;

/// 单个词条允许的最大字符数（短语也算）。
pub const MAX_WORD_CHARS: usize = 64;

/// 语境句上限；超出直接拒绝，避免把整段文章发出去。
pub const MAX_CONTEXT_CHARS: usize = 200;

/// 造句一次最多选多少个词。
pub const MAX_GENERATE_WORDS: usize = 10;

/// 两端共用的毫秒时间戳。
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

/// 归一化：去首尾、连续空白折叠为单个空格、小写。词库主键用它。
pub fn normalize(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// 校验并归一化用户输入；失败统一回 `invalid_word`。
pub fn validate_word(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed.chars().count() > MAX_WORD_CHARS {
        return Err("invalid_word".into());
    }
    let allowed = trimmed.chars().all(|ch| {
        ch.is_ascii_alphabetic() || matches!(ch, ' ' | '-' | '\'' | '.')
    });
    if !allowed {
        return Err("invalid_word".into());
    }
    let normalized = normalize(trimmed);
    if normalized.is_empty() || !normalized.chars().any(|ch| ch.is_ascii_alphabetic()) {
        return Err("invalid_word".into());
    }
    Ok(normalized)
}

/// 语境句裁剪：空白归一 + 长度上限（超出截断而不是报错，用户已经明确点击了查词）。
pub fn trim_context(input: Option<&str>) -> Option<String> {
    let text = input?.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() {
        return None;
    }
    Some(text.chars().take(MAX_CONTEXT_CHARS).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_collapses_whitespace_and_lowercases() {
        assert_eq!(normalize("  Run   OUT\tOf "), "run out of");
    }

    #[test]
    fn validate_rejects_empty_non_latin_and_long() {
        assert_eq!(validate_word("  Run ").unwrap(), "run");
        assert_eq!(validate_word("take-off"), Ok("take-off".into()));
        assert_eq!(validate_word(""), Err("invalid_word".into()));
        assert_eq!(validate_word("跑"), Err("invalid_word".into()));
        assert_eq!(validate_word("run123"), Err("invalid_word".into()));
        assert_eq!(
            validate_word(&"a".repeat(MAX_WORD_CHARS + 1)),
            Err("invalid_word".into())
        );
    }

    #[test]
    fn trim_context_returns_none_for_blank_and_truncates() {
        assert_eq!(trim_context(Some("   ")), None);
        assert_eq!(trim_context(None), None);
        let long = "x".repeat(MAX_CONTEXT_CHARS + 20);
        assert_eq!(
            trim_context(Some(&long)).unwrap().chars().count(),
            MAX_CONTEXT_CHARS
        );
    }
}
