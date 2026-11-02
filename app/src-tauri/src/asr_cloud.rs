//! 云端 ASR 配置状态与 Tauri 命令。
//!
//! 负责：配置读写、Keychain 缓存、状态/掩码、地址解析、引擎选择、
//! 设置页“测试连接”。真正的 WebSocket 会话在 bailian_asr.rs。

use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::asr_config::{self, AsrSettings, BailianConfig, CloudConsent};
use crate::asr_keychain;
use crate::asr_models::ModelManager;
use crate::bailian_asr::{self, CloudSessionConfig};

const ENGINE_LOCAL: &str = "local";
const ENGINE_BAILIAN: &str = "bailian";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAsrStatus {
    pub engine: String,
    pub configured: bool,
    pub consent: bool,
    pub has_key: bool,
    pub key_masked: Option<String>,
    pub fallback_to_local: bool,
    pub local_ready: bool,
    pub config: BailianConfig,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAsrSaveInput {
    pub config: BailianConfig,
    pub consent: bool,
    pub fallback_to_local: bool,
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

    pub fn fallback_to_local(&self) -> bool {
        self.settings.lock().unwrap().fallback_to_local
    }

    pub fn cloud_selected(&self) -> bool {
        self.settings.lock().unwrap().cloud_selected()
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

    pub fn status(&self, models: &ModelManager) -> CloudAsrStatus {
        let settings = self.snapshot();
        let key = self.key().ok().flatten();
        let configured =
            settings.consent_cloud.granted && key.is_some() && settings.validate().is_ok();
        CloudAsrStatus {
            engine: settings.engine,
            configured,
            consent: settings.consent_cloud.granted,
            has_key: key.is_some(),
            key_masked: key
                .as_deref()
                .map(asr_config::mask_key)
                .filter(|value| !value.is_empty()),
            fallback_to_local: settings.fallback_to_local,
            local_ready: models.selected_available(),
            config: settings.bailian,
        }
    }

    pub fn save(
        &self,
        input: CloudAsrSaveInput,
        models: &ModelManager,
    ) -> Result<CloudAsrStatus, String> {
        let mut next = self.snapshot();
        next.bailian = input.config;
        next.normalize();
        next.validate()?;
        next.fallback_to_local = input.fallback_to_local;
        next.consent_cloud = if input.consent {
            CloudConsent {
                granted: true,
                at: asr_config::now_ms(),
            }
        } else {
            CloudConsent::default()
        };

        // 记住旧 Key，配置落盘失败时回滚，避免“Key 已换、配置没换”的半更新状态。
        let previous_key = self.key()?;
        let mut key_changed = false;
        let mut has_key = previous_key.is_some();

        if input.clear_key {
            asr_keychain::delete_key()?;
            self.invalidate_key();
            key_changed = true;
            has_key = false;
        }
        if let Some(api_key) = input
            .api_key
            .as_deref()
            .map(str::trim)
            .filter(|key| !key.is_empty())
        {
            asr_keychain::set_key(api_key)?;
            self.invalidate_key();
            key_changed = true;
            has_key = true;
        }

        let configured = next.consent_cloud.granted && has_key && next.validate().is_ok();
        if next.engine == ENGINE_BAILIAN && !configured {
            next.engine = ENGINE_LOCAL.to_string();
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
        Ok(self.status(models))
    }

    pub fn select_engine(
        &self,
        engine: &str,
        models: &ModelManager,
    ) -> Result<CloudAsrStatus, String> {
        if engine != ENGINE_LOCAL && engine != ENGINE_BAILIAN {
            return Err("未知的语音引擎".to_string());
        }
        if engine == ENGINE_BAILIAN {
            let settings = self.snapshot();
            let has_key = self.key()?.is_some();
            if !settings.consent_cloud.granted || !has_key || settings.validate().is_err() {
                return Err("云端还没配置完整，请先填写地址、API Key 并同意隐私说明".to_string());
            }
        }
        let mut next = self.snapshot();
        next.engine = engine.to_string();
        self.persist(next)?;
        Ok(self.status(models))
    }

    pub fn clear(&self, models: &ModelManager) -> Result<CloudAsrStatus, String> {
        asr_keychain::delete_key()?;
        self.invalidate_key();
        let next = AsrSettings::default();
        self.persist(next)?;
        Ok(self.status(models))
    }

    /// 会话开始时取一次配置快照；云端不可用时调用方决定本机回退。
    pub fn session_config(
        &self,
        models: &ModelManager,
    ) -> Result<CloudSessionConfig, CloudStartError> {
        let settings = self.snapshot();
        if settings.engine != ENGINE_BAILIAN {
            return Err(CloudStartError {
                code: "cloud_not_configured",
                message: "当前没有启用云端引擎".to_string(),
            });
        }
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
        let _ = models;
        Ok(CloudSessionConfig {
            endpoint,
            workspace_id: settings.bailian.workspace_id.clone(),
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
            .or_else(|| self.key().ok().flatten());
        let Some(key) = key else {
            return test_error(
                "cloud_not_configured",
                "请先填写 API Key".to_string(),
                Some(model),
            );
        };

        let session = CloudSessionConfig {
            endpoint,
            workspace_id: draft.bailian.workspace_id.clone(),
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
pub fn asr_cloud_status(
    state: State<'_, Arc<AsrCloudState>>,
    models: State<'_, Arc<ModelManager>>,
) -> CloudAsrStatus {
    state.status(models.inner())
}

#[tauri::command]
pub fn asr_cloud_save(
    state: State<'_, Arc<AsrCloudState>>,
    models: State<'_, Arc<ModelManager>>,
    input: CloudAsrSaveInput,
) -> Result<CloudAsrStatus, String> {
    state.save(input, models.inner())
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
pub fn asr_engine_select(
    state: State<'_, Arc<AsrCloudState>>,
    models: State<'_, Arc<ModelManager>>,
    engine: String,
) -> Result<CloudAsrStatus, String> {
    state.select_engine(&engine, models.inner())
}

#[tauri::command]
pub fn asr_cloud_clear(
    state: State<'_, Arc<AsrCloudState>>,
    models: State<'_, Arc<ModelManager>>,
) -> Result<CloudAsrStatus, String> {
    state.clear(models.inner())
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
    fn status_engine_defaults_to_local() {
        let settings = AsrSettings::default();
        assert_eq!(settings.engine, "local");
        assert!(!settings.cloud_selected());
    }
}
