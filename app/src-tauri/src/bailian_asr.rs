//! 百炼实时语音识别（Qwen-Audio-ASR-Streaming）客户端。
//!
//! 桌面端直连百炼 WebSocket：连接 → run-task → task-started → 二进制 PCM 音频
//! → result-generated（中间/最终句）→ finish-task → task-finished/task-failed。
//!
//! 本模块只负责“云端会话 + 文本组装 + 中间结果广播”，不直接写剪贴板；
//! 最终文本由 desktop_server 交给 desktop_mic 统一落字，保证“只插入一次”。

use std::collections::BTreeMap;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{Value, json};
use tokio::net::TcpStream;
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};

use crate::asr_config::KEYWORD_WEIGHT;
use crate::transcript::normalize_transcript;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const START_TIMEOUT: Duration = Duration::from_secs(3);
const FINISH_TIMEOUT: Duration = Duration::from_secs(8);
const PROBE_FINISH_TIMEOUT: Duration = Duration::from_secs(5);
const PARTIAL_INTERVAL: Duration = Duration::from_millis(50);
const SAMPLE_RATE: u32 = 16_000;

type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

#[derive(Clone, Debug)]
pub struct CloudSessionConfig {
    pub endpoint: String,
    pub api_key: String,
    pub model: String,
    pub language_hints: Vec<String>,
    pub keep_dialect: bool,
    pub vad_model: String,
    pub max_sentence_silence_ms: u32,
    pub heartbeat: bool,
    pub keywords: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CloudUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    pub audio_duration_ms: u64,
}

#[derive(Clone, Debug)]
pub struct CloudTranscript {
    pub text: String,
    pub truncated: bool,
    pub usage: Option<CloudUsage>,
}

#[derive(Clone, Debug)]
pub struct CloudError {
    pub code: &'static str,
    pub detail: String,
}

impl CloudError {
    pub fn new(code: &'static str, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }
}

#[derive(Debug)]
pub struct CloudOutcome {
    pub result: Result<CloudTranscript, CloudError>,
}

pub enum CloudInput {
    Frame(Vec<u8>),
    Stop,
    Abort,
}

pub struct CloudHandle {
    tx: mpsc::UnboundedSender<CloudInput>,
    outcome: oneshot::Receiver<CloudOutcome>,
}

impl CloudHandle {
    pub fn send_frame(&self, payload: Vec<u8>) -> bool {
        self.tx.send(CloudInput::Frame(payload)).is_ok()
    }

    pub fn stop(&self) {
        let _ = self.tx.send(CloudInput::Stop);
    }

    pub fn abort(&self) {
        let _ = self.tx.send(CloudInput::Abort);
    }

    /// 等待收尾结果；超时返回 cloud_timeout（调用方决定是否本机回退）。
    pub async fn wait(self) -> Result<CloudTranscript, CloudError> {
        match tokio::time::timeout(Duration::from_secs(9), self.outcome).await {
            Ok(Ok(CloudOutcome { result })) => result,
            // 任务 panic 时 outcome sender 被丢弃；这不是网络问题，单独成码便于排障。
            Ok(Err(_)) => Err(CloudError::new(
                "cloud_internal",
                "云端会话异常结束（内部错误）",
            )),
            Err(_) => Err(CloudError::new("cloud_timeout", "云端收尾超时")),
        }
    }
}

pub fn spawn(
    config: CloudSessionConfig,
    session: String,
    partial_tx: broadcast::Sender<String>,
) -> CloudHandle {
    let (tx, rx) = mpsc::unbounded_channel();
    let (outcome_tx, outcome_rx) = oneshot::channel();
    tokio::spawn(async move {
        let result = run_session(config, session, partial_tx, rx).await;
        let _ = outcome_tx.send(CloudOutcome { result });
    });
    CloudHandle {
        tx,
        outcome: outcome_rx,
    }
}

async fn run_session(
    config: CloudSessionConfig,
    session: String,
    partial_tx: broadcast::Sender<String>,
    mut input_rx: mpsc::UnboundedReceiver<CloudInput>,
) -> Result<CloudTranscript, CloudError> {
    let connect_started = Instant::now();
    let socket = connect(&config).await?;
    let (mut write, mut read) = socket.split();

    let task_id = uuid::Uuid::new_v4().to_string();
    send_json(&mut write, run_task_payload(&config, &task_id)).await?;

    let mut buffered: Vec<Vec<u8>> = Vec::new();
    let mut stop_requested = false;
    let start_deadline = tokio::time::Instant::now() + START_TIMEOUT;
    let mut emitter = PartialEmitter::default();
    let mut assembler = Assembler::default();
    // 该模型的 usage 可能只在 result-generated 的 payload.usage 里出现，
    // task-finished 的 payload 可能为空；这里累计最近一次，收尾时兜底。
    let mut usage_snapshot: Option<CloudUsage> = None;

    // 等 task-started：期间的音频全部缓存，收到后再倍速补发。
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(start_deadline) => {
                return Err(CloudError::new("cloud_timeout", "等待 task-started 超时"));
            }
            input = input_rx.recv() => {
                match input {
                    Some(CloudInput::Frame(bytes)) => buffered.push(bytes),
                    Some(CloudInput::Stop) => stop_requested = true,
                    Some(CloudInput::Abort) | None => {
                        return Err(CloudError::new("cloud_cancelled", "会话已取消"));
                    }
                }
            }
            message = read.next() => {
                match handle_server_message(message, &mut assembler, &partial_tx, &session, &mut emitter, &mut usage_snapshot)? {
                    ServerEvent::Started => break,
                    ServerEvent::Finished(transcript) => return Ok(transcript),
                    ServerEvent::Ignored => {}
                }
            }
        }
    }

    let first_partial_at = connect_started.elapsed().as_millis();
    println!(
        "[asr-cloud] session={} model={} keywords={} started={}ms buffered_frames={}",
        short_session(&session),
        config.model,
        config.keywords.len(),
        first_partial_at,
        buffered.len()
    );

    // 补发缓存，再进入实时转发。
    for bytes in buffered.drain(..) {
        write
            .send(Message::Binary(bytes.into()))
            .await
            .map_err(|error| CloudError::new("cloud_network", format!("发送音频失败: {error}")))?;
    }

    let mut finishing = false;
    let mut finish_deadline: Option<tokio::time::Instant> = None;

    if stop_requested {
        send_json(&mut write, finish_task_payload(&task_id)).await?;
        finishing = true;
        finish_deadline = Some(tokio::time::Instant::now() + FINISH_TIMEOUT);
    }

    loop {
        if let Some(deadline) = finish_deadline {
            if tokio::time::Instant::now() >= deadline {
                return Err(CloudError::new("cloud_timeout", "云端收尾超时"));
            }
        }

        tokio::select! {
            _ = async {
                match finish_deadline {
                    Some(deadline) => tokio::time::sleep_until(deadline).await,
                    None => std::future::pending::<()>().await,
                }
            } => {
                if finishing {
                    return Err(CloudError::new("cloud_timeout", "云端收尾超时"));
                }
            }
            input = input_rx.recv(), if !finishing => {
                match input {
                    Some(CloudInput::Frame(bytes)) => {
                        write.send(Message::Binary(bytes.into())).await
                            .map_err(|error| CloudError::new("cloud_network", format!("发送音频失败: {error}")))?;
                    }
                    Some(CloudInput::Stop) => {
                        send_json(&mut write, finish_task_payload(&task_id)).await?;
                        finishing = true;
                        finish_deadline = Some(tokio::time::Instant::now() + FINISH_TIMEOUT);
                    }
                    Some(CloudInput::Abort) | None => {
                        return Err(CloudError::new("cloud_cancelled", "会话已取消"));
                    }
                }
            }
            message = read.next() => {
                match handle_server_message(message, &mut assembler, &partial_tx, &session, &mut emitter, &mut usage_snapshot)? {
                    ServerEvent::Finished(transcript) => return Ok(transcript),
                    ServerEvent::Started | ServerEvent::Ignored => {}
                }
            }
        }
    }
}

enum ServerEvent {
    Started,
    Finished(CloudTranscript),
    Ignored,
}

fn handle_server_message(
    message: Option<Result<Message, tokio_tungstenite::tungstenite::Error>>,
    assembler: &mut Assembler,
    partial_tx: &broadcast::Sender<String>,
    session: &str,
    emitter: &mut PartialEmitter,
    usage_snapshot: &mut Option<CloudUsage>,
) -> Result<ServerEvent, CloudError> {
    let Some(message) = message else {
        return Err(CloudError::new("cloud_network", "云端连接已关闭"));
    };
    let message = message
        .map_err(|error| CloudError::new("cloud_network", format!("读取云端消息失败: {error}")))?;
    let Message::Text(text) = message else {
        return Ok(ServerEvent::Ignored);
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return Ok(ServerEvent::Ignored);
    };
    let header = value.get("header").cloned().unwrap_or(Value::Null);
    let event = header
        .get("event")
        .and_then(Value::as_str)
        .unwrap_or_default();

    match event {
        "task-started" => Ok(ServerEvent::Started),
        "result-generated" => {
            // usage 是累计值；可能挂在只有 usage、没有句子的 result-generated 上，
            // 所以必须在任何 early return 之前解析。
            if let Some(usage) = parse_usage(&value) {
                *usage_snapshot = Some(usage);
            }
            let Some(sentence) = value.pointer("/payload/output/sentence").cloned() else {
                return Ok(ServerEvent::Ignored);
            };
            if sentence.get("heartbeat").and_then(Value::as_bool) == Some(true) {
                return Ok(ServerEvent::Ignored);
            }
            let text = sentence.get("text").and_then(Value::as_str).unwrap_or("");
            if text.is_empty() {
                return Ok(ServerEvent::Ignored);
            }
            let sentence_id = sentence
                .get("sentence_id")
                .and_then(Value::as_u64)
                .unwrap_or(0) as u32;
            let sentence_end = sentence
                .get("sentence_end")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            assembler.apply(sentence_id, text, sentence_end);
            let visible = assembler.visible_text();
            emitter.maybe_emit(partial_tx, session, &visible, sentence_id, sentence_end);
            Ok(ServerEvent::Ignored)
        }
        "task-finished" => {
            // 正常情况 task-finished 自带 usage；实测 qwen-audio-3.1 流式接口
            // 会把 usage 提前放在 result-generated 里、task-finished 的 payload 为空，
            // 因此用累计快照兜底。
            let usage = parse_usage(&value).or_else(|| usage_snapshot.clone());
            let (text, truncated) = normalize_transcript(&assembler.final_text());
            Ok(ServerEvent::Finished(CloudTranscript {
                text,
                truncated,
                usage,
            }))
        }
        "task-failed" => {
            let code = header
                .get("error_code")
                .and_then(Value::as_str)
                .unwrap_or("UNKNOWN");
            let message = header
                .get("error_message")
                .and_then(Value::as_str)
                .unwrap_or("未知错误");
            Err(map_task_error(code, message))
        }
        _ => Ok(ServerEvent::Ignored),
    }
}

fn map_task_error(code: &str, message: &str) -> CloudError {
    let normalized = code.to_ascii_lowercase();
    let mapped = if normalized.contains("invalidapikey")
        || normalized.contains("unauthorized")
        || normalized.contains("authentication")
    {
        "cloud_key_invalid"
    } else if normalized.contains("forbidden")
        || normalized.contains("permission")
        || normalized.contains("accessdenied")
    {
        "cloud_forbidden"
    } else if normalized.contains("model") && normalized.contains("not") {
        "cloud_model_not_found"
    } else if normalized.contains("throttl") || normalized.contains("limit") {
        "cloud_rate_limited"
    } else if normalized.contains("quota") || normalized.contains("balance") {
        "cloud_quota_exceeded"
    } else {
        "cloud_task_failed"
    };
    CloudError::new(mapped, format!("{code}: {message}"))
}

fn parse_usage(value: &Value) -> Option<CloudUsage> {
    let usage = value
        .pointer("/payload/usage")
        .or_else(|| value.pointer("/payload/output/usage"))?;
    Some(CloudUsage {
        input_tokens: usage
            .get("input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        output_tokens: usage
            .get("output_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        total_tokens: usage
            .get("total_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        audio_duration_ms: usage
            .get("duration")
            .and_then(Value::as_u64)
            .map(|seconds| seconds * 1000)
            .unwrap_or(0),
    })
}

fn run_task_payload(config: &CloudSessionConfig, task_id: &str) -> Value {
    let mut parameters = json!({
        "format": "pcm",
        "sample_rate": SAMPLE_RATE,
        "keep_dialect": config.keep_dialect,
        "vad_model": config.vad_model,
        "max_sentence_silence": config.max_sentence_silence_ms,
        "heartbeat": config.heartbeat,
    });
    if !config.language_hints.is_empty() {
        parameters["language_hints"] = json!(config.language_hints);
    }
    // 关键词统一权重 4；为空时不带该键。
    let mut vocabulary = serde_json::Map::new();
    for keyword in &config.keywords {
        let text = keyword.trim();
        if text.is_empty() {
            continue;
        }
        vocabulary.insert(text.to_string(), json!(KEYWORD_WEIGHT));
    }
    if !vocabulary.is_empty() {
        parameters["vocabulary"] = Value::Object(vocabulary);
    }

    json!({
        "header": {
            "action": "run-task",
            "task_id": task_id,
            "streaming": "duplex",
        },
        "payload": {
            "task_group": "audio",
            "task": "asr",
            "function": "recognition",
            "model": config.model,
            "parameters": parameters,
            "input": {},
        }
    })
}

fn finish_task_payload(task_id: &str) -> Value {
    json!({
        "header": {
            "action": "finish-task",
            "task_id": task_id,
            "streaming": "duplex",
        },
        "payload": { "input": {} }
    })
}

/// rustls 0.23 不再自动选择 CryptoProvider，必须在第一次 TLS 握手前显式安装。
/// 实际安装收敛到 `crate::tls`，与模型价格抓取共用 ring provider。
pub fn ensure_crypto_provider() {
    crate::tls::ensure_crypto_provider();
}

async fn connect(config: &CloudSessionConfig) -> Result<Socket, CloudError> {
    ensure_crypto_provider();
    let mut request = config
        .endpoint
        .as_str()
        .into_client_request()
        .map_err(|error| CloudError::new("cloud_network", format!("服务地址无效: {error}")))?;
    let headers = request.headers_mut();
    headers.insert(
        "Authorization",
        HeaderValue::from_str(&format!("Bearer {}", config.api_key))
            .map_err(|_| CloudError::new("cloud_network", "API Key 含非法字符"))?,
    );
    headers.insert("user-agent", HeaderValue::from_static("Sidekick/0.1"));

    match tokio::time::timeout(CONNECT_TIMEOUT, connect_async(request)).await {
        Ok(Ok((socket, _response))) => Ok(socket),
        Ok(Err(error)) => Err(map_connect_error(error)),
        Err(_) => Err(CloudError::new("cloud_timeout", "连接百炼超时")),
    }
}

fn map_connect_error(error: tokio_tungstenite::tungstenite::Error) -> CloudError {
    use tokio_tungstenite::tungstenite::Error as WsError;
    match error {
        WsError::Http(response) => {
            let status = response.status().as_u16();
            match status {
                401 => CloudError::new(
                    "cloud_key_invalid",
                    format!("握手被拒绝（HTTP {status}），检查 API Key"),
                ),
                403 => CloudError::new(
                    "cloud_forbidden",
                    format!("握手被拒绝（HTTP {status}），检查模型/业务空间权限"),
                ),
                _ => CloudError::new("cloud_network", format!("握手失败（HTTP {status}）")),
            }
        }
        other => CloudError::new("cloud_network", format!("连接百炼失败: {other}")),
    }
}

async fn send_json(
    write: &mut futures_util::stream::SplitSink<Socket, Message>,
    value: Value,
) -> Result<(), CloudError> {
    write
        .send(Message::Text(value.to_string().into()))
        .await
        .map_err(|error| CloudError::new("cloud_network", format!("发送指令失败: {error}")))
}

#[derive(Default)]
struct PartialEmitter {
    rev: u64,
    last_emit: Option<Instant>,
    last_text: String,
}

impl PartialEmitter {
    fn maybe_emit(
        &mut self,
        tx: &broadcast::Sender<String>,
        session: &str,
        text: &str,
        sentence: u32,
        sentence_end: bool,
    ) {
        if text.is_empty() || (text == self.last_text && !sentence_end) {
            return;
        }
        let due = self
            .last_emit
            .map(|last| last.elapsed() >= PARTIAL_INTERVAL)
            .unwrap_or(true);
        if !due && !sentence_end {
            return;
        }
        self.rev += 1;
        self.last_emit = Some(Instant::now());
        self.last_text = text.to_string();
        let payload = json!({
            "v": 1,
            "type": "mic.partial",
            "session": session,
            "rev": self.rev,
            "text": text,
            "sentence": sentence,
            "ts": crate::asr_config::now_ms(),
        });
        let _ = tx.send(payload.to_string());
    }
}

#[derive(Default)]
struct Assembler {
    finals: BTreeMap<u32, String>,
    current_id: u32,
    current_text: String,
}

impl Assembler {
    fn apply(&mut self, sentence_id: u32, text: &str, sentence_end: bool) {
        if sentence_end {
            if !text.is_empty() {
                self.finals.insert(sentence_id, text.to_string());
            }
            if self.current_id == sentence_id {
                self.current_id = 0;
                self.current_text.clear();
            }
        } else {
            self.current_id = sentence_id;
            self.current_text = text.to_string();
        }
    }

    fn visible_text(&self) -> String {
        let mut parts: Vec<String> = self.finals.values().cloned().collect();
        if !self.current_text.is_empty() && !self.finals.contains_key(&self.current_id) {
            parts.push(self.current_text.clone());
        }
        parts.join("")
    }

    fn final_text(&self) -> String {
        self.visible_text()
    }
}

/// 设置页“测试连接”：握手 → run-task → task-started → 320ms 静音 → finish-task。
/// 只验证地址/Key/模型，不发送真人音频。
pub async fn probe(config: &CloudSessionConfig) -> Result<u32, CloudError> {
    let started = Instant::now();
    let socket = connect(config).await?;
    let (mut write, mut read) = socket.split();
    let task_id = uuid::Uuid::new_v4().to_string();
    send_json(&mut write, run_task_payload(config, &task_id)).await?;

    let start_deadline = tokio::time::Instant::now() + CONNECT_TIMEOUT;
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(start_deadline) => {
                return Err(CloudError::new("cloud_timeout", "等待 task-started 超时"));
            }
            message = read.next() => {
                match handle_probe_message(message)? {
                    ServerEvent::Started => break,
                    ServerEvent::Finished(_) | ServerEvent::Ignored => {}
                }
            }
        }
    }
    let latency = started.elapsed().as_millis() as u32;

    // 320ms 静音，足够让服务端完成一次收尾；不包含任何用户语音。
    let silence = vec![0u8; (SAMPLE_RATE as usize * 320 / 1000) * 2];
    write
        .send(Message::Binary(silence.into()))
        .await
        .map_err(|error| CloudError::new("cloud_network", format!("发送测试音频失败: {error}")))?;
    send_json(&mut write, finish_task_payload(&task_id)).await?;

    let finish_deadline = tokio::time::Instant::now() + PROBE_FINISH_TIMEOUT;
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(finish_deadline) => {
                return Err(CloudError::new("cloud_timeout", "等待 task-finished 超时"));
            }
            message = read.next() => {
                match handle_probe_message(message)? {
                    ServerEvent::Finished(_) => return Ok(latency),
                    ServerEvent::Started | ServerEvent::Ignored => {}
                }
            }
        }
    }
}

fn handle_probe_message(
    message: Option<Result<Message, tokio_tungstenite::tungstenite::Error>>,
) -> Result<ServerEvent, CloudError> {
    let Some(message) = message else {
        return Err(CloudError::new("cloud_network", "云端连接已关闭"));
    };
    let message = message
        .map_err(|error| CloudError::new("cloud_network", format!("读取云端消息失败: {error}")))?;
    let Message::Text(text) = message else {
        return Ok(ServerEvent::Ignored);
    };
    let Ok(value) = serde_json::from_str::<Value>(&text) else {
        return Ok(ServerEvent::Ignored);
    };
    let header = value.get("header").cloned().unwrap_or(Value::Null);
    let event = header
        .get("event")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match event {
        "task-started" => Ok(ServerEvent::Started),
        "task-finished" => Ok(ServerEvent::Finished(CloudTranscript {
            text: String::new(),
            truncated: false,
            usage: parse_usage(&value),
        })),
        "task-failed" => {
            let code = header
                .get("error_code")
                .and_then(Value::as_str)
                .unwrap_or("UNKNOWN");
            let message = header
                .get("error_message")
                .and_then(Value::as_str)
                .unwrap_or("未知错误");
            Err(map_task_error(code, message))
        }
        _ => Ok(ServerEvent::Ignored),
    }
}

fn short_session(session: &str) -> &str {
    session.get(0..8).unwrap_or("?")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> CloudSessionConfig {
        CloudSessionConfig {
            endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/inference".to_string(),
            api_key: "sk-test".to_string(),
            model: "qwen-audio-3.1-asr-flash-streaming".to_string(),
            language_hints: vec!["zh".to_string()],
            keep_dialect: false,
            vad_model: "near_meeting_16k".to_string(),
            max_sentence_silence_ms: 800,
            heartbeat: true,
            keywords: vec!["异步".to_string(), "函数".to_string()],
        }
    }

    #[test]
    fn builds_run_task_payload() {
        let payload = run_task_payload(&config(), "task-1");
        assert_eq!(payload["header"]["action"], "run-task");
        assert_eq!(payload["header"]["task_id"], "task-1");
        assert_eq!(
            payload["payload"]["model"],
            "qwen-audio-3.1-asr-flash-streaming"
        );
        assert_eq!(payload["payload"]["parameters"]["format"], "pcm");
        assert_eq!(payload["payload"]["parameters"]["sample_rate"], 16000);
        assert_eq!(payload["payload"]["parameters"]["language_hints"][0], "zh");
        // 统一权重 4（官方推荐普通词起始值）。
        assert_eq!(payload["payload"]["parameters"]["vocabulary"]["异步"], 4);
        assert_eq!(payload["payload"]["parameters"]["vocabulary"]["函数"], 4);
        assert_eq!(payload["payload"]["input"], json!({}));
    }

    #[test]
    fn omits_vocabulary_when_no_keywords() {
        let mut config = config();
        config.keywords.clear();
        let payload = run_task_payload(&config, "task-2");
        assert!(payload["payload"]["parameters"].get("vocabulary").is_none());
    }

    #[test]
    fn assembles_sentences_in_order() {
        let mut assembler = Assembler::default();
        assembler.apply(1, "你好，", false);
        assembler.apply(1, "你好，世界。", true);
        assembler.apply(2, "下一句", false);
        assert_eq!(assembler.visible_text(), "你好，世界。下一句");
        assert_eq!(assembler.final_text(), "你好，世界。下一句");
    }

    #[test]
    fn replaces_corrected_intermediate_text() {
        let mut assembler = Assembler::default();
        assembler.apply(1, "你好", false);
        assembler.apply(1, "你好，世界", false);
        assert_eq!(assembler.visible_text(), "你好，世界");
    }

    #[test]
    fn shows_current_sentence_even_with_zero_id() {
        let mut assembler = Assembler::default();
        assembler.apply(0, "临时文本", false);
        assert_eq!(assembler.visible_text(), "临时文本");
    }

    #[test]
    fn installs_rustls_crypto_provider() {
        ensure_crypto_provider();
        assert!(rustls::crypto::CryptoProvider::get_default().is_some());
    }

    #[test]
    fn ignores_duplicate_final_sentence() {
        let mut assembler = Assembler::default();
        assembler.apply(1, "第一句。", true);
        assembler.apply(1, "第一句。", true);
        assert_eq!(assembler.visible_text(), "第一句。");
    }

    #[test]
    fn maps_task_errors() {
        assert_eq!(
            map_task_error("InvalidApiKey", "bad key").code,
            "cloud_key_invalid"
        );
        assert_eq!(
            map_task_error("ModelNotFound", "nope").code,
            "cloud_model_not_found"
        );
        assert_eq!(
            map_task_error("Throttling", "slow").code,
            "cloud_rate_limited"
        );
        assert_eq!(
            map_task_error("UnknownError", "x").code,
            "cloud_task_failed"
        );
    }

    #[tokio::test]
    async fn streams_partials_and_final_text_through_mock_server() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            let first = ws.next().await.unwrap().unwrap();
            assert!(first.to_text().unwrap().contains("run-task"));
            ws.send(Message::Text(
                json!({
                    "header": {"event": "task-started", "task_id": "t"},
                    "payload": {}
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();

            let mut audio_bytes = 0usize;
            loop {
                match ws.next().await.unwrap().unwrap() {
                    Message::Binary(data) => audio_bytes += data.len(),
                    Message::Text(text) => {
                        let value: Value = serde_json::from_str(&text).unwrap();
                        if value["header"]["action"] == "finish-task" {
                            break;
                        }
                    }
                    _ => {}
                }
            }

            for (text, end) in [("你好", false), ("你好，世界。", true)] {
                ws.send(Message::Text(
                    json!({
                        "header": {"event": "result-generated", "task_id": "t"},
                        "payload": {"output": {"sentence": {
                            "sentence_id": 1,
                            "text": text,
                            "sentence_end": end,
                            "heartbeat": false
                        }}}
                    })
                    .to_string()
                    .into(),
                ))
                .await
                .unwrap();
            }
            ws.send(Message::Text(
                json!({
                    "header": {"event": "task-finished", "task_id": "t"},
                    "payload": {"usage": {
                        "input_tokens": 10,
                        "output_tokens": 4,
                        "total_tokens": 14,
                        "duration": 1
                    }}
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();
            audio_bytes
        });

        let (tx, mut rx) = broadcast::channel(64);
        let mut config = config();
        config.endpoint = format!("ws://{addr}/api-ws/v1/inference");
        let handle = spawn(
            config,
            "0f8fad5b-d9cb-469f-a165-70867728950e".to_string(),
            tx,
        );

        assert!(handle.send_frame(vec![0u8; 320]));
        handle.stop();

        let transcript = handle.wait().await.unwrap();
        assert_eq!(transcript.text, "你好，世界。");
        assert_eq!(transcript.usage.unwrap().total_tokens, 14);

        let mut partials = Vec::new();
        while let Ok(raw) = rx.try_recv() {
            partials.push(raw);
        }
        assert!(partials.iter().any(|raw| raw.contains("mic.partial")));
        assert!(partials.iter().any(|raw| raw.contains("你好")));

        let audio_bytes = server.await.unwrap();
        assert!(audio_bytes >= 320);
    }

    #[test]
    fn falls_back_to_usage_from_result_generated() {
        let (partial_tx, _partial_rx) = broadcast::channel::<String>(8);
        let mut assembler = Assembler::default();
        let mut emitter = PartialEmitter::default();
        let mut usage: Option<CloudUsage> = None;

        // 只有 usage、没有句子的 result-generated（服务端把 usage 挂在收尾帧上）。
        let message = json!({
            "header": {"event": "result-generated", "task_id": "t"},
            "payload": {"usage": {
                "input_tokens": 85,
                "output_tokens": 4,
                "total_tokens": 89,
                "duration": 2
            }}
        });
        let event = handle_server_message(
            Some(Ok(Message::Text(message.to_string().into()))),
            &mut assembler,
            &partial_tx,
            "session",
            &mut emitter,
            &mut usage,
        )
        .unwrap();
        assert!(matches!(event, ServerEvent::Ignored));
        assert_eq!(usage.as_ref().unwrap().total_tokens, 89);

        // 带句子的 result-generated 不会清掉已有 usage。
        let message = json!({
            "header": {"event": "result-generated", "task_id": "t"},
            "payload": {"output": {"sentence": {
                "sentence_id": 1,
                "text": "你好",
                "sentence_end": true
            }}}
        });
        handle_server_message(
            Some(Ok(Message::Text(message.to_string().into()))),
            &mut assembler,
            &partial_tx,
            "session",
            &mut emitter,
            &mut usage,
        )
        .unwrap();

        // task-finished 的 payload 为空（实测行为）→ 用快照兜底。
        let message = json!({
            "header": {"event": "task-finished", "task_id": "t"},
            "payload": {"output": {}}
        });
        let event = handle_server_message(
            Some(Ok(Message::Text(message.to_string().into()))),
            &mut assembler,
            &partial_tx,
            "session",
            &mut emitter,
            &mut usage,
        )
        .unwrap();
        match event {
            ServerEvent::Finished(transcript) => {
                assert_eq!(transcript.text, "你好");
                let usage = transcript
                    .usage
                    .expect("应回退到 result-generated 的 usage");
                assert_eq!(usage.total_tokens, 89);
                assert_eq!(usage.audio_duration_ms, 2000);
            }
            _ => panic!("task-finished 应返回 Finished"),
        }
    }

    #[tokio::test]
    async fn records_usage_reported_only_in_result_generated() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut ws = tokio_tungstenite::accept_async(stream).await.unwrap();
            let first = ws.next().await.unwrap().unwrap();
            assert!(first.to_text().unwrap().contains("run-task"));
            ws.send(Message::Text(
                json!({
                    "header": {"event": "task-started", "task_id": "t"},
                    "payload": {}
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();
            // 实测 qwen-audio-3.1 流式接口：usage 只在 result-generated 上，
            // task-finished 的 payload 是空的。
            ws.send(Message::Text(
                json!({
                    "header": {"event": "result-generated", "task_id": "t"},
                    "payload": {
                        "output": {"sentence": {
                            "sentence_id": 1,
                            "text": "你好，世界。",
                            "sentence_end": true,
                            "heartbeat": false
                        }},
                        "usage": {
                            "input_tokens": 93,
                            "output_tokens": 21,
                            "total_tokens": 114,
                            "duration": 7
                        }
                    }
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();
            ws.send(Message::Text(
                json!({
                    "header": {"event": "task-finished", "task_id": "t"},
                    "payload": {"output": {}}
                })
                .to_string()
                .into(),
            ))
            .await
            .unwrap();
            // 收完客户端可能在收尾前补发的音频 / finish-task，避免它写已关闭的 socket。
            let _ = tokio::time::timeout(std::time::Duration::from_secs(2), async {
                while let Some(Ok(_)) = ws.next().await {}
            })
            .await;
        });

        let (tx, _rx) = broadcast::channel(64);
        let mut config = config();
        config.endpoint = format!("ws://{addr}/api-ws/v1/inference");
        let handle = spawn(
            config,
            "0f8fad5b-d9cb-469f-a165-70867728951e".to_string(),
            tx,
        );
        assert!(handle.send_frame(vec![0u8; 320]));
        handle.stop();

        let transcript = handle.wait().await.unwrap();
        assert_eq!(transcript.text, "你好，世界。");
        let usage = transcript
            .usage
            .expect("task-finished 为空时应回退到 result-generated 的 usage");
        assert_eq!(usage.total_tokens, 114);
        assert_eq!(usage.input_tokens, 93);
        assert_eq!(usage.output_tokens, 21);
        assert_eq!(usage.audio_duration_ms, 7000);
        server.await.unwrap();
    }

    #[test]
    fn parses_usage() {
        let value = json!({
            "payload": {
                "usage": {
                    "input_tokens": 85,
                    "output_tokens": 4,
                    "total_tokens": 89,
                    "duration": 2
                }
            }
        });
        let usage = parse_usage(&value).unwrap();
        assert_eq!(usage.total_tokens, 89);
        assert_eq!(usage.audio_duration_ms, 2000);
    }
}
