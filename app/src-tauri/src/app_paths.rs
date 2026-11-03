use std::fs;
use std::path::{Path, PathBuf};

/// Sidekick 自己的本机数据目录：`~/.sidekick`。
///
/// 用户明确要求「本地建一个 `.sidekick` 文件夹存必要的设置之类的数据」，
/// 不再把配置/历史藏在 `~/Library/Application Support/Sidekick`。
/// 桌面端升级时会把旧目录里的 `asr.json` / `clipboard.json` / `asr_usage.json`
/// 复制一次过来（旧文件保留，不删除；旧 `models/` 不迁移）。
pub const APP_DATA_DIR: &str = ".sidekick";
/// 迁移标记：用户以后删掉历史文件时，不会被旧目录的内容复活。
const MIGRATION_MARKER: &str = ".migrated-from-app-support";
/// 从旧 macOS 标准目录迁移的 Sidekick 配置文件。
const LEGACY_FILES: [&str; 3] = ["asr.json", "clipboard.json", "asr_usage.json"];

pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("SIDEKICK_DATA_DIR") {
        return PathBuf::from(dir);
    }

    let home = std::env::var("HOME").unwrap_or_default();
    if cfg!(target_os = "macos") {
        let home = PathBuf::from(home);
        let target = home.join(APP_DATA_DIR);
        migrate_legacy_dir(&home.join("Library/Application Support/Sidekick"), &target);
        target
    } else {
        PathBuf::from(home).join(".local/share/sidekick")
    }
}

/// 把旧 `~/Library/Application Support/Sidekick` 里的 Sidekick JSON 复制到 `~/.sidekick`。
/// 只复制一次（写标记），不删除旧文件；旧 models 目录不迁移。
fn migrate_legacy_dir(legacy: &Path, target: &Path) {
    if target.join(MIGRATION_MARKER).exists() {
        return;
    }
    if !legacy.is_dir() {
        return;
    }
    if fs::create_dir_all(target).is_err() {
        return;
    }
    for name in LEGACY_FILES {
        let from = legacy.join(name);
        let to = target.join(name);
        if from.is_file() && !to.exists() {
            if let Err(error) = fs::copy(&from, &to) {
                eprintln!("[app-data] 迁移 {from:?} 失败: {error}");
            }
        }
    }
    let marker = format!("copied from {}\n", legacy.display());
    if let Err(error) = fs::write(target.join(MIGRATION_MARKER), marker) {
        eprintln!("[app-data] 写迁移标记失败: {error}");
    }
}

pub fn clipboard_file() -> PathBuf {
    data_dir().join("clipboard.json")
}

pub fn ensure_parent(path: &Path) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SEQUENCE: AtomicU64 = AtomicU64::new(1);

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "sidekick-app-paths-{label}-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn migrates_legacy_files_once() {
        let root = temp_dir("migrate");
        let legacy = root.join("legacy");
        let target = root.join("target");
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("asr.json"), "{\"version\":1}").unwrap();
        fs::write(legacy.join("clipboard.json"), "[]").unwrap();

        migrate_legacy_dir(&legacy, &target);
        assert_eq!(
            fs::read_to_string(target.join("asr.json")).unwrap(),
            "{\"version\":1}"
        );
        assert!(target.join("clipboard.json").exists());
        assert!(!target.join("asr_usage.json").exists());

        // 用户删掉历史后不能从旧目录复活。
        fs::remove_file(target.join("clipboard.json")).unwrap();
        migrate_legacy_dir(&legacy, &target);
        assert!(!target.join("clipboard.json").exists());

        // 已有新文件时不被旧文件覆盖。
        fs::write(target.join("asr.json"), "{\"version\":2}").unwrap();
        migrate_legacy_dir(&legacy, &target);
        assert_eq!(
            fs::read_to_string(target.join("asr.json")).unwrap(),
            "{\"version\":2}"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn missing_legacy_dir_is_noop() {
        let root = temp_dir("missing");
        let target = root.join("target");
        migrate_legacy_dir(&root.join("nope"), &target);
        assert!(!target.exists());
        let _ = fs::remove_dir_all(root);
    }
}
