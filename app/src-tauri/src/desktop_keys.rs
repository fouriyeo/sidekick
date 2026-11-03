//! 手机结果卡片的「回车 / 清空」：在最近一次插入文本的目标应用里合成按键。
//!
//! 数据流：
//! `手机 --key.request--> /ws --> desktop_server --> desktop_keys::execute`
//! `desktop_server --key.result--> /ws 上的手机与桌面 UI`
//!
//! 约束：
//! - 只允许用户主动点按；不自动发送任何按键（见 `docs/prd/mic/PRD.md` 铁律）；
//! - 目标应用必须是最近一次 `mic.result(inserted)` 记录的前台应用，变化即拒绝；
//! - 密码/安全输入框、辅助功能未授权、非 macOS 一律不发；
//! - 30 秒时效 + 成功一次即作废；500ms 限频在 `desktop_server` 层；
//! - 日志只有动作与结果码，不打印转写文本/应用名。

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use crate::app_focus;
use crate::desktop_mic::{self, FrontApp};

/// 两次按键动作的最小间隔（防手抖连续触发两次回车）。
pub const KEY_MIN_INTERVAL: Duration = Duration::from_millis(500);
/// 最近一次插入之后多久内还允许按键；结果卡片 10 秒，留出网络/点击余量。
pub const KEY_ACTION_TTL: Duration = Duration::from_secs(30);
/// session 最大字符数（与协议 `id ≤ 128` 一致）。
pub const MAX_SESSION_CHARS: usize = 128;

/// macOS 虚拟键码：Return。
const RETURN_KEYCODE: u16 = 36;
/// macOS 虚拟键码：A。
const A_KEYCODE: u16 = 0;
/// macOS 虚拟键码：Delete（Backspace）。
const DELETE_KEYCODE: u16 = 51;
/// 清空时等 ⌘A 选中稳定，再按 Delete。
const SELECTION_SETTLE_MS: u64 = 40;

/// 结果卡片上的两个手动动作。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyAction {
    Enter,
    Clear,
}

impl KeyAction {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "enter" => Some(Self::Enter),
            "clear" => Some(Self::Clear),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Enter => "enter",
            Self::Clear => "clear",
        }
    }
}

/// 通过校验的按键请求（不含任何文本）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyRequest {
    pub request_id: String,
    pub session: String,
    pub action: KeyAction,
}

/// 一次按键（按下 + 抬起）；`command` 表示同时按住 Command。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyStroke {
    pub keycode: u16,
    pub command: bool,
}

/// 当前平台是否支持合成按键。
pub fn supported() -> bool {
    cfg!(target_os = "macos")
}

/// 把动作翻译成按键序列（纯函数，便于单测）。
pub fn plan(action: KeyAction) -> Vec<KeyStroke> {
    match action {
        KeyAction::Enter => vec![KeyStroke {
            keycode: RETURN_KEYCODE,
            command: false,
        }],
        KeyAction::Clear => vec![
            KeyStroke {
                keycode: A_KEYCODE,
                command: true,
            },
            KeyStroke {
                keycode: DELETE_KEYCODE,
                command: false,
            },
        ],
    }
}

/// 依次合成按键；任一失败即返回 false。
pub fn post_sequence(strokes: &[KeyStroke]) -> bool {
    for (index, stroke) in strokes.iter().enumerate() {
        if index > 0 {
            std::thread::sleep(Duration::from_millis(SELECTION_SETTLE_MS));
        }
        if !desktop_mic::post_key(stroke.keycode, stroke.command) {
            return false;
        }
    }
    true
}

fn field_str<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value.get(key).and_then(Value::as_str)
}

/// 校验 `key.request` 的版本、requestId、session 与 action；失败回 `bad_request`。
pub fn parse_key_request(value: &Value) -> Result<KeyRequest, &'static str> {
    if value.get("v").and_then(Value::as_u64) != Some(1) {
        return Err("bad_request");
    }
    let request_id = app_focus::request_id_of(value).ok_or("bad_request")?;
    let session = field_str(value, "session").map(str::trim).unwrap_or("");
    if session.is_empty() || session.chars().count() > MAX_SESSION_CHARS {
        return Err("bad_request");
    }
    let action = field_str(value, "action")
        .and_then(KeyAction::parse)
        .ok_or("bad_request")?;
    Ok(KeyRequest {
        request_id,
        session: session.to_string(),
        action,
    })
}

#[derive(Debug, Clone)]
struct KeyTarget {
    owner: u64,
    session: String,
    app: FrontApp,
    at: Instant,
}

/// 最近一次「插入成功」的目标应用；同一时间只有一条记录。
pub struct KeyRegistry {
    target: Mutex<Option<KeyTarget>>,
}

impl KeyRegistry {
    pub fn new() -> Self {
        Self {
            target: Mutex::new(None),
        }
    }

    /// 插入成功后记录目标应用；只有 `inserted` 才调用。
    pub fn record(&self, owner: u64, session: &str, app: FrontApp, now: Instant) {
        *self.target.lock().unwrap() = Some(KeyTarget {
            owner,
            session: session.to_string(),
            app,
            at: now,
        });
    }

    /// 校验请求能否作用于最近一次插入，并返回当时的目标应用。
    pub fn authorize(
        &self,
        owner: u64,
        session: &str,
        now: Instant,
    ) -> Result<FrontApp, &'static str> {
        let mut target = self.target.lock().unwrap();
        let Some(current) = target.as_ref() else {
            return Err("no_target");
        };
        if current.owner != owner || current.session != session {
            return Err("session_mismatch");
        }
        if now.saturating_duration_since(current.at) > KEY_ACTION_TTL {
            *target = None;
            return Err("no_target");
        }
        Ok(current.app.clone())
    }

    /// 成功按键后作废记录，避免重复事件/重复回车。
    pub fn consume(&self, owner: u64, session: &str) {
        let mut target = self.target.lock().unwrap();
        let matches = target
            .as_ref()
            .is_some_and(|current| current.owner == owner && current.session == session);
        if matches {
            *target = None;
        }
    }

    /// 客户端断开时清掉它的记录（下次连接会换 owner）。
    pub fn clear_owner(&self, owner: u64) {
        let mut target = self.target.lock().unwrap();
        if target
            .as_ref()
            .is_some_and(|current| current.owner == owner)
        {
            *target = None;
        }
    }
}

impl Default for KeyRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// 执行按键前需要采集的桌面状态（可注入，单测不真的发按键）。
#[derive(Debug, Clone)]
pub struct KeyGates {
    pub current_app: Option<FrontApp>,
    pub secure_input: bool,
    pub accessibility: bool,
}

/// 安全闸门 + 合成按键。顺序固定：目标窗口 → 密码框 → 辅助功能 → 发送。
pub fn execute(
    action: KeyAction,
    expected: &FrontApp,
    gates: &KeyGates,
    post: &dyn Fn(&[KeyStroke]) -> bool,
) -> Result<(), &'static str> {
    let same_app = gates
        .current_app
        .as_ref()
        .is_some_and(|current| expected.same_as(current));
    if !same_app {
        return Err("target_mismatch");
    }
    if gates.secure_input {
        return Err("secure_input");
    }
    if !gates.accessibility {
        return Err("accessibility_off");
    }
    if !post(&plan(action)) {
        return Err("send_failed");
    }
    Ok(())
}

/// `key.result` 的 JSON 构造；error 为错误码字符串或 null。
pub fn key_result_json(
    request_id: &str,
    action: KeyAction,
    ok: bool,
    error: Option<&str>,
    ts: u64,
) -> Value {
    json!({
        "type": "key.result",
        "v": 1,
        "requestId": request_id,
        "action": action.as_str(),
        "ok": ok,
        "error": error,
        "ts": ts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(bundle: &str, name: &str) -> FrontApp {
        FrontApp {
            bundle_id: Some(bundle.to_string()),
            name: Some(name.to_string()),
        }
    }

    fn request_json(action: &str) -> Value {
        json!({
            "type": "key.request",
            "v": 1,
            "requestId": "k-1",
            "session": "session-1",
            "action": action,
            "ts": 1,
        })
    }

    #[test]
    fn parses_and_validates_key_requests() {
        let request = parse_key_request(&request_json("enter")).unwrap();
        assert_eq!(
            request,
            KeyRequest {
                request_id: "k-1".to_string(),
                session: "session-1".to_string(),
                action: KeyAction::Enter,
            }
        );
        assert_eq!(
            parse_key_request(&request_json("clear")).unwrap().action,
            KeyAction::Clear
        );

        let mut wrong_version = request_json("enter");
        wrong_version["v"] = json!(2);
        assert_eq!(parse_key_request(&wrong_version), Err("bad_request"));
        assert_eq!(
            parse_key_request(&request_json("submit")),
            Err("bad_request")
        );

        let mut empty_session = request_json("enter");
        empty_session["session"] = json!("  ");
        assert_eq!(parse_key_request(&empty_session), Err("bad_request"));

        let mut long_session = request_json("enter");
        long_session["session"] = json!("x".repeat(MAX_SESSION_CHARS + 1));
        assert_eq!(parse_key_request(&long_session), Err("bad_request"));

        let mut missing_id = request_json("enter");
        missing_id["requestId"] = json!("   ");
        assert_eq!(parse_key_request(&missing_id), Err("bad_request"));
    }

    #[test]
    fn enter_presses_return_and_clear_presses_command_a_then_delete() {
        assert_eq!(
            plan(KeyAction::Enter),
            vec![KeyStroke {
                keycode: RETURN_KEYCODE,
                command: false,
            }]
        );
        assert_eq!(
            plan(KeyAction::Clear),
            vec![
                KeyStroke {
                    keycode: A_KEYCODE,
                    command: true,
                },
                KeyStroke {
                    keycode: DELETE_KEYCODE,
                    command: false,
                },
            ]
        );
    }

    #[test]
    fn execute_blocks_when_the_front_app_changed() {
        let posted = std::sync::Arc::new(Mutex::new(0_u32));
        let recorder = std::sync::Arc::clone(&posted);
        let gates = KeyGates {
            current_app: Some(app("com.apple.finder", "Finder")),
            secure_input: false,
            accessibility: true,
        };
        let result = execute(
            KeyAction::Enter,
            &app("com.other", "Other"),
            &gates,
            &|_| {
                *recorder.lock().unwrap() += 1;
                true
            },
        );
        assert_eq!(result, Err("target_mismatch"));
        assert_eq!(*posted.lock().unwrap(), 0);
    }

    #[test]
    fn execute_blocks_secure_input_and_missing_accessibility() {
        let expected = app("com.other", "Other");
        let secure = KeyGates {
            current_app: Some(expected.clone()),
            secure_input: true,
            accessibility: true,
        };
        assert_eq!(
            execute(KeyAction::Enter, &expected, &secure, &|_| true),
            Err("secure_input")
        );

        let untrusted = KeyGates {
            current_app: Some(expected.clone()),
            secure_input: false,
            accessibility: false,
        };
        assert_eq!(
            execute(KeyAction::Enter, &expected, &untrusted, &|_| true),
            Err("accessibility_off")
        );
    }

    #[test]
    fn execute_reports_posting_failures_and_passes_the_plan_through() {
        let expected = app("com.other", "Other");
        let gates = KeyGates {
            current_app: Some(expected.clone()),
            secure_input: false,
            accessibility: true,
        };

        let sent: std::sync::Arc<Mutex<Vec<Vec<KeyStroke>>>> = Default::default();
        let recorder = std::sync::Arc::clone(&sent);
        let result = execute(KeyAction::Clear, &expected, &gates, &|strokes| {
            recorder.lock().unwrap().push(strokes.to_vec());
            true
        });
        assert_eq!(result, Ok(()));
        assert_eq!(sent.lock().unwrap().as_slice(), [plan(KeyAction::Clear)]);

        assert_eq!(
            execute(KeyAction::Enter, &expected, &gates, &|_| false),
            Err("send_failed")
        );
    }

    #[test]
    fn registry_tracks_recent_insert_and_expires() {
        let registry = KeyRegistry::new();
        let start = Instant::now();
        assert_eq!(registry.authorize(1, "session-1", start), Err("no_target"));

        registry.record(1, "session-1", app("com.other", "Other"), start);
        assert_eq!(
            registry.authorize(1, "session-1", start + Duration::from_secs(5)),
            Ok(app("com.other", "Other"))
        );

        // 别的客户端/会话拿不到目标。
        assert_eq!(
            registry.authorize(2, "session-1", start),
            Err("session_mismatch")
        );
        assert_eq!(
            registry.authorize(1, "session-2", start),
            Err("session_mismatch")
        );

        // 超过 30 秒后过期并清空。
        assert_eq!(
            registry.authorize(
                1,
                "session-1",
                start + KEY_ACTION_TTL + Duration::from_secs(1)
            ),
            Err("no_target")
        );
        assert_eq!(registry.authorize(1, "session-1", start), Err("no_target"));
    }

    #[test]
    fn registry_is_one_shot_and_owner_scoped() {
        let registry = KeyRegistry::new();
        let start = Instant::now();
        registry.record(1, "session-1", app("com.other", "Other"), start);

        registry.consume(2, "session-1");
        assert!(registry.authorize(1, "session-1", start).is_ok());

        registry.consume(1, "session-1");
        assert_eq!(registry.authorize(1, "session-1", start), Err("no_target"));

        registry.record(1, "session-1", app("com.other", "Other"), start);
        registry.clear_owner(2);
        assert!(registry.authorize(1, "session-1", start).is_ok());
        registry.clear_owner(1);
        assert_eq!(registry.authorize(1, "session-1", start), Err("no_target"));
    }

    #[test]
    fn key_result_json_matches_the_protocol() {
        let ok = key_result_json("k-1", KeyAction::Enter, true, None, 123);
        assert_eq!(ok["type"], "key.result");
        assert_eq!(ok["v"], 1);
        assert_eq!(ok["requestId"], "k-1");
        assert_eq!(ok["action"], "enter");
        assert_eq!(ok["ok"], true);
        assert!(ok["error"].is_null());
        assert_eq!(ok["ts"], 123);

        let failed = key_result_json("k-2", KeyAction::Clear, false, Some("target_mismatch"), 124);
        assert_eq!(failed["action"], "clear");
        assert_eq!(failed["ok"], false);
        assert_eq!(failed["error"], "target_mismatch");
    }
}
