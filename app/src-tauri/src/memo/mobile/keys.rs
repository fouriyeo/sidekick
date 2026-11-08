use std::path::Path;

use serde::{Deserialize, Serialize};

/// 手机本机保存的敏感配置。MVP 落在 App 私有目录（0600），
/// Keystore 加密是 P1（见 D118 的实现取舍）。
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecureData {
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub device_id: String,
    #[serde(default)]
    pub token: Option<String>,
    #[serde(default)]
    pub device_name: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    pub has_key: bool,
    pub key_masked: Option<String>,
    pub paired: bool,
    pub device_id: String,
}

fn default_device_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

impl SecureData {
    pub fn load(path: &Path) -> Self {
        let mut data = std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str::<SecureData>(&raw).ok())
            .unwrap_or_default();
        if data.device_id.trim().is_empty() {
            data.device_id = default_device_id();
        }
        data
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| format!("创建配置目录失败: {error}"))?;
        }
        let body = serde_json::to_string_pretty(self).map_err(|error| error.to_string())?;
        std::fs::write(path, body).map_err(|error| format!("保存配置失败: {error}"))?;
        restrict_permissions(path);
        Ok(())
    }

    pub fn status(&self) -> KeyStatus {
        KeyStatus {
            has_key: self.api_key.as_deref().is_some_and(|key| !key.trim().is_empty()),
            key_masked: self.api_key.as_deref().map(mask_key),
            paired: self.token.as_deref().is_some_and(|token| !token.trim().is_empty()),
            device_id: self.device_id.clone(),
        }
    }
}

pub fn mask_key(key: &str) -> String {
    let trimmed = key.trim();
    if trimmed.chars().count() <= 8 {
        return "••••".into();
    }
    let tail: String = trimmed
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("sk-…{tail}")
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_and_status() {
        assert_eq!(mask_key("sk-12345678"), "sk-…5678");
        assert_eq!(mask_key("short"), "••••");
        let data = SecureData {
            api_key: Some("sk-12345678".into()),
            device_id: "d".into(),
            token: Some("t".into()),
            device_name: None,
        };
        let status = data.status();
        assert!(status.has_key);
        assert_eq!(status.key_masked.as_deref(), Some("sk-…5678"));
        assert!(status.paired);
    }

    #[test]
    fn save_and_load_roundtrip() {
        let root = std::env::temp_dir().join(format!(
            "sidekick-memo-secure-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = root.join("secure.json");
        let data = SecureData {
            api_key: Some("sk-abcdefgh".into()),
            device_id: "device".into(),
            token: None,
            device_name: None,
        };
        data.save(&path).unwrap();
        let loaded = SecureData::load(&path);
        assert_eq!(loaded.api_key.as_deref(), Some("sk-abcdefgh"));
        assert_eq!(loaded.device_id, "device");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
        let _ = std::fs::remove_dir_all(root);
    }
}
