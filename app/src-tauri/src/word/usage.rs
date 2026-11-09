//! 英语角的 AI 用量与费用统计。
//!
//! 每次解释/造句成功后按本机日期累加；`word_usage.json`（0600）只存每日汇总
//! （调用次数、token、人民币微元），不存词条正文、语境句或 Key。
//! 价格常量是探测后的暂定值，等百炼账单对账再校准。

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::Local;
use serde::{Deserialize, Serialize};

const USAGE_VERSION: u32 = 1;
const MAX_DAYS: usize = 400;

/// 单价（元 / 百万 token）。2026-11-09 按百炼官方降价公告核实：
/// 输入 0.8、输出 2.7（北京）；缓存命中输入 0.1，当前未建模（本机不启用显式缓存）。
pub const INPUT_CNY_PER_M: f64 = 0.8;
pub const OUTPUT_CNY_PER_M: f64 = 2.7;

pub const PRICE_NOTE: &str =
    "qwen3.8-flash · 估算（元/百万 token：输入 0.8、输出 2.7；未计缓存命中折扣）";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageDay {
    pub date: String,
    pub calls: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub cost_cny_micros: u64,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub calls: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub cost_cny_micros: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub today: UsageSummary,
    pub last30_days: UsageSummary,
    pub days: Vec<UsageDay>,
    pub price_note: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageFile {
    #[serde(default = "default_version")]
    version: u32,
    #[serde(default)]
    days: BTreeMap<String, UsageDay>,
}

fn default_version() -> u32 {
    USAGE_VERSION
}

impl Default for UsageFile {
    fn default() -> Self {
        Self {
            version: USAGE_VERSION,
            days: BTreeMap::new(),
        }
    }
}

pub struct UsageStore {
    path: PathBuf,
    inner: Mutex<UsageFile>,
}

impl UsageStore {
    pub fn new(path: PathBuf) -> Self {
        let data = load(&path);
        Self {
            path,
            inner: Mutex::new(data),
        }
    }

    /// 记一次成功调用；token 来自百炼返回的 usage。
    pub fn record(&self, prompt_tokens: u64, completion_tokens: u64) {
        let mut data = match self.inner.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let date = Local::now().format("%Y-%m-%d").to_string();
        let cost = cost_micros(prompt_tokens, completion_tokens);
        let entry = data.days.entry(date.clone()).or_insert_with(|| UsageDay {
            date,
            ..UsageDay::default()
        });
        entry.calls += 1;
        entry.prompt_tokens += prompt_tokens;
        entry.completion_tokens += completion_tokens;
        entry.cost_cny_micros += cost;
        prune(&mut data);
        let _ = save(&self.path, &data);
    }

    pub fn stats(&self) -> UsageStats {
        let data = match self.inner.lock() {
            Ok(guard) => guard.clone(),
            Err(_) => UsageFile::default(),
        };
        let today = Local::now().format("%Y-%m-%d").to_string();
        let cutoff = Local::now()
            .date_naive()
            .checked_sub_signed(chrono::Duration::days(29))
            .unwrap_or_else(|| Local::now().date_naive());
        let cutoff_key = cutoff.format("%Y-%m-%d").to_string();
        let mut last30 = UsageSummary::default();
        for day in data.days.values() {
            if day.date.as_str() >= cutoff_key.as_str() {
                last30.calls += day.calls;
                last30.prompt_tokens += day.prompt_tokens;
                last30.completion_tokens += day.completion_tokens;
                last30.cost_cny_micros += day.cost_cny_micros;
            }
        }
        let today_summary = data
            .days
            .get(&today)
            .map(|day| UsageSummary {
                calls: day.calls,
                prompt_tokens: day.prompt_tokens,
                completion_tokens: day.completion_tokens,
                cost_cny_micros: day.cost_cny_micros,
            })
            .unwrap_or_default();
        let days = data
            .days
            .values()
            .filter(|day| day.date.as_str() >= cutoff_key.as_str())
            .cloned()
            .collect();
        UsageStats {
            today: today_summary,
            last30_days: last30,
            days,
            price_note: PRICE_NOTE.to_string(),
        }
    }
}

/// 微元：token × 单价（元/百万）即为微元数。
pub fn cost_micros(prompt_tokens: u64, completion_tokens: u64) -> u64 {
    let input = prompt_tokens as f64 * INPUT_CNY_PER_M;
    let output = completion_tokens as f64 * OUTPUT_CNY_PER_M;
    (input + output).round() as u64
}

fn prune(data: &mut UsageFile) {
    if data.days.len() <= MAX_DAYS {
        return;
    }
    let keep_from = data
        .days
        .keys()
        .rev()
        .take(MAX_DAYS)
        .last()
        .cloned()
        .unwrap_or_default();
    data.days.retain(|key, _| key >= &keep_from);
}

fn load(path: &Path) -> UsageFile {
    let Ok(text) = fs::read_to_string(path) else {
        return UsageFile::default();
    };
    match serde_json::from_str::<UsageFile>(&text) {
        Ok(mut data) => {
            if data.version == 0 {
                data.version = USAGE_VERSION;
            }
            data
        }
        Err(error) => {
            eprintln!("[word-usage] 读取失败，使用空统计: {error}");
            UsageFile::default()
        }
    }
}

fn save(path: &Path, data: &UsageFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建统计目录失败: {error}"))?;
    }
    let bytes = serde_json::to_vec_pretty(data).map_err(|error| format!("序列化统计失败: {error}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|error| format!("写入统计失败: {error}"))?;
    set_private_permissions(&temp);
    fs::rename(&temp, path).map_err(|error| format!("保存统计失败: {error}"))
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "sidekick-word-usage-{name}-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn cost_uses_micro_yuan() {
        // 1000 输入 + 1000 输出 = 0.8 + 2.7 = 3.5 元 = 3_500_000 微元
        assert_eq!(cost_micros(1_000_000, 1_000_000), 3_500_000);
        assert_eq!(cost_micros(0, 0), 0);
    }

    #[test]
    fn record_accumulates_and_persists() {
        let path = temp_path("record");
        let store = UsageStore::new(path.clone());
        store.record(170, 200);
        store.record(100, 50);
        let stats = store.stats();
        assert_eq!(stats.today.calls, 2);
        assert_eq!(stats.today.prompt_tokens, 270);
        assert_eq!(stats.today.completion_tokens, 250);
        assert_eq!(stats.last30_days.calls, 2);
        assert!(stats.today.cost_cny_micros > 0);

        // 重新加载仍能读到（落盘成功）。
        let reloaded = UsageStore::new(path.clone()).stats();
        assert_eq!(reloaded.today.calls, 2);
        let _ = std::fs::remove_file(path);
    }

}
