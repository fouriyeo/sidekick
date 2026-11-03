//! 手机「一键唤起电脑」：把 DSH 对应的桌面 App 切到前台（没开则启动）。
//!
//! 数据流：
//! `手机 --focus.request--> /ws --> desktop_server --> app_focus::activate`
//! `desktop_server --focus.result--> /ws 上的手机`
//!
//! 约束：
//! - 只接受已知 source（P0 `dsh`），未知 source 回 `unsupported_source`；
//! - 只支持 macOS（`open -a`），其它平台回 `unsupported_platform`；
//! - 命令固定，不拼接 shell、不打印 sessionId 内容；
//! - 全局 1.5s 限频，避免手机抖动连续拉起 App；
//! - 执行入口可注入 runner，单测不会真的启动 App。

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

/// 全局限频间隔：两次 focus.request 至少间隔 1.5s。
pub const FOCUS_MIN_INTERVAL: Duration = Duration::from_millis(1500);
/// requestId 最大字符数。
pub const MAX_REQUEST_ID_CHARS: usize = 64;
/// sessionId 最大字符数（与协议 `id ≤ 128` 一致）。
pub const MAX_SESSION_ID_CHARS: usize = 128;
/// source 最大字符数。
pub const MAX_SOURCE_CHARS: usize = 32;
/// macOS 上要唤起的 App 名称。
pub const DSH_APP_NAME: &str = "DeepSeek Harness";

/// 通过校验的 focus 请求（不含任何会话内容）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FocusRequest {
    pub request_id: String,
    pub source: String,
    pub session_id: String,
}

/// 唤起 `source` 对应的桌面 App。错误码直接作为 `focus.result.error` 回给手机。
pub fn activate(source: &str) -> Result<(), &'static str> {
    activate_with(source, &launch_default)
}

#[cfg(target_os = "macos")]
fn launch_default(_source: &str) -> Result<(), &'static str> {
    let status = std::process::Command::new("open")
        .args(["-a", DSH_APP_NAME])
        .status()
        .map_err(|_| "launch_failed")?;
    if status.success() {
        Ok(())
    } else {
        Err("launch_failed")
    }
}

#[cfg(not(target_os = "macos"))]
fn launch_default(_source: &str) -> Result<(), &'static str> {
    Err("unsupported_platform")
}

/// 可注入 runner 的唤起入口；测试用假 runner 断言 source 映射而不真的 open。
pub fn activate_with(
    source: &str,
    launch: &dyn Fn(&str) -> Result<(), &'static str>,
) -> Result<(), &'static str> {
    if source != "dsh" {
        return Err("unsupported_source");
    }
    #[cfg(target_os = "macos")]
    {
        launch(source)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = launch;
        Err("unsupported_platform")
    }
}

fn field_str<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

/// 单独解析 requestId：非法时无法回包，调用方直接丢弃请求。
pub fn request_id_of(value: &Value) -> Option<String> {
    let request_id = field_str(value, "requestId")?.trim();
    if request_id.is_empty() || request_id.chars().count() > MAX_REQUEST_ID_CHARS {
        return None;
    }
    Some(request_id.to_string())
}

/// 校验 focus.request 的 requestId/source/sessionId 与协议版本；失败回 `bad_request`。
pub fn parse_focus_request(value: &Value) -> Result<FocusRequest, &'static str> {
    if value.get("v").and_then(Value::as_u64) != Some(1) {
        return Err("bad_request");
    }
    let request_id = request_id_of(value).ok_or("bad_request")?;
    let source = field_str(value, "source").map(str::trim).unwrap_or("");
    if source.is_empty() || source.chars().count() > MAX_SOURCE_CHARS {
        return Err("bad_request");
    }
    let session_id = field_str(value, "sessionId").map(str::trim).unwrap_or("");
    if session_id.is_empty() || session_id.chars().count() > MAX_SESSION_ID_CHARS {
        return Err("bad_request");
    }
    Ok(FocusRequest {
        request_id,
        source: source.to_string(),
        session_id: session_id.to_string(),
    })
}

/// focus.result 的 JSON 构造；error 为错误码字符串或 null。
pub fn focus_result_json(
    request_id: &str,
    source: &str,
    ok: bool,
    error: Option<&'static str>,
    ts: u64,
) -> Value {
    json!({
        "type": "focus.result",
        "v": 1,
        "requestId": request_id,
        "source": source,
        "ok": ok,
        "error": error,
        "ts": ts,
    })
}

/// 全局 1.5s 限频（允许注入 clock 以便单测）。
pub struct FocusLimiter {
    interval: Duration,
    last: Mutex<Option<Instant>>,
}

impl FocusLimiter {
    pub fn new() -> Self {
        Self::with_interval(FOCUS_MIN_INTERVAL)
    }

    pub fn with_interval(interval: Duration) -> Self {
        Self {
            interval,
            last: Mutex::new(None),
        }
    }

    /// 获得一次执行机会；距上次成功不足 `interval` 时返回 false。
    pub fn try_acquire(&self, now: Instant) -> bool {
        let mut last = self.last.lock().unwrap();
        match *last {
            Some(previous) if now.saturating_duration_since(previous) < self.interval => false,
            _ => {
                *last = Some(now);
                true
            }
        }
    }
}

impl Default for FocusLimiter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request_json(source: &str, session_id: &str) -> Value {
        json!({
            "type": "focus.request",
            "v": 1,
            "requestId": "f-1",
            "source": source,
            "sessionId": session_id,
            "ts": 1,
        })
    }

    #[test]
    fn activate_maps_dsh_to_the_desktop_app() {
        let launched: std::sync::Arc<Mutex<Vec<String>>> = Default::default();
        let recorder = std::sync::Arc::clone(&launched);
        let result = activate_with("dsh", &|source| {
            recorder.lock().unwrap().push(source.to_string());
            Ok(())
        });
        assert_eq!(result, Ok(()));
        assert_eq!(launched.lock().unwrap().as_slice(), ["dsh"]);
    }

    #[test]
    fn activate_rejects_unknown_sources_without_launching() {
        let launched = std::sync::Arc::new(Mutex::new(0_u32));
        let recorder = std::sync::Arc::clone(&launched);
        let result = activate_with("claude-code", &|_| {
            *recorder.lock().unwrap() += 1;
            Ok(())
        });
        assert_eq!(result, Err("unsupported_source"));
        assert_eq!(*launched.lock().unwrap(), 0);
    }

    #[test]
    fn activate_propagates_launch_failure() {
        assert_eq!(
            activate_with("dsh", &|_| Err("launch_failed")),
            Err("launch_failed")
        );
    }

    #[test]
    fn limiter_allows_one_request_per_interval() {
        let limiter = FocusLimiter::with_interval(Duration::from_millis(1500));
        let start = Instant::now();
        assert!(limiter.try_acquire(start));
        assert!(!limiter.try_acquire(start + Duration::from_millis(1499)));
        assert!(!limiter.try_acquire(start + Duration::from_millis(1_000)));
        assert!(limiter.try_acquire(start + Duration::from_millis(1_500)));
        assert!(!limiter.try_acquire(start + Duration::from_millis(2_000)));
        assert!(limiter.try_acquire(start + Duration::from_millis(3_000)));
    }

    #[test]
    fn parses_and_validates_focus_requests() {
        let request = parse_focus_request(&request_json("dsh", "session-1")).unwrap();
        assert_eq!(
            request,
            FocusRequest {
                request_id: "f-1".to_string(),
                source: "dsh".to_string(),
                session_id: "session-1".to_string(),
            }
        );

        // 版本、requestId、source、sessionId 非法都是 bad_request。
        let mut wrong_version = request_json("dsh", "session-1");
        wrong_version["v"] = json!(2);
        assert_eq!(parse_focus_request(&wrong_version), Err("bad_request"));
        assert_eq!(
            parse_focus_request(
                &json!({"type":"focus.request","v":1,"source":"dsh","sessionId":"s"})
            ),
            Err("bad_request")
        );
        assert_eq!(
            parse_focus_request(&request_json("", "session-1")),
            Err("bad_request")
        );
        assert_eq!(
            parse_focus_request(&request_json("dsh", "")),
            Err("bad_request")
        );
        assert_eq!(
            parse_focus_request(&request_json("dsh", &"x".repeat(MAX_SESSION_ID_CHARS + 1))),
            Err("bad_request")
        );
        assert_eq!(
            parse_focus_request(&request_json(
                &"s".repeat(MAX_SOURCE_CHARS + 1),
                "session-1"
            )),
            Err("bad_request")
        );
        assert_eq!(
            request_id_of(&request_json("dsh", "s")),
            Some("f-1".to_string())
        );
        assert_eq!(
            request_id_of(&json!({"v":1,"requestId":"x".repeat(MAX_REQUEST_ID_CHARS + 1)})),
            None
        );
        assert_eq!(request_id_of(&json!({"v":1,"requestId":"   "})), None);
    }

    #[test]
    fn focus_result_json_matches_the_protocol() {
        let ok = focus_result_json("f-1", "dsh", true, None, 123);
        assert_eq!(ok["type"], "focus.result");
        assert_eq!(ok["v"], 1);
        assert_eq!(ok["requestId"], "f-1");
        assert_eq!(ok["source"], "dsh");
        assert_eq!(ok["ok"], true);
        assert!(ok["error"].is_null());
        assert_eq!(ok["ts"], 123);

        let failed = focus_result_json("f-2", "dsh", false, Some("rate_limited"), 124);
        assert_eq!(failed["ok"], false);
        assert_eq!(failed["error"], "rate_limited");
    }
}
