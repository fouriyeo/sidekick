//! 英语角的本机路径。
//!
//! 桌面：`~/.sidekick/words.db`、`word_usage.json`、`word.json`。
//! 手机：`<app_data>/word/` 下的同名文件（与备忘录同级的私有目录）。

use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct WordPaths {
    pub root: PathBuf,
    pub db: PathBuf,
    pub usage: PathBuf,
    pub config: PathBuf,
}

impl WordPaths {
    fn ensure(self) -> Result<Self, String> {
        std::fs::create_dir_all(&self.root).map_err(|error| format!("创建目录失败: {error}"))?;
        Ok(self)
    }

    #[cfg(desktop)]
    pub fn desktop() -> Result<Self, String> {
        let root = crate::app_paths::data_dir();
        Self {
            db: root.join("words.db"),
            usage: root.join("word_usage.json"),
            config: root.join("word.json"),
            root,
        }
        .ensure()
    }

    #[cfg(mobile)]
    pub fn mobile(app: &tauri::AppHandle) -> Result<Self, String> {
        use tauri::Manager;
        let root = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("取 App 数据目录失败: {error}"))?
            .join("word");
        Self {
            db: root.join("words.db"),
            usage: root.join("word_usage.json"),
            config: root.join("word.json"),
            root,
        }
        .ensure()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_creates_root() {
        let unique = format!(
            "sidekick-word-paths-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let root = std::env::temp_dir().join(unique);
        let paths = WordPaths {
            db: root.join("words.db"),
            usage: root.join("word_usage.json"),
            config: root.join("word.json"),
            root: root.clone(),
        }
        .ensure()
        .unwrap();
        assert!(paths.root.is_dir());
        let _ = std::fs::remove_dir_all(root);
    }
}
