use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("SIDEKICK_DATA_DIR") {
        return PathBuf::from(dir);
    }

    let home = std::env::var("HOME").unwrap_or_default();
    if cfg!(target_os = "macos") {
        PathBuf::from(home).join("Library/Application Support/Sidekick")
    } else {
        PathBuf::from(home).join(".local/share/sidekick")
    }
}

pub fn clipboard_file() -> PathBuf {
    data_dir().join("clipboard.json")
}

pub fn ensure_parent(path: &std::path::Path) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}
