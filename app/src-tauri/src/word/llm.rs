//! 英语角的 AI 管道：单词解释与造句。
//!
//! 走百炼兼容模式（DashScope compatible-mode），与语音备忘录同一套 Key；
//! 输出严格 JSON，解析前先做括号补全（实测模型偶发漏右括号）。
//! 失败返回错误码字符串（`timeout` / `rate_limited` / `model_error` / `bad_json`），
//! 由命令层转成 `WordRow.last_error`，不打印词条正文。

use std::sync::OnceLock;
use std::time::Duration;

use serde_json::{Value, json};

use super::types::{WordDefinition, WordExample, WordExplanation, WordSentence};
use super::{ENDPOINT, MODEL};

const TIMEOUT: Duration = Duration::from_secs(25);
const MAX_TOKENS_EXPLAIN: u32 = 800;
const MAX_TOKENS_GENERATE: u32 = 500;

const SYSTEM_PROMPT_EXPLAIN: &str = "你是英语学习助手。只输出一个 JSON 对象，不要 markdown、不要解释。\n\
字段：{\"word\":\"原词\",\"phonetic\":\"IPA 音标，不确定就空字符串\",\"pos\":\"词性，如 n./v./adj.\",\"definitions\":[{\"zh\":\"中文释义\",\"en\":\"英文释义\"}],\"examples\":[{\"en\":\"英文例句\",\"zh\":\"中文翻译\"}],\"collocations\":[\"常见搭配，最多 3 条\"],\"mistakes\":\"常见误用，没有就空字符串\",\"roots\":\"词根词缀，不确定就空字符串\"}\n\
规则：\n\
- definitions 1-3 条，examples 2 条且自然贴合原词；\n\
- 中文释义优先给当前语境下的意思；\n\
- 音标/词根不确定就留空，绝不编造；\n\
- 不要输出 JSON 之外的任何字符。";

const SYSTEM_PROMPT_GENERATE: &str = "你是英语写作教练。用户给你一组英文单词，请写 3-5 个英文句子，每句至少用上其中 1 个词，难度 B1-B2，自然口语化，不要为凑词写生硬句子。\n\
只输出 JSON：{\"sentences\":[{\"en\":\"英文句子\",\"zh\":\"中文翻译\",\"words\":[\"用到的词\"]}]}\n\
不要 markdown、不要解释、不要输出 JSON 之外的任何字符。";

/// 一次成功调用：内容 + prompt/completion token。
pub struct Completion {
    pub content: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
}

/// 解释一个词。返回解释与 usage（调用方负责记账）。
pub async fn explain(
    api_key: &str,
    word: &str,
    context: Option<&str>,
) -> Result<(WordExplanation, Completion), String> {
    let mut user = format!("单词：{word}");
    if let Some(context) = context.filter(|text| !text.trim().is_empty()) {
        user.push_str(&format!("\n语境：{context}"));
    }
    let body = json!({
        "model": MODEL,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT_EXPLAIN },
            { "role": "user", "content": user },
        ],
        "temperature": 0.3,
        "max_tokens": MAX_TOKENS_EXPLAIN,
        "enable_thinking": false,
    });
    let mut last_error = "model_error".to_string();
    for attempt in 0..2 {
        match call(api_key, &body).await {
            Ok(completion) => match parse_explanation(&completion.content) {
                Ok(explanation) => return Ok((explanation, completion)),
                Err(error) => last_error = error,
            },
            Err(error) => {
                last_error = error;
                // 只有超时/限流值得重试；配置或鉴权错误重试也没用。
                if last_error != "timeout" && last_error != "rate_limited" {
                    break;
                }
            }
        }
        if attempt == 0 {
            continue;
        }
    }
    Err(last_error)
}

/// 用选中的词造句。返回句子与 usage。
pub async fn generate(
    api_key: &str,
    words: &[String],
) -> Result<(Vec<WordSentence>, Completion), String> {
    let joined = words.join(", ");
    let body = json!({
        "model": MODEL,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT_GENERATE },
            { "role": "user", "content": format!("单词：{joined}") },
        ],
        "temperature": 0.6,
        "max_tokens": MAX_TOKENS_GENERATE,
        "enable_thinking": false,
    });
    let mut last_error = "model_error".to_string();
    for attempt in 0..2 {
        match call(api_key, &body).await {
            Ok(completion) => match parse_sentences(&completion.content) {
                Ok(sentences) if !sentences.is_empty() => return Ok((sentences, completion)),
                Ok(_) => last_error = "bad_json".into(),
                Err(error) => last_error = error,
            },
            Err(error) => {
                last_error = error;
                if last_error != "timeout" && last_error != "rate_limited" {
                    break;
                }
            }
        }
        if attempt == 0 {
            continue;
        }
    }
    Err(last_error)
}

async fn call(api_key: &str, body: &Value) -> Result<Completion, String> {
    let response = client()?
        .post(ENDPOINT)
        .bearer_auth(api_key.trim())
        .json(body)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "timeout".to_string()
            } else {
                "model_error".to_string()
            }
        })?;

    let status = response.status();
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err("rate_limited".into());
    }
    if !status.is_success() {
        return Err("model_error".into());
    }

    let value: Value = response
        .json()
        .await
        .map_err(|_| "model_error".to_string())?;
    let content = value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if content.trim().is_empty() {
        return Err("bad_json".into());
    }
    Ok(Completion {
        content,
        prompt_tokens: value
            .pointer("/usage/prompt_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        completion_tokens: value
            .pointer("/usage/completion_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    })
}

/// 解析解释 JSON；容忍 markdown 围栏与漏右括号。
pub fn parse_explanation(raw: &str) -> Result<WordExplanation, String> {
    let text = repair_json(raw).ok_or_else(|| "bad_json".to_string())?;
    let value: Value = serde_json::from_str(&text).map_err(|_| "bad_json".to_string())?;
    let definitions = value
        .get("definitions")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let zh = item.get("zh").and_then(Value::as_str)?.trim();
                    if zh.is_empty() {
                        return None;
                    }
                    Some(WordDefinition {
                        zh: zh.to_string(),
                        en: item
                            .get("en")
                            .and_then(Value::as_str)
                            .map(str::trim)
                            .filter(|text| !text.is_empty())
                            .map(str::to_string),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if definitions.is_empty() {
        return Err("bad_json".into());
    }
    let examples = value
        .get("examples")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let en = item.get("en").and_then(Value::as_str)?.trim();
                    let zh = item.get("zh").and_then(Value::as_str)?.trim();
                    if en.is_empty() || zh.is_empty() {
                        return None;
                    }
                    Some(WordExample {
                        en: en.to_string(),
                        zh: zh.to_string(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let text_field = |key: &str| {
        value
            .get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    };
    let collocations = value
        .get("collocations")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .take(3)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
        .filter(|items| !items.is_empty());
    Ok(WordExplanation {
        word: value
            .get("word")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .unwrap_or_default()
            .to_string(),
        phonetic: text_field("phonetic"),
        pos: text_field("pos"),
        definitions,
        examples,
        collocations,
        mistakes: text_field("mistakes"),
        roots: text_field("roots"),
    })
}

/// 解析造句 JSON。
pub fn parse_sentences(raw: &str) -> Result<Vec<WordSentence>, String> {
    let text = repair_json(raw).ok_or_else(|| "bad_json".to_string())?;
    let value: Value = serde_json::from_str(&text).map_err(|_| "bad_json".to_string())?;
    let sentences = value
        .get("sentences")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let en = item.get("en").and_then(Value::as_str)?.trim();
                    let zh = item.get("zh").and_then(Value::as_str)?.trim();
                    if en.is_empty() || zh.is_empty() {
                        return None;
                    }
                    let words = item
                        .get("words")
                        .and_then(Value::as_array)
                        .map(|items| {
                            items
                                .iter()
                                .filter_map(Value::as_str)
                                .map(str::to_string)
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_default();
                    Some(WordSentence {
                        en: en.to_string(),
                        zh: zh.to_string(),
                        words,
                    })
                })
                .take(5)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if sentences.is_empty() {
        return Err("bad_json".into());
    }
    Ok(sentences)
}

/// 取出首个 `{` 之后的 JSON，去掉 markdown 围栏，补全缺失的右括号与尾随逗号。
///
/// 两种候选依次尝试：① 到结尾（模型漏了最后的 `}`）；② 到末个 `}`（模型在 JSON 后
/// 多说了话）。只有两种都解析不了才交给调用方报 `bad_json`。
fn repair_json(raw: &str) -> Option<String> {
    let start = raw.find('{')?;
    let rest = raw[start..].trim();
    let rest = rest.trim_end_matches("```").trim();
    let mut candidates = vec![rest.to_string()];
    if let Some(index) = rest.rfind('}') {
        candidates.push(rest[..=index].to_string());
    }
    for candidate in &candidates {
        if candidate.is_empty() {
            continue;
        }
        let text = balance_brackets(&strip_trailing_commas(candidate));
        if serde_json::from_str::<Value>(&text).is_ok() {
            return Some(text);
        }
    }
    Some(balance_brackets(&strip_trailing_commas(rest)))
}

fn strip_trailing_commas(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    let mut in_string = false;
    let mut escaped = false;
    while let Some(ch) = chars.next() {
        if in_string {
            out.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
            out.push(ch);
            continue;
        }
        if ch == ',' {
            // 逗号后若紧跟闭括号，丢弃。
            let mut lookahead = chars.clone();
            while let Some(next) = lookahead.peek() {
                if next.is_whitespace() {
                    lookahead.next();
                } else {
                    break;
                }
            }
            if matches!(lookahead.peek(), Some('}') | Some(']')) {
                continue;
            }
        }
        out.push(ch);
    }
    out
}

fn balance_brackets(text: &str) -> String {
    let mut stack: Vec<char> = Vec::new();
    let mut in_string = false;
    let mut escaped = false;
    for ch in text.chars() {
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '{' => stack.push('}'),
            '[' => stack.push(']'),
            '}' | ']' => {
                if stack.last() == Some(&ch) {
                    stack.pop();
                }
            }
            _ => {}
        }
    }
    // 字符串没闭合就先补引号，再补括号。
    let mut out = text.to_string();
    if in_string {
        if escaped {
            out.push('\\');
        }
        out.push('"');
    }
    for closer in stack.iter().rev() {
        out.push(*closer);
    }
    out
}

#[cfg(desktop)]
fn client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            crate::tls::ensure_crypto_provider();
            reqwest::Client::builder()
                .timeout(TIMEOUT)
                .build()
                .map_err(|error| format!("初始化 AI 客户端失败: {error}"))
        })
        .as_ref()
        .map_err(|error| error.clone())
}

#[cfg(mobile)]
fn client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            ensure_crypto_provider();
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

#[cfg(mobile)]
fn ensure_crypto_provider() {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_json() {
        let raw = r#"{"word":"run","phonetic":"/rʌn/","pos":"v.","definitions":[{"zh":"跑","en":"to move"}],"examples":[{"en":"I run.","zh":"我跑。"}]}"#;
        let parsed = parse_explanation(raw).unwrap();
        assert_eq!(parsed.word, "run");
        assert_eq!(parsed.definitions.len(), 1);
        assert_eq!(parsed.examples.len(), 1);
        assert_eq!(parsed.collocations, None);
    }

    #[test]
    fn repairs_missing_closing_brace() {
        // 实测 qwen3.8-flash 偶发漏掉最后一个 }。
        let raw = r#"{"word":"resilient","definitions":[{"zh":"有韧性的"}],"examples":[{"en":"a resilient system","zh":"有韧性的系统"}],"roots":"re- + silire""#;
        let parsed = parse_explanation(raw).unwrap();
        assert_eq!(parsed.roots.as_deref(), Some("re- + silire"));
    }

    #[test]
    fn repairs_markdown_fence_and_trailing_comma() {
        let raw = "```json\n{\"word\":\"run\",\"definitions\":[{\"zh\":\"跑\"},],\"examples\":[]}\n```";
        let parsed = parse_explanation(raw).unwrap();
        assert_eq!(parsed.definitions.len(), 1);
    }

    #[test]
    fn rejects_json_without_definitions() {
        let raw = r#"{"word":"run","examples":[]}"#;
        assert_eq!(parse_explanation(raw), Err("bad_json".into()));
    }

    #[test]
    fn parses_sentences_and_skips_broken_items() {
        let raw = r#"{"sentences":[{"en":"A.","zh":"甲。","words":["a"]},{"en":"","zh":"乙。"},{"en":"B.","zh":"乙。","words":[]}]}"#;
        let parsed = parse_sentences(raw).unwrap();
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].words, vec!["a"]);
    }

    #[test]
    fn balance_handles_nested_arrays() {
        assert_eq!(balance_brackets(r#"{"a":[1,2"#), r#"{"a":[1,2]}"#);
    }
}
