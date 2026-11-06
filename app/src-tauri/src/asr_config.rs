use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::app_paths;

pub const DEFAULT_ENDPOINT: &str = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
pub const DEFAULT_MODEL: &str = "qwen-audio-3.1-asr-flash-streaming";
pub const MAX_SENTENCE_SILENCE_MS: u32 = 6_000;
pub const MIN_SENTENCE_SILENCE_MS: u32 = 200;

/// 单个会话最多发送的关键词数量。
pub const MAX_KEYWORDS: usize = 2_000;
/// 含非 ASCII 字符的关键词按字符数限制。
pub const MAX_WORD_CHARS: usize = 15;
/// 纯 ASCII 关键词按空白切分的段数限制。
pub const MAX_ASCII_SEGMENTS: usize = 7;
/// 所有关键词统一使用的即时热词权重（官方推荐普通词用 4）。
pub const KEYWORD_WEIGHT: u8 = 4;

/// 2026-11-06 中间版本写下的 `dictionaries` 只用于迁移，不再序列化。
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyWord {
    #[serde(default)]
    pub text: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyDictionary {
    #[serde(default)]
    pub words: Vec<LegacyWord>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BailianConfig {
    pub endpoint: String,
    pub model: String,
    pub language_hints: Vec<String>,
    pub keep_dialect: bool,
    pub vad_model: String,
    pub max_sentence_silence_ms: u32,
    pub heartbeat: bool,
    /// 关键词列表（一行一个词），是唯一事实源。
    #[serde(default)]
    pub vocabulary: Vec<String>,
    /// 中间版本遗留的分组词典；读取一次后平铺进 `vocabulary`，不再写回。
    #[serde(default, rename = "dictionaries", skip_serializing)]
    pub legacy_dictionaries: Vec<LegacyDictionary>,
}

impl Default for BailianConfig {
    fn default() -> Self {
        Self {
            endpoint: DEFAULT_ENDPOINT.to_string(),
            model: DEFAULT_MODEL.to_string(),
            language_hints: vec!["zh".to_string()],
            keep_dialect: false,
            vad_model: "near_meeting_16k".to_string(),
            max_sentence_silence_ms: 800,
            heartbeat: true,
            vocabulary: Vec::new(),
            legacy_dictionaries: Vec::new(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum KeywordProblem {
    Empty,
    Newline,
    TooLong,
    TooManySegments,
}

fn keyword_problem(text: &str) -> Option<KeywordProblem> {
    if text.is_empty() {
        return Some(KeywordProblem::Empty);
    }
    if text.contains('\n') || text.contains('\r') {
        return Some(KeywordProblem::Newline);
    }
    if text.chars().any(|ch| !ch.is_ascii()) {
        if text.chars().count() > MAX_WORD_CHARS {
            return Some(KeywordProblem::TooLong);
        }
    } else if text.split_whitespace().count() > MAX_ASCII_SEGMENTS {
        return Some(KeywordProblem::TooManySegments);
    }
    None
}

/// 错误信息里展示词内容时只取前 10 个字符，避免把整句关键词回显到 UI/日志。
fn short_word(text: &str) -> String {
    let mut chars = text.chars();
    let short: String = chars.by_ref().take(10).collect();
    if chars.next().is_some() {
        format!("{short}…")
    } else {
        short
    }
}

/// 加载期容错：平铺遗留分组、trim/去重/丢弃非法词，最多保留 2000 个。
/// 不打印词内容，只打印被丢弃的数量。
fn normalize_keywords(bailian: &mut BailianConfig) {
    if bailian.vocabulary.is_empty() && !bailian.legacy_dictionaries.is_empty() {
        bailian.vocabulary = std::mem::take(&mut bailian.legacy_dictionaries)
            .into_iter()
            .flat_map(|dictionary| dictionary.words)
            .map(|word| word.text)
            .collect();
    } else {
        bailian.legacy_dictionaries.clear();
    }

    let mut seen = std::collections::HashSet::new();
    let mut words = Vec::new();
    let mut dropped = 0usize;
    for raw in std::mem::take(&mut bailian.vocabulary) {
        let text = raw.trim();
        if text.is_empty() {
            continue;
        }
        if keyword_problem(text).is_some() {
            dropped += 1;
            continue;
        }
        if !seen.insert(text.to_string()) {
            continue;
        }
        if words.len() >= MAX_KEYWORDS {
            continue;
        }
        words.push(text.to_string());
    }
    if dropped > 0 {
        eprintln!("[asr-config] 丢弃 {dropped} 个不合法关键词（加载期容错）");
    }
    bailian.vocabulary = words;
}

/// 保存前校验关键词；错误信息直接展示给用户（中文）。
pub fn validate_keywords(keywords: &[String]) -> Result<(), String> {
    if keywords.len() > MAX_KEYWORDS {
        return Err(format!(
            "关键词最多 {} 个（当前 {}）",
            MAX_KEYWORDS,
            keywords.len()
        ));
    }
    for (index, raw) in keywords.iter().enumerate() {
        let position = index + 1;
        let text = raw.trim();
        match keyword_problem(text) {
            Some(KeywordProblem::Empty) => {
                return Err(format!("第 {position} 个关键词不能为空"));
            }
            Some(KeywordProblem::Newline) => {
                return Err(format!("第 {position} 个关键词不能包含换行"));
            }
            Some(KeywordProblem::TooLong) => {
                return Err(format!(
                    "第 {position} 个关键词「{}」太长：中文等最多 {} 个字符",
                    short_word(text),
                    MAX_WORD_CHARS
                ));
            }
            Some(KeywordProblem::TooManySegments) => {
                return Err(format!(
                    "第 {position} 个关键词「{}」空格分段太多：英文最多 {} 段",
                    short_word(text),
                    MAX_ASCII_SEGMENTS
                ));
            }
            None => {}
        }
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudConsent {
    pub granted: bool,
    pub at: u64,
}

impl Default for CloudConsent {
    fn default() -> Self {
        Self {
            granted: false,
            at: 0,
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrSettings {
    pub version: u32,
    pub consent_cloud: CloudConsent,
    /// 百炼 API Key。只存在本机 `asr.json`（0600），不写日志、不经过服务器。
    #[serde(default)]
    pub api_key: Option<String>,
    /// 是否已保存 API Key；由 `api_key` 派生，仅用于状态展示。
    #[serde(default)]
    pub key_present: bool,
    /// 掩码后的 Key 尾号，仅用于 UI 提示；不是密钥。
    #[serde(default)]
    pub key_hint: Option<String>,
    pub bailian: BailianConfig,
}

impl Default for AsrSettings {
    fn default() -> Self {
        Self {
            version: 1,
            consent_cloud: CloudConsent::default(),
            api_key: None,
            key_present: false,
            key_hint: None,
            bailian: BailianConfig::default(),
        }
    }
}

impl AsrSettings {
    pub fn normalize(&mut self) {
        if self.version == 0 {
            self.version = 1;
        }
        if self.consent_cloud.at == 0 && self.consent_cloud.granted {
            self.consent_cloud.at = now_ms();
        }

        self.api_key = self
            .api_key
            .take()
            .map(|key| key.trim().to_string())
            .filter(|key| !key.is_empty());
        if let Some(key) = self.api_key.as_deref() {
            self.key_present = true;
            self.key_hint = Some(mask_key(key));
        } else {
            // 旧版本只有 Keychain 元数据时不再回读钥匙串，视为未保存，等用户重新粘贴。
            self.key_present = false;
            self.key_hint = None;
        }

        let defaults = BailianConfig::default();
        self.bailian.endpoint = self.bailian.endpoint.trim().to_string();
        if self.bailian.endpoint.is_empty() {
            self.bailian.endpoint = defaults.endpoint;
        }
        self.bailian.model = self.bailian.model.trim().to_string();
        if self.bailian.model.is_empty() {
            self.bailian.model = defaults.model;
        }

        self.bailian.language_hints = self
            .bailian
            .language_hints
            .iter()
            .map(|item| item.trim().to_ascii_lowercase())
            .filter(|item| !item.is_empty() && item.len() <= 8)
            .take(4)
            .collect();
        if self.bailian.language_hints.is_empty() {
            self.bailian.language_hints = defaults.language_hints;
        }

        if self.bailian.vad_model != "far_field_meeting_16k" {
            self.bailian.vad_model = "near_meeting_16k".to_string();
        }

        self.bailian.max_sentence_silence_ms = self
            .bailian
            .max_sentence_silence_ms
            .clamp(MIN_SENTENCE_SILENCE_MS, MAX_SENTENCE_SILENCE_MS);
        if self.bailian.max_sentence_silence_ms == 0 {
            self.bailian.max_sentence_silence_ms = defaults.max_sentence_silence_ms;
        }

        normalize_keywords(&mut self.bailian);
    }

    pub fn validate(&self) -> Result<(), String> {
        let endpoint = self.resolve_endpoint()?;
        if !endpoint.starts_with("wss://") && !endpoint.starts_with("ws://") {
            return Err("服务地址必须以 wss:// 开头".to_string());
        }
        if self.bailian.model.is_empty() {
            return Err("请填写模型名".to_string());
        }
        Ok(())
    }

    pub fn resolve_endpoint(&self) -> Result<String, String> {
        let endpoint = normalize_endpoint(&self.bailian.endpoint)?;
        if endpoint.contains("{WorkspaceId}") || endpoint.contains("{workspaceId}") {
            return Err("请填写完整服务地址（把 {WorkspaceId} 换成真实业务空间 ID）".to_string());
        }
        Ok(endpoint)
    }
}

pub fn config_path() -> PathBuf {
    app_paths::data_dir().join("asr.json")
}

pub fn load() -> AsrSettings {
    let path = config_path();
    let Ok(text) = fs::read_to_string(&path) else {
        return AsrSettings::default();
    };
    match serde_json::from_str::<AsrSettings>(&text) {
        Ok(mut settings) => {
            settings.normalize();
            settings
        }
        Err(error) => {
            eprintln!("[asr-config] 读取 {path:?} 失败，使用默认配置: {error}");
            AsrSettings::default()
        }
    }
}

/// 旧版 `asr.json` 的识别：只有 `keyPresent: true` / `keyHint` 元数据，没有真正的 `apiKey`。
/// 这种文件是 D61 之前写的（Key 在旧 Keychain 里），加载时按未配置处理并清理元数据。
pub fn legacy_key_metadata_present() -> bool {
    let Ok(text) = fs::read_to_string(config_path()) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return false;
    };
    let flagged = value
        .get("keyPresent")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let has_key = value
        .get("apiKey")
        .and_then(serde_json::Value::as_str)
        .map(|key| !key.trim().is_empty())
        .unwrap_or(false);
    flagged && !has_key
}

pub fn save(settings: &AsrSettings) -> Result<(), String> {
    let path = config_path();
    app_paths::ensure_parent(&path).map_err(|error| format!("创建配置目录失败: {error}"))?;
    let bytes =
        serde_json::to_vec_pretty(settings).map_err(|error| format!("序列化配置失败: {error}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|error| format!("写入配置失败: {error}"))?;
    set_private_permissions(&temp);
    fs::rename(&temp, &path).map_err(|error| format!("保存配置失败: {error}"))
}

pub fn normalize_endpoint(raw: &str) -> Result<String, String> {
    let mut value = raw.trim().to_string();
    if value.is_empty() {
        return Err("请填写服务地址".to_string());
    }

    if value.starts_with("https://") {
        value.replace_range(0..8, "wss://");
    } else if value.starts_with("http://") {
        value.replace_range(0..7, "ws://");
    }
    if !value.starts_with("wss://") && !value.starts_with("ws://") {
        value = format!("wss://{value}");
    }

    let scheme_end = value.find("://").map(|index| index + 3).unwrap_or(0);
    if scheme_end == 0 || value.len() <= scheme_end {
        return Err("服务地址格式不正确".to_string());
    }
    let after_scheme = &value[scheme_end..];
    if !after_scheme.contains('/') {
        value.push_str("/api-ws/v1/inference");
    }

    if value.starts_with("ws://") {
        let rest = &value[5..];
        let host = rest
            .split('/')
            .next()
            .unwrap_or("")
            .split(':')
            .next()
            .unwrap_or("");
        if host != "localhost" && host != "127.0.0.1" && host != "[::1]" {
            return Err("服务地址必须使用 wss://（localhost 调试除外）".to_string());
        }
    }

    Ok(value)
}

pub fn mask_key(key: &str) -> String {
    let key = key.trim();
    if key.is_empty() {
        return String::new();
    }
    if key.chars().count() <= 8 {
        return "••••".to_string();
    }
    let prefix: String = key.chars().take(3).collect();
    let suffix: String = key
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{prefix}••••{suffix}")
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(unix)]
fn set_private_permissions(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &std::path::Path) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_endpoint_variants() {
        assert_eq!(
            normalize_endpoint("https://dashscope.aliyuncs.com").unwrap(),
            "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
        );
        assert_eq!(
            normalize_endpoint("dashscope.aliyuncs.com/api-ws/v1/inference").unwrap(),
            "wss://dashscope.aliyuncs.com/api-ws/v1/inference"
        );
        assert!(normalize_endpoint("ws://example.com/api").is_err());
        assert!(normalize_endpoint("ws://localhost:1234/api").is_ok());
        assert!(normalize_endpoint("   ").is_err());
    }

    #[test]
    fn rejects_unfilled_workspace_placeholder() {
        let mut settings = AsrSettings::default();
        settings.bailian.endpoint =
            "wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference".to_string();
        assert!(settings.resolve_endpoint().is_err());
        settings.bailian.endpoint =
            "wss://ws-123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference".to_string();
        assert_eq!(
            settings.resolve_endpoint().unwrap(),
            "wss://ws-123.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference"
        );
    }

    #[test]
    fn masks_keys() {
        assert_eq!(mask_key(""), "");
        assert_eq!(mask_key("short"), "••••");
        assert_eq!(mask_key("sk-1234567890abcdef"), "sk-••••cdef");
    }

    #[test]
    fn normalizes_local_api_key_and_clears_legacy_metadata() {
        let mut settings = AsrSettings::default();
        settings.api_key = Some(" sk-1234567890abcdef ".to_string());
        settings.normalize();
        assert_eq!(settings.api_key.as_deref(), Some("sk-1234567890abcdef"));
        assert!(settings.key_present);
        assert_eq!(settings.key_hint.as_deref(), Some("sk-••••cdef"));

        // 旧配置只有 Keychain 元数据、没有本地 Key：不再回读钥匙串，按未保存处理。
        settings.api_key = None;
        settings.key_present = true;
        settings.key_hint = Some("sk-••••old".to_string());
        settings.normalize();
        assert!(!settings.key_present);
        assert!(settings.key_hint.is_none());
    }

    #[test]
    fn normalizes_defaults_keywords_and_clamps() {
        let mut settings = AsrSettings {
            bailian: BailianConfig {
                endpoint: " ".to_string(),
                model: " ".to_string(),
                max_sentence_silence_ms: 99,
                vad_model: "weird".to_string(),
                vocabulary: vec![" 异步 ".to_string(), "异步".to_string(), "".to_string()],
                ..BailianConfig::default()
            },
            ..AsrSettings::default()
        };
        settings.normalize();
        assert_eq!(settings.bailian.endpoint, DEFAULT_ENDPOINT);
        assert_eq!(settings.bailian.model, DEFAULT_MODEL);
        assert_eq!(
            settings.bailian.max_sentence_silence_ms,
            MIN_SENTENCE_SILENCE_MS
        );
        assert_eq!(settings.bailian.vad_model, "near_meeting_16k");
        assert_eq!(settings.bailian.vocabulary, vec!["异步".to_string()]);
        assert!(settings.bailian.legacy_dictionaries.is_empty());
    }

    #[test]
    fn flattens_legacy_dictionaries_into_keywords() {
        let mut settings = AsrSettings::default();
        settings.bailian.legacy_dictionaries = vec![
            LegacyDictionary {
                words: vec![
                    LegacyWord {
                        text: " 异步 ".to_string(),
                    },
                    LegacyWord {
                        text: "函数".to_string(),
                    },
                ],
            },
            LegacyDictionary {
                words: vec![
                    LegacyWord {
                        text: "异步".to_string(),
                    },
                    LegacyWord {
                        text: "".to_string(),
                    },
                ],
            },
        ];
        settings.normalize();
        assert_eq!(
            settings.bailian.vocabulary,
            vec!["异步".to_string(), "函数".to_string()]
        );
        assert!(settings.bailian.legacy_dictionaries.is_empty());
    }

    #[test]
    fn normalize_keywords_drops_invalid_and_duplicates() {
        let mut settings = AsrSettings::default();
        settings.bailian.vocabulary = vec![
            " 异步 ".to_string(),
            "异步".to_string(),
            "".to_string(),
            "a\nb".to_string(),
            "一二三四五六七八九十一二三四五六".to_string(),
            "a b c d e f g h".to_string(),
            " good word ".to_string(),
        ];
        settings.normalize();
        assert_eq!(
            settings.bailian.vocabulary,
            vec!["异步".to_string(), "good word".to_string()]
        );
    }

    #[test]
    fn validates_valid_keywords() {
        let keywords = vec![
            "异步".to_string(),
            "good word".to_string(),
            "a b c d e f g".to_string(),
        ];
        assert!(validate_keywords(&keywords).is_ok());
    }

    #[test]
    fn rejects_more_than_two_thousand_keywords() {
        let keywords: Vec<String> = (0..MAX_KEYWORDS + 1)
            .map(|index| format!("w{index}"))
            .collect();
        let error = validate_keywords(&keywords).unwrap_err();
        assert!(error.contains("2000"), "{error}");
    }

    #[test]
    fn rejects_overlong_non_ascii_word() {
        let keywords = vec!["一二三四五六七八九十一二三四五六".to_string()];
        let error = validate_keywords(&keywords).unwrap_err();
        assert!(error.contains("太长"), "{error}");
        assert!(error.contains("15"), "{error}");
    }

    #[test]
    fn rejects_ascii_word_with_too_many_segments() {
        let keywords = vec!["a b c d e f g h".to_string()];
        let error = validate_keywords(&keywords).unwrap_err();
        assert!(error.contains("7"), "{error}");
    }

    #[test]
    fn rejects_empty_keyword() {
        let error = validate_keywords(&["  ".to_string()]).unwrap_err();
        assert!(error.contains("不能为空"), "{error}");
    }
}
