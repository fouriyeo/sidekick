use std::path::PathBuf;

/// 语音备忘录的本地路径。
///
/// 手机：`<app_data>/memo/`（音频、临时、库、secure.json 都在这里）。
/// 桌面：库固定在 `~/.sidekick/sidekick.db`，音频在 `~/.sidekick/memos/audio/`，
/// 设备配对表在 `~/.sidekick/memo_devices.json`。
#[derive(Clone, Debug)]
pub struct MemoPaths {
    pub root: PathBuf,
    pub audio: PathBuf,
    pub tmp: PathBuf,
    pub db: PathBuf,
    pub secure: PathBuf,
    pub devices: PathBuf,
}

impl MemoPaths {
    fn ensure(self) -> Result<Self, String> {
        for dir in [&self.root, &self.audio, &self.tmp] {
            std::fs::create_dir_all(dir).map_err(|error| format!("创建目录失败: {error}"))?;
        }
        if let Some(parent) = self.db.parent() {
            std::fs::create_dir_all(parent).map_err(|error| format!("创建目录失败: {error}"))?;
        }
        if let Some(parent) = self.devices.parent() {
            std::fs::create_dir_all(parent).map_err(|error| format!("创建目录失败: {error}"))?;
        }
        Ok(self)
    }

    #[cfg(mobile)]
    pub fn mobile(app: &tauri::AppHandle) -> Result<Self, String> {
        use tauri::Manager;
        let root = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("取 App 数据目录失败: {error}"))?
            .join("memo");
        Self {
            audio: root.join("audio"),
            tmp: root.join("tmp"),
            db: root.join("sidekick.db"),
            secure: root.join("secure.json"),
            devices: root.join("devices.json"),
            root,
        }
        .ensure()
    }

    #[cfg(desktop)]
    pub fn desktop() -> Result<Self, String> {
        let data = crate::app_paths::data_dir();
        let root = data.join("memo");
        Self {
            audio: data.join("memos").join("audio"),
            tmp: root.join("tmp"),
            db: data.join("sidekick.db"),
            secure: root.join("secure.json"),
            devices: data.join("memo_devices.json"),
            root,
        }
        .ensure()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_creates_directories() {
        let unique = format!(
            "sidekick-memo-paths-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let root = std::env::temp_dir().join(unique);
        let paths = MemoPaths {
            audio: root.join("audio"),
            tmp: root.join("tmp"),
            db: root.join("sidekick.db"),
            secure: root.join("secure.json"),
            devices: root.join("devices.json"),
            root: root.clone(),
        }
        .ensure()
        .unwrap();
        assert!(paths.audio.is_dir());
        assert!(paths.tmp.is_dir());
        let _ = std::fs::remove_dir_all(root);
    }
}
