//! 手机直连百炼实时 ASR（wss）。只做「一段 PCM 进、最终文本出」，
//! 不广播 partial、不碰桌面链路（`bailian_asr.rs` 是桌面专属模块）。

use std::collections::BTreeMap;
use std::sync::Once;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::connect_async;

pub const DEFAULT_ENDPOINT: &str = "wss://dashscope.aliyuncs.com/api-ws/v1/inference";
pub const DEFAULT_MODEL: &str = "qwen-audio-3.1-asr-flash-streaming";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const START_TIMEOUT: Duration = Duration::from_secs(8);
const FINISH_TIMEOUT: Duration = Duration::from_secs(120);
const SEND_CHUNK: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloudError {
    pub code: &'static str,
    pub message: String,
}

impl CloudError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }

    /// 网络类错误：保留任务、状态置 offline，等下次重试。
    pub fn is_offline(&self) -> bool {
        matches!(self.code, "cloud_network" | "cloud_timeout")
    }
}

/// rustls 0.23 不会自动选择 CryptoProvider；手机端第一次 TLS 握手前安装 ring。
pub fn ensure_crypto_provider() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}

/// 转写一段 PCM（16k mono s16le）。
pub async fn transcribe(pcm: &[u8], api_key: &str) -> Result<String, CloudError> {
    if pcm.is_empty() {
        return Ok(String::new());
    }
    ensure_crypto_provider();
    let mut request = DEFAULT_ENDPOINT
        .into_client_request()
        .map_err(|error| CloudError::new("cloud_network", format!("服务地址无效: {error}")))?;
    let headers = request.headers_mut();
    headers.insert(
        "Authorization",
        format!("Bearer {}", api_key.trim())
            .parse()
            .map_err(|_| CloudError::new("cloud_key_invalid", "API Key 含非法字符"))?,
    );
    headers.insert("user-agent", "Sidekick/0.1".parse().unwrap());

    let (mut write, mut read) = match tokio::time::timeout(CONNECT_TIMEOUT, connect_async(request)).await {
        Ok(Ok((socket, _))) => socket.split(),
        Ok(Err(error)) => return Err(map_connect_error(error)),
        Err(_) => return Err(CloudError::new("cloud_timeout", "连接百炼超时")),
    };

    let task_id = uuid::Uuid::new_v4().to_string();
    send_json(&mut write, run_task_payload(&task_id)).await?;

    // 等 task-started：期间音频先不丢（整段 PCM 已在内存）。
    wait_started(&mut read).await?;

    // 分段是离线音频，按约 10× 实时速度发，避免 5 分钟 PCM 一次性灌给流式接口。
    for chunk in pcm.chunks(SEND_CHUNK) {
        write
            .send(Message::Binary(chunk.to_vec().into()))
            .await
            .map_err(|error| CloudError::new("cloud_network", format!("发送音频失败: {error}")))?;
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    send_json(&mut write, finish_task_payload(&task_id)).await?;

    let deadline = tokio::time::Instant::now() + FINISH_TIMEOUT;
    let mut assembler = Assembler::default();
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => {
                return Err(CloudError::new("cloud_timeout", "等待识别结果超时"));
            }
            message = read.next() => {
                let Some(message) = message else {
                    return Err(CloudError::new("cloud_network", "识别连接提前关闭"));
                };
                let message = message.map_err(|error| CloudError::new("cloud_network", format!("读取识别结果失败: {error}")))?;
                let Message::Text(text) = message else { continue };
                let value: Value = match serde_json::from_str(&text) {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                match value.pointer("/header/event").and_then(Value::as_str) {
                    Some("result-generated") => {
                        if let Some(sentence) = value.pointer("/payload/output/sentence") {
                            if sentence.get("heartbeat").and_then(Value::as_bool) == Some(true) {
                                continue;
                            }
                            let id = sentence.get("sentence_id").and_then(Value::as_u64).unwrap_or(0) as u32;
                            let text = sentence.get("text").and_then(Value::as_str).unwrap_or("");
                            let end = sentence.get("sentence_end").and_then(Value::as_bool).unwrap_or(false);
                            assembler.apply(id, text, end);
                        }
                    }
                    Some("task-finished") => return Ok(assembler.final_text()),
                    Some("task-failed") => {
                        let code = value.pointer("/payload/code").and_then(Value::as_str).unwrap_or("");
                        let message = value
                            .pointer("/payload/message")
                            .and_then(Value::as_str)
                            .unwrap_or("识别失败");
                        let mapped = if code.contains("InvalidApiKey") {
                            "cloud_key_invalid"
                        } else if code.contains("Model") {
                            "cloud_model_not_found"
                        } else {
                            "cloud_failed"
                        };
                        return Err(CloudError::new(mapped, message.to_string()));
                    }
                    _ => {}
                }
            }
        }
    }
}

async fn wait_started(
    read: &mut futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
) -> Result<(), CloudError> {
    let deadline = tokio::time::Instant::now() + START_TIMEOUT;
    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => {
                return Err(CloudError::new("cloud_timeout", "等待识别会话开始超时"));
            }
            message = read.next() => {
                let Some(message) = message else {
                    return Err(CloudError::new("cloud_network", "识别连接提前关闭"));
                };
                let message = message.map_err(|error| CloudError::new("cloud_network", format!("读取识别会话失败: {error}")))?;
                let Message::Text(text) = message else { continue };
                let Ok(value) = serde_json::from_str::<Value>(&text) else { continue };
                match value.pointer("/header/event").and_then(Value::as_str) {
                    Some("task-started") => return Ok(()),
                    Some("task-failed") => {
                        let code = value.pointer("/payload/code").and_then(Value::as_str).unwrap_or("");
                        let message = value.pointer("/payload/message").and_then(Value::as_str).unwrap_or("识别失败");
                        let mapped = if code.contains("InvalidApiKey") { "cloud_key_invalid" } else { "cloud_failed" };
                        return Err(CloudError::new(mapped, message.to_string()));
                    }
                    _ => {}
                }
            }
        }
    }
}

fn map_connect_error(error: tokio_tungstenite::tungstenite::Error) -> CloudError {
    use tokio_tungstenite::tungstenite::Error as WsError;
    match error {
        WsError::Http(response) => {
            let status = response.status().as_u16();
            match status {
                401 => CloudError::new("cloud_key_invalid", "握手被拒绝（HTTP 401），检查 API Key"),
                403 => CloudError::new("cloud_forbidden", "握手被拒绝（HTTP 403），检查模型权限"),
                _ => CloudError::new("cloud_network", format!("握手失败（HTTP {status}）")),
            }
        }
        other => CloudError::new("cloud_network", format!("连接百炼失败: {other}")),
    }
}

async fn send_json(
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    value: Value,
) -> Result<(), CloudError> {
    write
        .send(Message::Text(value.to_string().into()))
        .await
        .map_err(|error| CloudError::new("cloud_network", format!("发送识别指令失败: {error}")))
}

fn run_task_payload(task_id: &str) -> Value {
    json!({
        "header": { "action": "run-task", "task_id": task_id, "streaming": "duplex" },
        "payload": {
            "task_group": "audio",
            "task": "asr",
            "function": "recognition",
            "model": DEFAULT_MODEL,
            "parameters": {
                "format": "pcm",
                "sample_rate": 16_000,
                "language_hints": ["zh"],
                "vad_model": "near_meeting_16k",
                "max_sentence_silence": 800,
                "heartbeat": true,
            },
            "input": {},
        }
    })
}

fn finish_task_payload(task_id: &str) -> Value {
    json!({
        "header": { "action": "finish-task", "task_id": task_id, "streaming": "duplex" },
        "payload": { "input": {} }
    })
}

#[derive(Default)]
struct Assembler {
    finals: BTreeMap<u32, String>,
    current_id: u32,
    current_text: String,
}

impl Assembler {
    fn apply(&mut self, id: u32, text: &str, end: bool) {
        if end {
            if !text.is_empty() {
                self.finals.insert(id, text.to_string());
            }
            if self.current_id == id {
                self.current_id = 0;
                self.current_text.clear();
            }
        } else {
            self.current_id = id;
            self.current_text = text.to_string();
        }
    }

    fn final_text(&self) -> String {
        let mut parts: Vec<String> = self.finals.values().cloned().collect();
        if !self.current_text.is_empty() && !self.finals.contains_key(&self.current_id) {
            parts.push(self.current_text.clone());
        }
        parts.join("")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assembler_collects_sentences() {
        let mut assembler = Assembler::default();
        assembler.apply(1, "你好", false);
        assert_eq!(assembler.final_text(), "你好");
        assembler.apply(1, "你好。", true);
        assembler.apply(2, "第二句", false);
        assert_eq!(assembler.final_text(), "你好。第二句");
    }

    #[test]
    fn payload_has_required_fields() {
        let payload = run_task_payload("task");
        assert_eq!(payload["header"]["action"], "run-task");
        assert_eq!(payload["payload"]["model"], DEFAULT_MODEL);
        assert_eq!(payload["payload"]["parameters"]["sample_rate"], 16_000);
        assert_eq!(payload["payload"]["parameters"]["format"], "pcm");
    }

    #[test]
    fn offline_errors_are_classified() {
        assert!(CloudError::new("cloud_network", "x").is_offline());
        assert!(CloudError::new("cloud_timeout", "x").is_offline());
        assert!(!CloudError::new("cloud_key_invalid", "x").is_offline());
    }
}
