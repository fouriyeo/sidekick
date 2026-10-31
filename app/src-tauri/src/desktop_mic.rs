use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;

use crate::asr_models::{ModelManager, TranscribeFailure};
use crate::clipboard_manager::ClipboardManager;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontApp {
    pub bundle_id: Option<String>,
    pub name: Option<String>,
}

impl FrontApp {
    fn same_as(&self, other: &Self) -> bool {
        match (&self.bundle_id, &other.bundle_id) {
            (Some(left), Some(right)) => left == right,
            _ => matches!((&self.name, &other.name), (Some(left), Some(right)) if left == right),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityInfo {
    pub trusted: bool,
    pub app_name: String,
    pub executable_path: String,
    pub is_dev: bool,
}

#[derive(Debug)]
pub struct MicInsertResult {
    pub outcome: &'static str,
    pub reason: Option<&'static str>,
    pub text: String,
    pub truncated: bool,
}

#[derive(Debug)]
pub struct MicFailure {
    pub code: &'static str,
    pub message: String,
}

#[cfg(target_os = "macos")]
#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    fn IsSecureEventInputEnabled() -> bool;
}

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

pub fn front_app() -> Option<FrontApp> {
    let asn = Command::new("lsappinfo").arg("front").output().ok()?;
    let asn = String::from_utf8_lossy(&asn.stdout).trim().to_string();
    if asn.is_empty() {
        return None;
    }

    let info = Command::new("lsappinfo")
        .args(["info", "-only", "bundleid,name", &asn])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&info.stdout);

    Some(FrontApp {
        bundle_id: extract_quoted(&text, "\"CFBundleIdentifier\"=\""),
        name: extract_quoted(&text, "\"LSDisplayName\"=\""),
    })
}

fn extract_quoted(text: &str, marker: &str) -> Option<String> {
    let start = text.find(marker)? + marker.len();
    let rest = &text[start..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn secure_input_enabled() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { IsSecureEventInputEnabled() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

pub fn accessibility_trusted() -> bool {
    #[cfg(target_os = "macos")]
    {
        unsafe { AXIsProcessTrusted() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

fn paste_cmd_v() -> bool {
    #[cfg(target_os = "macos")]
    {
        use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
        use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

        let Ok(source) = CGEventSource::new(CGEventSourceStateID::HIDSystemState) else {
            return false;
        };
        let Ok(down) = CGEvent::new_keyboard_event(source.clone(), 9, true) else {
            return false;
        };
        down.set_flags(CGEventFlags::CGEventFlagCommand);
        down.post(CGEventTapLocation::HID);

        std::thread::sleep(Duration::from_millis(12));

        let Ok(up) = CGEvent::new_keyboard_event(source, 9, false) else {
            return false;
        };
        up.set_flags(CGEventFlags::CGEventFlagCommand);
        up.post(CGEventTapLocation::HID);
        true
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

pub fn transcribe_and_insert(
    models: &ModelManager,
    clipboard: &ClipboardManager,
    pcm16: &[u8],
    expected_app: Option<&FrontApp>,
    cancel: &AtomicBool,
) -> Result<MicInsertResult, MicFailure> {
    let transcript = models
        .transcribe(pcm16, cancel)
        .map_err(failure_from_transcribe)?;

    if cancel.load(Ordering::Relaxed) {
        return Err(MicFailure {
            code: "asr_timeout",
            message: "转写超时".to_string(),
        });
    }

    clipboard
        .write_text(&transcript.text)
        .map_err(|error| MicFailure {
            code: "insert_failed",
            message: error,
        })?;

    let current_app = front_app();
    let same_app = expected_app
        .zip(current_app.as_ref())
        .map(|(expected, current)| expected.same_as(current))
        .unwrap_or(false);
    let secure = secure_input_enabled();
    let trusted = accessibility_trusted();

    let (outcome, reason) = if !same_app {
        ("copied", Some("target_mismatch"))
    } else if secure {
        ("copied", Some("secure_input"))
    } else if !trusted {
        ("copied", Some("accessibility_off"))
    } else if paste_cmd_v() {
        ("inserted", None)
    } else {
        ("copied", Some("paste_failed"))
    };

    eprintln!(
        "[mic] insert outcome={outcome} reason={} same_app={same_app} secure={secure} trusted={trusted}",
        reason.unwrap_or("ok")
    );

    Ok(MicInsertResult {
        outcome,
        reason,
        text: transcript.text,
        truncated: transcript.truncated,
    })
}

fn failure_from_transcribe(error: TranscribeFailure) -> MicFailure {
    MicFailure {
        code: error.code(),
        message: error.message(),
    }
}

#[tauri::command]
pub fn accessibility_info() -> AccessibilityInfo {
    let executable = std::env::current_exe().unwrap_or_default();
    let executable_path = executable.to_string_lossy().to_string();
    let app_name = executable
        .file_stem()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "Sidekick".to_string());
    let is_dev = executable_path.contains("/target/debug/");

    AccessibilityInfo {
        trusted: accessibility_trusted(),
        app_name,
        executable_path,
        is_dev,
    }
}

#[tauri::command]
pub fn accessibility_open_settings() -> Result<(), String> {
    Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status()
        .map_err(|error| format!("打开系统设置失败: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn accessibility_request() -> AccessibilityInfo {
    #[cfg(target_os = "macos")]
    {
        let _ = macos_accessibility_client::accessibility::application_is_trusted_with_prompt();
    }
    accessibility_info()
}

#[tauri::command]
pub fn accessibility_reveal_app() -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| format!("找不到当前程序: {error}"))?;
    Command::new("open")
        .arg("-R")
        .arg(&executable)
        .status()
        .map_err(|error| format!("打开 Finder 失败: {error}"))?;
    Ok(())
}
