//! Token 用量看板：只读 DSH cost-meter 账本，按区间 / 客户端 / 会话 / 模型聚合。
//!
//! 数据源：`<DSH_HOME>/storages/cost-meter/ledger.json`（DSH_HOME 优先级见
//! `dsh_hook_install::dsh_home()`）。本模块**只读**，不写 DSH、不上传用量。
//!
//! 口径：
//! - 总 Token = input + output + cacheRead + cacheWrite + reasoning；
//! - 缓存命中 = cacheRead / (input + cacheRead + cacheWrite)；
//! - 有 `costCny` 用实际记账（人民币微元）；缺失才用价格表估算并标 `estimated`；
//! - 会话按 id 跨天合并，标题优先账本 `sessions[].title`，缺失时只读 DSH 会话缓存的 `record.rows.title.val` 回填（不读提示词），仍无才用短 id；标题 ≤80 字符；模型按 `provider:model` 拆分；
//! - 客户端 P0 只有 DSH 一行，其他客户端由前端以「未接入」占位。

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::UNIX_EPOCH;

use chrono::{Local, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::dsh_hook_install;
use crate::token_pricing::{PriceLookup, PricingStatus};

/// 账本文件保护上限，防止异常文件把内存打爆。
const MAX_LEDGER_BYTES: u64 = 64 * 1024 * 1024;
/// 分组明细最多展示的行数（会话 / 模型）。
const TOP_ROWS: usize = 8;
/// 会话标题上限（与 hook 的 sessionList 一致）。
const MAX_TITLE_CHARS: usize = 80;

fn normalize_range(range: &str) -> (&'static str, usize) {
    match range {
        "today" => ("today", 1),
        "30d" => ("30d", 30),
        "180d" => ("180d", 180),
        _ => ("7d", 7),
    }
}

#[derive(Clone, Copy, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Buckets {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub reasoning: u64,
}

impl Buckets {
    fn tokens(&self) -> u64 {
        self.input
            .saturating_add(self.output)
            .saturating_add(self.cache_read)
            .saturating_add(self.cache_write)
            .saturating_add(self.reasoning)
    }

    fn cache_hit_pct(&self) -> Option<f64> {
        let base = self
            .input
            .saturating_add(self.cache_read)
            .saturating_add(self.cache_write);
        if base == 0 {
            return None;
        }
        Some(self.cache_read as f64 / base as f64 * 100.0)
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary {
    pub tokens: u64,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub reasoning: u64,
    /// 实际记账 + 估算的总花费（人民币微元）。
    pub cost_cny_micros: u64,
    /// 其中估算的部分（人民币微元）。
    pub estimated_cost_micros: u64,
    /// ledger / estimated / mixed / unknown
    pub cost_source: String,
    pub calls: u64,
    pub sessions: u64,
    pub cache_hit_pct: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageDay {
    pub date: String,
    pub tokens: u64,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub cost_cny_micros: u64,
    pub calls: u64,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RowPrice {
    pub input_cny_per_m: f64,
    pub output_cny_per_m: f64,
    pub cache_read_cny_per_m: f64,
    pub cache_write_cny_per_m: f64,
    pub source: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageRow {
    pub key: String,
    pub label: String,
    pub sub: Option<String>,
    pub tokens: u64,
    pub cost_cny_micros: u64,
    pub estimated_cost_micros: u64,
    pub cost_source: String,
    pub share_pct: f64,
    pub calls: Option<u64>,
    pub sessions: Option<u64>,
    pub cache_hit_pct: Option<f64>,
    pub model_id: Option<String>,
    pub provider: Option<String>,
    pub tag: Option<String>,
    pub price: Option<RowPrice>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageGroups {
    pub clients: Vec<UsageRow>,
    pub sessions: Vec<UsageRow>,
    pub models: Vec<UsageRow>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerState {
    pub available: bool,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageStats {
    pub range: String,
    pub generated_at: u64,
    pub summary: UsageSummary,
    pub previous: UsageSummary,
    pub days: Vec<UsageDay>,
    pub groups: UsageGroups,
    pub pricing: PricingStatus,
    pub coverage_days: usize,
    pub ledger: LedgerState,
}

// ---------------------------------------------------------------------------
// 账本反序列化（只声明需要的字段，未知字段忽略）
// ---------------------------------------------------------------------------

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct LedgerFile {
    days: BTreeMap<String, LedgerDay>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct LedgerDay {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
    reasoning: u64,
    calls: u64,
    cost_cny: Option<f64>,
    by_provider_model: HashMap<String, LedgerModel>,
    sessions: Vec<LedgerSession>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct LedgerSession {
    id: String,
    at: Option<u64>,
    title: Option<String>,
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
    reasoning: u64,
    calls: u64,
    cost_cny: Option<f64>,
    by_provider_model: HashMap<String, LedgerModel>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct LedgerModel {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
    reasoning: u64,
    calls: u64,
    cost_cny: Option<f64>,
}

impl From<&LedgerModel> for Buckets {
    fn from(value: &LedgerModel) -> Self {
        Self {
            input: value.input,
            output: value.output,
            cache_read: value.cache_read,
            cache_write: value.cache_write,
            reasoning: value.reasoning,
        }
    }
}

impl From<&LedgerSession> for Buckets {
    fn from(value: &LedgerSession) -> Self {
        Self {
            input: value.input,
            output: value.output,
            cache_read: value.cache_read,
            cache_write: value.cache_write,
            reasoning: value.reasoning,
        }
    }
}

impl From<&LedgerDay> for Buckets {
    fn from(value: &LedgerDay) -> Self {
        Self {
            input: value.input,
            output: value.output,
            cache_read: value.cache_read,
            cache_write: value.cache_write,
            reasoning: value.reasoning,
        }
    }
}

// ---------------------------------------------------------------------------
// 内部聚合
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
struct ModelAgg {
    key: String,
    provider: String,
    model: String,
    buckets: Buckets,
    cost_micros: u64,
    estimated_micros: u64,
    calls: u64,
}

#[derive(Clone, Debug)]
struct SessionAgg {
    id: String,
    title: Option<String>,
    last_at: Option<u64>,
    buckets: Buckets,
    cost_micros: u64,
    estimated_micros: u64,
    calls: u64,
}

#[derive(Clone, Debug)]
struct DayAgg {
    date: NaiveDate,
    date_str: String,
    buckets: Buckets,
    cost_micros: u64,
    estimated_micros: u64,
    calls: u64,
    sessions: Vec<SessionAgg>,
    models: Vec<ModelAgg>,
}

#[derive(Clone)]
struct CachedLedger {
    signature: (u64, u64),
    days: Vec<DayAgg>,
}

/// Token 用量读取与聚合；按文件 mtime + size 做内存缓存。
pub struct TokenUsageStore {
    pricing: Arc<dyn PriceLookup>,
    cache: Mutex<Option<CachedLedger>>,
    /// 测试 / 集成时可以指定账本路径。
    ledger_path: Option<PathBuf>,
}

impl TokenUsageStore {
    pub fn new(pricing: Arc<dyn PriceLookup>) -> Self {
        Self {
            pricing,
            cache: Mutex::new(None),
            ledger_path: None,
        }
    }

    /// 测试 / 集成入口：指定账本路径。生产只用 `new()`。
    #[allow(dead_code)]
    pub fn with_ledger_path(pricing: Arc<dyn PriceLookup>, path: impl Into<PathBuf>) -> Self {
        Self {
            pricing,
            cache: Mutex::new(None),
            ledger_path: Some(path.into()),
        }
    }

    fn path(&self) -> PathBuf {
        self.ledger_path.clone().unwrap_or_else(|| {
            dsh_hook_install::dsh_home()
                .join("storages")
                .join("cost-meter")
                .join("ledger.json")
        })
    }

    /// DSH 的会话缓存目录：`<DSH_HOME>/storages/session_projcache/sessions`。
    /// 账本里的 `sessions[].title` 有时缺失，这里只补标题，不读提示词/消息。
    fn session_cache_dir(&self) -> PathBuf {
        self.path()
            .parent()
            .and_then(Path::parent)
            .map(|storages| storages.join("session_projcache").join("sessions"))
            .unwrap_or_default()
    }

    /// 从 DSH 会话缓存只读 `record.rows.title.val`；失败/缺失返回 None。
    /// 会话 id 只允许字母数字、`-`、`_`，避免拼接出目录穿越路径。
    fn cached_session_title(&self, session_id: &str) -> Option<String> {
        if !session_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
        {
            return None;
        }
        let path = self.session_cache_dir().join(format!("{session_id}.json"));
        let meta = fs::metadata(&path).ok()?;
        if !meta.is_file() || meta.len() > 2 * 1024 * 1024 {
            return None;
        }
        let bytes = fs::read(&path).ok()?;
        let value: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
        let title = value.pointer("/record/rows/title/val")?.as_str()?;
        sanitize_title(title)
    }

    /// 读取并聚合指定区间；文件缺失/损坏返回空数据 + 明确原因，不编造。
    pub fn stats(&self, range: &str) -> TokenUsageStats {
        self.stats_at(range, Local::now().date_naive())
    }

    pub fn stats_at(&self, range: &str, today: NaiveDate) -> TokenUsageStats {
        let (range, days) = normalize_range(range);
        let path = self.path();
        match self.load_days(&path) {
            Ok(ledger) => self.build_stats(
                range,
                days,
                today,
                ledger.days,
                LedgerState {
                    available: true,
                    reason: None,
                },
            ),
            Err(reason) => {
                // 账本正在被 DSH 原子替换时，优先展示上一次成功解析的缓存。
                if let Some(cached) = self.cache.lock().ok().and_then(|c| c.clone()) {
                    return self.build_stats(
                        range,
                        days,
                        today,
                        cached.days,
                        LedgerState {
                            available: true,
                            reason: Some(reason),
                        },
                    );
                }
                self.build_stats(
                    range,
                    days,
                    today,
                    Vec::new(),
                    LedgerState {
                        available: false,
                        reason: Some(reason),
                    },
                )
            }
        }
    }

    fn load_days(&self, path: &Path) -> Result<CachedLedger, String> {
        let meta = fs::metadata(path).map_err(|_| "ledger_missing".to_string())?;
        if !meta.is_file() {
            return Err("ledger_missing".to_string());
        }
        if meta.len() > MAX_LEDGER_BYTES {
            return Err("ledger_too_large".to_string());
        }
        let signature = (
            meta.modified()
                .ok()
                .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                .map(|duration| duration.as_nanos() as u64)
                .unwrap_or(0),
            meta.len(),
        );
        {
            let cache = self
                .cache
                .lock()
                .map_err(|_| "ledger_cache_lock".to_string())?;
            if let Some(cached) = cache.as_ref() {
                if cached.signature == signature {
                    return Ok(cached.clone());
                }
            }
        }

        let bytes = fs::read(path).map_err(|_| "ledger_unreadable".to_string())?;
        let file: LedgerFile =
            serde_json::from_slice(&bytes).map_err(|_| "ledger_invalid".to_string())?;
        let mut days = Vec::with_capacity(file.days.len());
        for (date, day) in &file.days {
            if let Some(parsed) = parse_date(date) {
                days.push(self.build_day(parsed, date, day));
            }
        }
        days.sort_by_key(|day| day.date);
        let cached = CachedLedger { signature, days };
        if let Ok(mut cache) = self.cache.lock() {
            *cache = Some(cached.clone());
        }
        Ok(cached)
    }

    fn build_day(&self, date: NaiveDate, date_str: &str, day: &LedgerDay) -> DayAgg {
        let buckets = Buckets::from(day);
        let mut models: Vec<ModelAgg> = day
            .by_provider_model
            .iter()
            .map(|(key, model)| {
                let (provider, model_id) = split_model_key(key);
                let provider = clean_meta(&provider, 40);
                let model_id = clean_meta(&model_id, 120);
                let clean_key = if provider.is_empty() {
                    model_id.clone()
                } else {
                    format!("{provider}:{model_id}")
                };
                let buckets = Buckets::from(model);
                let (cost_micros, estimated_micros) = self.cost_for(
                    &provider,
                    &model_id,
                    &buckets,
                    model.cost_cny,
                    day.sessions.iter().find_map(|session| session.at),
                );
                ModelAgg {
                    key: clean_key,
                    provider,
                    model: model_id,
                    buckets,
                    cost_micros,
                    estimated_micros,
                    calls: model.calls,
                }
            })
            .collect();
        models.sort_by(|a, b| b.buckets.tokens().cmp(&a.buckets.tokens()));

        let mut sessions: Vec<SessionAgg> = day
            .sessions
            .iter()
            .filter(|session| !session.id.trim().is_empty())
            .map(|session| {
                let session_id = clean_meta(&session.id, 128);
                let buckets = Buckets::from(session);
                let actual = session.cost_cny.map(to_micros);
                let estimated = if actual.is_none() {
                    let mut estimated = 0u64;
                    for (key, model) in &session.by_provider_model {
                        let (provider, model_id) = split_model_key(key);
                        if let Some(quote) = self.pricing.quote(&provider, &model_id, session.at) {
                            estimated = estimated
                                .saturating_add(estimate_micros(&Buckets::from(model), &quote));
                        }
                    }
                    estimated
                } else {
                    0
                };
                SessionAgg {
                    id: session_id,
                    title: session.title.as_deref().and_then(sanitize_title),
                    last_at: session.at,
                    buckets,
                    cost_micros: actual.unwrap_or(estimated),
                    estimated_micros: if actual.is_some() { 0 } else { estimated },
                    calls: session.calls,
                }
            })
            .collect();
        sessions.sort_by(|a, b| b.buckets.tokens().cmp(&a.buckets.tokens()));

        let actual_total = day.cost_cny.map(to_micros);
        let estimated_total = if actual_total.is_none() {
            models.iter().map(|model| model.estimated_micros).sum()
        } else {
            0
        };
        DayAgg {
            date,
            date_str: date_str.to_string(),
            buckets,
            cost_micros: actual_total.unwrap_or(estimated_total),
            estimated_micros: if actual_total.is_some() {
                0
            } else {
                estimated_total
            },
            calls: day.calls,
            sessions,
            models,
        }
    }

    /// 单条模型成本：有实际 costCny 用实际，否则按价格表估算。
    fn cost_for(
        &self,
        provider: &str,
        model: &str,
        buckets: &Buckets,
        actual: Option<f64>,
        at_ms: Option<u64>,
    ) -> (u64, u64) {
        if let Some(actual) = actual {
            return (to_micros(actual), 0);
        }
        let Some(quote) = self.pricing.quote(provider, model, at_ms) else {
            return (0, 0);
        };
        let estimated = estimate_micros(buckets, &quote);
        (estimated, estimated)
    }

    fn build_stats(
        &self,
        range: &'static str,
        days: usize,
        today: NaiveDate,
        all_days: Vec<DayAgg>,
        ledger: LedgerState,
    ) -> TokenUsageStats {
        let start = today - chrono::Duration::days((days as i64) - 1);
        let previous_start = start - chrono::Duration::days(days as i64);
        let previous_end = start - chrono::Duration::days(1);
        let selected: Vec<&DayAgg> = all_days
            .iter()
            .filter(|day| day.date >= start && day.date <= today)
            .collect();
        let previous: Vec<&DayAgg> = all_days
            .iter()
            .filter(|day| day.date >= previous_start && day.date <= previous_end)
            .collect();
        let summary = summarize(&selected);
        let previous_summary = summarize(&previous);
        let groups = self.build_groups(&selected);
        let out_days: Vec<UsageDay> = all_days
            .iter()
            .rev()
            .take(180)
            .map(UsageDay::from)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        TokenUsageStats {
            range: range.to_string(),
            generated_at: now_ms(),
            summary,
            previous: previous_summary,
            days: out_days,
            groups,
            pricing: self.pricing.status(),
            coverage_days: selected.len(),
            ledger,
        }
    }

    fn build_groups(&self, days: &[&DayAgg]) -> UsageGroups {
        let (summary, sessions, models, clients) = aggregate_groups(days);
        let total = summary.tokens.max(1);
        let mut session_rows: Vec<UsageRow> = sessions
            .iter()
            .map(|session| row_from_session(session, total))
            .collect();
        // D102：分组排行按金额降序（Token 仅作同额兜底），Top 8 也按金额选。
        session_rows.sort_by(|a, b| {
            b.cost_cny_micros
                .cmp(&a.cost_cny_micros)
                .then_with(|| b.tokens.cmp(&a.tokens))
        });
        // 账本没有会话标题时，从 DSH 会话缓存回填（只补展示名，不读消息）；
        // 只处理会计入 Top 8 的行，避免每次统计读上百个缓存文件。
        let missing_titles: HashSet<&str> = sessions
            .iter()
            .filter(|session| session.title.is_none())
            .map(|session| session.id.as_str())
            .collect();
        for row in session_rows.iter_mut().take(TOP_ROWS) {
            if missing_titles.contains(row.key.as_str()) {
                if let Some(title) = self.cached_session_title(&row.key) {
                    row.label = title;
                }
            }
        }

        let mut model_rows: Vec<UsageRow> = models
            .iter()
            .map(|model| {
                let quote = self.pricing.quote(&model.provider, &model.model, None);
                row_from_model(model, total, quote)
            })
            .collect();
        model_rows.sort_by(|a, b| {
            b.cost_cny_micros
                .cmp(&a.cost_cny_micros)
                .then_with(|| b.tokens.cmp(&a.tokens))
        });

        truncate_with_other(&mut session_rows, "会话", total);
        truncate_with_other(&mut model_rows, "模型", total);

        let mut client_rows: Vec<UsageRow> = clients
            .iter()
            .map(|client| row_from_client(client, &summary))
            .collect();
        client_rows.sort_by(|a, b| {
            b.cost_cny_micros
                .cmp(&a.cost_cny_micros)
                .then_with(|| b.tokens.cmp(&a.tokens))
        });
        if client_rows.is_empty() && summary.tokens > 0 {
            client_rows.push(UsageRow {
                key: "dsh".into(),
                label: "DeepSeek Harness".into(),
                sub: Some("本机 cost-meter · 已接入".into()),
                tokens: summary.tokens,
                cost_cny_micros: summary.cost_cny_micros,
                estimated_cost_micros: summary.estimated_cost_micros,
                cost_source: summary.cost_source.clone(),
                share_pct: 100.0,
                calls: Some(summary.calls),
                sessions: Some(summary.sessions),
                cache_hit_pct: summary.cache_hit_pct,
                model_id: None,
                provider: None,
                tag: None,
                price: None,
            });
        }

        UsageGroups {
            clients: client_rows,
            sessions: session_rows,
            models: model_rows,
        }
    }
}

fn truncate_with_other(rows: &mut Vec<UsageRow>, noun: &str, total: u64) {
    if rows.len() <= TOP_ROWS {
        return;
    }
    let rest = rows.len() - TOP_ROWS;
    let mut tokens = 0u64;
    let mut cost = 0u64;
    let mut estimated = 0u64;
    let mut calls = 0u64;
    for row in rows.iter().skip(TOP_ROWS) {
        tokens = tokens.saturating_add(row.tokens);
        cost = cost.saturating_add(row.cost_cny_micros);
        estimated = estimated.saturating_add(row.estimated_cost_micros);
        calls = calls.saturating_add(row.calls.unwrap_or(0));
    }
    rows.truncate(TOP_ROWS);
    rows.push(UsageRow {
        key: "other".into(),
        label: format!("其他 {rest} 个{noun}"),
        sub: Some("未在 Top 8".into()),
        tokens,
        cost_cny_micros: cost,
        estimated_cost_micros: estimated,
        cost_source: cost_source_for(cost, estimated),
        share_pct: pct(tokens, total),
        calls: Some(calls),
        sessions: if noun == "会话" {
            Some(rest as u64)
        } else {
            None
        },
        cache_hit_pct: None,
        model_id: None,
        provider: None,
        tag: Some("other".into()),
        price: None,
    });
}

fn split_model_key(key: &str) -> (String, String) {
    match key.split_once(':') {
        Some((provider, model)) => (provider.to_string(), model.to_string()),
        None => (String::new(), key.to_string()),
    }
}

/// 外发元数据清洗：去控制字符、压单行、限长；模型 ID/接入方最多 120/40 字符。
fn clean_meta(value: &str, max_chars: usize) -> String {
    let one_line = value
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect::<String>();
    one_line
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max_chars)
        .collect()
}

fn provider_label(provider: &str) -> String {
    match provider {
        "opencode-go" => "OpenCode Go".to_string(),
        "deepseek-account" => "DeepSeek 账号".to_string(),
        "deepseek-official" => "DeepSeek 官方".to_string(),
        "" => "未知接入方".to_string(),
        other => other.to_string(),
    }
}

fn to_micros(cny: f64) -> u64 {
    if !cny.is_finite() || cny <= 0.0 {
        return 0;
    }
    (cny * 1_000_000.0).round().min(u64::MAX as f64) as u64
}

fn estimate_micros(buckets: &Buckets, quote: &crate::token_pricing::PriceQuote) -> u64 {
    let micros = quote.input_cny_per_m * buckets.input as f64
        + quote.output_cny_per_m * buckets.output as f64
        + quote.cache_read_cny_per_m * buckets.cache_read as f64
        + quote.cache_write_cny_per_m * buckets.cache_write as f64;
    if !micros.is_finite() || micros <= 0.0 {
        0
    } else {
        micros.round().min(u64::MAX as f64) as u64
    }
}

fn sanitize_title(value: &str) -> Option<String> {
    let one_line = value
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect::<String>();
    let normalized = one_line.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }
    Some(normalized.chars().take(MAX_TITLE_CHARS).collect())
}

fn short_id(id: &str) -> String {
    id.chars().take(8).collect()
}

fn format_at(at_ms: Option<u64>) -> Option<String> {
    let at = at_ms? as i64;
    let dt = Local.timestamp_millis_opt(at).single()?;
    Some(dt.format("%m-%d %H:%M").to_string())
}

fn pct(part: u64, total: u64) -> f64 {
    if total == 0 {
        0.0
    } else {
        part as f64 / total as f64 * 100.0
    }
}

/// 由「总花费」与「其中估算」推断来源：全估算不能算 mixed。
fn cost_source_for(cost: u64, estimated: u64) -> String {
    if cost == 0 && estimated == 0 {
        return "unknown".into();
    }
    if estimated == 0 {
        return "ledger".into();
    }
    if cost > estimated {
        "mixed".into()
    } else {
        "estimated".into()
    }
}

fn summarize(days: &[&DayAgg]) -> UsageSummary {
    let mut buckets = Buckets::default();
    let mut cost = 0u64;
    let mut estimated = 0u64;
    let mut calls = 0u64;
    let mut session_ids = HashSet::new();
    for day in days {
        buckets.input = buckets.input.saturating_add(day.buckets.input);
        buckets.output = buckets.output.saturating_add(day.buckets.output);
        buckets.cache_read = buckets.cache_read.saturating_add(day.buckets.cache_read);
        buckets.cache_write = buckets.cache_write.saturating_add(day.buckets.cache_write);
        buckets.reasoning = buckets.reasoning.saturating_add(day.buckets.reasoning);
        cost = cost.saturating_add(day.cost_micros);
        estimated = estimated.saturating_add(day.estimated_micros);
        calls = calls.saturating_add(day.calls);
        for session in &day.sessions {
            session_ids.insert(session.id.as_str());
        }
    }
    let sessions = session_ids.len() as u64;
    let cost_source = cost_source_for(cost, estimated);
    UsageSummary {
        tokens: buckets.tokens(),
        input: buckets.input,
        output: buckets.output,
        cache_read: buckets.cache_read,
        cache_write: buckets.cache_write,
        reasoning: buckets.reasoning,
        cost_cny_micros: cost,
        estimated_cost_micros: estimated,
        cost_source,
        calls,
        sessions,
        cache_hit_pct: buckets.cache_hit_pct(),
    }
}

/// 客户端 / 会话 / 模型聚合；会话按 id 跨天合并，模型按 provider:model 合并。
#[allow(clippy::type_complexity)]
fn aggregate_groups(
    days: &[&DayAgg],
) -> (UsageSummary, Vec<SessionAgg>, Vec<ModelAgg>, Vec<ClientAgg>) {
    let mut total = Buckets::default();
    let mut sessions: HashMap<String, SessionAgg> = HashMap::new();
    let mut models: HashMap<String, ModelAgg> = HashMap::new();
    let mut clients: HashMap<String, ClientAgg> = HashMap::new();

    for day in days {
        total.input = total.input.saturating_add(day.buckets.input);
        total.output = total.output.saturating_add(day.buckets.output);
        total.cache_read = total.cache_read.saturating_add(day.buckets.cache_read);
        total.cache_write = total.cache_write.saturating_add(day.buckets.cache_write);
        total.reasoning = total.reasoning.saturating_add(day.buckets.reasoning);

        let client = clients
            .entry("dsh".to_string())
            .or_insert_with(|| ClientAgg {
                key: "dsh".into(),
                label: "DeepSeek Harness".into(),
                sub: "本机 cost-meter · 已接入".into(),
                buckets: Buckets::default(),
                cost_micros: 0,
                estimated_micros: 0,
                calls: 0,
                sessions: 0,
            });
        client.buckets.input = client.buckets.input.saturating_add(day.buckets.input);
        client.buckets.output = client.buckets.output.saturating_add(day.buckets.output);
        client.buckets.cache_read = client
            .buckets
            .cache_read
            .saturating_add(day.buckets.cache_read);
        client.buckets.cache_write = client
            .buckets
            .cache_write
            .saturating_add(day.buckets.cache_write);
        client.buckets.reasoning = client
            .buckets
            .reasoning
            .saturating_add(day.buckets.reasoning);
        client.cost_micros = client.cost_micros.saturating_add(day.cost_micros);
        client.estimated_micros = client.estimated_micros.saturating_add(day.estimated_micros);
        client.calls = client.calls.saturating_add(day.calls);
        client.sessions = client.sessions.saturating_add(day.sessions.len() as u64);

        for session in &day.sessions {
            let entry = sessions
                .entry(session.id.clone())
                .or_insert_with(|| SessionAgg {
                    id: session.id.clone(),
                    title: None,
                    last_at: None,
                    buckets: Buckets::default(),
                    cost_micros: 0,
                    estimated_micros: 0,
                    calls: 0,
                });
            if session.title.is_some() {
                entry.title = session.title.clone();
            }
            if session.last_at.is_some() {
                entry.last_at = session.last_at;
            }
            entry.buckets.input = entry.buckets.input.saturating_add(session.buckets.input);
            entry.buckets.output = entry.buckets.output.saturating_add(session.buckets.output);
            entry.buckets.cache_read = entry
                .buckets
                .cache_read
                .saturating_add(session.buckets.cache_read);
            entry.buckets.cache_write = entry
                .buckets
                .cache_write
                .saturating_add(session.buckets.cache_write);
            entry.buckets.reasoning = entry
                .buckets
                .reasoning
                .saturating_add(session.buckets.reasoning);
            entry.cost_micros = entry.cost_micros.saturating_add(session.cost_micros);
            entry.estimated_micros = entry
                .estimated_micros
                .saturating_add(session.estimated_micros);
            entry.calls = entry.calls.saturating_add(session.calls);
        }

        for model in &day.models {
            let entry = models.entry(model.key.clone()).or_insert_with(|| ModelAgg {
                key: model.key.clone(),
                provider: model.provider.clone(),
                model: model.model.clone(),
                buckets: Buckets::default(),
                cost_micros: 0,
                estimated_micros: 0,
                calls: 0,
            });
            entry.buckets.input = entry.buckets.input.saturating_add(model.buckets.input);
            entry.buckets.output = entry.buckets.output.saturating_add(model.buckets.output);
            entry.buckets.cache_read = entry
                .buckets
                .cache_read
                .saturating_add(model.buckets.cache_read);
            entry.buckets.cache_write = entry
                .buckets
                .cache_write
                .saturating_add(model.buckets.cache_write);
            entry.buckets.reasoning = entry
                .buckets
                .reasoning
                .saturating_add(model.buckets.reasoning);
            entry.cost_micros = entry.cost_micros.saturating_add(model.cost_micros);
            entry.estimated_micros = entry
                .estimated_micros
                .saturating_add(model.estimated_micros);
            entry.calls = entry.calls.saturating_add(model.calls);
        }
    }

    let unique_sessions = sessions.len() as u64;
    let mut sessions = sessions.into_values().collect::<Vec<_>>();
    sessions.sort_by(|a, b| {
        b.cost_micros
            .cmp(&a.cost_micros)
            .then_with(|| b.buckets.tokens().cmp(&a.buckets.tokens()))
    });
    let mut models = models.into_values().collect::<Vec<_>>();
    models.sort_by(|a, b| {
        b.cost_micros
            .cmp(&a.cost_micros)
            .then_with(|| b.buckets.tokens().cmp(&a.buckets.tokens()))
    });
    for client in clients.values_mut() {
        client.sessions = unique_sessions;
    }
    let mut clients = clients.into_values().collect::<Vec<_>>();
    clients.sort_by(|a, b| {
        b.cost_micros
            .cmp(&a.cost_micros)
            .then_with(|| b.buckets.tokens().cmp(&a.buckets.tokens()))
    });

    let total_buckets = Buckets {
        input: total.input,
        output: total.output,
        cache_read: total.cache_read,
        cache_write: total.cache_write,
        reasoning: total.reasoning,
    };
    let summary = UsageSummary {
        tokens: total_buckets.tokens(),
        input: total.input,
        output: total.output,
        cache_read: total.cache_read,
        cache_write: total.cache_write,
        reasoning: total.reasoning,
        cost_cny_micros: clients.iter().map(|client| client.cost_micros).sum::<u64>(),
        estimated_cost_micros: clients
            .iter()
            .map(|client| client.estimated_micros)
            .sum::<u64>(),
        cost_source: "unknown".into(),
        calls: clients.iter().map(|client| client.calls).sum(),
        sessions: clients.iter().map(|client| client.sessions).sum(),
        cache_hit_pct: total_buckets.cache_hit_pct(),
    };
    (summary, sessions, models, clients)
}

#[derive(Clone, Debug)]
struct ClientAgg {
    key: String,
    label: String,
    sub: String,
    buckets: Buckets,
    cost_micros: u64,
    estimated_micros: u64,
    calls: u64,
    sessions: u64,
}

fn row_from_session(session: &SessionAgg, total: u64) -> UsageRow {
    let label = session
        .title
        .clone()
        .unwrap_or_else(|| format!("会话 {}", short_id(&session.id)));
    let sub = match format_at(session.last_at) {
        Some(at) => Some(format!("最近 {at} · {} 次调用", session.calls)),
        None => Some(format!("{} 次调用", session.calls)),
    };
    UsageRow {
        key: session.id.clone(),
        label,
        sub,
        tokens: session.buckets.tokens(),
        cost_cny_micros: session.cost_micros,
        estimated_cost_micros: session.estimated_micros,
        cost_source: cost_source_for(session.cost_micros, session.estimated_micros),
        share_pct: pct(session.buckets.tokens(), total),
        calls: Some(session.calls),
        sessions: None,
        cache_hit_pct: session.buckets.cache_hit_pct(),
        model_id: None,
        provider: None,
        tag: None,
        price: None,
    }
}

fn row_from_model(
    model: &ModelAgg,
    total: u64,
    quote: Option<crate::token_pricing::PriceQuote>,
) -> UsageRow {
    let sub = match model.buckets.cache_hit_pct() {
        Some(hit) => format!("{} · 缓存命中 {hit:.1}%", provider_label(&model.provider)),
        None => provider_label(&model.provider),
    };
    UsageRow {
        key: model.key.clone(),
        label: model.model.clone(),
        sub: Some(sub),
        tokens: model.buckets.tokens(),
        cost_cny_micros: model.cost_micros,
        estimated_cost_micros: model.estimated_micros,
        cost_source: cost_source_for(model.cost_micros, model.estimated_micros),
        share_pct: pct(model.buckets.tokens(), total),
        calls: Some(model.calls),
        sessions: None,
        cache_hit_pct: model.buckets.cache_hit_pct(),
        model_id: Some(model.model.clone()),
        provider: Some(provider_label(&model.provider)),
        tag: None,
        price: quote.map(|quote| RowPrice {
            input_cny_per_m: quote.input_cny_per_m,
            output_cny_per_m: quote.output_cny_per_m,
            cache_read_cny_per_m: quote.cache_read_cny_per_m,
            cache_write_cny_per_m: quote.cache_write_cny_per_m,
            source: quote.source,
        }),
    }
}

fn row_from_client(client: &ClientAgg, _summary: &UsageSummary) -> UsageRow {
    UsageRow {
        key: client.key.clone(),
        label: client.label.clone(),
        sub: Some(client.sub.clone()),
        tokens: client.buckets.tokens(),
        cost_cny_micros: client.cost_micros,
        estimated_cost_micros: client.estimated_micros,
        cost_source: cost_source_for(client.cost_micros, client.estimated_micros),
        share_pct: 100.0,
        calls: Some(client.calls),
        sessions: Some(client.sessions),
        cache_hit_pct: client.buckets.cache_hit_pct(),
        model_id: None,
        provider: None,
        tag: None,
        price: None,
    }
}

impl From<&DayAgg> for UsageDay {
    fn from(day: &DayAgg) -> Self {
        Self {
            date: day.date_str.clone(),
            tokens: day.buckets.tokens(),
            input: day.buckets.input,
            output: day.buckets.output,
            cache_read: day.buckets.cache_read,
            cache_write: day.buckets.cache_write,
            cost_cny_micros: day.cost_micros,
            calls: day.calls,
        }
    }
}

fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

impl TokenUsageStats {
    /// 手机端快照：关闭「手机显示模型分组」时移除模型名，只留分组提示。
    pub fn mobile_json(&self) -> serde_json::Value {
        let mut value = serde_json::to_value(self).unwrap_or_else(|_| serde_json::json!({}));
        if let Some(groups) = value
            .get_mut("groups")
            .and_then(|value| value.as_object_mut())
        {
            if !self.pricing.mobile_models {
                groups.insert("models".into(), serde_json::Value::Array(Vec::new()));
                groups.insert("modelsHidden".into(), serde_json::Value::Bool(true));
            }
        }
        value
    }
}

#[tauri::command]
pub async fn token_usage_stats(
    store: State<'_, Arc<TokenUsageStore>>,
    range: Option<String>,
) -> Result<TokenUsageStats, String> {
    let store = store.inner().clone();
    let range = range.unwrap_or_else(|| "7d".to_string());
    tauri::async_runtime::spawn_blocking(move || store.stats(&range))
        .await
        .map_err(|error| format!("token_usage_join: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::token_pricing::PriceQuote;
    use std::io::Write;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

    struct FakePricing {
        quote: Option<PriceQuote>,
    }

    impl PriceLookup for FakePricing {
        fn quote(&self, _provider: &str, _model: &str, _at_ms: Option<u64>) -> Option<PriceQuote> {
            self.quote.clone()
        }
        fn status(&self) -> PricingStatus {
            PricingStatus::default()
        }
    }

    fn quote() -> PriceQuote {
        PriceQuote {
            input_cny_per_m: 1.0,
            output_cny_per_m: 4.0,
            cache_read_cny_per_m: 0.05,
            cache_write_cny_per_m: 0.0,
            source: "test".into(),
        }
    }

    fn write_temp_ledger(json: &str) -> PathBuf {
        let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let dir =
            std::env::temp_dir().join(format!("sidekick-token-usage-{}-{seq}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("ledger.json");
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(json.as_bytes()).unwrap();
        path
    }

    fn store_with(json: &str, pricing: Arc<dyn PriceLookup>) -> TokenUsageStore {
        let path = write_temp_ledger(json);
        TokenUsageStore::with_ledger_path(pricing, path)
    }

    const LEDGER: &str = r#"{
      "days": {
        "2026-11-04": {
          "input": 1000000, "output": 100000, "cacheRead": 10000000,
          "cacheWrite": 0, "reasoning": 0, "calls": 10,
          "costCny": 2.0,
          "byProviderModel": {
            "opencode-go:deepseek-v4.1-flash": {
              "input": 1000000, "output": 100000, "cacheRead": 10000000,
              "cacheWrite": 0, "reasoning": 0, "calls": 10, "costCny": 2.0
            }
          },
          "sessions": [
            { "id": "s-1", "at": 1793700000000, "title": "会话一",
              "input": 1000000, "output": 100000, "cacheRead": 10000000,
              "cacheWrite": 0, "reasoning": 0, "calls": 10, "costCny": 2.0 }
          ]
        },
        "2026-11-05": {
          "input": 2000000, "output": 200000, "cacheRead": 20000000,
          "cacheWrite": 0, "reasoning": 0, "calls": 20,
          "costCny": 4.0,
          "byProviderModel": {
            "opencode-go:deepseek-v4.1-flash": {
              "input": 2000000, "output": 200000, "cacheRead": 20000000,
              "cacheWrite": 0, "reasoning": 0, "calls": 20, "costCny": 4.0
            }
          },
          "sessions": [
            { "id": "s-1", "at": 1793800000000, "title": "会话一",
              "input": 2000000, "output": 200000, "cacheRead": 20000000,
              "cacheWrite": 0, "reasoning": 0, "calls": 20, "costCny": 4.0 }
          ]
        }
      }
    }"#;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 5).unwrap()
    }

    #[test]
    fn aggregates_today_and_ranges() {
        let pricing: Arc<dyn PriceLookup> = Arc::new(FakePricing { quote: None });
        let store = store_with(LEDGER, pricing);
        let today_stats = store.stats_at("today", today());
        assert!(today_stats.ledger.available);
        assert_eq!(today_stats.summary.tokens, 22_200_000);
        assert_eq!(today_stats.summary.cost_cny_micros, 4_000_000);
        assert_eq!(today_stats.summary.calls, 20);
        assert_eq!(today_stats.coverage_days, 1);

        let week = store.stats_at("7d", today());
        assert_eq!(week.coverage_days, 2);
        assert_eq!(week.summary.tokens, 33_300_000);
        assert_eq!(week.summary.cost_cny_micros, 6_000_000);
        assert_eq!(week.previous.tokens, 0);
    }

    const RANKING_LEDGER: &str = r#"{
      "days": {
        "2026-11-05": {
          "input": 9001000, "output": 0, "cacheRead": 0,
          "cacheWrite": 0, "reasoning": 0, "calls": 2,
          "costCny": 9.0,
          "byProviderModel": {
            "p:big-cheap": {
              "input": 9000000, "output": 0, "cacheRead": 0,
              "cacheWrite": 0, "reasoning": 0, "calls": 1, "costCny": 1.0
            },
            "p:costly-small": {
              "input": 1000, "output": 0, "cacheRead": 0,
              "cacheWrite": 0, "reasoning": 0, "calls": 1, "costCny": 8.0
            }
          },
          "sessions": [
            { "id": "s-big", "title": "大 Token 便宜",
              "input": 9000000, "output": 0, "cacheRead": 0,
              "cacheWrite": 0, "reasoning": 0, "calls": 1, "costCny": 1.0 },
            { "id": "s-costly", "title": "小 Token 贵",
              "input": 1000, "output": 0, "cacheRead": 0,
              "cacheWrite": 0, "reasoning": 0, "calls": 1, "costCny": 8.0 }
          ]
        }
      }
    }"#;

    #[test]
    fn session_rows_backfill_title_from_dsh_cache() {
        let seq = TEMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "sidekick-session-title-{}-{seq}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("storages/cost-meter")).unwrap();
        fs::create_dir_all(dir.join("storages/session_projcache/sessions")).unwrap();
        let ledger = r#"{
          "days": {
            "2026-11-05": {
              "input": 1000000, "output": 0, "cacheRead": 0,
              "cacheWrite": 0, "reasoning": 0, "calls": 1,
              "costCny": 1.0,
              "sessions": [
                { "id": "session-title-test", "at": 1793800000000,
                  "input": 1000000, "output": 0, "cacheRead": 0,
                  "cacheWrite": 0, "reasoning": 0, "calls": 1, "costCny": 1.0 }
              ]
            }
          }
        }"#;
        fs::write(dir.join("storages/cost-meter/ledger.json"), ledger).unwrap();
        let cache = r#"{"record":{"rows":{"title":{"ver":1,"seq":1,"val":"缓存里的会话名"}}}}"#;
        fs::write(
            dir.join("storages/session_projcache/sessions/session-title-test.json"),
            cache,
        )
        .unwrap();
        let pricing: Arc<dyn PriceLookup> = Arc::new(FakePricing { quote: None });
        let store =
            TokenUsageStore::with_ledger_path(pricing, dir.join("storages/cost-meter/ledger.json"));
        let stats = store.stats_at("today", today());
        assert_eq!(stats.groups.sessions.len(), 1);
        assert_eq!(stats.groups.sessions[0].label, "缓存里的会话名");
    }

    #[test]
    fn groups_rank_by_cost_not_tokens() {
        let pricing: Arc<dyn PriceLookup> = Arc::new(FakePricing { quote: None });
        let store = store_with(RANKING_LEDGER, pricing);
        let stats = store.stats_at("today", today());
        assert_eq!(stats.groups.sessions.len(), 2);
        assert_eq!(stats.groups.sessions[0].label, "小 Token 贵");
        assert_eq!(stats.groups.sessions[1].label, "大 Token 便宜");
        assert_eq!(stats.groups.models.len(), 2);
        assert_eq!(stats.groups.models[0].label, "costly-small");
        assert_eq!(stats.groups.models[1].label, "big-cheap");
    }

    #[test]
    fn groups_sessions_across_days_and_splits_models() {
        let pricing: Arc<dyn PriceLookup> = Arc::new(FakePricing { quote: None });
        let store = store_with(LEDGER, pricing);
        let stats = store.stats_at("7d", today());
        assert_eq!(stats.groups.sessions.len(), 1);
        assert_eq!(stats.groups.sessions[0].label, "会话一");
        assert_eq!(stats.groups.sessions[0].tokens, 33_300_000);
        assert_eq!(stats.groups.sessions[0].calls, Some(30));
        assert_eq!(stats.groups.models.len(), 1);
        assert_eq!(
            stats.groups.models[0].model_id.as_deref(),
            Some("deepseek-v4.1-flash")
        );
        assert_eq!(
            stats.groups.models[0].provider.as_deref(),
            Some("OpenCode Go")
        );
        assert_eq!(stats.groups.clients.len(), 1);
        assert_eq!(stats.groups.clients[0].share_pct, 100.0);
        // 同一会话跨两天只算一个会话。
        assert_eq!(stats.summary.sessions, 1);
        assert_eq!(stats.groups.clients[0].sessions, Some(1));
    }

    #[test]
    fn estimates_when_cost_missing() {
        let ledger = r#"{
          "days": {
            "2026-11-05": {
              "input": 1000000, "output": 100000, "cacheRead": 0,
              "cacheWrite": 0, "reasoning": 0, "calls": 1,
              "byProviderModel": {
                "opencode-go:deepseek-v4.1-flash": {
                  "input": 1000000, "output": 100000, "cacheRead": 0,
                  "cacheWrite": 0, "reasoning": 0, "calls": 1
                }
              },
              "sessions": []
            }
          }
        }"#;
        let pricing: Arc<dyn PriceLookup> = Arc::new(FakePricing {
            quote: Some(quote()),
        });
        let store = store_with(ledger, pricing);
        let stats = store.stats_at("today", today());
        // input 1M * ¥1 + output 0.1M * ¥4 = ¥1.4
        assert_eq!(stats.summary.cost_cny_micros, 1_400_000);
        assert_eq!(stats.summary.estimated_cost_micros, 1_400_000);
        assert_eq!(stats.groups.models[0].cost_source, "estimated");
        assert!(stats.groups.models[0].price.is_some());
    }

    #[test]
    fn missing_or_invalid_ledger_is_empty_with_reason() {
        let pricing: Arc<dyn PriceLookup> = Arc::new(FakePricing { quote: None });
        let missing = TokenUsageStore::with_ledger_path(
            pricing.clone(),
            std::env::temp_dir().join("sidekick-token-usage-definitely-missing.json"),
        );
        let stats = missing.stats_at("7d", today());
        assert!(!stats.ledger.available);
        assert_eq!(stats.ledger.reason.as_deref(), Some("ledger_missing"));
        assert_eq!(stats.summary.tokens, 0);

        let path = write_temp_ledger("{not-json");
        let store = TokenUsageStore::with_ledger_path(pricing, path);
        let stats = store.stats_at("7d", today());
        assert!(!stats.ledger.available);
        assert_eq!(stats.ledger.reason.as_deref(), Some("ledger_invalid"));
    }

    #[test]
    fn unknown_range_defaults_to_7d() {
        let pricing: Arc<dyn PriceLookup> = Arc::new(FakePricing { quote: None });
        let store = store_with(LEDGER, pricing);
        let stats = store.stats_at("bogus", today());
        assert_eq!(stats.range, "7d");
        assert_eq!(stats.coverage_days, 2);
    }
}
