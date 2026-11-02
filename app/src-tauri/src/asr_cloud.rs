//! 云端 ASR 配置状态与 Tauri 命令。
//!
//! 只保留百炼云端引擎：负责配置读写、Keychain 缓存、状态/掩码、地址解析、
//! 设置页“测试连接”。真正的 WebSocket 会话在 bailian_asr.rs。

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
    key_cache: Mutex<Option<Option<String>>>,
}

impl AsrCloudState {
    pub fn new() -> Self {
        Self {
            settings: Mutex::new(asr_config::load()),
            key_cache: Mutex::new(None),
        }
    }

    fn key(&self) -> Result<Option<String>, String> {
        let mut cache = self.key_cache.lock().unwrap();
        if let Some(cached) = cache.as_ref() {
            return Ok(cached.clone());
        }
        let key = asr_keychain::get_key()?;
        *cache = Some(key.clone());
        Ok(key)
    }

    fn invalidate_key(&self) {
        *self.key_cache.lock().unwrap() = None;
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
        let settings = self.snapshot();
        let key = self.key().ok().flatten();
        let configured =
            settings.consent_cloud.granted && key.is_some() && settings.validate().is_ok();
        CloudAsrStatus {
            configured,
            consent: settings.consent_cloud.granted,
            has_key: key.is_some(),
            key_masked: key
                .as_deref()
                .map(asr_config::mask_key)
                .filter(|value| !value.is_empty()),
            config: settings.bailian,
        }
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
        let key_changed = input.clear_key || new_key.is_some();
        // 只有真的要改 Key 且元数据表明已有 Key 时才读钥匙串；
        // 保存地址/模型、首次保存 Key 都不应触发系统授权弹窗。
        let previous_key = if key_changed && next.key_present {
            self.key()?
        } else {
            None
        };

        if input.clear_key {
            asr_keychain::delete_key()?;
            *self.key_cache.lock().unwrap() = Some(None);
            next.key_present = false;
            next.key_hint = None;
        }
        if let Some(api_key) = new_key {
            asr_keychain::set_key(api_key)?;
            // 保存后把 Key 留在内存缓存：本次 App 运行期间首次录音不再触发钥匙串授权。
            *self.key_cache.lock().unwrap() = Some(Some(api_key.to_string()));
            next.key_present = true;
            next.key_hint = Some(asr_config::mask_key(api_key));
        }

        if let Err(error) = self.persist(next) {
            if key_changed {
                let rollback = match previous_key.as_deref() {
                    Some(key) => asr_keychain::set_key(key),
                    None => asr_keychain::delete_key(),
                };
                if let Err(rollback_error) = rollback {
                    return Err(format!("{error}；回滚系统钥匙串也失败：{rollback_error}"));
                }
                self.invalidate_key();
            }
            return Err(error);
        }
        Ok(self.status())
    }

    pub fn clear(&self) -> Result<CloudAsrStatus, String> {
        asr_keychain::delete_key()?;
        self.invalidate_key();
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
        if !settings.key_present {
            return Err(CloudStartError {
                code: "cloud_not_configured",
                message: "还没有保存百炼 API Key".to_string(),
            });
        }
        let key = match self.key() {
            Ok(Some(key)) => key,
            Ok(None) => {
                return Err(CloudStartError {
                    code: "cloud_not_configured",
                    message: "还没有保存百炼 API Key".to_string(),
                });
            }
            Err(error) => {
                return Err(CloudStartError {
                    code: "cloud_key_unavailable",
                    message: error,
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
            vocabulary: settings.bailian.vocabulary.clone(),
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
            .or_else(|| {
                if draft.key_present {
                    self.key().ok().flatten()
                } else {
                    None
                }
            });
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
            vocabulary: draft.bailian.vocabulary.clone(),
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
}
