//! 语音备忘录的共享核心（D115/D118）。
//!
//! 两端共用：类型、WAV 写入、SQLite 库、路径。
//! 手机端（`mobile`）负责录音、云端转写/结构化、Key 与同步；
//! 桌面端（`desktop`）负责配对、镜像接收与只读展示。

pub mod db;
pub mod storage;
pub mod types;
pub mod wav;

#[cfg(mobile)]
pub mod mobile;

#[cfg(desktop)]
pub mod desktop;

/// 音频统一参数：16k mono PCM16。
pub const SAMPLE_RATE: u32 = 16_000;
pub const CHANNELS: u16 = 1;
pub const BYTES_PER_SECOND: u64 = SAMPLE_RATE as u64 * 2;

/// 单次录音上限（2 小时，D118 先固定）。
pub const MAX_RECORDING_MS: i64 = 2 * 60 * 60 * 1000;

/// 管道分段大小（5 分钟一段）。
pub const SEGMENT_MS: i64 = 5 * 60 * 1000;

/// PCM 字节数 → 时长（毫秒）。
pub fn pcm_duration_ms(bytes: u64) -> i64 {
    ((bytes as f64 / BYTES_PER_SECOND as f64) * 1000.0).round() as i64
}

/// 当前毫秒时间戳（两端共用，不依赖桌面专属模块）。
pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

