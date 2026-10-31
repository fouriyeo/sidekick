use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::app_paths;

const MAX_ITEMS: usize = 100;
const MAX_TEXT_CHARS: usize = 50_000;
const POLL_MS: u64 = 500;
const EVENT_CHANGED: &str = "clipboard-changed";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardItem {
    pub id: String,
    pub text: String,
    pub kind: String,
    pub created_at: u64,
    pub last_used_at: u64,
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSnapshot {
    pub enabled: bool,
    pub items: Vec<ClipboardItem>,
    pub path: String,
    pub max_items: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct ClipboardFile {
    version: u32,
    enabled: bool,
    items: Vec<ClipboardItem>,
}

impl Default for ClipboardFile {
    fn default() -> Self {
        Self {
            version: 1,
            enabled: true,
            items: Vec::new(),
        }
    }
}

struct Inner {
    enabled: bool,
    items: Vec<ClipboardItem>,
}

pub struct ClipboardManager {
    app: AppHandle,
    path: PathBuf,
    inner: Mutex<Inner>,
    skip_next: Mutex<Option<String>>,
    counter: AtomicU64,
}

impl ClipboardManager {
    pub fn new(app: AppHandle) -> Self {
        let path = app_paths::clipboard_file();
        let mut file = load_file(&path).unwrap_or_default();
        sort_items(&mut file.items);
        trim_items(&mut file.items);

        Self {
            app,
            path,
            inner: Mutex::new(Inner {
                enabled: file.enabled,
                items: file.items,
            }),
            skip_next: Mutex::new(None),
            counter: AtomicU64::new(0),
        }
    }

    pub fn start(self: &Arc<Self>) {
        let manager = Arc::clone(self);
        thread::spawn(move || {
            let mut last_count = pasteboard_change_count();
            loop {
                thread::sleep(Duration::from_millis(POLL_MS));
                let count = pasteboard_change_count();
                if count == last_count {
                    continue;
                }
                last_count = count;

                let skipped = manager.skip_next.lock().unwrap().take();
                let Some(text) = read_pasteboard_text() else {
                    continue;
                };
                if skipped.as_deref() == Some(text.as_str()) {
                    continue;
                }
                manager.add_text(text);
            }
        });
    }

    pub fn snapshot(&self) -> ClipboardSnapshot {
        let inner = self.inner.lock().unwrap();
        self.snapshot_locked(&inner)
    }

    fn snapshot_locked(&self, inner: &Inner) -> ClipboardSnapshot {
        ClipboardSnapshot {
            enabled: inner.enabled,
            items: inner.items.clone(),
            path: self.path.to_string_lossy().to_string(),
            max_items: MAX_ITEMS,
        }
    }

    pub fn write_text(&self, text: &str) -> Result<(), String> {
        *self.skip_next.lock().unwrap() = Some(text.to_string());
        let mut clipboard =
            arboard::Clipboard::new().map_err(|error| format!("剪贴板不可用: {error}"))?;
        if let Err(error) = clipboard.set_text(text) {
            *self.skip_next.lock().unwrap() = None;
            return Err(format!("写入剪贴板失败: {error}"));
        }
        Ok(())
    }

    pub fn copy_item(&self, id: &str) -> Result<ClipboardSnapshot, String> {
        let text = {
            let inner = self.inner.lock().unwrap();
            inner
                .items
                .iter()
                .find(|item| item.id == id)
                .map(|item| item.text.clone())
                .ok_or_else(|| "这条剪贴板记录不存在".to_string())?
        };

        self.write_text(&text)?;

        let mut inner = self.inner.lock().unwrap();
        let now = now_ms();
        if let Some(item) = inner.items.iter_mut().find(|item| item.id == id) {
            item.last_used_at = now;
        }
        sort_items(&mut inner.items);
        let snapshot = self.persist_and_snapshot(&mut inner);
        let _ = self.app.emit(EVENT_CHANGED, snapshot.clone());
        Ok(snapshot)
    }

    pub fn toggle_pin(&self, id: &str) -> Result<ClipboardSnapshot, String> {
        let mut inner = self.inner.lock().unwrap();
        let item = inner
            .items
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| "这条剪贴板记录不存在".to_string())?;
        item.pinned = !item.pinned;
        sort_items(&mut inner.items);
        let snapshot = self.persist_and_snapshot(&mut inner);
        let _ = self.app.emit(EVENT_CHANGED, snapshot.clone());
        Ok(snapshot)
    }

    pub fn delete(&self, id: &str) -> Result<ClipboardSnapshot, String> {
        let mut inner = self.inner.lock().unwrap();
        inner.items.retain(|item| item.id != id);
        let snapshot = self.persist_and_snapshot(&mut inner);
        let _ = self.app.emit(EVENT_CHANGED, snapshot.clone());
        Ok(snapshot)
    }

    pub fn clear(&self) -> Result<ClipboardSnapshot, String> {
        let mut inner = self.inner.lock().unwrap();
        inner.items.clear();
        let snapshot = self.persist_and_snapshot(&mut inner);
        let _ = self.app.emit(EVENT_CHANGED, snapshot.clone());
        Ok(snapshot)
    }

    pub fn set_enabled(&self, enabled: bool) -> Result<ClipboardSnapshot, String> {
        let mut inner = self.inner.lock().unwrap();
        inner.enabled = enabled;
        let snapshot = self.persist_and_snapshot(&mut inner);
        let _ = self.app.emit(EVENT_CHANGED, snapshot.clone());
        Ok(snapshot)
    }

    fn add_text(&self, text: String) {
        let trimmed = text.trim();
        if trimmed.is_empty() || trimmed.chars().count() > MAX_TEXT_CHARS {
            return;
        }

        let mut inner = self.inner.lock().unwrap();
        if !inner.enabled {
            return;
        }

        let now = now_ms();
        let existing_pinned = inner
            .items
            .iter()
            .find(|item| item.text == text)
            .map(|item| item.pinned)
            .unwrap_or(false);
        inner.items.retain(|item| item.text != text);

        let kind = item_kind(trimmed).to_string();
        let id = format!("{now}-{}", self.counter.fetch_add(1, Ordering::Relaxed));
        inner.items.push(ClipboardItem {
            id,
            text,
            kind,
            created_at: now,
            last_used_at: now,
            pinned: existing_pinned,
        });
        sort_items(&mut inner.items);
        trim_items(&mut inner.items);
        let snapshot = self.persist_and_snapshot(&mut inner);
        let _ = self.app.emit(EVENT_CHANGED, snapshot);
    }

    fn persist_and_snapshot(&self, inner: &mut Inner) -> ClipboardSnapshot {
        if let Err(error) = save_file(&self.path, inner) {
            eprintln!("[clipboard] save failed: {error}");
        }
        self.snapshot_locked(inner)
    }
}

fn item_kind(text: &str) -> &'static str {
    let lower = text.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")
    {
        "url"
    } else {
        "text"
    }
}

fn sort_items(items: &mut [ClipboardItem]) {
    items.sort_by(|left, right| {
        right
            .pinned
            .cmp(&left.pinned)
            .then(right.last_used_at.cmp(&left.last_used_at))
    });
}

fn trim_items(items: &mut Vec<ClipboardItem>) {
    while items.len() > MAX_ITEMS {
        items.pop();
    }
}

pub fn should_skip_type(kind: &str) -> bool {
    let lower = kind.to_ascii_lowercase();
    lower.starts_with("org.nspasteboard.")
        || lower.contains("concealed")
        || lower.contains("transient")
        || lower.contains("autogenerated")
        || lower.starts_with("com.agilebits.")
        || lower.starts_with("com.1password.")
        || lower.starts_with("com.bitwarden.")
        || lower.starts_with("com.lastpass.")
}

#[cfg(target_os = "macos")]
fn pasteboard_change_count() -> i64 {
    use objc2_app_kit::NSPasteboard;
    NSPasteboard::generalPasteboard().changeCount() as i64
}

#[cfg(target_os = "macos")]
fn read_pasteboard_text() -> Option<String> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};

    let pasteboard = NSPasteboard::generalPasteboard();
    let types = pasteboard.types()?;
    if types.iter().any(|kind| should_skip_type(&kind.to_string())) {
        return None;
    }

    let plain_text_type = unsafe { NSPasteboardTypeString };
    let value = pasteboard.stringForType(plain_text_type)?;
    let text = value.to_string();
    if text.is_empty() { None } else { Some(text) }
}

#[cfg(not(target_os = "macos"))]
fn pasteboard_change_count() -> i64 {
    0
}

#[cfg(not(target_os = "macos"))]
fn read_pasteboard_text() -> Option<String> {
    None
}

fn load_file(path: &Path) -> Option<ClipboardFile> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn save_file(path: &Path, inner: &Inner) -> Result<(), String> {
    app_paths::ensure_parent(path).map_err(|error| format!("创建目录失败: {error}"))?;
    let payload = ClipboardFile {
        version: 1,
        enabled: inner.enabled,
        items: inner.items.clone(),
    };
    let bytes = serde_json::to_vec(&payload).map_err(|error| format!("序列化失败: {error}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|error| format!("写入失败: {error}"))?;
    set_private_permissions(&temp);
    fs::rename(&temp, path).map_err(|error| format!("保存失败: {error}"))
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) {}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn clipboard_list(manager: State<'_, Arc<ClipboardManager>>) -> ClipboardSnapshot {
    manager.snapshot()
}

#[tauri::command]
pub fn clipboard_status(manager: State<'_, Arc<ClipboardManager>>) -> ClipboardSnapshot {
    manager.snapshot()
}

#[tauri::command]
pub fn clipboard_copy(
    manager: State<'_, Arc<ClipboardManager>>,
    id: String,
) -> Result<ClipboardSnapshot, String> {
    manager.copy_item(&id)
}

#[tauri::command]
pub fn clipboard_toggle_pin(
    manager: State<'_, Arc<ClipboardManager>>,
    id: String,
) -> Result<ClipboardSnapshot, String> {
    manager.toggle_pin(&id)
}

#[tauri::command]
pub fn clipboard_delete(
    manager: State<'_, Arc<ClipboardManager>>,
    id: String,
) -> Result<ClipboardSnapshot, String> {
    manager.delete(&id)
}

#[tauri::command]
pub fn clipboard_clear(
    manager: State<'_, Arc<ClipboardManager>>,
) -> Result<ClipboardSnapshot, String> {
    manager.clear()
}

#[tauri::command]
pub fn clipboard_set_enabled(
    manager: State<'_, Arc<ClipboardManager>>,
    enabled: bool,
) -> Result<ClipboardSnapshot, String> {
    manager.set_enabled(enabled)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, text: &str, pinned: bool, last_used_at: u64) -> ClipboardItem {
        ClipboardItem {
            id: id.to_string(),
            text: text.to_string(),
            kind: item_kind(text).to_string(),
            created_at: last_used_at,
            last_used_at,
            pinned,
        }
    }

    #[test]
    fn filters_pasteboard_markers() {
        assert!(should_skip_type("org.nspasteboard.ConcealedType"));
        assert!(should_skip_type("org.nspasteboard.TransientType"));
        assert!(should_skip_type("org.nspasteboard.AutoGeneratedType"));
        assert!(should_skip_type("com.agilebits.onepassword"));
        assert!(!should_skip_type("public.utf8-plain-text"));
        assert!(!should_skip_type("public.html"));
    }

    #[test]
    fn sorts_pinned_first() {
        let mut items = vec![
            item("a", "a", false, 10),
            item("b", "b", true, 5),
            item("c", "c", false, 20),
        ];
        sort_items(&mut items);
        assert_eq!(
            items
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["b", "c", "a"]
        );
    }

    #[test]
    fn trims_to_max_items() {
        let mut items: Vec<ClipboardItem> = (0..MAX_ITEMS + 5)
            .map(|index| item(&index.to_string(), "x", false, index as u64))
            .collect();
        sort_items(&mut items);
        trim_items(&mut items);
        assert_eq!(items.len(), MAX_ITEMS);
    }

    #[test]
    fn detects_urls() {
        assert_eq!(item_kind("https://example.com"), "url");
        assert_eq!(item_kind("hello"), "text");
    }
}
