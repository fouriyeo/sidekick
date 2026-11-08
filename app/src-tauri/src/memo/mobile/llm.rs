//! 手机端 LLM 结构化：把转写文本整理成标题 / 类型 / 摘要 / 待办。
//! 走百炼兼容模式（DashScope compatible-mode），TLS 用 webpki roots，
//! 不依赖 Android 平台证书校验器。

use std::sync::OnceLock;
use std::time::Duration;

use serde_json::{Value, json};

use crate::memo::types::{MemoStructured, MemoType};

const ENDPOINT: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const MODEL: &str = "qwen-plus";
const TIMEOUT: Duration = Duration::from_secs(25);

const SYSTEM_PROMPT: &str = "你是语音备忘录整理助手。用户会给你一段口述转写。\n\
只输出一个 JSON 对象，不要 markdown、不要解释。字段：\n\
{\"title\":\"不超过 18 个字的标题\",\"type\":\"memo|todo|idea\",\"summary\":\"不超过 80 字的一句话摘要\",\"todos\":[\"可执行的待办，最多 8 条\"],\"tags\":[\"最多 4 个短标签\"]}\n\
规则：\n\
- 内容是明确要做的事 → type=todo，并尽量抽取 todos；\n\
- 内容是想法/灵感 → type=idea；\n\
- 其它日常记录 → type=memo；\n\
- 没有待办就给空数组；不要编造转写里没有的信息；\n\
- 标题用转写里的原意，不要用“语音备忘录”这种泛称。";

/// 解析模型输出；非法 JSON 时退回「首句当标题」的兜底。
pub fn parse_structured(raw: &str, transcript: &str) -> MemoStructured {
    let json_text = extract_json(raw);
    let value = json_text.and_then(|text| serde_json::from_str::<Value>(&text).ok());
    let Some(value) = value else {
        return fallback(transcript);
    };

    let title = value
        .get("title")
        .and_then(Value::as_str)
        .map(clean_text)
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| fallback_title(transcript));
    let memo_type = MemoType::parse(
        value.get("type").and_then(Value::as_str).unwrap_or("memo"),
    );
    let summary = value
        .get("summary")
        .and_then(Value::as_str)
        .map(clean_text)
        .filter(|text| !text.is_empty());
    let todos = string_list(value.get("todos"), 8);
    let tags = string_list(value.get("tags"), 4);

    MemoStructured { title, memo_type, summary, todos, tags }
}

fn extract_json(raw: &str) -> Option<String> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    Some(raw[start..=end].to_string())
}

fn clean_text(text: &str) -> String {
    text.trim().trim_matches('"').trim().to_string()
}

fn fallback_title(transcript: &str) -> String {
    let text = transcript.trim();
    if text.is_empty() {
        return "未命名备忘".into();
    }
    let first = text.split(['。', '！', '？', '\n', '.', '!', '?']).next().unwrap_or(text);
    let first = first.trim();
    let mut title: String = first.chars().take(18).collect();
    if first.chars().count() > 18 {
        title.push('…');
    }
    if title.is_empty() { "未命名备忘".into() } else { title }
}

fn string_list(value: Option<&Value>, max: usize) -> Vec<String> {
    let Some(Value::Array(items)) = value else { return Vec::new() };
    items
        .iter()
        .filter_map(|item| match item {
            Value::String(text) => Some(clean_text(text)),
            Value::Object(map) => map
                .get("text")
                .and_then(Value::as_str)
                .map(clean_text),
            _ => None,
        })
        .filter(|text| !text.is_empty())
        .take(max)
        .collect()
}

fn fallback(transcript: &str) -> MemoStructured {
    MemoStructured {
        title: fallback_title(transcript),
        memo_type: MemoType::Memo,
        summary: None,
        todos: Vec::new(),
        tags: Vec::new(),
    }
}

fn client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            super::cloud::ensure_crypto_provider();
            let mut roots = rustls::RootCertStore::empty();
            roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
            let tls = rustls::ClientConfig::builder()
                .with_root_certificates(roots)
                .with_no_client_auth();
            reqwest::Client::builder()
                .use_preconfigured_tls(tls)
                .timeout(TIMEOUT)
                .build()
                .map_err(|error| format!("初始化 AI 客户端失败: {error}"))
        })
        .as_ref()
        .map_err(|error| error.clone())
}

/// 调用一次 LLM；网络/HTTP 错误返回 Err，格式错误由 `parse_structured` 兜底。
pub async fn structure(transcript: &str, api_key: &str) -> Result<MemoStructured, String> {
    let text = transcript.trim();
    if text.is_empty() {
        return Ok(fallback(""));
    }
    if text.chars().count() <= 24 {
        // 很短的口述没必要花一次 LLM 调用，直接本地兜底。
        return Ok(fallback(text));
    }

    let body = json!({
        "model": MODEL,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": text },
        ],
        "temperature": 0.2,
        "max_tokens": 600,
    });

    let response = client()?
        .post(ENDPOINT)
        .bearer_auth(api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("请求 AI 整理失败: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("AI 整理返回 HTTP {status}"));
    }

    let value: Value = response
        .json()
        .await
        .map_err(|error| format!("读取 AI 结果失败: {error}"))?;
    let content = value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("");
    Ok(parse_structured(content, text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_json_block() {
        let raw = r#"```json
{"title":"买牛奶","type":"todo","summary":"下班路上买","todos":["买牛奶","买鸡蛋"],"tags":["生活"]}
```"#;
        let result = parse_structured(raw, "下班路上买牛奶和鸡蛋");
        assert_eq!(result.title, "买牛奶");
        assert_eq!(result.memo_type, MemoType::Todo);
        assert_eq!(result.todos, vec!["买牛奶", "买鸡蛋"]);
        assert_eq!(result.tags, vec!["生活"]);
    }

    #[test]
    fn falls_back_on_bad_json() {
        let result = parse_structured("这不是 JSON", "明天下午三点和产品开会，记得带上原型。");
        assert_eq!(result.title, "明天下午三点和产品开会");
        assert_eq!(result.memo_type, MemoType::Memo);
        assert!(result.todos.is_empty());
    }

    #[test]
    fn accepts_object_todos_and_caps_lists() {
        let raw = r#"{"title":"t","type":"idea","todos":[{"text":"一"},{"text":"二"},{"text":""}],"tags":["a","b","c","d","e"]}"#;
        let result = parse_structured(raw, "x");
        assert_eq!(result.todos, vec!["一", "二"]);
        assert_eq!(result.tags.len(), 4);
    }

    #[test]
    fn empty_transcript_is_safe() {
        let result = parse_structured("", "");
        assert_eq!(result.title, "未命名备忘");
    }
}
