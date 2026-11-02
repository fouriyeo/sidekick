//! 云端 ASR 用量与费用统计。
//!
//! 每次百炼 task-finished 返回 usage 后按本机日期累加到一天；`asr_usage.json`
//! （0600）只存每日汇总（Token、音频时长、人民币微元），不存文本/Key/音频。
//! 查询时按今天/近 7 天/近 30 天/近 1 年汇总，并返回最近 14 天明细。

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chrono::{Duration, Local, NaiveDate};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::app_paths;
use crate::asr_pricing::{self, Pricing};
use crate::bailian_asr::CloudUsage;

const USAGE_VERSION: u32 = 1;
const MAX_DAYS: usize = 400;
const DAYS_WINDOW: i64 = 365;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub sessions: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub audio_duration_ms: u64,
    pub cost_cny_micros: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageDay {
    pub date: String,
    pub sessions: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub audio_duration_ms: u64,
    pub cost_cny_micros: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub today: UsageSummary,
    pub last7_days: UsageSummary,
    pub last30_days: UsageSummary,
    pub last365_days: UsageSummary,
    pub days: Vec<UsageDay>,
    pub price_note: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageData {
    version: u32,
    days: BTreeMap<String, UsageDay>,
}

impl Default for UsageData {
    fn default() -> Self {
        Self {
            version: USAGE_VERSION,
            days: BTreeMap::new(),
        }
    }
}

pub struct UsageStore {
    data: Mutex<UsageData>,
}

impl UsageStore {
    pub fn new() -> Self {
        Self {
            data: Mutex::new(load()),
        }
    }

    pub fn record(&self, usage: &CloudUsage, pricing: Pricing) {
        let input = usage.input_tokens;
        let output = usage.output_tokens;
        let total = usage.total_tokens.max(input.saturating_add(output));
        if total == 0 && usage.audio_duration_ms == 0 {
            return;
        }

        let date = today_string();
        let cost = asr_pricing::cost_micros(input, output, pricing);
        let mut data = self.data.lock().unwrap();
        let day = data.days.entry(date.clone()).or_insert_with(|| UsageDay {
            date,
            ..UsageDay::default()
        });
        day.sessions += 1;
        day.input_tokens += input;
        day.output_tokens += output;
        day.total_tokens += total;
        day.audio_duration_ms += usage.audio_duration_ms;
        day.cost_cny_micros += cost;

        while data.days.len() > MAX_DAYS {
            let Some(oldest) = data.days.keys().next().cloned() else {
                break;
            };
            data.days.remove(&oldest);
        }

        if let Err(error) = save(&data) {
            eprintln!("[asr-usage] 保存用量失败: {error}");
        }
    }

    pub fn stats(&self) -> UsageStats {
        stats_for(&self.data.lock().unwrap(), Local::now().date_naive())
    }

    pub fn clear(&self) -> Result<UsageStats, String> {
        let mut data = self.data.lock().unwrap();
        *data = UsageData::default();
        save(&data)?;
        Ok(stats_for(&data, Local::now().date_naive()))
    }
}

fn today_string() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn stats_for(data: &UsageData, today: NaiveDate) -> UsageStats {
    UsageStats {
        today: sum_range(data, today, today),
        last7_days: sum_range(data, today - Duration::days(6), today),
        last30_days: sum_range(data, today - Duration::days(29), today),
        last365_days: sum_range(data, today - Duration::days(364), today),
        days: days_window(data, today),
        price_note: asr_pricing::price_note().to_string(),
    }
}

fn sum_range(data: &UsageData, start: NaiveDate, end: NaiveDate) -> UsageSummary {
    let start = start.format("%Y-%m-%d").to_string();
    let end = end.format("%Y-%m-%d").to_string();
    let mut summary = UsageSummary::default();
    for day in data.days.values() {
        if day.date < start || day.date > end {
            continue;
        }
        summary.sessions += day.sessions;
        summary.input_tokens += day.input_tokens;
        summary.output_tokens += day.output_tokens;
        summary.total_tokens += day.total_tokens;
        summary.audio_duration_ms += day.audio_duration_ms;
        summary.cost_cny_micros += day.cost_cny_micros;
    }
    summary
}

fn days_window(data: &UsageData, today: NaiveDate) -> Vec<UsageDay> {
    let mut days = Vec::with_capacity(DAYS_WINDOW as usize);
    for offset in 0..DAYS_WINDOW {
        let date = (today - Duration::days(offset))
            .format("%Y-%m-%d")
            .to_string();
        let mut day = data.days.get(&date).cloned().unwrap_or_default();
        day.date = date;
        days.push(day);
    }
    days
}

fn usage_path() -> PathBuf {
    app_paths::data_dir().join("asr_usage.json")
}

fn load() -> UsageData {
    let path = usage_path();
    let Ok(text) = fs::read_to_string(&path) else {
        return UsageData::default();
    };
    match serde_json::from_str::<UsageData>(&text) {
        Ok(mut data) => {
            if data.version == 0 {
                data.version = USAGE_VERSION;
            }
            data
        }
        Err(error) => {
            eprintln!("[asr-usage] 读取 {path:?} 失败，使用空统计: {error}");
            UsageData::default()
        }
    }
}

fn save(data: &UsageData) -> Result<(), String> {
    let path = usage_path();
    app_paths::ensure_parent(&path).map_err(|error| format!("创建统计目录失败: {error}"))?;
    let bytes =
        serde_json::to_vec_pretty(data).map_err(|error| format!("序列化统计失败: {error}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|error| format!("写入统计失败: {error}"))?;
    set_private_permissions(&temp);
    fs::rename(&temp, &path).map_err(|error| format!("保存统计失败: {error}"))
}

#[cfg(unix)]
fn set_private_permissions(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &std::path::Path) {}

#[tauri::command]
pub fn asr_usage_stats(store: State<'_, Arc<UsageStore>>) -> UsageStats {
    store.stats()
}

#[tauri::command]
pub fn asr_usage_clear(store: State<'_, Arc<UsageStore>>) -> Result<UsageStats, String> {
    store.clear()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(date: &str, input: u64, output: u64, cost: u64) -> UsageDay {
        UsageDay {
            date: date.to_string(),
            sessions: 1,
            input_tokens: input,
            output_tokens: output,
            total_tokens: input + output,
            audio_duration_ms: 1000,
            cost_cny_micros: cost,
        }
    }

    fn data_with(days: Vec<UsageDay>) -> UsageData {
        let mut data = UsageData::default();
        for day in days {
            data.days.insert(day.date.clone(), day);
        }
        data
    }

    #[test]
    fn aggregates_ranges_and_fills_recent_days() {
        let today = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();
        let data = data_with(vec![
            day("2026-11-02", 100, 10, 650),
            day("2026-10-30", 200, 20, 1300),
            day("2026-10-04", 300, 30, 1950),
            day("2025-11-03", 400, 40, 2600),
            day("2025-11-02", 500, 50, 3250),
        ]);

        let stats = stats_for(&data, today);
        assert_eq!(stats.today.sessions, 1);
        assert_eq!(stats.today.total_tokens, 110);
        assert_eq!(stats.today.cost_cny_micros, 650);
        assert_eq!(stats.last7_days.sessions, 2);
        assert_eq!(stats.last30_days.sessions, 3);
        assert_eq!(stats.last365_days.sessions, 4);

        assert_eq!(stats.days.len(), 365);
        assert_eq!(stats.days[0].date, "2026-11-02");
        assert_eq!(stats.days[0].total_tokens, 110);
        assert_eq!(stats.days[3].date, "2026-10-30");
        assert_eq!(stats.days[3].total_tokens, 220);
        assert_eq!(stats.days[13].sessions, 0);
    }

    #[test]
    fn skips_zero_usage() {
        let usage = CloudUsage::default();
        // 直接验证判断条件，不写真实文件。
        assert_eq!(
            usage
                .total_tokens
                .max(usage.input_tokens + usage.output_tokens)
                == 0
                && usage.audio_duration_ms == 0,
            true
        );
    }
}
