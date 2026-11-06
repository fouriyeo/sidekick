//! 云端 ASR 配置状态与 Tauri 命令。
//!
//! 只保留百炼云端引擎：负责配置读写、本地 Key、状态/掩码、地址解析、
//! 设置页“测试连接”。真正的 WebSocket 会话在 bailian_asr.rs。
//! API Key 存在本机 `asr.json`（0600），不再读写 macOS 钥匙串。

use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::asr_config::{self, AsrSettings, BailianConfig, CloudConsent};
use crate::asr_keychain;
use crate::bailian_asr::{self, CloudSessionConfig};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAsrStatus {
    pub configured: bool,
    pub consent: bool,
    pub has_key: bool,
    pub key_masked: Option<String>,
    pub config: BailianConfig,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAsrSaveInput {
    pub config: BailianConfig,
    pub consent: bool,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub clear_key: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAsrTestResult {
    pub ok: bool,
    pub latency_ms: Option<u32>,
    pub model: Option<String>,
    pub error_code: Option<String>,
    pub message: Option<String>,
}

#[derive(Clone, Debug)]
pub struct CloudStartError {
    pub code: &'static str,
    pub message: String,
}

pub struct AsrCloudState {
    settings: Mutex<AsrSettings>,
}

impl AsrCloudState {
    /// 生产构造：只读 `asr.json`（0600），**不访问 Keychain**。
    /// 开发版每次重编译签名都会变，读旧钥匙串条目会弹系统授权/登录密码；
    /// 旧 Key 的恢复方式只有模型页重新粘贴。
    pub fn new() -> Self {
        let settings = asr_config::load();
        // 升级前的老文件只有 keyPresent/keyHint、没有 apiKey：加载时已按未配置处理，
        // 顺手把磁盘上的旧元数据清掉，避免「看着像已保存」的误导。
        if asr_config::legacy_key_metadata_present() {
            let _ = asr_config::save(&settings);
        }
        Self {
            settings: Mutex::new(settings),
        }
    }

    fn snapshot(&self) -> AsrSettings {
        self.settings.lock().unwrap().clone()
    }

    fn persist(&self, next: AsrSettings) -> Result<(), String> {
        asr_config::save(&next)?;
        *self.settings.lock().unwrap() = next;
        Ok(())
    }

    pub fn status(&self) -> CloudAsrStatus {
        status_from_settings(&self.snapshot())
    }

    pub fn save(&self, input: CloudAsrSaveInput) -> Result<CloudAsrStatus, String> {
        let mut next = self.snapshot();
        next.bailian = input.config;
        next.normalize();
        next.validate()?;
        next.consent_cloud = if input.consent {
            CloudConsent {
                granted: true,
                at: asr_config::now_ms(),
            }
        } else {
            CloudConsent::default()
        };

        let new_key = input
            .api_key
            .as_deref()
            .map(str::trim)
            .filter(|key| !key.is_empty());

        if input.clear_key {
            next.api_key = None;
            next.key_present = false;
            next.key_hint = None;
            // 旧版本可能把 Key 放在钥匙串；清除是显式动作，顺手清理旧条目。
            let _ = asr_keychain::delete_key();
        }
        if let Some(api_key) = new_key {
            next.api_key = Some(api_key.to_string());
            next.key_present = true;
            next.key_hint = Some(asr_config::mask_key(api_key));
        }

        self.persist(next)?;
        Ok(self.status())
    }

    /// 保存关键词：只替换 `bailian.vocabulary`，不碰 consent / apiKey /
    /// keyPresent / keyHint 与其他 bailian 字段。
    pub fn save_keywords(&self, keywords: Vec<String>) -> Result<CloudAsrStatus, String> {
        asr_config::validate_keywords(&keywords)?;
        let mut next = self.snapshot();
        next.bailian.vocabulary = keywords;
        next.normalize();
        self.persist(next)?;
        Ok(self.status())
    }

    pub fn clear(&self) -> Result<CloudAsrStatus, String> {
        let _ = asr_keychain::delete_key();
        self.persist(AsrSettings::default())?;
        Ok(self.status())
    }

    /// 会话开始时取一次配置快照；未配置完整时返回错误，由调用方回给手机。
    pub fn session_config(&self) -> Result<CloudSessionConfig, CloudStartError> {
        let settings = self.snapshot();
        if !settings.consent_cloud.granted {
            return Err(CloudStartError {
                code: "cloud_not_configured",
                message: "还没有同意云端识别隐私说明".to_string(),
            });
        }
        if let Err(error) = settings.validate() {
            return Err(CloudStartError {
                code: "cloud_not_configured",
                message: error,
            });
        }
        let key = match settings
            .api_key
            .clone()
            .filter(|key| !key.trim().is_empty())
        {
            Some(key) => key,
            None => {
                return Err(CloudStartError {
                    code: "cloud_not_configured",
                    message: "还没有保存百炼 API Key".to_string(),
                });
            }
        };
        let endpoint = settings
            .resolve_endpoint()
            .map_err(|error| CloudStartError {
                code: "cloud_not_configured",
                message: error,
            })?;
        Ok(CloudSessionConfig {
            endpoint,
            api_key: key,
            model: settings.bailian.model.clone(),
            language_hints: settings.bailian.language_hints.clone(),
            keep_dialect: settings.bailian.keep_dialect,
            vad_model: settings.bailian.vad_model.clone(),
            max_sentence_silence_ms: settings.bailian.max_sentence_silence_ms,
            heartbeat: settings.bailian.heartbeat,
            keywords: settings.bailian.vocabulary.clone(),
        })
    }

    pub async fn test(
        &self,
        config: Option<BailianConfig>,
        api_key: Option<String>,
    ) -> CloudAsrTestResult {
        let settings = self.snapshot();
        let mut draft = settings.clone();
        if let Some(config) = config {
            draft.bailian = config;
        }
        draft.normalize();
        let model = draft.bailian.model.clone();

        if let Err(error) = draft.validate() {
            return test_error("cloud_not_configured", error, Some(model));
        }
        let endpoint = match draft.resolve_endpoint() {
            Ok(endpoint) => endpoint,
            Err(error) => return test_error("cloud_not_configured", error, Some(model)),
        };
        let key = api_key
            .as_deref()
            .map(str::trim)
            .filter(|key| !key.is_empty())
            .map(str::to_string)
            .or_else(|| draft.api_key.clone())
            .filter(|key| !key.trim().is_empty());
        let Some(key) = key else {
            return test_error(
                "cloud_not_configured",
                "请先填写 API Key".to_string(),
                Some(model),
            );
        };

        let session = CloudSessionConfig {
            endpoint,
            api_key: key,
            model: model.clone(),
            language_hints: draft.bailian.language_hints.clone(),
            keep_dialect: draft.bailian.keep_dialect,
            vad_model: draft.bailian.vad_model.clone(),
            max_sentence_silence_ms: draft.bailian.max_sentence_silence_ms,
            heartbeat: draft.bailian.heartbeat,
            keywords: draft.bailian.vocabulary.clone(),
        };

        match bailian_asr::probe(&session).await {
            Ok(latency_ms) => CloudAsrTestResult {
                ok: true,
                latency_ms: Some(latency_ms),
                model: Some(model),
                error_code: None,
                message: Some(format!("连接成功 · {latency_ms}ms")),
            },
            Err(error) => test_error(error.code, error.detail, Some(model)),
        }
    }
}

fn test_error(code: &'static str, detail: String, model: Option<String>) -> CloudAsrTestResult {
    CloudAsrTestResult {
        ok: false,
        latency_ms: None,
        model,
        error_code: Some(code.to_string()),
        message: Some(format!("{}（{}）", user_error_text(code), detail)),
    }
}

/// 只读 `asr.json` 的元数据；Key 已存在本地配置里，不再访问 Keychain。
fn status_from_settings(settings: &AsrSettings) -> CloudAsrStatus {
    CloudAsrStatus {
        configured: settings.consent_cloud.granted
            && settings.key_present
            && settings.validate().is_ok(),
        consent: settings.consent_cloud.granted,
        has_key: settings.key_present,
        key_masked: settings
            .key_hint
            .clone()
            .filter(|value| !value.trim().is_empty()),
        config: settings.bailian.clone(),
    }
}

pub fn user_error_text(code: &str) -> &'static str {
    match code {
        "cloud_not_configured" => "云端还没配置完整",
        "cloud_key_invalid" => "百炼 API Key 无效或已过期",
        "cloud_forbidden" => "这个 Key 没有该模型或业务空间的权限",
        "cloud_rate_limited" => "百炼限流了，稍后再试",
        "cloud_quota_exceeded" => "百炼额度不足",
        "cloud_model_not_found" => "模型不存在或当前地域不可用",
        "cloud_network" => "连不上百炼，检查电脑网络",
        "cloud_timeout" => "百炼响应超时",
        "cloud_task_failed" => "百炼识别失败",
        "cloud_internal" => "云端会话异常结束，请重启 Sidekick",
        "cloud_key_unavailable" => "读取不到本机保存的密钥，请重新保存",
        _ => "云端识别失败",
    }
}

#[tauri::command]
pub fn asr_cloud_status(state: State<'_, Arc<AsrCloudState>>) -> CloudAsrStatus {
    state.status()
}

#[tauri::command]
pub fn asr_cloud_save(
    state: State<'_, Arc<AsrCloudState>>,
    input: CloudAsrSaveInput,
) -> Result<CloudAsrStatus, String> {
    state.save(input)
}

#[tauri::command]
pub fn asr_keywords_save(
    state: State<'_, Arc<AsrCloudState>>,
    keywords: Vec<String>,
) -> Result<CloudAsrStatus, String> {
    state.save_keywords(keywords)
}

#[tauri::command]
pub async fn asr_cloud_test(
    state: State<'_, Arc<AsrCloudState>>,
    config: Option<BailianConfig>,
    api_key: Option<String>,
) -> Result<CloudAsrTestResult, String> {
    Ok(state.test(config, api_key).await)
}

#[tauri::command]
pub fn asr_cloud_clear(state: State<'_, Arc<AsrCloudState>>) -> Result<CloudAsrStatus, String> {
    state.clear()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_error_text() {
        assert_eq!(
            user_error_text("cloud_key_invalid"),
            "百炼 API Key 无效或已过期"
        );
        assert_eq!(user_error_text("unknown"), "云端识别失败");
    }

    #[test]
    fn default_settings_have_no_key() {
        let settings = AsrSettings::default();
        assert!(!settings.consent_cloud.granted);
        assert_eq!(settings.bailian.model, asr_config::DEFAULT_MODEL);
    }

    #[test]
    fn session_config_reads_local_key() {
        let mut settings = AsrSettings::default();
        settings.consent_cloud.granted = true;
        settings.api_key = Some("sk-local-test-123456".to_string());
        settings.normalize();

        let state = AsrCloudState {
            settings: Mutex::new(settings),
        };
        let config = state.session_config().unwrap();
        assert_eq!(config.api_key, "sk-local-test-123456");
        assert_eq!(config.model, asr_config::DEFAULT_MODEL);
    }

    /// 测试写盘用独立临时目录，避免污染真实 `~/.sidekick`。
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn temp_data_dir(label: &str) -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static SEQUENCE: AtomicU64 = AtomicU64::new(1);
        let dir = std::env::temp_dir().join(format!(
            "sidekick-asr-cloud-{label}-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn session_config_uses_keywords() {
        let mut settings = AsrSettings::default();
        settings.consent_cloud.granted = true;
        settings.api_key = Some("sk-local-test-123456".to_string());
        settings.bailian.vocabulary = vec![" 异步 ".to_string(), "函数".to_string()];
        settings.normalize();

        let state = AsrCloudState {
            settings: Mutex::new(settings),
        };
        let config = state.session_config().unwrap();
        assert_eq!(config.keywords, vec!["异步".to_string(), "函数".to_string()]);
    }

    #[test]
    fn saves_keywords_without_touching_consent_or_key() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|error| error.into_inner());
        let dir = temp_data_dir("save");
        // SAFETY: 测试内独占环境变量（ENV_LOCK 串行化），不影响生产代码。
        unsafe { std::env::set_var("SIDEKICK_DATA_DIR", &dir) };

        let mut settings = AsrSettings::default();
        settings.consent_cloud = CloudConsent {
            granted: true,
            at: 12345,
        };
        settings.api_key = Some("sk-local-test-123456".to_string());
        settings.normalize();
        let state = AsrCloudState {
            settings: Mutex::new(settings),
        };

        let keywords = vec!["异步".to_string(), "函数".to_string()];
        let status = state.save_keywords(keywords.clone()).unwrap();
        assert_eq!(status.config.vocabulary, keywords);
        assert!(status.consent);
        assert!(status.has_key);
        assert_eq!(status.key_masked.as_deref(), Some("sk-••••3456"));

        // 落盘后再读回：关键词生效，consent / Key 原样保留。
        let saved = asr_config::load();
        assert_eq!(saved.bailian.vocabulary, keywords);
        assert!(saved.consent_cloud.granted);
        assert_eq!(saved.api_key.as_deref(), Some("sk-local-test-123456"));

        // SAFETY: 同上，测试串行化后恢复环境变量。
        unsafe { std::env::remove_var("SIDEKICK_DATA_DIR") };
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_invalid_keywords_without_persisting() {
        let _guard = ENV_LOCK.lock().unwrap_or_else(|error| error.into_inner());
        let dir = temp_data_dir("invalid");
        // SAFETY: 测试内独占环境变量（ENV_LOCK 串行化），不影响生产代码。
        unsafe { std::env::set_var("SIDEKICK_DATA_DIR", &dir) };

        let mut settings = AsrSettings::default();
        settings.consent_cloud.granted = true;
        settings.api_key = Some("sk-local-test-123456".to_string());
        settings.normalize();
        let state = AsrCloudState {
            settings: Mutex::new(settings),
        };

        let bad = vec!["一二三四五六七八九十一二三四五六".to_string()];
        let error = state.save_keywords(bad).unwrap_err();
        assert!(error.contains("太长"), "{error}");

        assert!(!asr_config::config_path().exists());
        assert!(state.status().config.vocabulary.is_empty());

        // SAFETY: 同上，测试串行化后恢复环境变量。
        unsafe { std::env::remove_var("SIDEKICK_DATA_DIR") };
        let _ = std::fs::remove_dir_all(&dir);
    }
}
