//! 快捷键流程的顶部状态条：把 `mic-hud` 事件翻译成一句「现在到底怎么了」。
//!
//! 窗口本身在 `mic_panel`（原生 NSPanel + WKWebView），因为普通 `NSWindow` 进不了
//! 全屏 Space。这里保留原来的 `mic_hud` 名字和 `{state, reason}` 载荷，是为了让
//! `mic_remote` 的状态机只用关心语义，不关心文案/渲染。
//!
//! 原则：**任何一个快捷键分支都必须能在这里找到一句可见的话**，尤其是
//! 「手机没回 ack」「手机拒了」「根本没连手机」——这些以前只写日志，用户看到
//! 的就是「按了没反应」。

use serde_json::Value;
use tauri::AppHandle;

use crate::mic_panel;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tone {
    Listening,
    Wait,
    Error,
    Success,
}

impl Tone {
    fn as_str(self) -> &'static str {
        match self {
            Self::Listening => "listening",
            Self::Wait => "wait",
            Self::Error => "error",
            Self::Success => "success",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Feedback {
    pub tone: Tone,
    pub title: &'static str,
    pub detail: &'static str,
}

/// 推一个状态给顶部条。可从任意线程调用。
pub fn show(app: &AppHandle, payload: Value) {
    let state = payload
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or("failed");
    let reason = payload.get("reason").and_then(Value::as_str);
    let feedback = feedback(state, reason);
    mic_panel::show_status(app, feedback.tone.as_str(), &display_text(state, &feedback));
}

/// 保持 D133 的单行胶囊：失败原因作为标题后的短句，放不下由 CSS 省略。
/// 录音态不塞提示，把宽度留给波形和计时。
fn display_text(state: &str, feedback: &Feedback) -> String {
    if state == "listening" || feedback.detail.is_empty() {
        feedback.title.to_string()
    } else {
        format!("{} · {}", feedback.title, feedback.detail)
    }
}

/// 延迟收起；有新状态时由 `mic_panel` 的 generation 保护，不会被旧定时器误收。
pub fn hide_later(app: &AppHandle, delay: std::time::Duration) {
    mic_panel::hide_later(app, delay);
}

fn reason_feedback(reason: &str) -> Feedback {
    let (title, detail) = match reason {
        "empty_transcript" => ("没听清，再试一次", ""),
        "asr_timeout" => ("电脑识别超时", "检查网络"),
        "insert_failed" => ("文本写入失败", "检查权限"),
        "cloud_not_configured" => ("百炼还没配置", "看语音页"),
        "cloud_key_invalid" => ("百炼 Key 无效", "看语音页"),
        "cloud_key_unavailable" => ("读不到百炼 Key", "看语音页"),
        "cloud_forbidden" => ("这个 Key 没有模型权限", "检查权限"),
        "cloud_rate_limited" => ("百炼限流了", "稍后再试"),
        "cloud_quota_exceeded" => ("百炼额度不足", "检查额度"),
        "cloud_model_not_found" => ("百炼模型不存在", "看语音页"),
        "cloud_network" => ("连不上百炼", "检查网络"),
        "cloud_timeout" => ("百炼响应超时", "再试一次"),
        "cloud_task_failed" => ("百炼识别失败", "再试一次"),
        "cloud_internal" => ("云端会话异常", "重启 App"),
        "session_busy" => ("手机正在处理上一段", "等上一段"),
        "bad_request" | "session_mismatch" => ("语音会话出了点问题", "再试一次"),
        _ => ("这次没成功", "再试一次"),
    };
    Feedback {
        tone: Tone::Error,
        title,
        detail,
    }
}

fn unavailable_feedback(reason: &str) -> Feedback {
    let (title, detail) = match reason {
        "multi_phone" => ("检测到多台手机", "只留一台"),
        "remote_disabled" => ("手机没开「电脑遥控录音」", "打开遥控"),
        "not_pet_page" => ("手机不在小跟班页面", "回到宠物页"),
        "standby_off" => ("手机没有开后台待命", "打开待命"),
        "notification_denied" => ("手机没有通知权限", "允许通知"),
        "service_failed" => ("手机待命服务启动失败", "重开 App"),
        "busy" => ("手机正在处理上一段语音", "等上一段"),
        "permission_denied" => ("手机没给麦克风权限", "允许麦克风"),
        "audio_blocked" => ("手机需要先点一下屏幕", "点一下"),
        "no_phone" => ("未连接手机麦克风", "打开手机"),
        _ => ("未连接手机麦克风", "打开手机"),
    };
    Feedback {
        tone: Tone::Error,
        title,
        detail,
    }
}

/// `{state, reason}` → 标题 + 短句。所有分支都必须返回非空标题。
pub fn feedback(state: &str, reason: Option<&str>) -> Feedback {
    match state {
        "connecting" => Feedback {
            tone: Tone::Wait,
            title: "正在连接手机…",
            detail: "等手机响应",
        },
        "requesting" => Feedback {
            tone: Tone::Wait,
            title: "快捷键已收到",
            detail: "正在联系",
        },
        "stopping" => Feedback {
            tone: Tone::Wait,
            title: "正在结束…",
            detail: "传完就结束",
        },
        "cancelling" => Feedback {
            tone: Tone::Wait,
            title: "正在取消…",
            detail: "不转写",
        },
        "listening" => Feedback {
            tone: Tone::Listening,
            title: "正在听",
            detail: "再按一次结束 · Esc 取消",
        },
        "processing" => Feedback {
            tone: Tone::Wait,
            title: "识别中…",
            detail: "马上进窗口",
        },
        "delivered" => Feedback {
            tone: Tone::Success,
            title: "已输入到当前窗口",
            detail: "",
        },
        "copied" => match reason.unwrap_or("") {
            "secure_input" => Feedback {
                tone: Tone::Success,
                title: "已复制（当前是密码框）",
                detail: "按 ⌘V",
            },
            "accessibility_off" => Feedback {
                tone: Tone::Success,
                title: "已复制；辅助功能未开",
                detail: "",
            },
            "target_mismatch" => Feedback {
                tone: Tone::Success,
                title: "已复制；焦点已变",
                detail: "已切换窗口",
            },
            "paste_failed" => Feedback {
                tone: Tone::Success,
                title: "已复制；自动粘贴失败",
                detail: "按 ⌘V",
            },
            _ => Feedback {
                tone: Tone::Success,
                title: "已复制到剪贴板",
                detail: "按 ⌘V",
            },
        },
        "failed" => match reason.unwrap_or("") {
            "ack_timeout" => Feedback {
                tone: Tone::Error,
                title: "手机没有响应",
                detail: "检查待命",
            },
            "start_timeout" => Feedback {
                tone: Tone::Error,
                title: "手机没有开始录音",
                detail: "再按一次",
            },
            "disconnected" => Feedback {
                tone: Tone::Error,
                title: "连接断了",
                detail: "正在重连",
            },
            other => reason_feedback(other),
        },
        "cancelled" => Feedback {
            tone: Tone::Wait,
            title: "已取消",
            detail: "不转写",
        },
        "unavailable" => unavailable_feedback(reason.unwrap_or("")),
        _ => Feedback {
            tone: Tone::Error,
            title: "这次没成功",
            detail: "再试一次",
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_phone_is_visible_and_actionable() {
        let feedback = feedback("unavailable", Some("no_phone"));
        assert_eq!(feedback.tone, Tone::Error);
        assert!(feedback.title.contains("未连接"));
        assert!(feedback.detail.contains("手机"));
    }

    #[test]
    fn ack_timeout_explains_phone_not_desktop() {
        let feedback = feedback("failed", Some("ack_timeout"));
        assert_eq!(feedback.tone, Tone::Error);
        assert!(feedback.title.contains("手机没有响应"));
        assert!(feedback.detail.contains("待命"));
    }

    #[test]
    fn start_timeout_tells_user_how_to_retry() {
        let feedback = feedback("failed", Some("start_timeout"));
        assert!(feedback.title.contains("没有开始录音"));
        assert!(feedback.detail.contains("再按一次"));
    }

    #[test]
    fn connecting_says_shortcut_was_received() {
        let feedback = feedback("connecting", None);
        assert_eq!(feedback.tone, Tone::Wait);
        assert!(feedback.detail.contains("响应"));
    }

    #[test]
    fn copied_secure_input_explains_manual_paste() {
        let feedback = feedback("copied", Some("secure_input"));
        assert_eq!(feedback.tone, Tone::Success);
        assert!(feedback.title.contains("密码框"));
        assert!(feedback.detail.contains("⌘V"));
    }

    #[test]
    fn unknown_reason_still_gets_a_message() {
        let feedback = feedback("failed", Some("something_new"));
        assert!(!feedback.title.is_empty());
        assert!(!feedback.detail.is_empty());
    }

    #[test]
    fn display_text_stays_single_line_and_omits_recording_hint() {
        let listening = feedback("listening", None);
        assert_eq!(display_text("listening", &listening), "正在听");

        let no_phone = feedback("unavailable", Some("no_phone"));
        let text = display_text("unavailable", &no_phone);
        assert!(text.starts_with("未连接手机麦克风 · "));
        assert!(!text.contains('\n'));
    }
}
