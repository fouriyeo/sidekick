//! 手机端麦克风选择 spike：枚举 Android 暴露的内置输入设备，并按指定设备录一段 PCM。
//!
//! 采集在 Kotlin `MicProbePlugin` 里完成；这里只做两件事：
//! 1. 在插件 setup 里注册 Android 插件并保存 `PluginHandle`；
//! 2. 提供两个应用命令给设置页，不注册 plugin 命令（避免改 capability/ACL）。
//!
//! 音频只在内存里转成 base64 返回给 WebView 播放，不落盘、不经过局域网、不进 ASR。

use serde::{Deserialize, Serialize};
use tauri::plugin::{Builder, PluginHandle, TauriPlugin};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MicDevice {
    pub id: i32,
    pub address: String,
    pub product_name: String,
    pub channel_counts: Vec<i32>,
    pub sample_rates: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MicClip {
    pub pcm_base64: String,
    pub sample_rate: u32,
    pub samples: u32,
    pub source_used: i32,
    pub routed_address: String,
    pub preferred_applied: bool,
    pub rms: f64,
    pub peak: f64,
    pub elapsed_ms: u64,
}

#[derive(Debug, Deserialize)]
struct ListResponse {
    devices: Vec<MicDevice>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecordPayload {
    device_id: i32,
    seconds: u32,
    source: Option<i32>,
}

pub struct MicProbeState {
    handle: PluginHandle<tauri::Wry>,
}

/// 列出 Android 暴露的内置麦克风（RMX3370 上是 bottom + back 两个）。
#[tauri::command]
pub async fn mic_probe_devices(app: AppHandle) -> Result<Vec<MicDevice>, String> {
    let handle = app
        .try_state::<MicProbeState>()
        .ok_or_else(|| "当前平台不支持麦克风选择".to_string())?
        .handle
        .clone();

    let response = handle
        .run_mobile_plugin_async::<ListResponse>("listInputs", ())
        .await
        .map_err(|error| format!("枚举麦克风失败：{error}"))?;
    Ok(response.devices)
}

/// 用指定设备录 `seconds` 秒 16k 单声道 PCM16；返回 base64 与实际路由，供前端试听。
#[tauri::command]
pub async fn mic_probe_record(
    app: AppHandle,
    device_id: i32,
    seconds: u32,
) -> Result<MicClip, String> {
    let handle = app
        .try_state::<MicProbeState>()
        .ok_or_else(|| "当前平台不支持麦克风选择".to_string())?
        .handle
        .clone();

    handle
        .run_mobile_plugin_async::<MicClip>(
            "record",
            RecordPayload {
                device_id,
                seconds,
                source: None,
            },
        )
        .await
        .map_err(|error| format!("录音失败：{error}"))
}

/// 只负责注册 Android 插件；命令走应用命令，不暴露 `plugin:mic-probe|...`。
pub fn init() -> TauriPlugin<tauri::Wry> {
    Builder::new("mic-probe")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api
                    .register_android_plugin("dev.sidekick.app", "MicProbePlugin")
                    .map_err(|error| std::io::Error::other(error.to_string()))?;
                app.manage(MicProbeState { handle });
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = (app, api);
            }
            Ok(())
        })
        .build()
}
