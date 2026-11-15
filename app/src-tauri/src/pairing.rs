//! 桌面端配对与 WS 鉴权。
//!
//! 首次配对：设置页生成 6 位一次性码（5 分钟、错 3 次作废），二维码带 `?pair=<code>`；
//! 手机扫码后 `auth.pair` 换长期 token。之后的连接由桌面下发 nonce，手机回
//! `sha256(token + nonce)`，token 不上线。
//!
//! 本机回环客户端（桌面 WebView）不经过这层；手机等局域网客户端必须通过。
//! 这是身份鉴权，不是信道加密；仍只建议在可信局域网使用。

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;
use uuid::Uuid;

const CODE_TTL_MS: u64 = 5 * 60 * 1000;
const MAX_CODE_ATTEMPTS: u32 = 3;
const MAX_DEVICE_ID_CHARS: usize = 64;
const MAX_DEVICE_NAME_CHARS: usize = 32;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairCodeView {
    pub code: String,
    pub expires_at: u64,
    pub ttl_seconds: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDeviceView {
    pub device_id: String,
    pub name: Option<String>,
    pub paired_at: u64,
    pub last_seen_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairedDevice {
    device_id: String,
    #[serde(default)]
    name: Option<String>,
    /// 长期 token；文件权限 0600。挑战应答需要原文才能算 sha256(token+nonce)。
    token: String,
    paired_at: u64,
    last_seen_at: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DevicesFile {
    #[serde(default = "new_desktop_id")]
    desktop_id: String,
    #[serde(default)]
    devices: Vec<PairedDevice>,
}

impl Default for DevicesFile {
    fn default() -> Self {
        Self {
            desktop_id: new_desktop_id(),
            devices: Vec::new(),
        }
    }
}

struct PairCode {
    code: String,
    expires_at: u64,
    attempts: u32,
}

pub struct PairingStore {
    path: PathBuf,
    data: Mutex<DevicesFile>,
    code: Mutex<Option<PairCode>>,
}

impl PairingStore {
    /// 生产构造：`~/.sidekick/paired-devices.json`。
    pub fn new() -> Result<Self, String> {
        Self::at_path(crate::app_paths::data_dir().join("paired-devices.json"))
    }

    pub fn at_path(path: PathBuf) -> Result<Self, String> {
        let data = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<DevicesFile>(&raw).ok())
            .unwrap_or_default();
        let store = Self {
            path,
            data: Mutex::new(data),
            code: Mutex::new(None),
        };
        // 首次启动就把 desktopId 落盘；失败不阻止服务启动，配对时会再写。
        let _ = store.save();
        // 仅 debug 构建：本地协议联调时可固定一枚配对码，避免依赖 UI 截图。
        #[cfg(debug_assertions)]
        if let Ok(code) = std::env::var("SIDEKICK_PAIRING_CODE") {
            let code = code.trim();
            if code.len() == 6 && code.chars().all(|value| value.is_ascii_digit()) {
                *store.code.lock().unwrap() = Some(PairCode {
                    code: code.to_string(),
                    expires_at: now_ms() + CODE_TTL_MS,
                    attempts: 0,
                });
            }
        }
        Ok(store)
    }

    fn save(&self) -> Result<(), String> {
        let data = self.data.lock().map_err(|_| "配对表锁异常".to_string())?;
        let raw = serde_json::to_string_pretty(&*data).map_err(|error| error.to_string())?;
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("创建配对目录失败：{error}"))?;
        }
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, raw).map_err(|error| format!("写配对表失败：{error}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&tmp, fs::Permissions::from_mode(0o600));
        }
        fs::rename(&tmp, &self.path).map_err(|error| format!("保存配对表失败：{error}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&self.path, fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }

    pub fn desktop_id(&self) -> String {
        self.data
            .lock()
            .map(|data| data.desktop_id.clone())
            .unwrap_or_default()
    }

    pub fn create_code(&self) -> Result<PairCodeView, String> {
        let value = Uuid::new_v4().as_u128() % 1_000_000;
        let code = format!("{value:06}");
        let expires_at = now_ms() + CODE_TTL_MS;
        *self.code.lock().map_err(|_| "配对码锁异常".to_string())? = Some(PairCode {
            code: code.clone(),
            expires_at,
            attempts: 0,
        });
        Ok(PairCodeView {
            code,
            expires_at,
            ttl_seconds: CODE_TTL_MS / 1000,
        })
    }

    fn verify_code(&self, raw: &str) -> Result<(), String> {
        let mut guard = self.code.lock().map_err(|_| "配对码锁异常".to_string())?;
        let Some(entry) = guard.as_mut() else {
            return Err("没有待用的配对码，请在电脑上重新生成".into());
        };
        if now_ms() > entry.expires_at {
            *guard = None;
            return Err("配对码已过期，请重新生成".into());
        }
        if entry.code != raw.trim() {
            entry.attempts += 1;
            if entry.attempts >= MAX_CODE_ATTEMPTS {
                *guard = None;
                return Err("配对码错误次数过多，请重新生成".into());
            }
            return Err("配对码不对".into());
        }
        *guard = None;
        Ok(())
    }

    /// 校验一次配对码，签发长期 token。
    pub fn pair(
        &self,
        code: &str,
        device_id: &str,
        name: Option<&str>,
    ) -> Result<(String, String), String> {
        let device_id = device_id.trim();
        if device_id.is_empty() || device_id.chars().count() > MAX_DEVICE_ID_CHARS {
            return Err("设备标识无效".into());
        }
        self.verify_code(code)?;
        let token = format!(
            "{}{}",
            Uuid::new_v4().simple(),
            Uuid::new_v4().simple()
        );
        let name = name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.chars().take(MAX_DEVICE_NAME_CHARS).collect::<String>());
        let now = now_ms();
        let desktop_id = {
            let mut data = self.data.lock().map_err(|_| "配对表锁异常".to_string())?;
            if let Some(device) = data
                .devices
                .iter_mut()
                .find(|device| device.device_id == device_id)
            {
                device.token = token.clone();
                device.name = name.clone();
                device.last_seen_at = now;
            } else {
                data.devices.push(PairedDevice {
                    device_id: device_id.to_string(),
                    name: name.clone(),
                    token: token.clone(),
                    paired_at: now,
                    last_seen_at: now,
                });
            }
            data.desktop_id.clone()
        };
        self.save()?;
        Ok((token, desktop_id))
    }

    /// 校验挑战应答；未知设备/错误 proof 都返回 false。
    pub fn verify(&self, device_id: &str, nonce: &str, proof: &str) -> bool {
        let expected = {
            let Ok(mut data) = self.data.lock() else {
                return false;
            };
            let Some(device) = data
                .devices
                .iter_mut()
                .find(|device| device.device_id == device_id.trim())
            else {
                return false;
            };
            device.last_seen_at = now_ms();
            proof_for(&device.token, nonce)
        };
        let _ = self.save();
        constant_time_eq(proof.as_bytes(), expected.as_bytes())
    }

    pub fn devices(&self) -> Vec<PairedDeviceView> {
        self.data
            .lock()
            .map(|data| {
                data.devices
                    .iter()
                    .map(|device| PairedDeviceView {
                        device_id: device.device_id.clone(),
                        name: device.name.clone(),
                        paired_at: device.paired_at,
                        last_seen_at: device.last_seen_at,
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn revoke(&self, device_id: &str) -> Result<bool, String> {
        let removed = {
            let mut data = self.data.lock().map_err(|_| "配对表锁异常".to_string())?;
            let before = data.devices.len();
            data.devices
                .retain(|device| device.device_id != device_id.trim());
            before != data.devices.len()
        };
        self.save()?;
        Ok(removed)
    }
}

fn new_desktop_id() -> String {
    Uuid::new_v4().to_string()
}

fn proof_for(token: &str, nonce: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hasher.update(nonce.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right) {
        diff |= a ^ b;
    }
    diff == 0
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn pairing_code_create(store: State<'_, std::sync::Arc<PairingStore>>) -> Result<PairCodeView, String> {
    store.create_code()
}

#[tauri::command]
pub fn pairing_devices(
    store: State<'_, std::sync::Arc<PairingStore>>,
) -> Result<Vec<PairedDeviceView>, String> {
    Ok(store.devices())
}

#[tauri::command]
pub fn pairing_revoke(
    store: State<'_, std::sync::Arc<PairingStore>>,
    device_id: String,
) -> Result<bool, String> {
    store.revoke(&device_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SEQ: AtomicU64 = AtomicU64::new(1);

    fn temp_store(label: &str) -> PairingStore {
        let dir = std::env::temp_dir().join(format!(
            "sidekick-pairing-{label}-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        PairingStore::at_path(dir.join("paired-devices.json")).unwrap()
    }

    #[test]
    fn pair_once_then_verify_challenge() {
        let store = temp_store("pair");
        let code = store.create_code().unwrap();
        let (token, desktop_id) = store
            .pair(&code.code, "phone-1", Some("Realme"))
            .unwrap();
        assert_eq!(desktop_id, store.desktop_id());
        assert!(!token.is_empty());
        // 一次性码不能复用。
        assert!(store.pair(&code.code, "phone-2", None).is_err());

        let proof = proof_for(&token, "nonce-1");
        assert!(store.verify("phone-1", "nonce-1", &proof));
        assert!(!store.verify("phone-1", "nonce-2", &proof));
        assert!(!store.verify("unknown", "nonce-1", &proof));
        assert_eq!(store.devices().len(), 1);
        assert!(store.revoke("phone-1").unwrap());
        assert!(!store.verify("phone-1", "nonce-1", &proof_for(&token, "nonce-1")));
    }

    #[test]
    fn wrong_code_attempts_invalidate() {
        let store = temp_store("attempts");
        let code = store.create_code().unwrap();
        for _ in 0..3 {
            assert!(store.pair("000000", "phone", None).is_err());
        }
        assert!(store.pair(&code.code, "phone", None).is_err());
    }

    #[test]
    fn expired_code_rejected() {
        let store = temp_store("expired");
        let code = store.create_code().unwrap();
        {
            let mut guard = store.code.lock().unwrap();
            guard.as_mut().unwrap().expires_at = now_ms().saturating_sub(1);
        }
        assert!(store.pair(&code.code, "phone", None).is_err());
    }
}
