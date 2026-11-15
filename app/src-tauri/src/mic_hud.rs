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
    mic_panel::show_status(app, feedback.tone.as_str(), feedback.title, feedback.detail);
}

/// 延迟收起；有新状态时由 `mic_panel` 的 generation 保护，不会被旧定时器误收。
pub fn hide_later(app: &AppHandle, delay: std::time::Duration) {
    mic_panel::hide_later(app, delay);
}

fn reason_feedback(reason: &str) -> Feedback {
    let (title, detail) = match reason {
        "empty_transcript" => ("没听清，再试一次", "靠近手机、说完整一句"),
        "asr_timeout" => ("电脑识别超时", "检查网络和百炼配置，再试一次"),
        "insert_failed" => ("文本写入失败", "检查剪贴板/磁盘权限，再试一次"),
        "cloud_not_configured" => ("百炼还没配置", "到「语音」页填地址和 API Key"),
        "cloud_key_invalid" => ("百炼 Key 无效", "到「语音」页重新保存 Key"),
        "cloud_key_unavailable" => ("读不到百炼 Key", "到「语音」页重新保存 Key"),
        "cloud_forbidden" => ("这个 Key 没有模型权限", "检查百炼业务空间/模型权限"),
        "cloud_rate_limited" => ("百炼限流了", "等一会儿再按一次"),
        "cloud_quota_exceeded" => ("百炼额度不足", "去百炼控制台检查额度"),
        "cloud_model_not_found" => ("百炼模型不存在", "到「语音」页恢复推荐模型"),
        "cloud_network" => ("连不上百炼", "检查电脑网络后重试"),
        "cloud_timeout" => ("百炼响应超时", "这段没转完，再试一次"),
        "cloud_task_failed" => ("百炼识别失败", "再试一次"),
        "cloud_internal" => ("云端会话异常", "重启 Sidekick 再试"),
        "session_busy" => ("手机正在处理上一段", "等这次结果出来再按"),
        "bad_request" | "session_mismatch" => ("语音会话出了点问题", "再按一次快捷键重试"),
        _ => ("这次没成功", "再按一次快捷键重试"),
    };
    Feedback {
        tone: Tone::Error,
        title,
        detail,
    }
}

fn unavailable_feedback(reason: &str) -> Feedback {
    let (title, detail) = match reason {
        "multi_phone" => ("检测到多台手机", "只保留一台手机在待命"),
        "remote_disabled" => ("手机没开「电脑遥控录音」", "手机上 更多 › 麦克风 打开即可"),
        "not_pet_page" => ("手机不在小跟班页面", "解锁手机、回到宠物页再试"),
        "standby_off" => (
            "手机没有开后台待命",
            "手机上打开「后台待命」，或让手机留在小跟班页面",
        ),
        "notification_denied" => (
            "手机没有通知权限",
            "没有常驻通知就不能后台开麦；去系统设置允许通知",
        ),
        "service_failed" => ("手机待命服务启动失败", "重新打开 Sidekick 或重启手机"),
        "busy" => ("手机正在处理上一段语音", "等这次识别结束再按"),
        "permission_denied" => ("手机没给麦克风权限", "在手机上点一次麦克风并允许录音"),
        "audio_blocked" => ("手机需要先点一下屏幕", "安卓要求先有触摸才能开麦"),
        "no_phone" => (
            "未连接手机麦克风",
            "打开手机小跟班并保持连接；锁屏可开「后台待命」",
        ),
        _ => (
            "未连接手机麦克风",
            "打开手机小跟班并保持连接；锁屏可开「后台待命」",
        ),
    };
    Feedback {
        tone: Tone::Error,
        title,
        detail,
    }
}

/// `{state, reason}` → 标题 + 第二行解释。所有分支都必须返回非空标题。
pub fn feedback(state: &str, reason: Option<&str>) -> Feedback {
    match state {
        "connecting" => Feedback {
            tone: Tone::Wait,
            title: "正在连接手机…",
            detail: "快捷键已触发，等手机响应",
        },
        "requesting" => Feedback {
            tone: Tone::Wait,
            title: "快捷键已收到",
            detail: "正在联系手机…",
        },
        "stopping" => Feedback {
            tone: Tone::Wait,
            title: "正在结束…",
            detail: "等手机把这段音频传完",
        },
        "cancelling" => Feedback {
            tone: Tone::Wait,
            title: "正在取消…",
            detail: "这段录音不会转写",
        },
        "listening" => Feedback {
            tone: Tone::Listening,
            title: "正在听",
            detail: "再按一次结束 · Esc 取消",
        },
        "processing" => Feedback {
            tone: Tone::Wait,
            title: "识别中…",
            detail: "说完的文字马上进当前窗口",
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
                detail: "密码框不能自动粘贴，按 ⌘V 手动粘贴",
            },
            "accessibility_off" => Feedback {
                tone: Tone::Success,
                title: "已复制；辅助功能未开",
                detail: "到 系统设置 › 隐私与安全性 › 辅助功能 打开 Sidekick",
            },
            "target_mismatch" => Feedback {
                tone: Tone::Success,
                title: "已复制；焦点已变",
                detail: "录音期间切换了窗口，没有自动粘贴",
            },
            "paste_failed" => Feedback {
                tone: Tone::Success,
                title: "已复制；自动粘贴失败",
                detail: "按 ⌘V 手动粘贴",
            },
            _ => Feedback {
                tone: Tone::Success,
                title: "已复制到剪贴板",
                detail: "按 ⌘V 手动粘贴",
            },
        },
        "failed" => match reason.unwrap_or("") {
            "ack_timeout" => Feedback {
                tone: Tone::Error,
                title: "手机没有响应",
                detail: "确认手机开了「后台待命」，或回到小跟班页面再试",
            },
            "start_timeout" => Feedback {
                tone: Tone::Error,
                title: "手机没有开始录音",
                detail: "再按一次；仍无反应就看手机「后台待命」是否还在",
            },
            "disconnected" => Feedback {
                tone: Tone::Error,
                title: "连接断了",
                detail: "手机可能切网/被系统回收；Rust 会自动重连，稍后再按",
            },
            other => reason_feedback(other),
        },
        "cancelled" => Feedback {
            tone: Tone::Wait,
            title: "已取消",
            detail: "这段录音不会转写",
        },
        "unavailable" => unavailable_feedback(reason.unwrap_or("")),
        _ => Feedback {
            tone: Tone::Error,
            title: "这次没成功",
            detail: "再按一次快捷键重试",
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
        assert!(feedback.detail.contains("后台待命"));
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
        assert!(feedback.detail.contains("快捷键已触发"));
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
}
