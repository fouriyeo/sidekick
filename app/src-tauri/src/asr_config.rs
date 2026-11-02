use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::app_paths;

pub const DEFAULT_ENDPOINT: &str = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
pub const DEFAULT_MODEL: &str = "qwen-audio-3.1-asr-flash-streaming";
pub const MAX_VOCABULARY: usize = 50;
pub const MAX_SENTENCE_SILENCE_MS: u32 = 6_000;
pub const MIN_SENTENCE_SILENCE_MS: u32 = 200;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BailianConfig {
    pub endpoint: String,
    pub workspace_id: String,
    pub model: String,
    pub language_hints: Vec<String>,
    pub keep_dialect: bool,
    pub vad_model: String,
    pub max_sentence_silence_ms: u32,
    pub heartbeat: bool,
    pub vocabulary: Vec<String>,
}

impl Default for BailianConfig {
    fn default() -> Self {
        Self {
            endpoint: DEFAULT_ENDPOINT.to_string(),
            workspace_id: String::new(),
            model: DEFAULT_MODEL.to_string(),
            language_hints: vec!["zh".to_string()],
            keep_dialect: false,
            vad_model: "near_meeting_16k".to_string(),
            max_sentence_silence_ms: 800,
            heartbeat: true,
            vocabulary: Vec::new(),
        }
    }
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrSettings {
    pub version: u32,
    pub engine: String,
    pub consent_cloud: CloudConsent,
    pub fallback_to_local: bool,
    pub bailian: BailianConfig,
}

impl Default for AsrSettings {
    fn default() -> Self {
        Self {
            version: 1,
            engine: "local".to_string(),
            consent_cloud: CloudConsent::default(),
            fallback_to_local: true,
            bailian: BailianConfig::default(),
        }
    }
}

impl AsrSettings {
    pub fn cloud_selected(&self) -> bool {
        self.engine == "bailian"
    }

    pub fn normalize(&mut self) {
        if self.version == 0 {
            self.version = 1;
        }
        if self.engine != "local" && self.engine != "bailian" {
            self.engine = "local".to_string();
        }
        if self.consent_cloud.at == 0 && self.consent_cloud.granted {
            self.consent_cloud.at = now_ms();
        }

        let defaults = BailianConfig::default();
        self.bailian.endpoint = self.bailian.endpoint.trim().to_string();
        if self.bailian.endpoint.is_empty() {
            self.bailian.endpoint = defaults.endpoint;
        }
        self.bailian.workspace_id = self.bailian.workspace_id.trim().to_string();
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

        let mut seen = std::collections::BTreeSet::new();
        let mut vocabulary = Vec::new();
        for word in &self.bailian.vocabulary {
            let word = word.trim();
            if word.is_empty() || word.chars().count() > 64 {
                continue;
            }
            if seen.insert(word.to_string()) {
                vocabulary.push(word.to_string());
            }
            if vocabulary.len() >= MAX_VOCABULARY {
                break;
            }
        }
        self.bailian.vocabulary = vocabulary;
    }

    pub fn validate(&self) -> Result<(), String> {
        let endpoint = self.resolve_endpoint()?;
        if !endpoint.starts_with("wss://") && !endpoint.starts_with("ws://") {
            return Err("服务地址必须以 wss:// 开头".to_string());
        }
        if self.bailian.model.is_empty() {
            return Err("请填写模型名".to_string());
        }
        if !self.bailian.workspace_id.is_empty()
            && !self
                .bailian
                .workspace_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err("业务空间 ID 只能包含字母、数字、- 和 _".to_string());
        }
        Ok(())
    }

    pub fn resolve_endpoint(&self) -> Result<String, String> {
        let mut endpoint = normalize_endpoint(&self.bailian.endpoint)?;
        if endpoint.contains("{WorkspaceId}") || endpoint.contains("{workspaceId}") {
            let workspace = self.bailian.workspace_id.trim();
            if workspace.is_empty() {
                return Err("使用业务空间域名时请填写业务空间 ID".to_string());
            }
            endpoint = endpoint
                .replace("{WorkspaceId}", workspace)
                .replace("{workspaceId}", workspace);
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
    fn substitutes_workspace_placeholder() {
        let mut settings = AsrSettings::default();
        settings.bailian.endpoint =
            "wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference".to_string();
        assert!(settings.resolve_endpoint().is_err());
        settings.bailian.workspace_id = "ws-123".to_string();
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
    fn normalizes_defaults_and_clamps() {
        let mut settings = AsrSettings {
            engine: "unknown".to_string(),
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
        assert_eq!(settings.engine, "local");
        assert_eq!(settings.bailian.endpoint, DEFAULT_ENDPOINT);
        assert_eq!(settings.bailian.model, DEFAULT_MODEL);
        assert_eq!(
            settings.bailian.max_sentence_silence_ms,
            MIN_SENTENCE_SILENCE_MS
        );
        assert_eq!(settings.bailian.vad_model, "near_meeting_16k");
        assert_eq!(settings.bailian.vocabulary, vec!["异步".to_string()]);
    }
}
