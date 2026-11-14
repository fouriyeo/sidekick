//! 桌面快捷键遥控手机录音的中间层。
//!
//! 数据流：
//! `hotkey::Action --> RemoteMic --> /ws 定向发送 mic.remote --> 手机开始/结束录音`
//! `手机 --> mic.remote.status / mic.remote.ack --> desktop_server --> RemoteMic`
//! `desktop_server（mic.start/stop/result/cancel） --> RemoteMic --> mic_hud`
//!
//! 约束：
//! - 命令**只允许桌面后端发起**（快捷键），绝不接受 WS 外部输入——当前 WS 无鉴权，
//!   否则同网段任何人都能开麦；
//! - 会话 id 仍由手机生成、`mic.start` 仍由手机发起：ASR、插入、安全闸门、
//!   记账、看门狗全部复用，本模块不碰音频；
//! - 单手机：capable 正好 1 台才下发；0 台提示「未连接」，多台拒绝（不广播双开）。

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, Weak};

use tokio::sync::mpsc;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::hotkey;
use crate::mic_hud;

/// 等手机 ack 的上限；超时按「手机没有响应」提示，不建会话。
pub const ACK_TIMEOUT: Duration = Duration::from_millis(2000);
/// 终态提示停留时长。
pub const HUD_LINGER: Duration = Duration::from_millis(2500);

type SenderMap = Arc<Mutex<HashMap<u64, mpsc::UnboundedSender<String>>>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    Idle,
    Connecting,
    Listening,
    Processing,
}

struct Pending {
    request_id: String,
}

pub struct RemoteMic {
    app: AppHandle,
    /// 由 `desktop_server::start` 注入：client_id → 定向发送端。
    senders: Mutex<Option<SenderMap>>,
    /// 上报过「允许电脑遥控」的手机；断连即清。
    capable: Mutex<HashMap<u64, Instant>>,
    pending: Mutex<Option<Pending>>,
    phase: Mutex<Phase>,
    seq: AtomicU64,
    self_weak: OnceLock<Weak<RemoteMic>>,
}

impl RemoteMic {
    pub fn new(app: AppHandle) -> Arc<Self> {
        let this = Arc::new(Self {
            app: app.clone(),
            senders: Mutex::new(None),
            capable: Mutex::new(HashMap::new()),
            pending: Mutex::new(None),
            phase: Mutex::new(Phase::Idle),
            seq: AtomicU64::new(0),
            self_weak: OnceLock::new(),
        });
        let _ = this.self_weak.set(Arc::downgrade(&this));
        let _ = app;
        this
    }

    pub fn attach_senders(&self, senders: SenderMap) {
        if let Ok(mut slot) = self.senders.lock() {
            *slot = Some(senders);
        }
    }

    /// 手机连上/改设置时上报「是否允许电脑遥控」。
    pub fn status(&self, client_id: u64, enabled: bool) {
        let Ok(mut capable) = self.capable.lock() else {
            return;
        };
        if enabled {
            capable.insert(client_id, Instant::now());
        } else {
            capable.remove(&client_id);
        }
    }

    pub fn disconnect(&self, client_id: u64) {
        if let Ok(mut capable) = self.capable.lock() {
            capable.remove(&client_id);
        }
    }

    // ---- 快捷键动作 ----------------------------------------------------------

    /// 双击/按下：空闲则开始，正在听则结束。
    pub fn on_trigger(&self) {
        let phase = self.phase();
        match self.phase() {
            Phase::Idle => self.start(),
            Phase::Listening => self.send_action("stop"),
            // 连接中/识别中：忽略，避免抖动产生第二个会话。
            Phase::Connecting | Phase::Processing => {}
        }
    }

    /// 按住式松开：只在正在听时结束。
    pub fn on_release(&self) {
        if self.phase() == Phase::Listening {
            self.send_action("stop");
        }
    }

    /// 录音中按 Esc：丢弃这段音频，不转写、不插入。
    pub fn on_cancel(&self) {
        if self.phase() != Phase::Listening {
            return;
        }
        self.send_action("cancel");
    }

    // ---- 服务端回调 ----------------------------------------------------------

    pub fn notify_listening(&self) {
        self.set_phase(Phase::Listening);
        *self.pending.lock().unwrap() = None;
        hotkey::set_recording(&self.app, true);
        crate::mic_panel::show_recording(&self.app);
        // startedAt 由 HUD 用来算计时。
        mic_hud::show(
            &self.app,
            json!({ "v": 1, "state": "listening", "startedAt": now_ms(), "ts": now_ms() }),
        );
    }

    pub fn notify_processing(&self) {
        crate::mic_panel::show(&self.app, "识别中…");
        self.set_phase(Phase::Processing);
        *self.pending.lock().unwrap() = None;
        mic_hud::show(
            &self.app,
            json!({ "v": 1, "state": "processing", "ts": now_ms() }),
        );
    }

    /// `outcome`/`reason` 直接用协议里的值；HUD 只在终态停留 2.5 秒。
    pub fn notify_result(&self, outcome: &str, reason: Option<&str>) {
        self.set_phase(Phase::Idle);
        *self.pending.lock().unwrap() = None;
        hotkey::set_recording(&self.app, false);
        let state = match outcome {
            "inserted" => "delivered",
            "copied" => "copied",
            _ => "failed",
        };
        mic_hud::show(
            &self.app,
            json!({ "v": 1, "state": state, "reason": reason, "ts": now_ms() }),
        );
        crate::mic_panel::show(
            &self.app,
            if state == "failed" {
                "识别/输入失败，看顶部提示"
            } else {
                "已输入到当前窗口"
            },
        );
        let app = self.app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(HUD_LINGER).await;
            crate::mic_panel::hide(&app);
        });
        mic_hud::hide_later(&self.app, HUD_LINGER);
    }

    pub fn notify_cancelled(&self, reason: Option<&str>) {
        self.set_phase(Phase::Idle);
        *self.pending.lock().unwrap() = None;
        hotkey::set_recording(&self.app, false);
        mic_hud::show(
            &self.app,
            json!({ "v": 1, "state": "cancelled", "reason": reason, "ts": now_ms() }),
        );
        mic_hud::hide_later(&self.app, HUD_LINGER);
    }

    pub fn on_ack(&self, value: &Value) {
        let Some(request_id) = value.get("requestId").and_then(Value::as_str) else {
            return;
        };
        let ok = value.get("ok").and_then(Value::as_bool).unwrap_or(false);
        let code = value.get("code").and_then(Value::as_str);

        let matched = {
            let Ok(mut pending) = self.pending.lock() else {
                return;
            };
            match pending.as_ref() {
                Some(current) if current.request_id == request_id => {
                    if !ok {
                        *pending = None;
                    }
                    true
                }
                _ => false,
            }
        };
        // 成功 ack 只代表手机「答应了」，等 mic.start/mic.ready 才进 listening。
        if !matched || ok {
            return;
        }

        self.set_phase(Phase::Idle);
        mic_hud::show(
            &self.app,
            json!({ "v": 1, "state": "unavailable", "reason": code, "ts": now_ms() }),
        );
        mic_hud::hide_later(&self.app, HUD_LINGER);
    }

    // ---- 内部 ----------------------------------------------------------------

    fn phase(&self) -> Phase {
        *self.phase.lock().unwrap()
    }

    fn set_phase(&self, phase: Phase) {
        *self.phase.lock().unwrap() = phase;
    }

    fn capable_targets(&self) -> Vec<u64> {
        let Ok(capable) = self.capable.lock() else {
            return Vec::new();
        };
        capable.keys().copied().collect()
    }

    fn start(&self) {
        let targets = self.capable_targets();
        match targets.len() {
            0 => {
                mic_hud::show(
                    &self.app,
                    json!({ "v": 1, "state": "unavailable", "reason": "no_phone", "ts": now_ms() }),
                );
                mic_hud::hide_later(&self.app, Duration::from_millis(2200));
            }
            1 => {
                let request_id = self.next_request_id();
                if !self.send(targets[0], "start", &request_id) {
                    mic_hud::show(
                        &self.app,
                        json!({ "v": 1, "state": "failed", "reason": "disconnected", "ts": now_ms() }),
                    );
                    mic_hud::hide_later(&self.app, HUD_LINGER);
                    return;
                }
                *self.pending.lock().unwrap() = Some(Pending {
                    request_id: request_id.clone(),
                });
                self.set_phase(Phase::Connecting);
                mic_hud::show(
                    &self.app,
                    json!({ "v": 1, "state": "connecting", "ts": now_ms() }),
                );
                self.arm_ack_timeout(request_id);
            }
            _ => {
                mic_hud::show(
                    &self.app,
                    json!({ "v": 1, "state": "unavailable", "reason": "multi_phone", "ts": now_ms() }),
                );
                mic_hud::hide_later(&self.app, HUD_LINGER);
            }
        }
    }

    fn send_action(&self, action: &'static str) {
        let targets = self.capable_targets();
        if targets.len() != 1 {
            mic_hud::show(
                &self.app,
                json!({
                    "v": 1,
                    "state": "unavailable",
                    "reason": if targets.is_empty() { "no_phone" } else { "multi_phone" },
                    "ts": now_ms(),
                }),
            );
            mic_hud::hide_later(&self.app, HUD_LINGER);
            return;
        }
        let request_id = self.next_request_id();
        if !self.send(targets[0], action, &request_id) {
            mic_hud::show(
                &self.app,
                json!({ "v": 1, "state": "failed", "reason": "disconnected", "ts": now_ms() }),
            );
            mic_hud::hide_later(&self.app, HUD_LINGER);
            return;
        }
        if action == "stop" || action == "cancel" {
            *self.pending.lock().unwrap() = Some(Pending {
                request_id: request_id.clone(),
            });
            self.arm_ack_timeout(request_id);
        }
    }

    fn send(&self, client_id: u64, action: &'static str, request_id: &str) -> bool {
        let payload = json!({
            "v": 1,
            "type": "mic.remote",
            "requestId": request_id,
            "action": action,
            "ts": now_ms(),
        })
        .to_string();
        let Ok(slot) = self.senders.lock() else {
            return false;
        };
        let Some(senders) = slot.as_ref() else {
            return false;
        };
        let Ok(senders) = senders.lock() else {
            return false;
        };
        let Some(tx) = senders.get(&client_id) else {
            return false;
        };
        tx.send(payload).is_ok()
    }

    fn next_request_id(&self) -> String {
        let seq = self.seq.fetch_add(1, Ordering::Relaxed);
        format!("h{:013x}{:06x}", now_ms(), seq & 0xff_ffff)
    }

    fn arm_ack_timeout(&self, request_id: String) {
        let weak = self.self_weak.get().cloned();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(ACK_TIMEOUT).await;
            let Some(this) = weak.and_then(|weak| weak.upgrade()) else {
                return;
            };
            let expired = {
                let Ok(mut pending) = this.pending.lock() else {
                    return;
                };
                match pending.as_ref() {
                    Some(current) if current.request_id == request_id => {
                        *pending = None;
                        true
                    }
                    _ => false,
                }
            };
            if !expired {
                return;
            }
            this.set_phase(Phase::Idle);
            mic_hud::show(
                &this.app,
                json!({ "v": 1, "state": "failed", "reason": "ack_timeout", "ts": now_ms() }),
            );
            mic_hud::hide_later(&this.app, HUD_LINGER);
        });
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(action: &str, request_id: &str) -> Value {
        json!({ "v": 1, "type": "mic.remote", "requestId": request_id, "action": action, "ts": 1 })
    }

    #[test]
    fn remote_payload_has_action_and_request_id() {
        let value = payload("start", "h1");
        assert_eq!(value["action"], "start");
        assert_eq!(value["requestId"], "h1");
    }
}
