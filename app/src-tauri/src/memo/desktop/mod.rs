//! 桌面端镜像：配对、接收同步、只读查询。

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, State};

use crate::memo::db::{MemoDb, MemoRow};
use crate::memo::storage::MemoPaths;
use crate::memo::types::{MemoDetail, MemoStatus, MemoSummary, MemoType};
use crate::memo::now_ms;

const CODE_TTL_MS: i64 = 2 * 60 * 1000;
const MAX_CODE_ATTEMPTS: u32 = 3;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairCodeView {
    pub code: String,
    pub expires_at: i64,
}

struct PairCode {
    code: String,
    expires_at: i64,
    attempts: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Device {
    device_id: String,
    #[serde(default)]
    name: Option<String>,
    token_hash: String,
    paired_at: i64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DevicesFile {
    #[serde(default)]
    devices: Vec<Device>,
}

struct Upload {
    path: PathBuf,
    bytes: i64,
    offset: u64,
    sha256: String,
}

/// 桌面端备忘录中心：SQLite 镜像 + 配对表 + 上传中的音频。
pub struct MemoHub {
    app: AppHandle,
    pub db: Arc<MemoDb>,
    pub paths: MemoPaths,
    devices: Mutex<DevicesFile>,
    pair_code: Mutex<Option<PairCode>>,
    uploads: Mutex<HashMap<String, Upload>>,
    trusted: Mutex<HashSet<u64>>,
}

impl MemoHub {
    pub fn new(app: AppHandle) -> Result<Self, String> {
        let paths = MemoPaths::desktop()?;
        let db = Arc::new(MemoDb::open(&paths.db)?);
        let devices = std::fs::read_to_string(&paths.devices)
            .ok()
            .and_then(|raw| serde_json::from_str::<DevicesFile>(&raw).ok())
            .unwrap_or_default();
        Ok(Self {
            app,
            db,
            paths,
            devices: Mutex::new(devices),
            pair_code: Mutex::new(None),
            uploads: Mutex::new(HashMap::new()),
            trusted: Mutex::new(HashSet::new()),
        })
    }

    pub fn create_pair_code(&self) -> Result<PairCodeView, String> {
        let value = uuid::Uuid::new_v4().as_u128() % 1_000_000;
        let code = format!("{value:06}");
        let expires_at = now_ms() + CODE_TTL_MS;
        *self.pair_code.lock().map_err(|_| "配对码锁异常".to_string())? = Some(PairCode {
            code: code.clone(),
            expires_at,
            attempts: 0,
        });
        Ok(PairCodeView { code, expires_at })
    }

    /// 校验一次性码；成功即作废，错 3 次也作废。
    fn verify_code(&self, code: &str) -> Result<(), String> {
        let mut guard = self.pair_code.lock().map_err(|_| "配对码锁异常".to_string())?;
        let Some(entry) = guard.as_mut() else {
            return Err("没有待用的配对码，请先在电脑上生成".into());
        };
        if now_ms() > entry.expires_at {
            *guard = None;
            return Err("配对码已过期，请重新生成".into());
        }
        if entry.code != code.trim() {
            entry.attempts += 1;
            if entry.attempts >= MAX_CODE_ATTEMPTS {
                *guard = None;
            }
            return Err("配对码不对".into());
        }
        *guard = None;
        Ok(())
    }

    /// 手机出示一次性码 + 设备信息；成功返回 token 与电脑上的 Key。
    pub fn pair(
        &self,
        client_id: u64,
        code: &str,
        device_id: &str,
        name: Option<&str>,
    ) -> Result<(String, Option<String>), String> {
        if device_id.trim().is_empty() {
            return Err("设备标识无效".into());
        }
        self.verify_code(code)?;
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        {
            let mut devices = self.devices.lock().map_err(|_| "配对表锁异常".to_string())?;
            devices.devices.retain(|device| device.device_id != device_id);
            devices.devices.push(Device {
                device_id: device_id.to_string(),
                name: name.map(|value| value.chars().take(40).collect()),
                token_hash: hash_token(&token),
                paired_at: now_ms(),
            });
            save_devices(&self.paths.devices, &devices)?;
        }
        self.trusted
            .lock()
            .map_err(|_| "配对状态锁异常".to_string())?
            .insert(client_id);
        let key = crate::asr_config::load().api_key;
        Ok((token, key))
    }

    pub fn hello(&self, client_id: u64, device_id: &str, token: &str) -> Result<(), String> {
        let devices = self.devices.lock().map_err(|_| "配对表锁异常".to_string())?;
        let expected = hash_token(token);
        if devices
            .devices
            .iter()
            .any(|device| device.device_id == device_id && device.token_hash == expected)
        {
            self.trusted
                .lock()
                .map_err(|_| "配对状态锁异常".to_string())?
                .insert(client_id);
            Ok(())
        } else {
            Err("设备未配对或凭据无效".into())
        }
    }

    pub fn is_trusted(&self, client_id: u64) -> bool {
        self.trusted
            .lock()
            .map(|guard| guard.contains(&client_id))
            .unwrap_or(false)
    }

    pub fn disconnect(&self, client_id: u64) {
        if let Ok(mut trusted) = self.trusted.lock() {
            trusted.remove(&client_id);
        }
    }

    /// 手机推送元数据；返回确认的 id。
    pub fn upsert(&self, client_id: u64, memos: &[Value]) -> Result<Vec<String>, String> {
        if !self.is_trusted(client_id) {
            return Err("设备未配对".into());
        }
        if memos.len() > 200 {
            return Err("单次同步条目过多".into());
        }
        let mut ids = Vec::new();
        for value in memos {
            let row = memo_row_from_json(value, now_ms())?;
            if row.deleted_at.is_some() {
                if let Some(path) = self.db.soft_delete(&row.id)? {
                    let _ = std::fs::remove_file(path);
                }
            } else {
                let previous_audio = self.db.get(&row.id)?.and_then(|existing| existing.audio_path);
                self.db.insert(&row)?;
                // 手机删了音频（audioBytes=0）：镜像也删文件，别留一份用户以为已经删掉的声音。
                if row.audio_bytes == 0 {
                    if let Some(path) = previous_audio {
                        let _ = std::fs::remove_file(path);
                        self.db.clear_audio(&row.id)?;
                    }
                }
            }
            ids.push(row.id);
        }
        let _ = self.app.emit("memo-changed", ());
        Ok(ids)
    }

    pub fn begin_audio(
        &self,
        client_id: u64,
        memo_id: &str,
        bytes: i64,
        sha256: &str,
    ) -> Result<u64, String> {
        self.require_trusted(client_id)?;
        if self.db.get(memo_id)?.is_none() {
            return Err("条目还没同步，先推送元数据".into());
        }
        if bytes <= 0 || bytes > 2 * 60 * 60 * 32_000 + 4096 {
            return Err("音频大小不合法".into());
        }
        let path = self.paths.tmp.join(format!("{memo_id}.upload"));
        std::fs::File::create(&path).map_err(|error| format!("创建上传文件失败: {error}"))?;
        let mut uploads = self.uploads.lock().map_err(|_| "上传锁异常".to_string())?;
        uploads.insert(
            memo_id.to_string(),
            Upload { path, bytes, offset: 0, sha256: sha256.to_string() },
        );
        Ok(0)
    }

    pub fn append_audio(
        &self,
        client_id: u64,
        memo_id: &str,
        offset: u64,
        data: &[u8],
    ) -> Result<u64, String> {
        self.require_trusted(client_id)?;
        let mut uploads = self.uploads.lock().map_err(|_| "上传锁异常".to_string())?;
        let upload = uploads.get_mut(memo_id).ok_or_else(|| "没有进行中的音频上传".to_string())?;
        if offset != upload.offset {
            return Err(format!("音频偏移不连续，期望 {}", upload.offset));
        }
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&upload.path)
            .map_err(|error| format!("打开上传文件失败: {error}"))?;
        file.write_all(data).map_err(|error| format!("写入音频失败: {error}"))?;
        upload.offset += data.len() as u64;
        Ok(upload.offset)
    }

    pub fn commit_audio(&self, client_id: u64, memo_id: &str) -> Result<(), String> {
        self.require_trusted(client_id)?;
        let upload = self
            .uploads
            .lock()
            .map_err(|_| "上传锁异常".to_string())?
            .remove(memo_id)
            .ok_or_else(|| "没有进行中的音频上传".to_string())?;
        let actual_bytes = std::fs::metadata(&upload.path)
            .map_err(|error| format!("读取上传文件失败: {error}"))?
            .len() as i64;
        if actual_bytes != upload.bytes {
            let _ = std::fs::remove_file(&upload.path);
            return Err(format!("音频大小不一致：收到 {actual_bytes}，期望 {}", upload.bytes));
        }
        let actual_hash = sha256_file(&upload.path)?;
        if !actual_hash.eq_ignore_ascii_case(&upload.sha256) {
            let _ = std::fs::remove_file(&upload.path);
            return Err("音频校验失败".into());
        }
        let target = self.paths.audio.join(format!("{memo_id}.wav"));
        std::fs::rename(&upload.path, &target).map_err(|error| format!("保存音频失败: {error}"))?;
        self.db.set_audio(
            memo_id,
            &target.to_string_lossy(),
            actual_bytes,
            &actual_hash,
        )?;
        let _ = self.app.emit("memo-changed", ());
        Ok(())
    }

    pub fn delete(&self, client_id: u64, memo_id: &str) -> Result<(), String> {
        self.require_trusted(client_id)?;
        if let Some(path) = self.db.soft_delete(memo_id)? {
            let _ = std::fs::remove_file(path);
        }
        let _ = self.app.emit("memo-changed", ());
        Ok(())
    }

    fn require_trusted(&self, client_id: u64) -> Result<(), String> {
        if self.is_trusted(client_id) {
            Ok(())
        } else {
            Err("设备未配对".into())
        }
    }
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|error| format!("读音频失败: {error}"))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher).map_err(|error| format!("校验失败: {error}"))?;
    Ok(format!("{:x}", hasher.finalize()))
}

fn save_devices(path: &Path, devices: &DevicesFile) -> Result<(), String> {
    let body = serde_json::to_string_pretty(devices).map_err(|error| error.to_string())?;
    std::fs::write(path, body).map_err(|error| format!("保存配对表失败: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn string_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn memo_row_from_json(value: &Value, synced_at: i64) -> Result<MemoRow, String> {
    let id = value
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "同步条目缺 id".to_string())?
        .to_string();
    let now = now_ms();
    Ok(MemoRow {
        id,
        created_at: value.get("createdAt").and_then(Value::as_i64).unwrap_or(now),
        updated_at: value.get("updatedAt").and_then(Value::as_i64).unwrap_or(now),
        memo_type: MemoType::parse(
            value.get("type").and_then(Value::as_str).unwrap_or("memo"),
        ),
        title: value.get("title").and_then(Value::as_str).unwrap_or("").to_string(),
        summary: value
            .get("summary")
            .and_then(Value::as_str)
            .map(|text| text.to_string()),
        todos: string_list(value.get("todos")),
        tags: string_list(value.get("tags")),
        transcript: value
            .get("transcript")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        duration_ms: value.get("durationMs").and_then(Value::as_i64).unwrap_or(0),
        audio_path: None,
        audio_bytes: value.get("audioBytes").and_then(Value::as_i64).unwrap_or(0),
        audio_sha256: value
            .get("audioSha256")
            .and_then(Value::as_str)
            .map(|text| text.to_string()),
        status: MemoStatus::Done,
        ai_status: Some("ok".into()),
        failed_segment: None,
        last_error: None,
        segment_total: 0,
        deleted_at: value.get("deletedAt").and_then(Value::as_i64),
        synced_at: Some(synced_at),
        rev: value.get("rev").and_then(Value::as_i64).unwrap_or(1),
    })
}

#[tauri::command]
pub fn memo_list(hub: State<'_, Arc<MemoHub>>) -> Result<Vec<MemoSummary>, String> {
    hub.db.list()
}

#[tauri::command]
pub fn memo_get(hub: State<'_, Arc<MemoHub>>, id: String) -> Result<MemoDetail, String> {
    let row = hub.db.get(&id)?.ok_or_else(|| "备忘录不存在".to_string())?;
    Ok(row.detail(hub.db.segments(&id)?))
}

#[tauri::command]
pub fn memo_pair_code_create(hub: State<'_, Arc<MemoHub>>) -> Result<PairCodeView, String> {
    hub.create_pair_code()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sync_row_and_keeps_tombstone() {
        let value = serde_json::json!({
            "id": "memo-1",
            "createdAt": 10,
            "updatedAt": 20,
            "type": "todo",
            "title": "买牛奶",
            "summary": null,
            "todos": ["买牛奶"],
            "tags": ["生活"],
            "transcript": "全文",
            "durationMs": 42000,
            "audioBytes": 1344000,
            "audioSha256": "abc",
            "deletedAt": null,
            "rev": 2
        });
        let row = memo_row_from_json(&value, 30).unwrap();
        assert_eq!(row.id, "memo-1");
        assert_eq!(row.memo_type, MemoType::Todo);
        assert_eq!(row.todos, vec!["买牛奶".to_string()]);
        assert_eq!(row.synced_at, Some(30));
        assert_eq!(row.audio_sha256.as_deref(), Some("abc"));
    }

    #[test]
    fn token_hash_is_stable() {
        assert_eq!(hash_token("abc"), hash_token("abc"));
        assert_ne!(hash_token("abc"), hash_token("abd"));
    }
}
