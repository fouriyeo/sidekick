//! 模型价格目录与报价。
//!
//! 价格来源优先级（高 → 低）：本地覆盖（`token_pricing_overrides.json`）>
//! DeepSeek 官方人民币峰谷价 > 远程 OpenRouter 目录（含上次成功刷新）> 内置 seed。
//!
//! 本地文件（均在本机数据目录，缓存 0600、temp+rename 原子写）：
//! - `token_pricing.json`：`version` / `settings` / `catalog` / `meta` 缓存；
//!   刷新失败时保留上次成功的 catalog，只更新 meta 里的尝试时间与错误码。
//! - `token_pricing_overrides.json`：用户覆盖，字段 `fxCnyPerUsd` 与 `models`；
//!   每个模型价默认按「USD / 1M tokens」再乘 FX 生效（最高优先级，与 seed/目录同单位），
//!   单条可写 `"currency": "CNY"` 表示直接按人民币 / 1M 生效。
//!
//! 单位约定：seed 与 OpenRouter 目录是 USD / 1M tokens，报价时乘 FX 转人民币；
//! DeepSeek 官方价本身就是 CNY / 1M tokens。对外只返回人民币。
//!
//! 性能：`quote()` 只读内存——覆盖文件在构造时读一次，FX 首次解析后缓存
//! （override/env 命中时启动即确定，只有落到 ledger 时才读一次账本）。
//!
//! 隐私：远程刷新只 GET OpenRouter 公开目录，不携带任何用量/Key/模型名；
//! 日志只打数量与错误码，不打印价格目录正文或用户模型名。
//!
//! 本模块依赖桌面端专属依赖（`reqwest`、`chrono`），`lib.rs` 里必须按
//! `#[cfg(desktop)]` 注册；文件内的 `#![cfg(desktop)]` 只是兜底，避免误注册后
//! 破坏移动端构建。

#![cfg(desktop)]

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use chrono::{Datelike, Timelike, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use tauri::State;

use crate::app_paths;

/// 本地缓存 schema 版本。
const CACHE_VERSION: u32 = 1;
/// 远程价格目录：固定 OpenRouter 公开接口（只读 GET）。
const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/models";
/// 允许的最终 host（重定向后必须仍是它）。
const OPENROUTER_HOST: &str = "openrouter.ai";
const USER_AGENT: &str = "Sidekick/0.1";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: usize = 3;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;

/// 自动刷新间隔：距上次成功 < 24h 不重复请求。
const AUTO_REFRESH_INTERVAL_MS: u64 = 24 * 60 * 60 * 1000;
/// 手动刷新最短间隔，避免连点打爆 OpenRouter。
const FORCE_MIN_INTERVAL_MS: u64 = 60 * 1000;
/// 失败后 1h 内不自动重试。
const FAILURE_BACKOFF_MS: u64 = 60 * 60 * 1000;
/// 目录超过 7 天视为过期（前端展示提示，不阻塞估算）。
const STALE_AFTER_MS: u64 = 7 * 24 * 60 * 60 * 1000;
/// 兜底汇率：没有 override / 环境变量 / ledger 时使用。
const FALLBACK_FX_CNY_PER_USD: f64 = 7.0;

const RATE_LIMITED_ERROR: &str = "刷新过于频繁，请 60 秒后再试";

/// 内置 seed：OpenRouter 目录快照（USD / 1M tokens），由 `scripts/update-pricing.mjs` 生成。
const SEED_JSON: &str = include_str!("pricing_seed.json");

/// 2026-08-16 16:00 UTC：DeepSeek 官方改为工作日峰谷计价。
const DEEPSEEK_NEW_PRICING_START_MS: u64 = 1_786_896_000_000;
/// 2026-09-10 04:00 UTC：DeepSeek v4-flash 下调官方价。
const DEEPSEEK_FLASH_20260910_START_MS: u64 = 1_789_012_800_000;

/// 某次报价：人民币 / 1M tokens。
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PriceQuote {
    pub input_cny_per_m: f64,
    pub output_cny_per_m: f64,
    pub cache_read_cny_per_m: f64,
    pub cache_write_cny_per_m: f64,
    /// `override` | `deepseek-official` | `remote` | `seed`
    pub source: String,
}

/// 价格目录查询抽象：`token_usage` 只依赖这个 trait，便于测试注入。
pub trait PriceLookup: Send + Sync {
    fn quote(&self, provider: &str, model: &str, at_ms: Option<u64>) -> Option<PriceQuote>;
    fn status(&self) -> PricingStatus;
}

/// 价格目录状态（不包含任何用量/模型名）。
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingStatus {
    /// seed | remote
    pub source: String,
    pub updated_at: Option<u64>,
    pub last_attempt_at: Option<u64>,
    pub last_error: Option<String>,
    pub stale: bool,
    pub auto_refresh: bool,
    pub model_count: usize,
    pub fx_cny_per_usd: f64,
    /// override | env | ledger | fallback
    pub fx_source: String,
    pub mobile_models: bool,
}

/// 目录里的单个模型价（USD / 1M tokens；缓存与 seed 同 schema）。
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct ModelPrice {
    #[serde(rename = "in", default)]
    input: f64,
    #[serde(rename = "out", default)]
    output: f64,
    #[serde(default)]
    cache_read: f64,
    #[serde(default)]
    cache_write: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    name: Option<String>,
}

impl ModelPrice {
    /// 负价/NaN 视为非法（OpenRouter 的 router 占位条目就是 -1000000）。
    fn is_usable(&self) -> bool {
        [self.input, self.output, self.cache_read, self.cache_write]
            .iter()
            .all(|value| value.is_finite() && *value >= 0.0)
    }

    fn to_cny_quote(&self, fx_cny_per_usd: f64, source: &str) -> PriceQuote {
        PriceQuote {
            input_cny_per_m: self.input * fx_cny_per_usd,
            output_cny_per_m: self.output * fx_cny_per_usd,
            cache_read_cny_per_m: self.cache_read * fx_cny_per_usd,
            cache_write_cny_per_m: self.cache_write * fx_cny_per_usd,
            source: source.to_string(),
        }
    }
}

/// 用户覆盖条目：默认 USD / 1M tokens（与 seed/目录同单位，报价时乘 FX）；
/// 单条写 `"currency": "CNY"` 表示直接按人民币 / 1M 生效。
#[derive(Clone, Debug, Default, Deserialize)]
struct OverridePrice {
    #[serde(rename = "in", default)]
    input: f64,
    #[serde(rename = "out", default)]
    output: f64,
    #[serde(default)]
    cache_read: f64,
    #[serde(default)]
    cache_write: f64,
    #[serde(default)]
    currency: Option<String>,
}

impl OverridePrice {
    fn is_usable(&self) -> bool {
        [self.input, self.output, self.cache_read, self.cache_write]
            .iter()
            .all(|value| value.is_finite() && *value >= 0.0)
    }

    fn uses_cny(&self) -> bool {
        matches!(
            self.currency.as_deref(),
            Some(currency) if currency.eq_ignore_ascii_case("cny")
        )
    }

    fn to_quote(&self, fx_cny_per_usd: f64) -> Option<PriceQuote> {
        if !self.is_usable() {
            return None;
        }
        let multiplier = if self.uses_cny() { 1.0 } else { fx_cny_per_usd };
        Some(PriceQuote {
            input_cny_per_m: self.input * multiplier,
            output_cny_per_m: self.output * multiplier,
            cache_read_cny_per_m: self.cache_read * multiplier,
            cache_write_cny_per_m: self.cache_write * multiplier,
            source: "override".to_string(),
        })
    }
}

/// `token_pricing_overrides.json`。
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OverridesFile {
    #[serde(default)]
    fx_cny_per_usd: Option<f64>,
    #[serde(default)]
    models: BTreeMap<String, OverridePrice>,
}

/// 用户可持久化开关。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    #[serde(default = "default_true")]
    auto_refresh: bool,
    #[serde(default = "default_true")]
    mobile_models: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_refresh: true,
            mobile_models: true,
        }
    }
}

fn default_true() -> bool {
    true
}

/// 价格目录本体（远程刷新会整体替换；刷新失败不动它）。
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Catalog {
    /// `seed` | `remote`
    #[serde(default)]
    source: String,
    #[serde(default)]
    updated_at: Option<u64>,
    #[serde(default)]
    models: BTreeMap<String, ModelPrice>,
}

/// 缓存里的运行元信息：只记尝试时间与错误码，不记任何用户数据。
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CacheMeta {
    #[serde(default)]
    last_attempt_at: Option<u64>,
    #[serde(default)]
    last_error: Option<String>,
}

/// `~/.sidekick/token_pricing.json`。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CacheFile {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    settings: Settings,
    #[serde(default)]
    catalog: Catalog,
    #[serde(default)]
    meta: CacheMeta,
}

/// 内置 seed 文件 schema。
#[derive(Debug, Deserialize)]
struct SeedFile {
    #[serde(rename = "_meta")]
    meta: SeedMeta,
    #[serde(default)]
    models: BTreeMap<String, ModelPrice>,
}

#[derive(Debug, Deserialize)]
struct SeedMeta {
    #[serde(default)]
    source: String,
    #[serde(default)]
    updated_at: Option<u64>,
    #[serde(default)]
    count: usize,
}

/// 内存状态：设置 + 目录 + 刷新元信息。网络请求期间不持锁。
struct StoreState {
    settings: Settings,
    catalog: Catalog,
    last_attempt_at: Option<u64>,
    last_error: Option<String>,
}

/// 汇率解析结果。
#[derive(Clone)]
struct FxRate {
    value: f64,
    source: String,
}

/// 一次目录命中的快照（克隆后即可释放 state 锁）。
struct CatalogHit {
    source: String,
    key: String,
    price: ModelPrice,
}

/// 价格目录存储：线程安全、可被多个 Tauri 命令/服务共享。
///
/// `quote()` 是高频路径（分组行 + 缺价估算），只读内存：
/// 覆盖文件构造时读一次，FX 首次解析后缓存。
pub struct PricingStore {
    data_dir: PathBuf,
    ledger_path: PathBuf,
    /// 构造时读取的环境变量覆盖（`SIDEKICK_FX_CNY_PER_USD`），测试可注入。
    env_fx: Option<f64>,
    /// 构造时一次性读入（用户改覆盖文件后重启生效）。
    overrides: OverridesFile,
    /// 首次解析后缓存：override > env > ledger > 兜底；之后 quote 不再读盘。
    fx: OnceLock<FxRate>,
    state: Mutex<StoreState>,
    /// 刷新单飞：同一时刻只允许一个网络刷新。
    refresh_lock: tokio::sync::Mutex<()>,
}

impl PricingStore {
    /// 生产构造：`~/.sidekick/` 缓存 + 默认 DSH 账本路径。
    pub fn new() -> Self {
        Self::build(
            app_paths::data_dir(),
            default_ledger_path(),
            env_fx_cny_per_usd(),
        )
    }

    /// 测试/注入用：指定数据目录与 DSH 账本路径；FX 环境变量仍按真实环境读取。
    #[allow(dead_code)]
    #[doc(hidden)]
    pub fn with_paths(data_dir: PathBuf, ledger_path: PathBuf) -> Self {
        Self::build(data_dir, ledger_path, env_fx_cny_per_usd())
    }

    fn build(data_dir: PathBuf, ledger_path: PathBuf, env_fx: Option<f64>) -> Self {
        let overrides = load_overrides(&data_dir.join("token_pricing_overrides.json"));
        Self {
            state: Mutex::new(load_state(&data_dir)),
            data_dir,
            ledger_path,
            env_fx,
            overrides,
            fx: OnceLock::new(),
            refresh_lock: tokio::sync::Mutex::new(()),
        }
    }

    fn cache_path(&self) -> PathBuf {
        self.data_dir.join("token_pricing.json")
    }

    /// 当前状态（含过期标记与汇率来源）。
    pub fn status(&self) -> PricingStatus {
        let fields = {
            let state = self.state.lock().unwrap();
            StatusFields {
                source: normalize_catalog_source(&state.catalog.source).to_string(),
                updated_at: state.catalog.updated_at,
                last_attempt_at: state.last_attempt_at,
                last_error: state.last_error.clone(),
                auto_refresh: state.settings.auto_refresh,
                mobile_models: state.settings.mobile_models,
                model_count: state.catalog.models.len(),
            }
        };
        let fx = self.resolve_fx();
        build_status(fields, &fx, now_ms())
    }

    /// 报价：override → DeepSeek 官方峰谷 → 目录（remote/seed）。找不到返回 None。
    /// 纯内存查询：覆盖条目已在构造时载入，FX 解析结果被缓存。
    pub fn quote(&self, provider: &str, model: &str, at_ms: Option<u64>) -> Option<PriceQuote> {
        let provider = provider.trim();
        let model = model.trim();
        if model.is_empty() {
            return None;
        }

        // 1) override：`provider:model`、`model` 两种 key。
        let mut direct_keys = Vec::with_capacity(2);
        if !provider.is_empty() {
            direct_keys.push(format!("{provider}:{model}"));
        }
        direct_keys.push(model.to_string());
        if let Some(quote) = self.override_quote_for(&direct_keys) {
            return Some(quote);
        }

        // 目录命中给到 override 的第三、四种 key（目录 id / provider/model），并复用给最终报价。
        let catalog_hit = {
            let state = self.state.lock().unwrap();
            find_catalog(&state.catalog, provider, model).map(|(key, price)| CatalogHit {
                source: normalize_catalog_source(&state.catalog.source).to_string(),
                key: key.to_string(),
                price: price.clone(),
            })
        };
        if let Some(hit) = &catalog_hit {
            let mut catalog_keys = vec![hit.key.clone()];
            if !provider.is_empty() {
                catalog_keys.push(format!("{provider}/{model}"));
            }
            if let Some(quote) = self.override_quote_for(&catalog_keys) {
                return Some(quote);
            }
        } else if !provider.is_empty() {
            // 目录里没有的模型也允许用 `provider/model` 形式的 override 补价。
            if let Some(quote) = self.override_quote_for(&[format!("{provider}/{model}")]) {
                return Some(quote);
            }
        }

        // 2) DeepSeek 官方直连：内置人民币峰谷表。
        // 官方表没收录的模型继续走目录（可能命中同名 OpenRouter 条目）。
        if provider.eq_ignore_ascii_case("deepseek-official")
            && let Some(quote) = deepseek_official_quote(model, at_ms)
        {
            return Some(quote);
        }

        // 3) 目录：USD / 1M → 人民币 / 1M。
        let hit = catalog_hit?;
        if !hit.price.is_usable() {
            return None;
        }
        let fx = self.resolve_fx();
        Some(hit.price.to_cny_quote(fx.value, &hit.source))
    }

    /// 刷新价格目录。`force=true` 为手动刷新（受 60s 最短间隔限制）。
    pub async fn refresh_async(&self, force: bool) -> Result<PricingStatus, String> {
        // 单飞：并发调用排队，后到者按最新状态重新判断是否还需要请求。
        let _single_flight = self.refresh_lock.lock().await;
        let now = now_ms();
        let gate = {
            let mut state = self.state.lock().unwrap();
            let gate = refresh_gate(
                &state.settings,
                state.catalog.updated_at,
                state.last_attempt_at,
                state.last_error.is_some(),
                force,
                now,
            );
            if gate == RefreshGate::Proceed {
                // 先记 attempt：失败后 1h 内不再自动重试，也用于手动 60s 限频。
                state.last_attempt_at = Some(now);
            }
            gate
        };
        match gate {
            RefreshGate::Skip => return Ok(self.status()),
            RefreshGate::TooFrequent => return Err(RATE_LIMITED_ERROR.to_string()),
            RefreshGate::Proceed => {}
        }

        match fetch_catalog().await {
            Ok(catalog) => {
                self.apply_refresh_success(catalog);
                Ok(self.status())
            }
            Err(code) => {
                self.apply_refresh_failure(&code);
                Err(code)
            }
        }
    }

    /// 自动刷新开关（持久化）。
    pub fn set_auto_refresh(&self, enabled: bool) -> Result<PricingStatus, String> {
        {
            let mut state = self.state.lock().unwrap();
            if state.settings.auto_refresh == enabled {
                drop(state);
                return Ok(self.status());
            }
            state.settings.auto_refresh = enabled;
            if let Err(code) = save_state(&self.cache_path(), &state) {
                eprintln!("[pricing] cache_save_failed code={code}");
            }
        }
        Ok(self.status())
    }

    /// 手机端是否展示模型分组（持久化；默认开）。
    pub fn set_mobile_models(&self, enabled: bool) -> Result<PricingStatus, String> {
        {
            let mut state = self.state.lock().unwrap();
            if state.settings.mobile_models == enabled {
                drop(state);
                return Ok(self.status());
            }
            state.settings.mobile_models = enabled;
            if let Err(code) = save_state(&self.cache_path(), &state) {
                eprintln!("[pricing] cache_save_failed code={code}");
            }
        }
        Ok(self.status())
    }

    /// 应用一次成功刷新：换目录、清错误、落盘。返回状态由调用方重新读取。
    fn apply_refresh_success(&self, catalog: Catalog) {
        let now = now_ms();
        let mut state = self.state.lock().unwrap();
        state.catalog = catalog;
        state.last_attempt_at = Some(now);
        state.last_error = None;
        if let Err(code) = save_state(&self.cache_path(), &state) {
            eprintln!("[pricing] cache_save_failed code={code}");
        }
    }

    /// 应用一次失败刷新：保留上次成功的目录，只记错误码与尝试时间。
    fn apply_refresh_failure(&self, code: &str) {
        let now = now_ms();
        let mut state = self.state.lock().unwrap();
        state.last_attempt_at = Some(now);
        state.last_error = Some(code.to_string());
        if let Err(save_code) = save_state(&self.cache_path(), &state) {
            eprintln!("[pricing] cache_save_failed code={save_code}");
        }
    }

    // ---- 覆盖文件 ----

    /// 按 key 顺序找 override；只有默认 USD 单位（或显式 USD）才需要 FX。
    fn override_quote_for(&self, keys: &[String]) -> Option<PriceQuote> {
        for key in keys {
            let wanted = normalize_key(key);
            if wanted.is_empty() {
                continue;
            }
            let found = self
                .overrides
                .models
                .iter()
                .find(|(name, _)| normalize_key(name) == wanted);
            let Some((_, price)) = found else {
                continue;
            };
            let fx = if price.uses_cny() {
                1.0
            } else {
                self.resolve_fx().value
            };
            if let Some(quote) = price.to_quote(fx) {
                return Some(quote);
            }
        }
        None
    }

    // ---- 汇率 ----

    /// FX 首次解析后缓存（`quote()` 之后是纯内存读）。
    fn resolve_fx(&self) -> FxRate {
        self.fx.get_or_init(|| self.compute_fx()).clone()
    }

    /// FX 优先级：override > 环境变量 > DSH ledger 里的 config.exchangeRate > 7.0。
    fn compute_fx(&self) -> FxRate {
        if let Some(value) = self
            .overrides
            .fx_cny_per_usd
            .filter(|value| valid_fx(*value))
        {
            return FxRate {
                value,
                source: "override".to_string(),
            };
        }
        if let Some(value) = self.env_fx.filter(|value| valid_fx(*value)) {
            return FxRate {
                value,
                source: "env".to_string(),
            };
        }
        if let Some(value) = read_ledger_fx(&self.ledger_path) {
            return FxRate {
                value,
                source: "ledger".to_string(),
            };
        }
        FxRate {
            value: FALLBACK_FX_CNY_PER_USD,
            source: "fallback".to_string(),
        }
    }
}

impl Default for PricingStore {
    fn default() -> Self {
        Self::new()
    }
}

impl PriceLookup for PricingStore {
    fn quote(&self, provider: &str, model: &str, at_ms: Option<u64>) -> Option<PriceQuote> {
        PricingStore::quote(self, provider, model, at_ms)
    }

    fn status(&self) -> PricingStatus {
        PricingStore::status(self)
    }
}

// -------------------- Tauri 命令（由 lib.rs 注册） --------------------

#[tauri::command]
pub fn token_pricing_status(store: State<'_, std::sync::Arc<PricingStore>>) -> PricingStatus {
    store.status()
}

#[tauri::command]
pub async fn token_pricing_refresh(
    store: State<'_, std::sync::Arc<PricingStore>>,
    force: bool,
) -> Result<PricingStatus, String> {
    store.refresh_async(force).await
}

#[tauri::command]
pub fn token_pricing_set_auto(
    store: State<'_, std::sync::Arc<PricingStore>>,
    enabled: bool,
) -> Result<PricingStatus, String> {
    store.set_auto_refresh(enabled)
}

#[tauri::command]
pub fn token_pricing_set_mobile_models(
    store: State<'_, std::sync::Arc<PricingStore>>,
    enabled: bool,
) -> Result<PricingStatus, String> {
    store.set_mobile_models(enabled)
}

// -------------------- seed / 缓存 / 覆盖文件 --------------------

/// 内置 seed 目录；解析失败时返回空目录并打错误码（不阻塞启动）。
fn seed_catalog() -> Catalog {
    match serde_json::from_str::<SeedFile>(SEED_JSON) {
        Ok(seed) => {
            // 来源与数量只用于一致性自检：日志只打错误码，不打印目录内容。
            if seed.meta.source.trim().is_empty() {
                eprintln!("[pricing] seed_source_missing");
            }
            if seed.meta.count != seed.models.len() {
                eprintln!(
                    "[pricing] seed_count_mismatch count={} models={}",
                    seed.meta.count,
                    seed.models.len()
                );
            }
            Catalog {
                source: "seed".to_string(),
                updated_at: seed.meta.updated_at,
                models: seed.models,
            }
        }
        Err(_) => {
            eprintln!("[pricing] seed_parse_failed");
            Catalog {
                source: "seed".to_string(),
                updated_at: None,
                models: BTreeMap::new(),
            }
        }
    }
}

/// 读取本地缓存；缺失/损坏/空目录一律回退 seed（设置仍尽量保留）。
fn load_state(data_dir: &Path) -> StoreState {
    let path = data_dir.join("token_pricing.json");
    let seed = seed_catalog();
    let Ok(text) = fs::read_to_string(&path) else {
        return StoreState {
            settings: Settings::default(),
            catalog: seed,
            last_attempt_at: None,
            last_error: None,
        };
    };
    match serde_json::from_str::<CacheFile>(&text) {
        Ok(mut file) => {
            let settings = std::mem::take(&mut file.settings);
            let mut catalog = file.catalog;
            if catalog.models.is_empty() {
                catalog = seed;
            }
            if catalog.source.is_empty() {
                catalog.source = "seed".to_string();
            }
            StoreState {
                settings,
                catalog,
                last_attempt_at: file.meta.last_attempt_at,
                last_error: file.meta.last_error,
            }
        }
        Err(_) => {
            eprintln!("[pricing] cache_parse_failed");
            StoreState {
                settings: Settings::default(),
                catalog: seed,
                last_attempt_at: None,
                last_error: None,
            }
        }
    }
}

/// 原子写缓存：目录不存在自动创建，0600，temp + rename。
fn save_state(path: &Path, state: &StoreState) -> Result<(), String> {
    let payload = CacheFile {
        version: CACHE_VERSION,
        settings: state.settings.clone(),
        catalog: state.catalog.clone(),
        meta: CacheMeta {
            last_attempt_at: state.last_attempt_at,
            last_error: state.last_error.clone(),
        },
    };
    if app_paths::ensure_parent(path).is_err() {
        return Err("cache_dir_failed".to_string());
    }
    let bytes =
        serde_json::to_vec_pretty(&payload).map_err(|_| "cache_encode_failed".to_string())?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|_| "cache_write_failed".to_string())?;
    set_private_permissions(&temp);
    fs::rename(&temp, path).map_err(|_| "cache_save_failed".to_string())
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) {}

fn load_overrides(path: &Path) -> OverridesFile {
    let Ok(text) = fs::read_to_string(path) else {
        return OverridesFile::default();
    };
    match serde_json::from_str::<OverridesFile>(&text) {
        Ok(data) => data,
        Err(_) => {
            // 覆盖文件可能含用户模型名：只打错误码，不打印内容。
            eprintln!("[pricing] overrides_parse_failed");
            OverridesFile::default()
        }
    }
}

// -------------------- 刷新策略 --------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RefreshGate {
    Proceed,
    Skip,
    TooFrequent,
}

/// 纯函数：决定这次刷新是否真的发请求（便于单测，不联网）。
fn refresh_gate(
    settings: &Settings,
    updated_at: Option<u64>,
    last_attempt_at: Option<u64>,
    has_error: bool,
    force: bool,
    now: u64,
) -> RefreshGate {
    let within = |timestamp: Option<u64>, window_ms: u64| {
        timestamp.is_some_and(|timestamp| now.saturating_sub(timestamp) < window_ms)
    };
    if force {
        if within(last_attempt_at, FORCE_MIN_INTERVAL_MS) {
            return RefreshGate::TooFrequent;
        }
        return RefreshGate::Proceed;
    }
    if !settings.auto_refresh {
        return RefreshGate::Skip;
    }
    if within(updated_at, AUTO_REFRESH_INTERVAL_MS) {
        return RefreshGate::Skip;
    }
    if has_error && within(last_attempt_at, FAILURE_BACKOFF_MS) {
        return RefreshGate::Skip;
    }
    RefreshGate::Proceed
}

fn build_status(fields: StatusFields, fx: &FxRate, now: u64) -> PricingStatus {
    let stale = match fields.updated_at {
        None => true,
        Some(updated_at) => now.saturating_sub(updated_at) > STALE_AFTER_MS,
    };
    PricingStatus {
        source: fields.source,
        updated_at: fields.updated_at,
        last_attempt_at: fields.last_attempt_at,
        last_error: fields.last_error,
        stale,
        auto_refresh: fields.auto_refresh,
        model_count: fields.model_count,
        fx_cny_per_usd: fx.value,
        fx_source: fx.source.clone(),
        mobile_models: fields.mobile_models,
    }
}

struct StatusFields {
    source: String,
    updated_at: Option<u64>,
    last_attempt_at: Option<u64>,
    last_error: Option<String>,
    auto_refresh: bool,
    model_count: usize,
    mobile_models: bool,
}

// -------------------- 目录匹配 --------------------

fn normalize_catalog_source(source: &str) -> &str {
    if source == "remote" { "remote" } else { "seed" }
}

fn normalize_key(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

/// 目录匹配：
/// 1) 模型本身带 `/`（调用方直接传目录 id）；
/// 2) `provider/model` 精确匹配；
/// 3) `model` 后缀唯一匹配（如 `deepseek-v4.1-flash` → `deepseek/deepseek-v4.1-flash`）；
///    多个 provider 同名且无法用 provider 前缀消歧时返回 None（不猜）。
fn find_catalog<'a>(
    catalog: &'a Catalog,
    provider: &str,
    model: &str,
) -> Option<(&'a str, &'a ModelPrice)> {
    let provider = normalize_key(provider);
    let model = normalize_key(model);
    if model.is_empty() {
        return None;
    }
    if model.contains('/')
        && let Some(found) = find_catalog_key(catalog, &model)
    {
        return Some(found);
    }
    if !provider.is_empty() && !provider.contains('/') {
        let direct = format!("{provider}/{model}");
        if let Some(found) = find_catalog_key(catalog, &direct) {
            return Some(found);
        }
    }
    let suffix = format!("/{model}");
    let mut matches: Vec<(&str, &ModelPrice)> = catalog
        .models
        .iter()
        .filter(|(key, _)| normalize_key(key).ends_with(&suffix))
        .map(|(key, price)| (key.as_str(), price))
        .collect();
    if matches.len() > 1 && !provider.is_empty() {
        let prefixed: Vec<(&str, &ModelPrice)> = matches
            .iter()
            .copied()
            .filter(|(key, _)| normalize_key(key).starts_with(&format!("{provider}/")))
            .collect();
        if prefixed.len() == 1 {
            return prefixed.into_iter().next();
        }
        matches = prefixed;
    }
    match matches.len() {
        1 => matches.pop(),
        _ => None,
    }
}

fn find_catalog_key<'a>(catalog: &'a Catalog, key: &str) -> Option<(&'a str, &'a ModelPrice)> {
    catalog
        .models
        .iter()
        .find(|(name, _)| normalize_key(name) == key)
        .map(|(name, price)| (name.as_str(), price))
}

// -------------------- DeepSeek 官方人民币峰谷价 --------------------

#[derive(Clone, Copy, Debug)]
enum DeepSeekModel {
    Pro,
    Flash,
}

struct DeepSeekPrice {
    input: f64,
    output: f64,
    cache_read: f64,
    cache_write: f64,
}

struct DeepSeekSchedule {
    off_peak: DeepSeekPrice,
    /// `None` 表示该时期没有峰谷区分（旧价目表）。
    peak: Option<DeepSeekPrice>,
}

const fn deepseek_price(
    input: f64,
    output: f64,
    cache_read: f64,
    cache_write: f64,
) -> DeepSeekPrice {
    DeepSeekPrice {
        input,
        output,
        cache_read,
        cache_write,
    }
}

/// 2026-08-16 16:00 UTC 之前的旧价：无峰谷。
const DEEPSEEK_LEGACY_PRO: DeepSeekSchedule = DeepSeekSchedule {
    off_peak: deepseek_price(3.0, 6.0, 0.025, 0.0),
    peak: None,
};

const DEEPSEEK_LEGACY_FLASH: DeepSeekSchedule = DeepSeekSchedule {
    off_peak: deepseek_price(1.0, 2.0, 0.02, 0.0),
    peak: None,
};

/// 2026-08-16 起 v4-pro 峰谷价（此后未变）。
const DEEPSEEK_CURRENT_PRO: DeepSeekSchedule = DeepSeekSchedule {
    off_peak: deepseek_price(4.5, 13.5, 0.15, 0.0),
    peak: Some(deepseek_price(9.0, 27.0, 0.30, 0.0)),
};

/// 2026-08-16 → 2026-09-10 之间的 v4-flash 峰谷价。
const DEEPSEEK_FLASH_2026_08: DeepSeekSchedule = DeepSeekSchedule {
    off_peak: deepseek_price(1.5, 4.5, 0.05, 0.0),
    peak: Some(deepseek_price(3.0, 9.0, 0.10, 0.0)),
};

/// 2026-09-10 起 v4-flash 新价（当前价）。
const DEEPSEEK_FLASH_CURRENT: DeepSeekSchedule = DeepSeekSchedule {
    off_peak: deepseek_price(1.0, 4.0, 0.02, 0.0),
    peak: Some(deepseek_price(2.0, 8.0, 0.04, 0.0)),
};

/// 模型 id → 官方价目表条目（支持带 provider 前缀与常见别名）。
fn deepseek_model_kind(model: &str) -> Option<DeepSeekModel> {
    let id = model.rsplit('/').next().unwrap_or(model).trim();
    match id.to_ascii_lowercase().as_str() {
        "deepseek-v4-pro" => Some(DeepSeekModel::Pro),
        "deepseek-v4-flash" | "deepseek-v4.1-flash" | "deepseek-flash" => {
            Some(DeepSeekModel::Flash)
        }
        _ => None,
    }
}

/// DeepSeek 官方价：`at_ms=None` 按谷时；峰时 = UTC 工作日 1–4、6–10 点。
fn deepseek_official_quote(model: &str, at_ms: Option<u64>) -> Option<PriceQuote> {
    let kind = deepseek_model_kind(model)?;
    let at = at_ms.map(normalize_at_ms);
    let legacy = at.is_some_and(|ms| ms < DEEPSEEK_NEW_PRICING_START_MS);
    let schedule: &DeepSeekSchedule = match kind {
        DeepSeekModel::Pro => {
            if legacy {
                &DEEPSEEK_LEGACY_PRO
            } else {
                &DEEPSEEK_CURRENT_PRO
            }
        }
        DeepSeekModel::Flash => {
            if legacy {
                &DEEPSEEK_LEGACY_FLASH
            } else if at.is_some_and(|ms| ms < DEEPSEEK_FLASH_20260910_START_MS) {
                &DEEPSEEK_FLASH_2026_08
            } else {
                &DEEPSEEK_FLASH_CURRENT
            }
        }
    };
    let peak = at.is_some_and(is_peak_utc);
    let price = if peak {
        schedule.peak.as_ref().unwrap_or(&schedule.off_peak)
    } else {
        &schedule.off_peak
    };
    Some(PriceQuote {
        input_cny_per_m: price.input,
        output_cny_per_m: price.output,
        cache_read_cny_per_m: price.cache_read,
        cache_write_cny_per_m: price.cache_write,
        source: "deepseek-official".to_string(),
    })
}

/// 峰时：UTC 工作日 01:00–04:00、06:00–10:00（北京时间 09–12、14–18 点）。
fn is_peak_utc(at_ms: u64) -> bool {
    let Some(at) = chrono::DateTime::<Utc>::from_timestamp_millis(at_ms as i64) else {
        return false;
    };
    if at.weekday().num_days_from_monday() >= 5 {
        return false;
    }
    let hour = at.hour();
    (1..4).contains(&hour) || (6..10).contains(&hour)
}

/// 兼容调用方传秒级时间戳（DSH 账本里两种都可能出现）。
fn normalize_at_ms(at_ms: u64) -> u64 {
    if at_ms < 100_000_000_000 {
        at_ms.saturating_mul(1000)
    } else {
        at_ms
    }
}

// -------------------- 远程刷新（reqwest） --------------------

async fn fetch_catalog() -> Result<Catalog, String> {
    let client = build_client()?;
    let mut response = client
        .get(OPENROUTER_URL)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|error| classify_request_error(&error))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("http_{}", status.as_u16()));
    }
    let mut body: Vec<u8> = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| classify_request_error(&error))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_BODY_BYTES {
            return Err("body_too_large".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    let models = parse_openrouter_body(&body)?;
    Ok(Catalog {
        source: "remote".to_string(),
        updated_at: Some(now_ms()),
        models,
    })
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= MAX_REDIRECTS {
                return attempt.error("too_many_redirects");
            }
            let url = attempt.url();
            if url.scheme() != "https" || url.host_str() != Some(OPENROUTER_HOST) {
                return attempt.error("unsafe_redirect");
            }
            attempt.follow()
        }))
        .build()
        .map_err(|_| "client_init_failed".to_string())
}

/// 错误只暴露错误码，供 status.lastError 与日志使用。
fn classify_request_error(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "timeout".to_string()
    } else if error.is_redirect() {
        "redirect".to_string()
    } else if error.is_decode() {
        "decode".to_string()
    } else {
        "network".to_string()
    }
}

#[derive(Debug, Default, Deserialize)]
struct OpenRouterEnvelope {
    #[serde(default)]
    data: Vec<OpenRouterModel>,
}

#[derive(Debug, Default, Deserialize)]
struct OpenRouterModel {
    #[serde(default)]
    id: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    pricing: Option<OpenRouterPricing>,
}

/// OpenRouter 的价格字段：每 token 的 USD 字符串（也兼容数字/null）。
#[derive(Debug, Default, Deserialize)]
struct OpenRouterPricing {
    #[serde(default, deserialize_with = "deserialize_optional_f64")]
    prompt: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_optional_f64")]
    completion: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_optional_f64")]
    input_cache_read: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_optional_f64")]
    input_cache_write: Option<f64>,
}

fn deserialize_optional_f64<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<serde_json::Value>::deserialize(deserializer)?;
    Ok(match value {
        None | Some(serde_json::Value::Null) => None,
        Some(serde_json::Value::String(text)) => text.trim().parse::<f64>().ok(),
        Some(serde_json::Value::Number(number)) => number.as_f64(),
        _ => None,
    })
}

/// OpenRouter 响应体 → `models{ "provider/model": {...} }`；跳过非法/负价条目。
fn parse_openrouter_body(body: &[u8]) -> Result<BTreeMap<String, ModelPrice>, String> {
    let envelope: OpenRouterEnvelope =
        serde_json::from_slice(body).map_err(|_| "invalid_json".to_string())?;
    if envelope.data.is_empty() {
        return Err("empty_catalog".to_string());
    }
    let mut models = BTreeMap::new();
    for entry in envelope.data {
        if let Some((id, price)) = normalize_openrouter_model(entry) {
            models.insert(id, price);
        }
    }
    if models.is_empty() {
        return Err("empty_catalog".to_string());
    }
    Ok(models)
}

fn normalize_openrouter_model(entry: OpenRouterModel) -> Option<(String, ModelPrice)> {
    let id = entry.id.trim();
    // OpenRouter 目录 id 固定是 `provider/model`；没有斜杠的脏数据跳过。
    if id.is_empty() || !id.contains('/') {
        return None;
    }
    let pricing = entry.pricing?;
    let input = usd_per_million(pricing.prompt?)?;
    let output = usd_per_million(pricing.completion?)?;
    let cache_read = match pricing.input_cache_read {
        Some(value) => usd_per_million(value)?,
        None => 0.0,
    };
    let cache_write = match pricing.input_cache_write {
        Some(value) => usd_per_million(value)?,
        None => 0.0,
    };
    let name = entry
        .name
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty());
    Some((
        id.to_string(),
        ModelPrice {
            input,
            output,
            cache_read,
            cache_write,
            name,
        },
    ))
}

/// 每 token USD → 每 1M USD（保留 6 位小数，抹掉浮点尾差）。
fn usd_per_million(per_token_usd: f64) -> Option<f64> {
    let value = per_token_usd * 1_000_000.0;
    if !value.is_finite() || value < 0.0 {
        return None;
    }
    Some((value * 1_000_000.0).round() / 1_000_000.0)
}

// -------------------- 路径 / 时间 / 汇率工具 --------------------

fn env_fx_cny_per_usd() -> Option<f64> {
    std::env::var("SIDEKICK_FX_CNY_PER_USD")
        .ok()
        .and_then(|value| value.trim().parse::<f64>().ok())
        .filter(|value| valid_fx(*value))
}

fn valid_fx(value: f64) -> bool {
    value.is_finite() && value > 0.0 && value < 1000.0
}

/// DSH 数据目录：`SIDEKICK_DSH_HOME` > `DSH_HOME` > `~/.dsh`。
fn dsh_home() -> PathBuf {
    for key in ["SIDEKICK_DSH_HOME", "DSH_HOME"] {
        if let Ok(value) = std::env::var(key) {
            let value = value.trim();
            if !value.is_empty() {
                return PathBuf::from(value);
            }
        }
    }
    PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".dsh")
}

fn default_ledger_path() -> PathBuf {
    dsh_home().join("storages/cost-meter/ledger.json")
}

/// 读 ledger 的 `config.exchangeRate`；坏文件/缺失都返回 None（走兜底汇率）。
fn read_ledger_fx(path: &Path) -> Option<f64> {
    let text = fs::read_to_string(path).ok()?;
    let payload: serde_json::Value = serde_json::from_str(&text).ok()?;
    let raw = payload.get("config")?.get("exchangeRate")?;
    let value = match raw {
        serde_json::Value::Number(number) => number.as_f64(),
        serde_json::Value::String(text) => text.trim().parse::<f64>().ok(),
        _ => None,
    }?;
    valid_fx(value).then_some(value)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SEQUENCE: AtomicU64 = AtomicU64::new(1);

    // 固定时间戳（2026-11-03 周二 / 2026-11-01 周日，均为 UTC）。
    const TUE_PEAK_0200: u64 = 1_793_671_200_000;
    const TUE_OFF_0400: u64 = 1_793_678_400_000;
    const TUE_PEAK_0600: u64 = 1_793_685_600_000;
    const TUE_PEAK_0955: u64 = 1_793_699_700_000;
    const TUE_OFF_1000: u64 = 1_793_700_000_000;
    const SUN_0200: u64 = 1_793_498_400_000;
    // 2026-08-03（周一）02:00 UTC：新旧计价分界之前。
    const LEGACY_MON_0200: u64 = 1_785_722_400_000;
    // DeepSeek v4-flash 2026-09-10 04:00 UTC 换价前后。
    const FLASH_OLD_0909_0500: u64 = 1_788_930_000_000;
    const FLASH_NEW_0910_0500: u64 = 1_789_016_400_000;
    // 2026-09-11（周五）02:00 UTC：新价生效后的峰时。
    const FLASH_NEW_PEAK_0911_0200: u64 = 1_789_092_000_000;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sidekick-token-pricing-{label}-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn store_in(dir: &Path) -> PricingStore {
        PricingStore::build(dir.to_path_buf(), dir.join("ledger.json"), None)
    }

    fn store_with_env_fx(dir: &Path, env_fx: Option<f64>) -> PricingStore {
        PricingStore::build(dir.to_path_buf(), dir.join("ledger.json"), env_fx)
    }

    fn write_overrides(dir: &Path, json: &str) {
        fs::write(dir.join("token_pricing_overrides.json"), json).unwrap();
    }

    fn write_cache(dir: &Path, json: &str) {
        fs::write(dir.join("token_pricing.json"), json).unwrap();
    }

    fn write_ledger(dir: &Path, json: &str) {
        fs::write(dir.join("ledger.json"), json).unwrap();
    }

    fn parsed_seed() -> SeedFile {
        serde_json::from_str(SEED_JSON).expect("pricing_seed.json 必须能被 include_str! 解析")
    }

    fn seed_price(key: &str) -> ModelPrice {
        parsed_seed()
            .models
            .get(key)
            .cloned()
            .unwrap_or_else(|| panic!("seed 缺少模型 {key}"))
    }

    fn approx(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-6,
            "期望 {expected}，实际 {actual}"
        );
    }

    fn assert_quote(
        quote: &PriceQuote,
        input: f64,
        output: f64,
        cache_read: f64,
        cache_write: f64,
    ) {
        approx(quote.input_cny_per_m, input);
        approx(quote.output_cny_per_m, output);
        approx(quote.cache_read_cny_per_m, cache_read);
        approx(quote.cache_write_cny_per_m, cache_write);
    }

    fn fixture_catalog(updated_at: Option<u64>) -> Catalog {
        let mut models = BTreeMap::new();
        models.insert(
            "openai/fixture-model".to_string(),
            ModelPrice {
                input: 1.0,
                output: 2.0,
                cache_read: 0.25,
                cache_write: 0.5,
                name: Some("Fixture Model".to_string()),
            },
        );
        models.insert(
            "acme/fixture-model".to_string(),
            ModelPrice {
                input: 0.5,
                output: 1.0,
                cache_read: 0.1,
                cache_write: 0.2,
                name: None,
            },
        );
        Catalog {
            source: "remote".to_string(),
            updated_at,
            models,
        }
    }

    // -------------------- seed / 缓存 --------------------

    #[test]
    fn seed_parses_with_expected_shape() {
        let seed = parsed_seed();
        assert_eq!(seed.meta.count, seed.models.len());
        assert_eq!(seed.models.len(), 548);
        assert!(seed.meta.source.contains("tokei pricing.json"));
        assert!(
            seed.meta
                .updated_at
                .is_some_and(|timestamp| timestamp > 1_700_000_000_000)
        );
        // 名称保留给显示用；OpenRouter 的 router 占位条目是负价，运行时不会报价。
        assert!(
            seed.models
                .values()
                .filter(|model| model.name.is_some())
                .count()
                > 400
        );
        assert!(!seed.models["openrouter/auto"].is_usable());
        let gpt = seed_price("openai/gpt-4o-mini");
        assert!(gpt.is_usable());
        assert!(
            gpt.name
                .as_deref()
                .unwrap_or_default()
                .contains("GPT-4o-mini")
        );
    }

    #[test]
    fn loads_seed_when_cache_absent() {
        let dir = temp_dir("seed");
        let store = store_in(&dir);
        let status = store.status();
        assert_eq!(status.source, "seed");
        assert_eq!(status.model_count, 548);
        assert_eq!(status.fx_source, "fallback");
        approx(status.fx_cny_per_usd, 7.0);
        assert!(status.auto_refresh);
        assert!(status.mobile_models);
        assert!(status.updated_at.is_some());
        assert!(status.last_error.is_none());
        // seed 快照是 2026-10-27，超过 7 天 → stale。
        assert!(status.stale);

        let expected = seed_price("openai/gpt-4o-mini");
        let quote = store.quote("openai", "gpt-4o-mini", None).unwrap();
        assert_eq!(quote.source, "seed");
        approx(quote.input_cny_per_m, expected.input * 7.0);
        approx(quote.output_cny_per_m, expected.output * 7.0);

        // provider 名与目录前缀不一致时，`model` 后缀唯一也能命中。
        let suffix = store.quote("whatever", "gpt-4o-mini", None).unwrap();
        assert_eq!(suffix.source, "seed");
        // 负价占位条目不会给出报价。
        assert!(store.quote("openrouter", "auto", None).is_none());
        // 不存在的模型返回 None，不编造价格。
        assert!(
            store
                .quote("nobody", "definitely-not-a-model", None)
                .is_none()
        );
    }

    #[test]
    fn corrupt_cache_falls_back_to_seed() {
        let dir = temp_dir("corrupt");
        write_cache(&dir, "{ 这不是合法 JSON");
        let store = store_in(&dir);
        let status = store.status();
        assert_eq!(status.source, "seed");
        assert_eq!(status.model_count, 548);
        assert!(status.auto_refresh);
        assert!(status.mobile_models);

        // 合法 JSON 但 catalog 为空：目录回退 seed，设置仍保留。
        let dir = temp_dir("empty-catalog");
        write_cache(
            &dir,
            r#"{"version":1,"settings":{"autoRefresh":false,"mobileModels":false},"catalog":{"source":"remote","models":{}},"meta":{}}"#,
        );
        let store = store_in(&dir);
        let status = store.status();
        assert_eq!(status.source, "seed");
        assert_eq!(status.model_count, 548);
        assert!(!status.auto_refresh);
        assert!(!status.mobile_models);
    }

    #[test]
    fn settings_persist_with_private_permissions() {
        let dir = temp_dir("settings");
        {
            let store = store_in(&dir);
            assert!(!store.set_auto_refresh(false).unwrap().auto_refresh);
            assert!(!store.set_mobile_models(false).unwrap().mobile_models);
            // 幂等：重复设置同样值不报错。
            assert!(!store.set_auto_refresh(false).unwrap().auto_refresh);
        }
        let cache = dir.join("token_pricing.json");
        assert!(cache.is_file());
        // 缓存 schema 必须含 version / settings / catalog / meta 四段。
        let payload: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&cache).unwrap()).unwrap();
        for key in ["version", "settings", "catalog", "meta"] {
            assert!(payload.get(key).is_some(), "缓存缺少 {key} 段");
        }
        assert_eq!(payload["settings"]["autoRefresh"].as_bool(), Some(false));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&cache).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "价格缓存必须以 0600 写入");
        }
        let reloaded = store_in(&dir);
        let status = reloaded.status();
        assert!(!status.auto_refresh);
        assert!(!status.mobile_models);
        assert_eq!(status.model_count, 548);
        // 改回默认值同样持久化。
        reloaded.set_auto_refresh(true).unwrap();
        reloaded.set_mobile_models(true).unwrap();
        let reloaded = store_in(&dir);
        assert!(reloaded.status().auto_refresh);
        assert!(reloaded.status().mobile_models);
    }

    // -------------------- 刷新策略 --------------------

    #[test]
    fn refresh_gate_policy() {
        let now = 1_793_700_000_000u64;
        let settings = Settings::default();
        assert_eq!(
            refresh_gate(&settings, None, None, false, false, now),
            RefreshGate::Proceed
        );
        assert_eq!(
            refresh_gate(&settings, Some(now - 1_000), None, false, false, now),
            RefreshGate::Skip
        );
        assert_eq!(
            refresh_gate(
                &settings,
                Some(now - AUTO_REFRESH_INTERVAL_MS + 1),
                None,
                false,
                false,
                now
            ),
            RefreshGate::Skip
        );
        assert_eq!(
            refresh_gate(
                &settings,
                Some(now - AUTO_REFRESH_INTERVAL_MS),
                None,
                false,
                false,
                now
            ),
            RefreshGate::Proceed
        );

        // 关闭自动刷新后自动调用直接跳过，手动 force 仍然放行。
        let disabled = Settings {
            auto_refresh: false,
            ..Settings::default()
        };
        assert_eq!(
            refresh_gate(&disabled, None, None, false, false, now),
            RefreshGate::Skip
        );
        assert_eq!(
            refresh_gate(&disabled, None, None, false, true, now),
            RefreshGate::Proceed
        );

        // 手动刷新 60s 限频。
        assert_eq!(
            refresh_gate(&settings, None, Some(now - 1_000), false, true, now),
            RefreshGate::TooFrequent
        );
        assert_eq!(
            refresh_gate(
                &settings,
                None,
                Some(now - FORCE_MIN_INTERVAL_MS),
                false,
                true,
                now
            ),
            RefreshGate::Proceed
        );

        // 失败后 1h 内不自动重试。
        assert_eq!(
            refresh_gate(&settings, None, Some(now - 1_000), true, false, now),
            RefreshGate::Skip
        );
        assert_eq!(
            refresh_gate(
                &settings,
                None,
                Some(now - FAILURE_BACKOFF_MS),
                true,
                false,
                now
            ),
            RefreshGate::Proceed
        );
        // 理论上不会出现「有错误但没有尝试时间」，此时允许重试。
        assert_eq!(
            refresh_gate(&settings, None, None, true, false, now),
            RefreshGate::Proceed
        );
    }

    #[test]
    fn refresh_failure_keeps_last_good_catalog() {
        let dir = temp_dir("refresh-failure");
        let store = store_in(&dir);
        assert_eq!(store.status().source, "seed");

        let now = now_ms();
        store.apply_refresh_success(fixture_catalog(Some(now)));
        let after_success = store.status();
        assert_eq!(after_success.source, "remote");
        assert_eq!(after_success.model_count, 2);
        assert!(!after_success.stale);
        assert!(after_success.last_error.is_none());
        assert_eq!(after_success.updated_at, Some(now));

        store.apply_refresh_failure("network");
        let after_failure = store.status();
        // 失败不动上次成功的目录，只记错误码与尝试时间。
        assert_eq!(after_failure.source, "remote");
        assert_eq!(after_failure.model_count, 2);
        assert_eq!(after_failure.updated_at, Some(now));
        assert_eq!(after_failure.last_error.as_deref(), Some("network"));
        assert!(after_failure.last_attempt_at.is_some());

        // 重启后仍保留上次成功目录与失败记录。
        let reloaded = store_in(&dir);
        let reloaded_status = reloaded.status();
        assert_eq!(reloaded_status.source, "remote");
        assert_eq!(reloaded_status.model_count, 2);
        assert_eq!(reloaded_status.last_error.as_deref(), Some("network"));
        let quote = reloaded.quote("openai", "fixture-model", None).unwrap();
        assert_eq!(quote.source, "remote");
        approx(quote.input_cny_per_m, 1.0 * 7.0);
    }

    #[test]
    fn stale_flag_after_seven_days() {
        let dir = temp_dir("stale");
        let store = store_in(&dir);
        store.apply_refresh_success(fixture_catalog(Some(now_ms())));
        assert!(!store.status().stale);

        store.apply_refresh_success(fixture_catalog(Some(now_ms() - STALE_AFTER_MS - 60_000)));
        assert!(store.status().stale);

        // updatedAt 缺失也算 stale。
        store.apply_refresh_success(fixture_catalog(None));
        let status = store.status();
        assert!(status.stale);
        assert!(status.updated_at.is_none());
    }

    #[tokio::test]
    async fn refresh_async_short_circuits_without_network() {
        let dir = temp_dir("refresh-gate");
        let store = store_in(&dir);
        store.apply_refresh_success(fixture_catalog(Some(now_ms())));
        // 24h 内自动刷新直接返回（不联网）。
        let status = store.refresh_async(false).await.unwrap();
        assert_eq!(status.source, "remote");
        assert_eq!(status.model_count, 2);
        // 关闭自动刷新后自动刷新仍然跳过。
        store.set_auto_refresh(false).unwrap();
        let status = store.refresh_async(false).await.unwrap();
        assert!(!status.auto_refresh);
        // 手动刷新受 60s 限频（刚尝试过），返回错误而不是发请求。
        let error = store.refresh_async(true).await.unwrap_err();
        assert!(error.contains("60"), "错误文案应提示 60 秒限频: {error}");
    }

    // -------------------- OpenRouter 解析 --------------------

    #[test]
    fn parses_and_normalizes_openrouter_fixture() {
        let body = br#"{
            "data": [
                {"id": "openai/gpt-test", "name": "GPT Test", "pricing": {
                    "prompt": "0.0000025", "completion": "0.00001",
                    "input_cache_read": "0.00000125", "input_cache_write": "0.000003"}},
                {"id": "vendor/number-price", "pricing": {
                    "prompt": 0.000001, "completion": 0.000002}},
                {"id": "vendor/negative", "pricing": {
                    "prompt": "-0.000001", "completion": "0.000002"}},
                {"id": "vendor/missing-output", "pricing": {"prompt": "0.000001"}},
                {"id": "vendor/nocache", "pricing": {
                    "prompt": "0.000001", "completion": "0.000002",
                    "input_cache_read": null, "input_cache_write": null}},
                {"id": "no-slash-id", "pricing": {
                    "prompt": "0.000001", "completion": "0.000001"}},
                {"id": "vendor/no-pricing"}
            ]
        }"#;
        let models = parse_openrouter_body(body).unwrap();
        assert_eq!(models.len(), 3);
        let gpt = &models["openai/gpt-test"];
        approx(gpt.input, 2.5);
        approx(gpt.output, 10.0);
        approx(gpt.cache_read, 1.25);
        approx(gpt.cache_write, 3.0);
        assert_eq!(gpt.name.as_deref(), Some("GPT Test"));
        assert!(gpt.is_usable());

        let numeric = &models["vendor/number-price"];
        approx(numeric.input, 1.0);
        approx(numeric.output, 2.0);
        assert!(numeric.name.is_none());

        let no_cache = &models["vendor/nocache"];
        approx(no_cache.input, 1.0);
        assert_eq!(no_cache.cache_read, 0.0);
        assert_eq!(no_cache.cache_write, 0.0);

        assert!(!models.contains_key("vendor/negative"));
        assert!(!models.contains_key("vendor/missing-output"));
        assert!(!models.contains_key("no-slash-id"));
        assert!(!models.contains_key("vendor/no-pricing"));
    }

    #[test]
    fn parse_openrouter_rejects_bad_payloads() {
        assert_eq!(
            parse_openrouter_body(b"not json").unwrap_err(),
            "invalid_json"
        );
        assert_eq!(
            parse_openrouter_body(br#"{"data":[]}"#).unwrap_err(),
            "empty_catalog"
        );
        assert_eq!(
            parse_openrouter_body(br#"{"data":[{"id":"a/b","pricing":{}}]}"#).unwrap_err(),
            "empty_catalog"
        );
        assert!(usd_per_million(f64::NAN).is_none());
        assert!(usd_per_million(-0.1).is_none());
        approx(usd_per_million(0.0000025).unwrap(), 2.5);
        approx(usd_per_million(0.0).unwrap(), 0.0);
    }

    // -------------------- DeepSeek 官方峰谷价 --------------------

    #[test]
    fn deepseek_peak_and_off_peak() {
        let dir = temp_dir("deepseek");
        let store = store_in(&dir);

        // at_ms=None 按谷时；峰时 = UTC 工作日 1–4、6–10 点。
        let pro_off = store
            .quote("deepseek-official", "deepseek-v4-pro", None)
            .unwrap();
        assert_eq!(pro_off.source, "deepseek-official");
        assert_quote(&pro_off, 4.5, 13.5, 0.15, 0.0);
        let pro_peak = store
            .quote("deepseek-official", "deepseek-v4-pro", Some(TUE_PEAK_0200))
            .unwrap();
        assert_quote(&pro_peak, 9.0, 27.0, 0.30, 0.0);
        assert_quote(
            &store
                .quote("deepseek-official", "deepseek-v4-pro", Some(TUE_PEAK_0600))
                .unwrap(),
            9.0,
            27.0,
            0.30,
            0.0,
        );
        assert_quote(
            &store
                .quote("deepseek-official", "deepseek-v4-pro", Some(TUE_PEAK_0955))
                .unwrap(),
            9.0,
            27.0,
            0.30,
            0.0,
        );
        // 峰时边界之外按谷时。
        assert_quote(
            &store
                .quote("deepseek-official", "deepseek-v4-pro", Some(TUE_OFF_0400))
                .unwrap(),
            4.5,
            13.5,
            0.15,
            0.0,
        );
        assert_quote(
            &store
                .quote("deepseek-official", "deepseek-v4-pro", Some(TUE_OFF_1000))
                .unwrap(),
            4.5,
            13.5,
            0.15,
            0.0,
        );
        // 周末按谷时。
        assert_quote(
            &store
                .quote("deepseek-official", "deepseek-v4-pro", Some(SUN_0200))
                .unwrap(),
            4.5,
            13.5,
            0.15,
            0.0,
        );
        // 兼容秒级时间戳。
        assert_quote(
            &store
                .quote(
                    "deepseek-official",
                    "deepseek-v4-pro",
                    Some(TUE_PEAK_0200 / 1000),
                )
                .unwrap(),
            9.0,
            27.0,
            0.30,
            0.0,
        );
    }

    #[test]
    fn deepseek_flash_aliases_and_schedule() {
        let dir = temp_dir("deepseek-flash");
        let store = store_in(&dir);

        // 2026-09-10 之后（当前）：谷时 1.0 / 4.0，峰时 2.0 / 8.0。
        assert_quote(
            &store
                .quote("deepseek-official", "deepseek-v4.1-flash", None)
                .unwrap(),
            1.0,
            4.0,
            0.02,
            0.0,
        );
        assert_quote(
            &store
                .quote("deepseek-official", "deepseek-flash", Some(TUE_PEAK_0200))
                .unwrap(),
            2.0,
            8.0,
            0.04,
            0.0,
        );
        // 别名 deepseek-v4-flash / 带 provider 前缀的模型 id 等价。
        assert_quote(
            &store
                .quote("deepseek-official", "deepseek-v4-flash", Some(TUE_OFF_0400))
                .unwrap(),
            1.0,
            4.0,
            0.02,
            0.0,
        );
        assert_quote(
            &store
                .quote(
                    "deepseek-official",
                    "deepseek/deepseek-v4-pro",
                    Some(TUE_PEAK_0200),
                )
                .unwrap(),
            9.0,
            27.0,
            0.30,
            0.0,
        );
        // 换价前的 v4-flash 旧价。
        assert_quote(
            &store
                .quote(
                    "deepseek-official",
                    "deepseek-v4-flash",
                    Some(FLASH_OLD_0909_0500),
                )
                .unwrap(),
            1.5,
            4.5,
            0.05,
            0.0,
        );
        assert_quote(
            &store
                .quote(
                    "deepseek-official",
                    "deepseek-v4-flash",
                    Some(FLASH_NEW_0910_0500),
                )
                .unwrap(),
            1.0,
            4.0,
            0.02,
            0.0,
        );
        assert_quote(
            &store
                .quote(
                    "deepseek-official",
                    "deepseek-v4-flash",
                    Some(FLASH_NEW_PEAK_0911_0200),
                )
                .unwrap(),
            2.0,
            8.0,
            0.04,
            0.0,
        );
        // provider 大小写不敏感。
        assert_eq!(
            store
                .quote("DeepSeek-Official", "deepseek-v4-pro", None)
                .unwrap()
                .source,
            "deepseek-official"
        );
        // 未知官方模型 + 目录无同名 → None（不编造价格）。
        assert!(
            store
                .quote("deepseek-official", "deepseek-v9-unknown", None)
                .is_none()
        );
    }

    #[test]
    fn deepseek_legacy_flat_price_before_peak_schedule() {
        let dir = temp_dir("deepseek-legacy");
        let store = store_in(&dir);
        // 2026-08-16 16:00 UTC 之前：v4-pro 3 / 6，v4-flash 1 / 2，且无峰谷。
        assert_quote(
            &store
                .quote(
                    "deepseek-official",
                    "deepseek-v4-pro",
                    Some(LEGACY_MON_0200),
                )
                .unwrap(),
            3.0,
            6.0,
            0.025,
            0.0,
        );
        assert_quote(
            &store
                .quote(
                    "deepseek-official",
                    "deepseek-v4-flash",
                    Some(LEGACY_MON_0200),
                )
                .unwrap(),
            1.0,
            2.0,
            0.02,
            0.0,
        );
    }

    #[test]
    fn deepseek_official_price_is_not_scaled_by_fx() {
        let dir = temp_dir("deepseek-fx");
        write_overrides(&dir, r#"{"fxCnyPerUsd": 10.0, "models": {}}"#);
        let store = store_in(&dir);
        let quote = store
            .quote("deepseek-official", "deepseek-v4-pro", None)
            .unwrap();
        assert_quote(&quote, 4.5, 13.5, 0.15, 0.0);
    }

    // -------------------- override / FX --------------------

    #[test]
    fn override_priority_keys_and_units() {
        let dir = temp_dir("override");
        write_overrides(
            &dir,
            r#"{
                "fxCnyPerUsd": 10.0,
                "models": {
                    "deepseek-official:deepseek-v4-pro": {
                        "in": 1.0, "out": 2.0, "cache_read": 0.5, "cache_write": 0.25
                    },
                    "openai/gpt-4o-mini": {
                        "in": 0.3, "out": 0.6, "cache_read": 0.15, "cache_write": 0.0
                    },
                    "special-model": {
                        "in": 2.0, "out": 4.0, "currency": "CNY"
                    },
                    "legacy-model": {"in": 3.0, "out": 5.0}
                }
            }"#,
        );
        let store = store_with_env_fx(&dir, Some(7.5));
        let status = store.status();
        // override 里的 fxCnyPerUsd 优先级最高。
        assert_eq!(status.fx_source, "override");
        approx(status.fx_cny_per_usd, 10.0);

        // `provider:model` key 覆盖 DeepSeek 官方；默认 USD → ×FX。
        let quote = store
            .quote("deepseek-official", "deepseek-v4-pro", Some(TUE_PEAK_0200))
            .unwrap();
        assert_eq!(quote.source, "override");
        assert_quote(&quote, 10.0, 20.0, 5.0, 2.5);

        // 目录 id key。
        let quote = store.quote("openai", "gpt-4o-mini", None).unwrap();
        assert_eq!(quote.source, "override");
        assert_quote(&quote, 3.0, 6.0, 1.5, 0.0);

        // `model` key + `currency: "CNY"` 直接人民币，不再乘 FX。
        let quote = store.quote("any-provider", "special-model", None).unwrap();
        assert_eq!(quote.source, "override");
        assert_quote(&quote, 2.0, 4.0, 0.0, 0.0);

        // 默认 USD 的 `model` key 走 FX。
        let quote = store.quote("other", "legacy-model", None).unwrap();
        assert_quote(&quote, 30.0, 50.0, 0.0, 0.0);

        // 未覆盖的模型仍走 seed，汇率用 override 的 10。
        let expected = seed_price("openai/gpt-5.6-sol");
        let quote = store.quote("openai", "gpt-5.6-sol", None).unwrap();
        assert_eq!(quote.source, "seed");
        approx(quote.input_cny_per_m, expected.input * 10.0);
        approx(quote.output_cny_per_m, expected.output * 10.0);
    }

    #[test]
    fn override_prices_models_missing_from_catalog() {
        let dir = temp_dir("override-new-model");
        write_overrides(
            &dir,
            r#"{"models": {"vendor/custom-model": {"in": 5.0, "out": 6.0, "currency": "CNY"}}}"#,
        );
        let store = store_in(&dir);
        let quote = store.quote("vendor", "custom-model", None).unwrap();
        assert_eq!(quote.source, "override");
        assert_quote(&quote, 5.0, 6.0, 0.0, 0.0);
    }

    #[test]
    fn invalid_override_is_ignored() {
        let dir = temp_dir("override-invalid");
        write_overrides(
            &dir,
            r#"{"models": {
                "openai/gpt-4o-mini": {"in": -1.0, "out": 2.0},
                "openai/gpt-4o": {"in": 1.0, "out": 2.0, "currency": "CNY"}
            }}"#,
        );
        let store = store_in(&dir);
        // 负价 override 被忽略，回退 seed 价。
        let expected = seed_price("openai/gpt-4o-mini");
        let quote = store.quote("openai", "gpt-4o-mini", None).unwrap();
        assert_eq!(quote.source, "seed");
        approx(quote.input_cny_per_m, expected.input * 7.0);
        // 合法 override 正常生效。
        let quote = store.quote("openai", "gpt-4o", None).unwrap();
        assert_eq!(quote.source, "override");
        approx(quote.input_cny_per_m, 1.0);
    }

    #[test]
    fn fx_priority_override_env_ledger_fallback() {
        // fallback：没有 override / env / ledger。
        let dir = temp_dir("fx-fallback");
        let store = store_in(&dir);
        let status = store.status();
        assert_eq!(status.fx_source, "fallback");
        approx(status.fx_cny_per_usd, 7.0);

        // ledger：读 config.exchangeRate。
        let dir = temp_dir("fx-ledger");
        write_ledger(&dir, r#"{"config":{"exchangeRate":7.35}}"#);
        let store = store_in(&dir);
        let status = store.status();
        assert_eq!(status.fx_source, "ledger");
        approx(status.fx_cny_per_usd, 7.35);
        let expected = seed_price("openai/gpt-4o-mini");
        approx(
            store
                .quote("openai", "gpt-4o-mini", None)
                .unwrap()
                .input_cny_per_m,
            expected.input * 7.35,
        );

        // 环境变量优先于 ledger。
        let store = store_with_env_fx(&dir, Some(7.5));
        let status = store.status();
        assert_eq!(status.fx_source, "env");
        approx(status.fx_cny_per_usd, 7.5);

        // override 里的 fxCnyPerUsd 优先级最高。
        write_overrides(&dir, r#"{"fxCnyPerUsd": 8.0, "models": {}}"#);
        let store = store_with_env_fx(&dir, Some(7.5));
        let status = store.status();
        assert_eq!(status.fx_source, "override");
        approx(status.fx_cny_per_usd, 8.0);

        // 非法 env / ledger 值不生效。
        let dir = temp_dir("fx-invalid");
        write_ledger(&dir, r#"{"config":{"exchangeRate":-1}}"#);
        let store = store_with_env_fx(&dir, Some(0.0));
        let status = store.status();
        assert_eq!(status.fx_source, "fallback");
        approx(status.fx_cny_per_usd, 7.0);

        // ledger 里字符串数字也接受；坏 JSON 回退。
        let dir = temp_dir("fx-string");
        write_ledger(&dir, r#"{"config":{"exchangeRate":"7.12"}}"#);
        let store = store_in(&dir);
        let status = store.status();
        assert_eq!(status.fx_source, "ledger");
        approx(status.fx_cny_per_usd, 7.12);
        let dir = temp_dir("fx-bad-ledger");
        write_ledger(&dir, "not json");
        let store = store_in(&dir);
        assert_eq!(store.status().fx_source, "fallback");
    }

    // -------------------- 目录匹配 --------------------

    #[test]
    fn catalog_matching_handles_ambiguity_and_case() {
        let dir = temp_dir("catalog");
        let store = store_in(&dir);
        store.apply_refresh_success(fixture_catalog(Some(now_ms())));

        // 两个 provider 都有同名模型：不指定 provider 时不猜。
        assert!(store.quote("", "fixture-model", None).is_none());
        // 指定 provider 精确命中。
        let quote = store.quote("acme", "fixture-model", None).unwrap();
        assert_quote(&quote, 0.5 * 7.0, 1.0 * 7.0, 0.1 * 7.0, 0.2 * 7.0);
        // provider / 模型大小写不敏感。
        let quote = store.quote("OpenAI", "Fixture-Model", None).unwrap();
        approx(quote.input_cny_per_m, 1.0 * 7.0);
        // 直接传目录 id 也能命中。
        let quote = store.quote("", "acme/fixture-model", None).unwrap();
        approx(quote.input_cny_per_m, 0.5 * 7.0);
    }

    #[test]
    fn quote_prefers_override_over_deepseek_official() {
        let dir = temp_dir("override-official");
        write_overrides(
            &dir,
            r#"{"models": {"deepseek-v4-pro": {"in": 2.0, "out": 3.0, "currency": "CNY"}}}"#,
        );
        let store = store_in(&dir);
        let quote = store
            .quote("deepseek-official", "deepseek-v4-pro", Some(TUE_PEAK_0200))
            .unwrap();
        assert_eq!(quote.source, "override");
        assert_quote(&quote, 2.0, 3.0, 0.0, 0.0);
        // 未覆盖的官方模型仍走内置表。
        let quote = store
            .quote("deepseek-official", "deepseek-v4.1-flash", None)
            .unwrap();
        assert_eq!(quote.source, "deepseek-official");
    }

    // -------------------- 契约（序列化 / trait） --------------------

    #[test]
    fn status_and_quote_serialize_for_frontend() {
        let dir = temp_dir("serde");
        let store = store_in(&dir);
        let json = serde_json::to_value(store.status()).unwrap();
        for key in [
            "source",
            "updatedAt",
            "lastAttemptAt",
            "lastError",
            "stale",
            "autoRefresh",
            "modelCount",
            "fxCnyPerUsd",
            "fxSource",
            "mobileModels",
        ] {
            assert!(json.get(key).is_some(), "PricingStatus 缺少 {key}");
        }
        // 契约要求 PricingStatus 可 Default（token_usage 会构造默认值）。
        let _default: PricingStatus = PricingStatus::default();
        // PriceQuote 字段名（Serde camelCase）与来源枚举。
        let quote = store.quote("openai", "gpt-4o-mini", None).unwrap();
        let value = serde_json::to_value(&quote).unwrap();
        for key in [
            "inputCnyPerM",
            "outputCnyPerM",
            "cacheReadCnyPerM",
            "cacheWriteCnyPerM",
            "source",
        ] {
            assert!(value.get(key).is_some(), "PriceQuote 缺少 {key}");
        }
        // PriceLookup trait 对象可用（token_usage 依赖 Arc<dyn PriceLookup>）。
        let lookup: std::sync::Arc<dyn PriceLookup> = std::sync::Arc::new(store);
        assert!(lookup.quote("openai", "gpt-4o-mini", None).is_some());
    }
}
