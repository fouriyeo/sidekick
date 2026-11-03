//! DSH 联动桥：回环 HTTP 接收插件状态 → 聚合 → WS 广播 / Tauri 事件。
//!
//! 数据流：
//! `DSH 插件 --POST /hook/dsh--> 127.0.0.1:47815-47819 --> HookBridge`
//! `HookBridge --broadcast StatusMessage--> /ws 上的手机`
//! `HookBridge --emit "dsh-hook-status"--> 桌面设置页`
//!
//! - 只监听回环地址，Token 走 `Authorization: Bearer <token>`；
//! - `completed` 只保持 [`COMPLETED_HOLD`]，到点自动广播 `resume` 稳定态；
//! - [`HEARTBEAT_TIMEOUT`] 没收到任何上报就视为掉线，广播 idle 让宠物复位；
//! - 新 WS 连接先直发一次快照，手机 `status.request` 也会补发快照。

use std::collections::VecDeque;
use std::io::Read;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::{Notify, broadcast};

use crate::dsh_hook_install::{self, DshHookConfig, Layout};

/// Sidekick AI 状态协议的版本。
pub const PROTOCOL_VERSION: u8 = 1;
/// `completed` 状态保持时长，之后广播 `resume`。
pub const COMPLETED_HOLD: Duration = Duration::from_secs(3);
/// 超过这么久没收到任何上报就认为 DSH 掉线。
pub const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(15);
/// 桌面保留的最近事件条数。
pub const RECENT_LIMIT: usize = 20;
/// 插件 POST body 上限（64 KB，需容纳最多 50 条会话摘要）。
pub const MAX_BODY_BYTES: usize = 65_536;
/// 单个状态里 sessions 的展示上限，防止异常值撑爆 UI。
pub const MAX_SESSIONS: u32 = 999;
/// 广播/快照里会话列表上限（与 TS/Rust/插件一致）。
pub const MAX_SESSION_LIST: usize = 50;
/// 会话标题最大字符数，按 Unicode 码点计。
pub const MAX_SESSION_TITLE_CHARS: usize = 80;
/// 单个会话 id 的最大字符数。
pub const MAX_SESSION_ID_CHARS: usize = 128;
/// 回环端口候选，按顺序挑第一个能绑定的。
pub const LOOPBACK_PORTS: [u16; 5] = [47815, 47816, 47817, 47818, 47819];
/// 回环监听地址（绝对不监听 0.0.0.0）。
pub const LOOPBACK_HOST: &str = "127.0.0.1";
/// 插件 POST 的路径。
pub const HOOK_PATH: &str = "/hook/dsh";
/// 桌面 UI 订阅的状态事件名。
pub const EVENT_NAME: &str = "dsh-hook-status";
/// 后台 tick 间隔（completed 到期 / 心跳超时检查）。
const TICK_INTERVAL: Duration = Duration::from_millis(250);
/// 运行中 profile 的检测缓存时长，避免每次状态变化都 spawn `ps`。
const PROFILE_SCAN_TTL: Duration = Duration::from_secs(2);

// ---------------------------------------------------------------------------
// 协议类型
// ---------------------------------------------------------------------------

/// 四态：idle（静态）/ working（工作中）/ asking（等你决定）/ completed（刚完成）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StatusState {
    Idle,
    Working,
    Asking,
    Completed,
}

impl StatusState {
    #[cfg(test)]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "idle" => Some(Self::Idle),
            "working" => Some(Self::Working),
            "asking" => Some(Self::Asking),
            "completed" => Some(Self::Completed),
            _ => None,
        }
    }

    /// completed 是瞬态，其余是稳定态。
    pub fn is_stable(self) -> bool {
        self != Self::Completed
    }
}

/// 状态来源：真实 DSH 上报或桌面「模拟」按钮。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StatusSource {
    Dsh,
    Test,
}

/// 单条会话的稳定态；completed 由 `completed_at` 推导，不进会话状态。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionState {
    #[default]
    Idle,
    Working,
    Asking,
}

/// 正在等待用户回答的类型。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AskKind {
    Approval,
    Question,
}

/// 插件上报的单条会话摘要（camelCase，宽松解析；非法项归一化时丢弃）。
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingSession {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub state: SessionState,
    #[serde(default)]
    pub ask_kind: Option<AskKind>,
    #[serde(default)]
    pub last_event_at: u64,
    #[serde(default)]
    pub completed_at: Option<u64>,
}

/// 广播/快照里的一条会话摘要（camelCase）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: Option<String>,
    /// P0 只有 `dsh`；后续接入其它来源时再扩展。
    pub source: &'static str,
    pub state: SessionState,
    pub ask_kind: Option<AskKind>,
    pub last_event_at: u64,
    pub completed_at: Option<u64>,
}

/// 插件 POST 上来的消息。未知 type / 非法 state 直接反序列化失败。
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum IncomingHook {
    Hello {
        #[serde(rename = "pluginVersion")]
        plugin_version: u64,
        profile: String,
        #[serde(default)]
        ts: Option<u64>,
    },
    State {
        state: StatusState,
        #[serde(default)]
        sessions: u32,
        #[serde(default)]
        resume: Option<StatusState>,
        #[serde(default, rename = "sessionList")]
        session_list: Vec<IncomingSession>,
        #[serde(default)]
        ts: Option<u64>,
    },
    Heartbeat {
        state: StatusState,
        #[serde(default)]
        sessions: u32,
        #[serde(default)]
        resume: Option<StatusState>,
        #[serde(default, rename = "sessionList")]
        session_list: Vec<IncomingSession>,
        #[serde(default)]
        ts: Option<u64>,
    },
}

/// 广播给手机 / 新 WS 客户端的 AI 状态消息。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusMessage {
    #[serde(rename = "type")]
    pub message_type: &'static str,
    pub v: u8,
    pub source: StatusSource,
    pub state: StatusState,
    pub sessions: u32,
    pub resume: Option<StatusState>,
    pub remaining_ms: Option<u64>,
    /// 顶层会话列表；空列表也会显式发送（旧手机忽略该字段）。
    pub session_list: Vec<SessionSummary>,
    pub ts: u64,
}

impl StatusMessage {
    fn new(
        source: StatusSource,
        state: StatusState,
        sessions: u32,
        resume: Option<StatusState>,
        remaining_ms: Option<u64>,
        session_list: Vec<SessionSummary>,
    ) -> Self {
        Self {
            message_type: "status",
            v: PROTOCOL_VERSION,
            source,
            state,
            sessions,
            resume,
            remaining_ms,
            session_list,
            ts: now_ms(),
        }
    }
}

/// 桌面最近事件（设置页展示用）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEvent {
    pub at: u64,
    pub state: StatusState,
    pub sessions: u32,
    pub source: StatusSource,
}

/// 一个 DSH profile 的展示信息。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DshProfileInfo {
    pub name: String,
    pub label: String,
    pub active: bool,
    pub installed: bool,
}

/// `dsh_hook_status` / `dsh-hook-status` 事件的返回结构。
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DshHookStatus {
    pub installed: bool,
    pub enabled: bool,
    pub connected: bool,
    pub profile: Option<String>,
    pub current_state: StatusState,
    pub sessions: u32,
    pub last_event_at: Option<u64>,
    pub last_heartbeat_at: Option<u64>,
    pub plugin_version: Option<u64>,
    pub endpoint: Option<String>,
    pub config_path: String,
    pub plugin_path: Option<String>,
    pub patch_path: Option<String>,
    pub error: Option<String>,
    pub recent_events: Vec<StatusEvent>,
    pub profiles: Vec<DshProfileInfo>,
}

// ---------------------------------------------------------------------------
// 内部状态
// ---------------------------------------------------------------------------

struct CompletedHold {
    resume: StatusState,
    deadline: Instant,
    source: StatusSource,
}

struct BridgeInner {
    enabled: bool,
    connected: bool,
    current: StatusState,
    source: StatusSource,
    sessions: u32,
    session_list: Vec<SessionSummary>,
    last_event_at: Option<u64>,
    last_heartbeat_at: Option<u64>,
    plugin_version: Option<u64>,
    last_seen: Option<Instant>,
    recent: VecDeque<StatusEvent>,
    completed: Option<CompletedHold>,
    last_error: Option<String>,
}

/// DSH 联动桥，桌面端单例。
pub struct HookBridge {
    app: Option<AppHandle>,
    layout: Layout,
    token: String,
    tx: broadcast::Sender<String>,
    inner: Mutex<BridgeInner>,
    endpoint: Mutex<Option<String>>,
    endpoint_ready: Notify,
    /// 串行化 config.json 的读改写（安装 / 开关 / 卸载 / 回环就绪）。
    config_write_lock: Mutex<()>,
    /// 运行中 profile 检测缓存：(检测时间, 结果)。
    running_cache: Mutex<Option<(Instant, Option<String>)>>,
}

impl HookBridge {
    /// 生产构造：解析 DSH home、读已有 config、生成/复用 token。
    pub fn new(app: AppHandle) -> Arc<Self> {
        let layout = Layout::discover();
        let config = dsh_hook_install::read_config(&layout.config_path());
        Self::build(Some(app), layout, config)
    }

    fn build(
        app: Option<AppHandle>,
        layout: Layout,
        config: Result<Option<DshHookConfig>, String>,
    ) -> Arc<Self> {
        let (config_error, config) = match config {
            Ok(config) => (None, config),
            Err(error) => (Some(error), None),
        };
        let token = config
            .as_ref()
            .map(|config| config.token.clone())
            .filter(|token| !token.is_empty())
            .unwrap_or_else(generate_token);
        let enabled = config
            .as_ref()
            .map(|config| config.enabled)
            .unwrap_or(false);
        let (tx, _rx) = broadcast::channel::<String>(64);

        Arc::new(Self {
            app,
            layout,
            token,
            tx,
            inner: Mutex::new(BridgeInner {
                enabled,
                connected: false,
                current: StatusState::Idle,
                source: StatusSource::Dsh,
                sessions: 0,
                session_list: Vec::new(),
                last_event_at: None,
                last_heartbeat_at: None,
                plugin_version: None,
                last_seen: None,
                recent: VecDeque::new(),
                completed: None,
                last_error: config_error,
            }),
            endpoint: Mutex::new(None),
            endpoint_ready: Notify::new(),
            config_write_lock: Mutex::new(()),
            running_cache: Mutex::new(None),
        })
    }

    /// 启动回环监听与后台 tick（在桌面 setup 里调用一次）。
    pub fn start(self: &Arc<Self>) {
        let listener_bridge = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            Self::run_listener(listener_bridge).await;
        });
        let ticker_bridge = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            Self::run_ticker(ticker_bridge).await;
        });
    }

    #[cfg(test)]
    pub fn layout(&self) -> &Layout {
        &self.layout
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    pub fn sender(&self) -> broadcast::Sender<String> {
        self.tx.clone()
    }

    pub fn endpoint(&self) -> Option<String> {
        self.endpoint.lock().unwrap().clone()
    }

    pub fn is_enabled(&self) -> bool {
        self.inner.lock().unwrap().enabled
    }

    async fn run_ticker(bridge: Arc<Self>) {
        let mut interval = tokio::time::interval(TICK_INTERVAL);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            bridge.tick(Instant::now());
        }
    }

    async fn run_listener(bridge: Arc<Self>) {
        Self::run_listener_on(bridge, &LOOPBACK_PORTS).await;
    }

    async fn run_listener_on(bridge: Arc<Self>, ports: &[u16]) {
        for port in ports {
            let addr = SocketAddr::from(([127, 0, 0, 1], *port));
            let listener = match TcpListener::bind(addr).await {
                Ok(listener) => listener,
                Err(_) => continue,
            };
            let bound_port = listener
                .local_addr()
                .map(|addr| addr.port())
                .unwrap_or(*port);

            let endpoint = format!("http://{LOOPBACK_HOST}:{bound_port}{HOOK_PATH}");
            bridge.on_endpoint(endpoint.clone());
            println!("[dsh-hook] listening on {endpoint}");

            let app = Router::new()
                .route(HOOK_PATH, post(hook_handler))
                .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
                .with_state(Arc::clone(&bridge));
            if let Err(error) = axum::serve(listener, app).await {
                eprintln!("[dsh-hook] 回环监听异常: {error}");
                bridge.set_error(format!("回环监听异常: {error}"));
            }
            return;
        }

        eprintln!("[dsh-hook] 回环端口 {LOOPBACK_PORTS:?} 都被占用，AI 联动无法接收状态");
        bridge.set_error(format!(
            "回环端口 {} 都被占用，AI 联动无法接收状态",
            LOOPBACK_PORTS
                .iter()
                .map(u16::to_string)
                .collect::<Vec<_>>()
                .join(" / ")
        ));
    }

    fn set_error(&self, error: String) {
        self.inner.lock().unwrap().last_error = Some(error);
    }

    async fn wait_endpoint(&self, timeout: Duration) -> Option<String> {
        if let Some(endpoint) = self.endpoint() {
            return Some(endpoint);
        }
        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let notified = self.endpoint_ready.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();

            if let Some(endpoint) = self.endpoint() {
                return Some(endpoint);
            }
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return self.endpoint();
            }
            if tokio::time::timeout(remaining, &mut notified)
                .await
                .is_err()
            {
                return self.endpoint();
            }
        }
    }

    /// 回环端口绑定成功后：记录 endpoint、通知等待者，并把实际 endpoint 写回
    /// 已安装的 config.json（端口可能和上次不同）。
    fn on_endpoint(self: &Arc<Self>, endpoint: String) {
        {
            let mut current = self.endpoint.lock().unwrap();
            *current = Some(endpoint.clone());
        }
        self.endpoint_ready.notify_waiters();

        let _guard = self.config_write_lock.lock().unwrap();
        let config_path = self.layout.config_path();
        match dsh_hook_install::read_config(&config_path) {
            Ok(Some(mut config)) => {
                let mut changed = false;
                if config.endpoint != endpoint {
                    config.endpoint = endpoint;
                    changed = true;
                }
                if config.token.is_empty() {
                    config.token = self.token.clone();
                    changed = true;
                }
                if changed && let Err(error) = dsh_hook_install::write_config(&config_path, &config)
                {
                    eprintln!("[dsh-hook] 回写 endpoint 失败: {error}");
                    self.set_error(error);
                }
                self.inner.lock().unwrap().enabled = config.enabled;
            }
            Ok(None) => {}
            Err(error) => {
                eprintln!("[dsh-hook] 读取配置失败: {error}");
                self.set_error(error);
            }
        }
    }

    /// 处理一条插件上报；返回需要广播的 status（hello 只有在线状态变化时不广播）。
    pub fn ingest(&self, incoming: IncomingHook, now: Instant) -> Option<StatusMessage> {
        let mut message = None;
        let mut emit = false;

        {
            let mut inner = self.inner.lock().unwrap();
            match incoming {
                IncomingHook::Hello {
                    plugin_version,
                    profile: _,
                    ts: _,
                } => {
                    let was_connected = inner.connected;
                    inner.connected = true;
                    inner.last_seen = Some(now);
                    inner.last_heartbeat_at = Some(now_ms());
                    inner.plugin_version = Some(plugin_version);
                    if !was_connected {
                        // 刚上线：清空旧列表并广播 idle，让手机丢掉上一段会话。
                        inner.current = StatusState::Idle;
                        inner.source = StatusSource::Dsh;
                        inner.sessions = 0;
                        inner.completed = None;
                        inner.session_list.clear();
                        message = Some(StatusMessage::new(
                            StatusSource::Dsh,
                            StatusState::Idle,
                            0,
                            None,
                            None,
                            Vec::new(),
                        ));
                    }
                    emit = true;
                }
                IncomingHook::State {
                    state,
                    sessions,
                    resume,
                    session_list,
                    ts: _,
                } => {
                    mark_alive(&mut inner, now);
                    message = Some(apply_incoming_state(
                        &mut inner,
                        state,
                        sessions.min(MAX_SESSIONS),
                        resume,
                        StatusSource::Dsh,
                        now,
                        normalize_session_list(session_list),
                    ));
                    emit = true;
                }
                IncomingHook::Heartbeat {
                    state,
                    sessions,
                    resume,
                    session_list,
                    ts: _,
                } => {
                    mark_alive(&mut inner, now);
                    let sessions = sessions.min(MAX_SESSIONS);
                    let session_list = normalize_session_list(session_list);
                    let list_changed = session_list != inner.session_list;
                    let changed = match &inner.completed {
                        // completed 展示期内心跳不打断（心跳里的 state 是 resume 态），
                        // 只有列表/状态真的变了才广播一条 completed + 剩余时间 + 新列表。
                        Some(hold) => !state.is_stable() || state != hold.resume || list_changed,
                        None => {
                            state != inner.current || sessions != inner.sessions || list_changed
                        }
                    };
                    if changed {
                        message = Some(apply_incoming_state(
                            &mut inner,
                            state,
                            sessions,
                            resume,
                            StatusSource::Dsh,
                            now,
                            session_list,
                        ));
                        emit = true;
                    }
                }
            }
        }

        if let Some(message) = &message {
            self.send_status(message);
        }
        if emit {
            self.emit_status();
        }
        message
    }

    /// 后台 tick：completed 到期广播 resume；心跳超时广播 idle。
    pub fn tick(&self, now: Instant) -> Vec<StatusMessage> {
        let mut messages = Vec::new();
        {
            let mut inner = self.inner.lock().unwrap();

            let expired = inner
                .completed
                .as_ref()
                .map(|hold| now >= hold.deadline)
                .unwrap_or(false);
            if expired {
                let hold = inner.completed.take().unwrap();
                inner.current = hold.resume;
                inner.source = hold.source;
                inner.last_event_at = Some(now_ms());
                let sessions = inner.sessions;
                let session_list = inner.session_list.clone();
                push_recent(
                    &mut inner,
                    StatusEvent {
                        at: now_ms(),
                        state: hold.resume,
                        sessions,
                        source: hold.source,
                    },
                );
                messages.push(StatusMessage::new(
                    hold.source,
                    hold.resume,
                    sessions,
                    None,
                    None,
                    session_list,
                ));
            }

            let timed_out = inner.connected
                && inner
                    .last_seen
                    .map(|seen| now.saturating_duration_since(seen) > HEARTBEAT_TIMEOUT)
                    .unwrap_or(false);
            if timed_out {
                inner.connected = false;
                inner.current = StatusState::Idle;
                inner.source = StatusSource::Dsh;
                inner.sessions = 0;
                inner.session_list.clear();
                inner.completed = None;
                inner.last_event_at = Some(now_ms());
                push_recent(
                    &mut inner,
                    StatusEvent {
                        at: now_ms(),
                        state: StatusState::Idle,
                        sessions: 0,
                        source: StatusSource::Dsh,
                    },
                );
                messages.push(StatusMessage::new(
                    StatusSource::Dsh,
                    StatusState::Idle,
                    0,
                    None,
                    None,
                    Vec::new(),
                ));
            }
        }

        for message in &messages {
            self.send_status(message);
        }
        if !messages.is_empty() {
            self.emit_status();
        }
        messages
    }

    /// 新 WS 连接 / status.request 用的当前状态快照（JSON 字符串）。
    pub fn snapshot_json(&self) -> String {
        let inner = self.inner.lock().unwrap();
        let now = Instant::now();
        let (state, sessions, resume, remaining_ms, source) = match &inner.completed {
            Some(hold) => (
                StatusState::Completed,
                inner.sessions,
                Some(hold.resume),
                Some(hold.deadline.saturating_duration_since(now).as_millis() as u64),
                hold.source,
            ),
            None => (inner.current, inner.sessions, None, None, inner.source),
        };
        let message = StatusMessage::new(
            source,
            state,
            sessions,
            resume,
            remaining_ms,
            inner.session_list.clone(),
        );
        serde_json::to_string(&message).unwrap_or_default()
    }

    /// 桌面设置页 / 事件用的完整状态。
    pub fn status(&self) -> DshHookStatus {
        let config_path = self.layout.config_path();
        let config_result = dsh_hook_install::read_config(&config_path);
        let config_error = config_result.as_ref().err().cloned();
        let config = config_result.ok().flatten();

        if let Some(config) = &config {
            self.inner.lock().unwrap().enabled = config.enabled;
        }

        let running = self.running_profile();
        let effective_profile = config
            .as_ref()
            .map(|config| config.profile.clone())
            .or_else(|| running.clone())
            .or_else(|| Some(dsh_hook_install::DEFAULT_PROFILE.to_string()));
        let installed = config
            .as_ref()
            .map(|config| self.layout.installed(&config.profile))
            .unwrap_or(false);
        let profiles = self.profiles(config.as_ref(), running.as_deref());
        let endpoint = self
            .endpoint()
            .or_else(|| config.as_ref().map(|config| config.endpoint.clone()));
        let plugin_path = effective_profile
            .as_ref()
            .map(|profile| self.layout.plugin_path(profile).display().to_string());
        let patch_path = effective_profile
            .as_ref()
            .map(|profile| self.layout.patch_path(profile).display().to_string());

        let inner = self.inner.lock().unwrap();
        let error = inner.last_error.clone().or(config_error);
        DshHookStatus {
            installed,
            enabled: inner.enabled,
            connected: inner.connected,
            profile: effective_profile,
            current_state: inner.current,
            sessions: inner.sessions,
            last_event_at: inner.last_event_at,
            last_heartbeat_at: inner.last_heartbeat_at,
            plugin_version: inner.plugin_version,
            endpoint,
            config_path: config_path.display().to_string(),
            plugin_path,
            patch_path,
            error,
            recent_events: inner.recent.iter().cloned().collect(),
            profiles,
        }
    }

    fn profiles(
        &self,
        config: Option<&DshHookConfig>,
        running: Option<&str>,
    ) -> Vec<DshProfileInfo> {
        let mut entries = dsh_hook_install::list_profiles(&self.layout);
        if let Some(config) = config
            && !entries.iter().any(|entry| entry.name == config.profile)
        {
            entries.push(dsh_hook_install::ProfileEntry {
                installed: self.layout.plugin_installed(&config.profile),
                name: config.profile.clone(),
            });
        }
        if entries.is_empty() {
            let name = dsh_hook_install::DEFAULT_PROFILE.to_string();
            entries.push(dsh_hook_install::ProfileEntry {
                installed: self.layout.plugin_installed(&name),
                name,
            });
        }
        entries
            .into_iter()
            .map(|entry| {
                let active = match running {
                    Some(name) => name == entry.name,
                    None => config
                        .map(|config| config.profile == entry.name)
                        .unwrap_or(entry.name == dsh_hook_install::DEFAULT_PROFILE),
                };
                DshProfileInfo {
                    label: dsh_hook_install::profile_label(&entry.name),
                    installed: entry.installed,
                    active,
                    name: entry.name,
                }
            })
            .collect()
    }

    fn running_profile(&self) -> Option<String> {
        let now = Instant::now();
        {
            let cache = self.running_cache.lock().unwrap();
            if let Some((at, value)) = cache.as_ref()
                && now.saturating_duration_since(*at) < PROFILE_SCAN_TTL
            {
                return value.clone();
            }
        }
        let value = dsh_hook_install::running_dsh_profile();
        *self.running_cache.lock().unwrap() = Some((now, value.clone()));
        value
    }

    /// 安装/修复：写插件脚本、patch 标记块与 config。
    pub fn install(&self, profile: &str, endpoint: &str) -> Result<(), String> {
        let _guard = self.config_write_lock.lock().unwrap();
        let config_path = self.layout.config_path();
        let previous = dsh_hook_install::read_config(&config_path)?;
        let enabled = previous
            .as_ref()
            .map(|config| config.enabled)
            .unwrap_or(true);
        let config = DshHookConfig {
            version: dsh_hook_install::CONFIG_VERSION,
            enabled,
            profile: profile.trim().to_string(),
            endpoint: endpoint.to_string(),
            token: self.token.clone(),
        };
        let report = dsh_hook_install::install(&self.layout, profile, &config)?;
        {
            let mut inner = self.inner.lock().unwrap();
            inner.enabled = enabled;
            inner.last_error = None;
        }
        drop(_guard);

        println!(
            "[dsh-hook] installed profile={} updated={} plugin={} patch={}",
            report.profile,
            report.patch_updated,
            report.plugin_path.display(),
            report.patch_path.display()
        );
        self.emit_status();
        Ok(())
    }

    /// 只切换 config.enabled；关闭时立刻广播 idle 并标记掉线。
    pub fn set_enabled(&self, enabled: bool) -> Result<(), String> {
        let _guard = self.config_write_lock.lock().unwrap();
        let config_path = self.layout.config_path();
        let mut config = dsh_hook_install::read_config(&config_path)?
            .ok_or_else(|| "还没安装 AI 联动，请先安装".to_string())?;
        config.enabled = enabled;
        if let Some(endpoint) = self.endpoint() {
            config.endpoint = endpoint;
        }
        config.token = self.token.clone();
        dsh_hook_install::write_config(&config_path, &config)?;

        if !enabled {
            let mut inner = self.inner.lock().unwrap();
            inner.enabled = false;
            inner.connected = false;
            inner.current = StatusState::Idle;
            inner.source = StatusSource::Dsh;
            inner.sessions = 0;
            inner.session_list.clear();
            inner.completed = None;
            inner.last_seen = None;
        } else {
            self.inner.lock().unwrap().enabled = true;
        }
        drop(_guard);

        if !enabled {
            let message = StatusMessage::new(
                StatusSource::Dsh,
                StatusState::Idle,
                0,
                None,
                None,
                Vec::new(),
            );
            self.send_status(&message);
        }
        self.emit_status();
        Ok(())
    }

    /// 卸载：清 patch 标记块 → 删插件脚本 → 删 config，并广播 idle。
    pub fn remove(&self) -> Result<(), String> {
        let _guard = self.config_write_lock.lock().unwrap();
        let report = dsh_hook_install::uninstall(&self.layout)?;
        {
            let mut inner = self.inner.lock().unwrap();
            inner.enabled = false;
            inner.connected = false;
            inner.current = StatusState::Idle;
            inner.source = StatusSource::Dsh;
            inner.sessions = 0;
            inner.session_list.clear();
            inner.completed = None;
            inner.last_seen = None;
            inner.plugin_version = None;
            inner.last_event_at = None;
            inner.last_heartbeat_at = None;
            inner.recent.clear();
            inner.last_error = None;
        }
        drop(_guard);

        println!(
            "[dsh-hook] removed profiles={:?} patch={} plugin={} config={}",
            report.profiles, report.removed_patch, report.removed_plugin, report.removed_config
        );
        let message = StatusMessage::new(
            StatusSource::Dsh,
            StatusState::Idle,
            0,
            None,
            None,
            Vec::new(),
        );
        self.send_status(&message);
        self.emit_status();
        Ok(())
    }

    /// 本机模拟一次状态（source=test），走同一条广播链路。
    pub fn inject_test(&self, state: StatusState) -> StatusMessage {
        let message = {
            let mut inner = self.inner.lock().unwrap();
            let sessions = match state {
                StatusState::Idle | StatusState::Completed => 0,
                _ => inner.sessions.max(1),
            };
            let resume = (state == StatusState::Completed).then(|| {
                if inner.current.is_stable() {
                    inner.current
                } else {
                    StatusState::Idle
                }
            });
            let session_list = inner.session_list.clone();
            apply_state(
                &mut inner,
                state,
                sessions,
                resume,
                StatusSource::Test,
                Instant::now(),
                session_list,
            )
        };
        self.send_status(&message);
        self.emit_status();
        message
    }

    fn send_status(&self, message: &StatusMessage) {
        if let Ok(text) = serde_json::to_string(message) {
            let _ = self.tx.send(text);
        }
    }

    fn emit_status(&self) {
        let Some(app) = self.app.as_ref() else {
            return;
        };
        let status = self.status();
        let _ = app.emit(EVENT_NAME, status);
    }
}

fn mark_alive(inner: &mut BridgeInner, now: Instant) {
    inner.connected = true;
    inner.last_seen = Some(now);
    inner.last_heartbeat_at = Some(now_ms());
}

/// 收到 state/heartbeat 时应用状态；completed 展示期内只做「保持 + 刷新列表」，
/// 不打断 3 秒计时（见 [`apply_incoming_state`]）。
fn apply_incoming_state(
    inner: &mut BridgeInner,
    state: StatusState,
    sessions: u32,
    resume: Option<StatusState>,
    source: StatusSource,
    now: Instant,
    session_list: Vec<SessionSummary>,
) -> StatusMessage {
    let keep_hold = state.is_stable()
        && inner
            .completed
            .as_ref()
            .map(|hold| hold.resume == state)
            .unwrap_or(false);
    if keep_hold {
        // completed 保持期内：保留计时，只刷新列表/计数，并广播 completed + remainingMs。
        inner.sessions = sessions;
        inner.session_list = session_list;
        inner.last_event_at = Some(now_ms());
        let hold = inner.completed.as_ref().unwrap();
        let remaining_ms = hold.deadline.saturating_duration_since(now).as_millis() as u64;
        let broadcast_resume = Some(hold.resume);
        let broadcast_source = hold.source;
        return StatusMessage::new(
            broadcast_source,
            StatusState::Completed,
            sessions,
            broadcast_resume,
            Some(remaining_ms),
            inner.session_list.clone(),
        );
    }
    apply_state(inner, state, sessions, resume, source, now, session_list)
}

fn apply_state(
    inner: &mut BridgeInner,
    state: StatusState,
    sessions: u32,
    resume: Option<StatusState>,
    source: StatusSource,
    now: Instant,
    session_list: Vec<SessionSummary>,
) -> StatusMessage {
    let stable_previous = if inner.current.is_stable() {
        inner.current
    } else {
        inner
            .completed
            .as_ref()
            .map(|hold| hold.resume)
            .unwrap_or(StatusState::Idle)
    };

    let (broadcast_resume, remaining_ms) = if state == StatusState::Completed {
        let resume = resume
            .filter(|state| state.is_stable())
            .unwrap_or(stable_previous);
        inner.completed = Some(CompletedHold {
            resume,
            deadline: now + COMPLETED_HOLD,
            source,
        });
        (Some(resume), Some(COMPLETED_HOLD.as_millis() as u64))
    } else {
        inner.completed = None;
        (None, None)
    };

    inner.current = state;
    inner.source = source;
    inner.sessions = sessions;
    inner.session_list = session_list;
    inner.last_event_at = Some(now_ms());
    push_recent(
        inner,
        StatusEvent {
            at: now_ms(),
            state,
            sessions,
            source,
        },
    );
    StatusMessage::new(
        source,
        state,
        sessions,
        broadcast_resume,
        remaining_ms,
        inner.session_list.clone(),
    )
}

/// 标题清洗：单行、去控制字符、折叠空白、trim，按 Unicode 码点截断到 80；空 → None。
pub fn truncate_title(title: Option<&str>) -> Option<String> {
    let title = title?.trim();
    if title.is_empty() {
        return None;
    }
    let cleaned: String = title
        .chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return None;
    }
    Some(
        collapsed
            .chars()
            .take(MAX_SESSION_TITLE_CHARS)
            .collect::<String>(),
    )
}

/// 归一化插件上报的会话列表：丢弃非法/重复项、截断标题，最多保留 50 条。
pub fn normalize_session_list(list: Vec<IncomingSession>) -> Vec<SessionSummary> {
    let mut seen = std::collections::HashSet::new();
    let mut normalized = Vec::new();
    for raw in list {
        if normalized.len() >= MAX_SESSION_LIST {
            break;
        }
        let id = raw.id.trim().to_string();
        if id.is_empty() || id.chars().count() > MAX_SESSION_ID_CHARS {
            continue;
        }
        if let Some(source) = raw.source.as_deref()
            && source != "dsh"
        {
            continue;
        }
        if !seen.insert(id.clone()) {
            continue;
        }
        normalized.push(SessionSummary {
            id,
            title: truncate_title(raw.title.as_deref()),
            source: "dsh",
            state: raw.state,
            ask_kind: if raw.state == SessionState::Asking {
                raw.ask_kind
            } else {
                None
            },
            last_event_at: raw.last_event_at,
            completed_at: raw.completed_at,
        });
    }
    normalized
}

fn push_recent(inner: &mut BridgeInner, event: StatusEvent) {
    inner.recent.push_back(event);
    while inner.recent.len() > RECENT_LIMIT {
        inner.recent.pop_front();
    }
}

// ---------------------------------------------------------------------------
// 回环 HTTP
// ---------------------------------------------------------------------------

async fn hook_handler(
    State(bridge): State<Arc<HookBridge>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !authorize(&headers, bridge.token()) {
        return error_response(StatusCode::UNAUTHORIZED, "unauthorized");
    }
    if body.len() > MAX_BODY_BYTES {
        return error_response(StatusCode::PAYLOAD_TOO_LARGE, "body too large");
    }
    if !bridge.is_enabled() {
        return error_response(StatusCode::FORBIDDEN, "disabled");
    }
    let incoming = match parse_incoming(&body) {
        Ok(incoming) => incoming,
        Err(_) => return error_response(StatusCode::BAD_REQUEST, "bad request"),
    };
    bridge.ingest(incoming, Instant::now());
    Json(json!({ "ok": true })).into_response()
}

fn error_response(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

/// Bearer token 校验；首尾空白与空 token 一律拒绝。
pub fn authorize(headers: &HeaderMap, token: &str) -> bool {
    if token.is_empty() {
        return false;
    }
    let Some(value) = headers.get(header::AUTHORIZATION) else {
        return false;
    };
    let Ok(value) = value.to_str() else {
        return false;
    };
    let Some(bearer) = value.strip_prefix("Bearer ") else {
        return false;
    };
    !bearer.is_empty() && bearer.trim() == token
}

/// 解析插件 POST body；任何字段非法都返回 `Err`（调用方回 400，不广播）。
pub fn parse_incoming(bytes: &[u8]) -> Result<IncomingHook, String> {
    serde_json::from_slice(bytes).map_err(|error| format!("无效的 DSH 上报: {error}"))
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

/// 生成回环 token：优先 /dev/urandom，取不到时退回时间 + pid。
pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    if let Ok(mut file) = std::fs::File::open("/dev/urandom")
        && file.read_exact(&mut bytes).is_ok()
    {
        return hex(&bytes);
    }
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let mut state = (nanos as u64)
        ^ ((nanos >> 64) as u64)
        ^ u64::from(std::process::id())
        ^ 0x9E37_79B9_7F4A_7C15;
    let mut token = String::with_capacity(64);
    for _ in 0..4 {
        state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        token.push_str(&format!("{:016x}", state ^ (state >> 32)));
    }
    token
}

fn hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}

// ---------------------------------------------------------------------------
// Tauri 命令
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn dsh_hook_status(bridge: tauri::State<'_, Arc<HookBridge>>) -> DshHookStatus {
    bridge.status()
}

#[tauri::command]
pub async fn dsh_hook_install(
    bridge: tauri::State<'_, Arc<HookBridge>>,
    profile: String,
) -> Result<DshHookStatus, String> {
    let bridge = bridge.inner().clone();
    let profile = if profile.trim().is_empty() {
        dsh_hook_install::DEFAULT_PROFILE.to_string()
    } else {
        profile
    };
    let endpoint = bridge
        .wait_endpoint(Duration::from_secs(2))
        .await
        .ok_or_else(|| "AI 联动回环端口还没就绪，请稍后重试".to_string())?;
    bridge.install(&profile, &endpoint)?;
    Ok(bridge.status())
}

#[tauri::command]
pub fn dsh_hook_set_enabled(
    bridge: tauri::State<'_, Arc<HookBridge>>,
    enabled: bool,
) -> Result<DshHookStatus, String> {
    bridge.set_enabled(enabled)?;
    Ok(bridge.status())
}

#[tauri::command]
pub fn dsh_hook_remove(bridge: tauri::State<'_, Arc<HookBridge>>) -> Result<DshHookStatus, String> {
    bridge.remove()?;
    Ok(bridge.status())
}

#[tauri::command]
pub fn dsh_hook_test(
    bridge: tauri::State<'_, Arc<HookBridge>>,
    state: StatusState,
) -> Result<DshHookStatus, String> {
    bridge.inject_test(state);
    Ok(bridge.status())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    use axum::http::HeaderValue;

    static SEQUENCE: AtomicU64 = AtomicU64::new(1);

    struct TempDir(PathBuf);

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn test_bridge() -> (Arc<HookBridge>, TempDir) {
        let root = std::env::temp_dir().join(format!(
            "sidekick-dsh-hook-test-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let layout = Layout::new(root.clone());
        let bridge = HookBridge::build(None, layout, Ok(None));
        (bridge, TempDir(root))
    }

    fn state_message(state: &str, sessions: u32, resume: Option<StatusState>) -> IncomingHook {
        state_message_with_list(state, sessions, resume, Vec::new())
    }

    fn state_message_with_list(
        state: &str,
        sessions: u32,
        resume: Option<StatusState>,
        session_list: Vec<IncomingSession>,
    ) -> IncomingHook {
        IncomingHook::State {
            state: StatusState::parse(state).unwrap(),
            sessions,
            resume,
            session_list,
            ts: None,
        }
    }

    fn heartbeat(state: StatusState, sessions: u32) -> IncomingHook {
        heartbeat_with_list(state, sessions, Vec::new())
    }

    fn heartbeat_with_list(
        state: StatusState,
        sessions: u32,
        session_list: Vec<IncomingSession>,
    ) -> IncomingHook {
        IncomingHook::Heartbeat {
            state,
            sessions,
            resume: None,
            session_list,
            ts: None,
        }
    }

    fn incoming_session(id: &str, state: SessionState) -> IncomingSession {
        IncomingSession {
            id: id.to_string(),
            title: Some(format!("标题-{id}")),
            source: Some("dsh".to_string()),
            state,
            ask_kind: None,
            last_event_at: 1_000,
            completed_at: None,
        }
    }

    fn value(text: &str) -> serde_json::Value {
        serde_json::from_str(text).unwrap()
    }

    #[test]
    fn generates_hex_tokens() {
        let first = generate_token();
        let second = generate_token();
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|ch| ch.is_ascii_hexdigit()));
        assert_ne!(first, second);
    }

    #[test]
    fn parses_protocol_messages() {
        let hello =
            parse_incoming(br#"{"type":"hello","pluginVersion":1,"profile":"desktop","ts":1}"#)
                .unwrap();
        assert_eq!(
            hello,
            IncomingHook::Hello {
                plugin_version: 1,
                profile: "desktop".to_string(),
                ts: Some(1),
            }
        );

        let state = parse_incoming(
            br#"{"type":"state","state":"asking","sessions":2,"resume":null,"ts":9}"#,
        )
        .unwrap();
        assert_eq!(
            state,
            IncomingHook::State {
                state: StatusState::Asking,
                sessions: 2,
                resume: None,
                session_list: Vec::new(),
                ts: Some(9),
            }
        );

        let heartbeat = parse_incoming(
            br#"{"type":"heartbeat","state":"working","sessions":1,"resume":null,"ts":10}"#,
        )
        .unwrap();
        assert_eq!(
            heartbeat,
            IncomingHook::Heartbeat {
                state: StatusState::Working,
                sessions: 1,
                resume: None,
                session_list: Vec::new(),
                ts: Some(10),
            }
        );

        let completed = parse_incoming(
            br#"{"type":"state","state":"completed","sessions":1,"resume":"working"}"#,
        )
        .unwrap();
        assert!(matches!(
            completed,
            IncomingHook::State {
                state: StatusState::Completed,
                resume: Some(StatusState::Working),
                ..
            }
        ));
    }

    #[test]
    fn parses_session_list_with_camel_case_fields() {
        let parsed = parse_incoming(
            r#"{"type":"state","state":"asking","sessions":1,"resume":null,
                 "sessionList":[
                   {"id":"s1","title":"修复登录","source":"dsh","state":"asking",
                    "askKind":"question","lastEventAt":1730000000000,"completedAt":null},
                   {"id":"s2","title":null,"source":"dsh","state":"idle",
                    "askKind":null,"lastEventAt":1730000000001,"completedAt":1730000000002}
                 ],"ts":9}"#
                .as_bytes(),
        )
        .unwrap();
        let IncomingHook::State { session_list, .. } = parsed else {
            panic!("应为 state 消息");
        };
        assert_eq!(session_list.len(), 2);
        assert_eq!(session_list[0].id, "s1");
        assert_eq!(session_list[0].title.as_deref(), Some("修复登录"));
        assert_eq!(session_list[0].ask_kind, Some(AskKind::Question));
        assert_eq!(session_list[1].completed_at, Some(1_730_000_000_002));
        assert_eq!(session_list[1].state, SessionState::Idle);
    }

    #[test]
    fn normalizes_titles_ids_and_session_list_cap() {
        assert_eq!(
            truncate_title(Some("  修复\n登录\t问题  ")),
            Some("修复 登录 问题".to_string())
        );
        assert_eq!(truncate_title(Some("   ")), None);
        assert_eq!(truncate_title(None), None);
        let long = "中".repeat(MAX_SESSION_TITLE_CHARS + 20);
        let truncated = truncate_title(Some(&long)).unwrap();
        assert_eq!(truncated.chars().count(), MAX_SESSION_TITLE_CHARS);

        // 非法项丢弃、重复 id 去重、标题截断。
        let mut raw = vec![
            IncomingSession {
                id: "   ".to_string(),
                title: None,
                source: Some("dsh".to_string()),
                state: SessionState::Working,
                ask_kind: None,
                last_event_at: 1,
                completed_at: None,
            },
            IncomingSession {
                id: "dup".to_string(),
                title: Some("a".to_string()),
                source: Some("dsh".to_string()),
                state: SessionState::Working,
                ask_kind: None,
                last_event_at: 1,
                completed_at: None,
            },
            IncomingSession {
                id: "dup".to_string(),
                title: Some("b".to_string()),
                source: Some("dsh".to_string()),
                state: SessionState::Working,
                ask_kind: None,
                last_event_at: 2,
                completed_at: None,
            },
            IncomingSession {
                id: "other-source".to_string(),
                title: None,
                source: Some("claude-code".to_string()),
                state: SessionState::Working,
                ask_kind: None,
                last_event_at: 3,
                completed_at: None,
            },
            IncomingSession {
                id: "ask".to_string(),
                title: Some(long),
                source: None,
                state: SessionState::Asking,
                ask_kind: Some(AskKind::Approval),
                last_event_at: 4,
                completed_at: None,
            },
            IncomingSession {
                id: "idle-with-ask".to_string(),
                title: None,
                source: Some("dsh".to_string()),
                state: SessionState::Idle,
                ask_kind: Some(AskKind::Question),
                last_event_at: 5,
                completed_at: None,
            },
        ];
        // 再补 60 条合法会话，验证上限 50。
        for index in 0..60 {
            raw.push(IncomingSession {
                id: format!("bulk-{index}"),
                title: None,
                source: Some("dsh".to_string()),
                state: SessionState::Working,
                ask_kind: None,
                last_event_at: 10 + index,
                completed_at: None,
            });
        }
        let list = normalize_session_list(raw);
        assert_eq!(list.len(), MAX_SESSION_LIST);
        assert_eq!(list[0].id, "dup");
        assert_eq!(list[0].title.as_deref(), Some("a"));
        assert!(!list.iter().any(|entry| entry.id == "other-source"));
        assert!(!list.iter().any(|entry| entry.id == "   "));
        let ask = list.iter().find(|entry| entry.id == "ask").unwrap();
        assert_eq!(ask.source, "dsh");
        assert_eq!(ask.ask_kind, Some(AskKind::Approval));
        assert_eq!(
            ask.title.as_ref().unwrap().chars().count(),
            MAX_SESSION_TITLE_CHARS
        );
        let idle = list
            .iter()
            .find(|entry| entry.id == "idle-with-ask")
            .unwrap();
        assert_eq!(idle.ask_kind, None);
    }

    #[test]
    fn rejects_invalid_payloads() {
        assert!(parse_incoming(b"").is_err());
        assert!(parse_incoming(b"{}").is_err());
        assert!(parse_incoming(b"[1,2,3]").is_err());
        assert!(parse_incoming(br#"{"type":"nope"}"#).is_err());
        assert!(parse_incoming(br#"{"type":"state","state":"busy","sessions":1}"#).is_err());
        assert!(parse_incoming(br#"{"type":"state","sessions":1}"#).is_err());
        assert!(parse_incoming(br#"{"type":"hello","profile":"desktop"}"#).is_err());
        assert!(
            parse_incoming(br#"{"type":"hello","pluginVersion":"x","profile":"desktop"}"#).is_err()
        );
        assert!(parse_incoming(br#"{"type":"state","state":"idle","sessions":-1}"#).is_err());
    }

    #[test]
    fn validates_bearer_token() {
        let token = "0123456789abcdef";
        let mut headers = HeaderMap::new();
        assert!(!authorize(&headers, token));

        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer wrong"),
        );
        assert!(!authorize(&headers, token));

        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Basic 0123456789abcdef"),
        );
        assert!(!authorize(&headers, token));

        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_static("Bearer 0123456789abcdef"),
        );
        assert!(authorize(&headers, token));

        headers.insert(header::AUTHORIZATION, HeaderValue::from_static("Bearer "));
        assert!(!authorize(&headers, token));

        assert!(!authorize(&headers, ""));
    }

    #[test]
    fn snapshot_defaults_to_idle_status() {
        let (bridge, _temp) = test_bridge();
        let snapshot = value(&bridge.snapshot_json());
        assert_eq!(snapshot["type"], "status");
        assert_eq!(snapshot["v"], 1);
        assert_eq!(snapshot["source"], "dsh");
        assert_eq!(snapshot["state"], "idle");
        assert_eq!(snapshot["sessions"], 0);
        assert!(snapshot["resume"].is_null());
        assert!(snapshot["remainingMs"].is_null());
        assert!(snapshot["sessionList"].as_array().unwrap().is_empty());
        assert!(snapshot["ts"].as_u64().unwrap() > 0);
    }

    #[test]
    fn snapshot_carries_the_latest_session_list() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        bridge
            .ingest(
                state_message_with_list(
                    "working",
                    1,
                    None,
                    vec![incoming_session("s1", SessionState::Working)],
                ),
                start,
            )
            .unwrap();
        let snapshot = value(&bridge.snapshot_json());
        assert_eq!(snapshot["sessionList"].as_array().unwrap().len(), 1);
        assert_eq!(snapshot["sessionList"][0]["id"], "s1");
        assert_eq!(snapshot["sessionList"][0]["title"], "标题-s1");
        assert_eq!(snapshot["sessionList"][0]["source"], "dsh");
        assert_eq!(snapshot["sessionList"][0]["state"], "working");
        assert!(snapshot["sessionList"][0]["askKind"].is_null());
        assert_eq!(snapshot["sessionList"][0]["lastEventAt"], 1_000);
        assert!(snapshot["sessionList"][0]["completedAt"].is_null());
    }

    #[test]
    fn completed_pulse_holds_three_seconds_then_resumes() {
        let (bridge, _temp) = test_bridge();
        let mut receiver = bridge.tx.subscribe();
        let start = Instant::now();

        let working = bridge
            .ingest(state_message("working", 2, None), start)
            .expect("state 应有广播");
        assert_eq!(working.state, StatusState::Working);
        assert_eq!(working.sessions, 2);
        assert!(working.remaining_ms.is_none());
        assert_eq!(value(&receiver.try_recv().unwrap())["state"], "working");

        let completed = bridge
            .ingest(
                state_message("completed", 2, Some(StatusState::Working)),
                start + Duration::from_millis(500),
            )
            .expect("completed 应有广播");
        assert_eq!(completed.state, StatusState::Completed);
        assert_eq!(completed.resume, Some(StatusState::Working));
        assert_eq!(completed.remaining_ms, Some(3000));

        // deadline = start + 0.5s + 3s，3s 时还没到。
        assert!(bridge.tick(start + Duration::from_secs(3)).is_empty());
        let resumed = bridge.tick(start + Duration::from_secs(4));
        assert_eq!(resumed.len(), 1);
        assert_eq!(resumed[0].state, StatusState::Working);
        assert_eq!(resumed[0].resume, None);
        assert_eq!(resumed[0].remaining_ms, None);

        let snapshot = value(&bridge.snapshot_json());
        assert_eq!(snapshot["state"], "working");

        assert_eq!(value(&receiver.try_recv().unwrap())["state"], "completed");
        assert_eq!(value(&receiver.try_recv().unwrap())["state"], "working");
    }

    #[test]
    fn completed_without_resume_falls_back_to_previous_stable_state() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        bridge.ingest(state_message("asking", 1, None), start);
        let completed = bridge
            .ingest(state_message("completed", 1, None), start)
            .expect("completed 应有广播");
        assert_eq!(completed.resume, Some(StatusState::Asking));

        let messages = bridge.tick(start + Duration::from_secs(3));
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].state, StatusState::Asking);
    }

    #[test]
    fn completed_resume_ignores_invalid_resume_value() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        let completed = bridge
            .ingest(
                state_message("completed", 0, Some(StatusState::Completed)),
                start,
            )
            .expect("completed 应有广播");
        assert_eq!(completed.resume, Some(StatusState::Idle));
    }

    #[test]
    fn heartbeat_timeout_marks_disconnected_and_idle_and_clears_list() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();

        assert!(
            bridge
                .ingest(
                    heartbeat_with_list(
                        StatusState::Working,
                        1,
                        vec![incoming_session("s1", SessionState::Working)],
                    ),
                    start,
                )
                .is_some()
        );
        assert!(bridge.inner.lock().unwrap().connected);

        assert!(bridge.tick(start + Duration::from_secs(14)).is_empty());
        let messages = bridge.tick(start + Duration::from_secs(16));
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].state, StatusState::Idle);
        assert_eq!(messages[0].sessions, 0);
        assert_eq!(messages[0].source, StatusSource::Dsh);
        assert!(messages[0].session_list.is_empty());

        let inner = bridge.inner.lock().unwrap();
        assert!(!inner.connected);
        assert_eq!(inner.current, StatusState::Idle);
        assert_eq!(inner.sessions, 0);
        assert!(inner.session_list.is_empty());
    }

    #[test]
    fn activity_refreshes_heartbeat_timeout() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        bridge.ingest(state_message("working", 1, None), start);
        bridge.ingest(
            heartbeat(StatusState::Working, 1),
            start + Duration::from_secs(10),
        );
        assert!(bridge.tick(start + Duration::from_secs(20)).is_empty());
        let messages = bridge.tick(start + Duration::from_secs(26));
        assert_eq!(messages.len(), 1);
    }

    #[test]
    fn heartbeat_does_not_rebroadcast_unchanged_state() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        bridge.ingest(state_message("working", 1, None), start);
        let mut receiver = bridge.tx.subscribe();

        let result = bridge.ingest(
            heartbeat(StatusState::Working, 1),
            start + Duration::from_secs(5),
        );
        assert!(result.is_none());
        assert!(receiver.try_recv().is_err());
        assert!(bridge.inner.lock().unwrap().connected);
    }

    #[test]
    fn heartbeat_replaces_list_and_broadcasts_when_aggregate_unchanged() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        bridge
            .ingest(
                state_message_with_list(
                    "working",
                    1,
                    None,
                    vec![incoming_session("a", SessionState::Working)],
                ),
                start,
            )
            .unwrap();
        let mut receiver = bridge.tx.subscribe();

        let result = bridge
            .ingest(
                heartbeat_with_list(
                    StatusState::Working,
                    1,
                    vec![incoming_session("b", SessionState::Idle)],
                ),
                start + Duration::from_secs(5),
            )
            .expect("列表变化应广播");
        assert_eq!(result.state, StatusState::Working);
        assert_eq!(result.session_list.len(), 1);
        assert_eq!(result.session_list[0].id, "b");
        let broadcast = value(&receiver.try_recv().unwrap());
        assert_eq!(broadcast["state"], "working");
        assert_eq!(broadcast["sessionList"][0]["id"], "b");
        assert_eq!(
            bridge.inner.lock().unwrap().session_list[0].id.as_str(),
            "b"
        );
    }

    #[test]
    fn state_message_replaces_and_clears_the_list() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        let with_list = bridge
            .ingest(
                state_message_with_list(
                    "working",
                    1,
                    None,
                    vec![incoming_session("a", SessionState::Working)],
                ),
                start,
            )
            .unwrap();
        assert_eq!(with_list.session_list.len(), 1);

        let cleared = bridge
            .ingest(
                state_message_with_list("idle", 0, None, Vec::new()),
                start + Duration::from_secs(1),
            )
            .unwrap();
        assert!(cleared.session_list.is_empty());
        assert!(bridge.inner.lock().unwrap().session_list.is_empty());
    }

    #[test]
    fn heartbeat_during_completed_hold_keeps_pulse() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        bridge.ingest(state_message("working", 1, None), start);
        bridge.ingest(
            state_message("completed", 1, Some(StatusState::Working)),
            start,
        );
        let mut receiver = bridge.tx.subscribe();

        let result = bridge.ingest(
            heartbeat(StatusState::Working, 1),
            start + Duration::from_secs(1),
        );
        assert!(result.is_none());
        assert!(receiver.try_recv().is_err());
        assert_eq!(bridge.inner.lock().unwrap().current, StatusState::Completed);

        let resumed = bridge.tick(start + Duration::from_secs(3));
        assert_eq!(resumed.len(), 1);
        assert_eq!(resumed[0].state, StatusState::Working);
    }

    #[test]
    fn heartbeat_list_change_during_completed_hold_keeps_the_timer() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        bridge.ingest(
            state_message_with_list(
                "working",
                1,
                None,
                vec![incoming_session("a", SessionState::Working)],
            ),
            start,
        );
        bridge
            .ingest(
                state_message_with_list(
                    "completed",
                    1,
                    Some(StatusState::Working),
                    vec![incoming_session("a", SessionState::Idle)],
                ),
                start,
            )
            .unwrap();
        let mut receiver = bridge.tx.subscribe();

        // completed 保持期内只改列表：广播 completed + remainingMs + 新列表，不打断 3s 计时。
        let result = bridge
            .ingest(
                heartbeat_with_list(
                    StatusState::Working,
                    1,
                    vec![incoming_session("b", SessionState::Working)],
                ),
                start + Duration::from_secs(1),
            )
            .expect("completed 保持期内列表变化应广播");
        assert_eq!(result.state, StatusState::Completed);
        assert_eq!(result.resume, Some(StatusState::Working));
        let remaining = result.remaining_ms.unwrap();
        assert!((1..=3000).contains(&remaining));
        assert_eq!(result.session_list.len(), 1);
        assert_eq!(result.session_list[0].id, "b");
        assert_eq!(bridge.inner.lock().unwrap().current, StatusState::Completed);
        assert_eq!(value(&receiver.try_recv().unwrap())["state"], "completed");

        // 原 deadline 仍然生效（start + 3s），恢复成 working 并带最新列表。
        let resumed = bridge.tick(start + Duration::from_secs(3));
        assert_eq!(resumed.len(), 1);
        assert_eq!(resumed[0].state, StatusState::Working);
        assert_eq!(resumed[0].session_list[0].id, "b");
    }

    #[test]
    fn state_during_completed_hold_cancels_pulse() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        bridge.ingest(
            state_message("completed", 1, Some(StatusState::Working)),
            start,
        );
        let asking = bridge
            .ingest(
                state_message("asking", 2, None),
                start + Duration::from_millis(200),
            )
            .expect("state 应有广播");
        assert_eq!(asking.state, StatusState::Asking);
        assert!(bridge.inner.lock().unwrap().completed.is_none());
        assert!(bridge.tick(start + Duration::from_secs(5)).is_empty());
    }

    #[test]
    fn recent_events_are_capped() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        for index in 0..25 {
            let state = if index % 2 == 0 { "working" } else { "asking" };
            bridge.ingest(state_message(state, 1, None), start);
        }
        assert_eq!(bridge.inner.lock().unwrap().recent.len(), RECENT_LIMIT);
    }

    #[test]
    fn hello_on_fresh_connection_clears_list_and_broadcasts_idle() {
        let (bridge, _temp) = test_bridge();
        let start = Instant::now();
        // 模拟桥里残留了一段旧列表 + 掉线状态，插件重连（hello）应清空并广播 idle。
        {
            let mut inner = bridge.inner.lock().unwrap();
            inner.session_list =
                normalize_session_list(vec![incoming_session("old", SessionState::Working)]);
            inner.connected = false;
        }
        let mut receiver = bridge.tx.subscribe();
        let message = bridge.ingest(
            IncomingHook::Hello {
                plugin_version: 2,
                profile: "desktop".to_string(),
                ts: Some(1),
            },
            start + Duration::from_secs(1),
        );
        let message = message.expect("刚上线应广播 idle");
        assert_eq!(message.state, StatusState::Idle);
        assert_eq!(message.sessions, 0);
        assert!(message.session_list.is_empty());
        assert_eq!(value(&receiver.try_recv().unwrap())["state"], "idle");
        let inner = bridge.inner.lock().unwrap();
        assert!(inner.connected);
        assert_eq!(inner.plugin_version, Some(2));
        assert_eq!(inner.current, StatusState::Idle);
        assert!(inner.session_list.is_empty());
    }

    #[test]
    fn snapshot_while_completed_reports_remaining_time() {
        let (bridge, _temp) = test_bridge();
        bridge.ingest(
            state_message("completed", 2, Some(StatusState::Working)),
            Instant::now(),
        );
        let snapshot = value(&bridge.snapshot_json());
        assert_eq!(snapshot["state"], "completed");
        assert_eq!(snapshot["resume"], "working");
        assert_eq!(snapshot["sessions"], 2);
        let remaining = snapshot["remainingMs"].as_u64().unwrap();
        assert!((1..=3000).contains(&remaining));
    }

    #[test]
    fn test_injection_uses_test_source() {
        let (bridge, _temp) = test_bridge();
        let message = bridge.inject_test(StatusState::Asking);
        assert_eq!(message.source, StatusSource::Test);
        assert_eq!(message.state, StatusState::Asking);
        assert_eq!(message.sessions, 1);

        let snapshot = value(&bridge.snapshot_json());
        assert_eq!(snapshot["source"], "test");
        assert_eq!(snapshot["state"], "asking");

        let status = bridge.status();
        assert_eq!(status.current_state, StatusState::Asking);
        assert!(!status.connected);
        assert_eq!(
            status.recent_events.last().unwrap().source,
            StatusSource::Test
        );
    }

    #[test]
    fn bridge_install_writes_files_and_status_reports_installed() {
        let (bridge, _temp) = test_bridge();
        bridge
            .install("work", "http://127.0.0.1:47816/hook/dsh")
            .unwrap();

        let status = bridge.status();
        assert!(status.installed);
        assert!(status.enabled);
        assert_eq!(status.profile.as_deref(), Some("work"));
        assert_eq!(
            status.endpoint.as_deref(),
            Some("http://127.0.0.1:47816/hook/dsh")
        );
        assert!(
            status
                .profiles
                .iter()
                .any(|profile| profile.name == "work" && profile.installed)
        );

        let config = dsh_hook_install::read_config(&bridge.layout().config_path())
            .unwrap()
            .unwrap();
        assert_eq!(config.token, bridge.token());
        assert_eq!(config.profile, "work");
        assert!(config.enabled);
    }

    #[test]
    fn toggle_enabled_updates_config_and_broadcasts_idle() {
        let (bridge, _temp) = test_bridge();
        bridge
            .install("desktop", "http://127.0.0.1:47815/hook/dsh")
            .unwrap();
        bridge
            .ingest(
                state_message_with_list(
                    "working",
                    1,
                    None,
                    vec![incoming_session("s1", SessionState::Working)],
                ),
                Instant::now(),
            )
            .unwrap();
        let mut receiver = bridge.tx.subscribe();

        bridge.set_enabled(false).unwrap();
        let config = dsh_hook_install::read_config(&bridge.layout().config_path())
            .unwrap()
            .unwrap();
        assert!(!config.enabled);
        assert!(!bridge.status().enabled);
        let idle = value(&receiver.try_recv().unwrap());
        assert_eq!(idle["state"], "idle");
        assert!(idle["sessionList"].as_array().unwrap().is_empty());
        assert!(bridge.inner.lock().unwrap().session_list.is_empty());

        bridge.set_enabled(true).unwrap();
        assert!(bridge.status().enabled);
        let config = dsh_hook_install::read_config(&bridge.layout().config_path())
            .unwrap()
            .unwrap();
        assert!(config.enabled);
    }

    #[test]
    fn set_enabled_requires_install() {
        let (bridge, _temp) = test_bridge();
        assert!(bridge.set_enabled(false).is_err());
    }

    #[test]
    fn removing_clears_install_and_broadcasts_idle() {
        let (bridge, _temp) = test_bridge();
        bridge
            .install("desktop", "http://127.0.0.1:47815/hook/dsh")
            .unwrap();
        bridge
            .ingest(
                state_message_with_list(
                    "working",
                    1,
                    None,
                    vec![incoming_session("s1", SessionState::Working)],
                ),
                Instant::now(),
            )
            .unwrap();
        let mut receiver = bridge.tx.subscribe();

        bridge.remove().unwrap();
        assert!(!bridge.status().installed);
        assert!(!bridge.status().enabled);
        assert!(!bridge.layout().config_path().exists());
        let idle = value(&receiver.try_recv().unwrap());
        assert_eq!(idle["state"], "idle");
        assert!(idle["sessionList"].as_array().unwrap().is_empty());
        assert!(bridge.inner.lock().unwrap().session_list.is_empty());
    }

    fn http_post(port: u16, authorization: Option<&str>, body: &[u8]) -> String {
        use std::io::{Read, Write};

        let mut stream = std::net::TcpStream::connect((LOOPBACK_HOST, port)).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        let auth_header = authorization
            .map(|value| format!("Authorization: {value}\r\n"))
            .unwrap_or_default();
        let request = format!(
            "POST {HOOK_PATH} HTTP/1.1\r\nHost: {LOOPBACK_HOST}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{auth_header}Connection: close\r\n\r\n",
            body.len()
        );
        stream.write_all(request.as_bytes()).unwrap();
        stream.write_all(body).unwrap();
        let mut response = String::new();
        let _ = stream.read_to_string(&mut response).unwrap();
        response
    }

    #[test]
    fn loopback_accepts_authorized_status_and_rejects_bad_input() {
        let (bridge, _temp) = test_bridge();
        bridge
            .install("desktop", "http://127.0.0.1:0/hook/dsh")
            .unwrap();
        let runtime = tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .unwrap();
        let listener_bridge = Arc::clone(&bridge);
        runtime.spawn(async move {
            HookBridge::run_listener_on(listener_bridge, &[0]).await;
        });
        let endpoint = runtime
            .block_on(bridge.wait_endpoint(Duration::from_secs(3)))
            .expect("回环监听应就绪");
        let port: u16 = endpoint
            .trim_start_matches("http://")
            .split(':')
            .nth(1)
            .and_then(|value| value.split('/').next())
            .and_then(|value| value.parse().ok())
            .unwrap();
        let mut receiver = bridge.tx.subscribe();

        let body = br#"{"type":"state","state":"working","sessions":2,"resume":null,"ts":1}"#;
        let response = http_post(port, Some(&format!("Bearer {}", bridge.token())), body);
        assert!(response.starts_with("HTTP/1.1 200"), "{response}");
        assert_eq!(bridge.inner.lock().unwrap().current, StatusState::Working);
        let broadcast = value(&receiver.try_recv().unwrap());
        assert_eq!(broadcast["type"], "status");
        assert_eq!(broadcast["state"], "working");
        assert_eq!(broadcast["sessions"], 2);
        assert_eq!(broadcast["source"], "dsh");

        // 错误 token / 缺 token -> 401，且不改变状态。
        let response = http_post(port, Some("Bearer wrong-token"), body);
        assert!(response.starts_with("HTTP/1.1 401"), "{response}");
        let response = http_post(port, None, body);
        assert!(response.starts_with("HTTP/1.1 401"), "{response}");
        assert!(receiver.try_recv().is_err());

        // 非法 state -> 400，不广播。
        let response = http_post(
            port,
            Some(&format!("Bearer {}", bridge.token())),
            br#"{"type":"state","state":"busy","sessions":1}"#,
        );
        assert!(response.starts_with("HTTP/1.1 400"), "{response}");
        assert!(receiver.try_recv().is_err());

        // 超过 4 KB -> 413。
        let big = vec![b' '; MAX_BODY_BYTES + 100];
        let response = http_post(port, Some(&format!("Bearer {}", bridge.token())), &big);
        assert!(response.starts_with("HTTP/1.1 413"), "{response}");
        assert!(receiver.try_recv().is_err());

        // 关闭开关后 -> 403。
        bridge.set_enabled(false).unwrap();
        let _ = receiver.try_recv();
        let response = http_post(port, Some(&format!("Bearer {}", bridge.token())), body);
        assert!(response.starts_with("HTTP/1.1 403"), "{response}");
    }

    #[test]
    fn status_surfaces_config_errors() {
        let (bridge, _temp) = test_bridge();
        let config_path = bridge.layout().config_path();
        std::fs::create_dir_all(config_path.parent().unwrap()).unwrap();
        std::fs::write(&config_path, "{ broken").unwrap();

        let status = bridge.status();
        assert!(status.error.is_some());
        assert!(!status.installed);
    }
}
