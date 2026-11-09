//! 英语角语音合成：qwen-audio-3.1-tts-plus。
//!
//! 一次请求拿完整音频 URL（非流式），下载后按内容哈希缓存到 `word_audio/`；
//! 同一段文本 + 音色 + 语速只合成一次，重复播放 0 请求、0 费用。
//! 失败时桌面回退系统 `say`（离线），手机直接报错。
//!
//! 接口：POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer
//! 文档：https://www.alibabacloud.com/help/zh/model-studio/qwen-audio-tts-http-api

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::types::TtsResult;

/// 语音合成模型（用户指定）。
pub const TTS_MODEL: &str = "qwen-audio-3.1-tts-plus";
/// 默认音色（旗舰女声，支持中英文；可用 `word.json` 覆盖）。
pub const TTS_VOICE: &str = "longanhuan_v3.1";
/// 音频格式与采样率：mp3 / 24k，体积与音质平衡。
pub const TTS_FORMAT: &str = "mp3";
pub const TTS_SAMPLE_RATE: u32 = 24000;

const ENDPOINT: &str = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer";
const TIMEOUT: Duration = Duration::from_secs(60);
/// 单段文本上限，避免一次合成整篇文章。
pub const MAX_TTS_CHARS: usize = 500;

/// 合成类型：单词读慢一点、句子自然语速。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TtsKind {
    Word,
    Sentence,
}

impl TtsKind {
    pub fn parse(value: &str) -> Self {
        if value == "sentence" {
            Self::Sentence
        } else {
            Self::Word
        }
    }

    pub fn rate(self) -> f64 {
        match self {
            Self::Word => 0.85,
            Self::Sentence => 1.0,
        }
    }

    fn instruction(self) -> &'static str {
        match self {
            Self::Word => {
                "用清晰标准的英式英语朗读这个单词，语速稍慢，只读单词本身，不要读字母、不要添加解释。"
            }
            Self::Sentence => "用自然流畅的英式英语朗读这句话，语速适中，注意连读和语调。",
        }
    }
}

/// 校验并裁剪文本；空/超长直接拒绝。
pub fn validate_text(text: &str) -> Result<String, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("invalid_word".into());
    }
    if trimmed.chars().count() > MAX_TTS_CHARS {
        return Err("tts_too_long".into());
    }
    Ok(trimmed.to_string())
}

/// 缓存键：文本 + 模型 + 音色 + 语速 + 类型；任何一项变化都会重新合成。
pub fn cache_key(text: &str, voice: &str, rate: f64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(TTS_MODEL.as_bytes());
    hasher.update(b"|");
    hasher.update(voice.as_bytes());
    hasher.update(b"|");
    hasher.update(format!("{rate:.2}").as_bytes());
    hasher.update(b"|");
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// 解析非流式响应：音频 URL + 计费字符数。
pub fn parse_tts_response(value: &Value) -> Result<(String, u64), String> {
    let url = value
        .pointer("/output/audio/url")
        .and_then(Value::as_str)
        .filter(|url| !url.is_empty())
        .ok_or_else(|| "tts_failed".to_string())?;
    let characters = value
        .pointer("/usage/characters")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Ok((url.to_string(), characters))
}

/// 合成一段文本；命中缓存时 `cached=true` 且不发请求。
pub async fn synthesize(
    api_key: &str,
    text: &str,
    kind: TtsKind,
    audio_dir: &Path,
    voice: &str,
) -> Result<TtsResult, String> {
    let text = validate_text(text)?;
    let key = cache_key(&text, voice, kind.rate());
    let path = audio_dir.join(format!("{key}.mp3"));
    if path.is_file() {
        return Ok(TtsResult {
            path: path.to_string_lossy().to_string(),
            characters: 0,
            cached: true,
            fallback: false,
        });
    }

    let body = json!({
        "model": TTS_MODEL,
        "input": {
            "text": text,
            "voice": voice,
            "format": TTS_FORMAT,
            "sample_rate": TTS_SAMPLE_RATE,
            "rate": kind.rate(),
            "language_hints": ["en"],
            "instruction": kind.instruction(),
        }
    });
    let response = client()?
        .post(ENDPOINT)
        .bearer_auth(api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "tts_timeout".to_string()
            } else {
                "tts_failed".to_string()
            }
        })?;
    if !response.status().is_success() {
        return Err("tts_failed".into());
    }
    let value: Value = response
        .json()
        .await
        .map_err(|_| "tts_failed".to_string())?;
    let (url, characters) = parse_tts_response(&value)?;

    let bytes = client()?
        .get(&url)
        .send()
        .await
        .map_err(|_| "tts_failed".to_string())?
        .bytes()
        .await
        .map_err(|_| "tts_failed".to_string())?;
    if bytes.is_empty() {
        return Err("tts_failed".into());
    }
    write_atomic(&path, &bytes)?;
    Ok(TtsResult {
        path: path.to_string_lossy().to_string(),
        characters,
        cached: false,
        fallback: false,
    })
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp: PathBuf = path.with_extension("mp3.tmp");
    std::fs::write(&temp, bytes).map_err(|error| format!("写入音频失败: {error}"))?;
    set_private_permissions(&temp);
    std::fs::rename(&temp, path).map_err(|error| format!("保存音频失败: {error}"))
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) {}

#[cfg(desktop)]
fn client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            crate::tls::ensure_crypto_provider();
            reqwest::Client::builder()
                .timeout(TIMEOUT)
                .build()
                .map_err(|error| format!("初始化语音客户端失败: {error}"))
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
                .map_err(|error| format!("初始化语音客户端失败: {error}"))
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
    fn cache_key_is_stable_and_sensitive() {
        let a = cache_key("resilient", TTS_VOICE, 0.85);
        let b = cache_key("resilient", TTS_VOICE, 0.85);
        assert_eq!(a, b);
        assert_eq!(a.len(), 64);
        assert_ne!(a, cache_key("resilient", TTS_VOICE, 1.0));
        assert_ne!(a, cache_key("resilient", "xunanchuan_v3.1", 0.85));
        assert_ne!(a, cache_key("deprecate", TTS_VOICE, 0.85));
    }

    #[test]
    fn validates_text_length_and_empty() {
        assert_eq!(validate_text("  hello "), Ok("hello".into()));
        assert_eq!(validate_text("   "), Err("invalid_word".into()));
        assert_eq!(
            validate_text(&"a".repeat(MAX_TTS_CHARS + 1)),
            Err("tts_too_long".into())
        );
    }

    #[test]
    fn parses_response_url_and_characters() {
        let value = json!({
            "output": { "audio": { "url": "https://example.com/a.mp3" }, "finish_reason": "stop" },
            "usage": { "characters": 22 }
        });
        assert_eq!(
            parse_tts_response(&value),
            Ok(("https://example.com/a.mp3".to_string(), 22))
        );
    }

    #[test]
    fn rejects_response_without_url() {
        let value = json!({ "output": { "audio": { "url": "" } } });
        assert_eq!(parse_tts_response(&value), Err("tts_failed".into()));
    }

    #[test]
    fn kind_rates_and_parse() {
        assert_eq!(TtsKind::parse("word"), TtsKind::Word);
        assert_eq!(TtsKind::parse("sentence"), TtsKind::Sentence);
        assert_eq!(TtsKind::parse("other"), TtsKind::Word);
        assert!(TtsKind::Word.rate() < TtsKind::Sentence.rate());
    }
}
