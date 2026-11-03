//! DSH（DeepSeek Harness / Cordis profile）联动安装器。
//!
//! 只做三件事，全部是本地文件，不装 npm 包、不碰用户其它配置：
//! 1. 把 `app/src/dsh-hook/sidekick-hook.mjs` 写进
//!    `~/.dsh/profiles/<profile>/plugins/sidekick-hook.mjs`；
//! 2. 在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 里追加/替换 Sidekick
//!    的标记块（`# >>> sidekick-hook` … `# <<< sidekick-hook`），
//!    首次改动前备份原文件，非 YAML 列表时报错且不写；
//! 3. 写 `~/.dsh/sidekick/config.json`（0600），告诉插件回环 endpoint、
//!    token、enabled 和当前 profile。
//!
//! DSH home 优先级：`SIDEKICK_DSH_HOME` > `DSH_HOME` > `$HOME/.dsh`。

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Sidekick 配置格式版本，插件与 Rust 两侧保持一致。
pub const CONFIG_VERSION: u64 = 1;
/// 检测不到 profile 时的默认目标。
pub const DEFAULT_PROFILE: &str = "desktop";
/// 插件脚本文件名。
pub const PLUGIN_FILE_NAME: &str = "sidekick-hook.mjs";
/// 打进桌面端的插件脚本。内容由 dsh-plugin 任务维护，Rust 只负责落盘。
pub const PLUGIN_SOURCE: &str = include_str!("../../src/dsh-hook/sidekick-hook.mjs");
/// patch 标记块开始行。
pub const MARKER_START: &str = "# >>> sidekick-hook (managed by Sidekick)";
/// patch 标记块结束行。
pub const MARKER_END: &str = "# <<< sidekick-hook";
/// 首次修改 patch 前的备份后缀（备份只保留一份原始内容）。
pub const PATCH_BACKUP_SUFFIX: &str = ".sidekick.bak";

/// 写入 `~/.dsh/sidekick/config.json` 的配置，插件每秒读取一次。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DshHookConfig {
    pub version: u64,
    pub enabled: bool,
    pub profile: String,
    pub endpoint: String,
    pub token: String,
}

/// DSH home 的路径集合与派生路径。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Layout {
    home: PathBuf,
}

impl Layout {
    pub fn new(home: impl Into<PathBuf>) -> Self {
        Self { home: home.into() }
    }

    /// 按环境变量解析 DSH home。
    pub fn discover() -> Self {
        Self::new(dsh_home())
    }

    #[cfg(test)]
    pub fn home(&self) -> &Path {
        &self.home
    }

    pub fn config_path(&self) -> PathBuf {
        self.home.join("sidekick").join("config.json")
    }

    /// DSH 的 workspace 持久化文件（`<dsh home>/storages/workspace.json`）。
    /// 归档会话 id 在 `global.archivedSessionIds` 里，用来把归档会话从列表里去掉。
    pub fn workspace_path(&self) -> PathBuf {
        self.home.join("storages").join("workspace.json")
    }

    pub fn profiles_dir(&self) -> PathBuf {
        self.home.join("profiles")
    }

    pub fn profile_dir(&self, profile: &str) -> PathBuf {
        self.profiles_dir().join(profile)
    }

    pub fn plugin_path(&self, profile: &str) -> PathBuf {
        self.profile_dir(profile)
            .join("plugins")
            .join(PLUGIN_FILE_NAME)
    }

    pub fn patch_path(&self, profile: &str) -> PathBuf {
        self.profile_dir(profile).join("cordis.patch.yml")
    }

    pub fn plugin_installed(&self, profile: &str) -> bool {
        self.plugin_path(profile).is_file()
    }

    pub fn patch_installed(&self, profile: &str) -> bool {
        fs::read_to_string(self.patch_path(profile))
            .map(|text| patch_has_marker(&text))
            .unwrap_or(false)
    }

    /// 三份文件都在才算完整安装。
    pub fn installed(&self, profile: &str) -> bool {
        self.plugin_installed(profile) && self.patch_installed(profile)
    }
}

/// 解析 DSH home：`SIDEKICK_DSH_HOME` > `DSH_HOME` > `$HOME/.dsh`。
pub fn dsh_home() -> PathBuf {
    for key in ["SIDEKICK_DSH_HOME", "DSH_HOME"] {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return PathBuf::from(trimmed);
            }
        }
    }

    let home = std::env::var("HOME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            std::env::var("USERPROFILE")
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
        .unwrap_or_default();
    PathBuf::from(home).join(".dsh")
}

/// 校验 profile 名，防止拼路径逃出 `profiles/`。
pub fn validate_profile_name(name: &str) -> Result<&str, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("profile 不能为空".to_string());
    }
    if trimmed.len() > 64 {
        return Err("profile 名太长（最多 64 个字符）".to_string());
    }
    if trimmed == "." || trimmed == ".." || trimmed.starts_with('.') {
        return Err("profile 名不能以 . 开头".to_string());
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
    {
        return Err("profile 只能包含字母、数字、- _ .".to_string());
    }
    Ok(trimmed)
}

/// profile 的展示名：desktop -> Desktop，其余首字母大写。
pub fn profile_label(name: &str) -> String {
    if name.eq_ignore_ascii_case("desktop") {
        return "Desktop".to_string();
    }
    let mut chars = name.chars();
    match chars.next() {
        Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
        None => String::new(),
    }
}

// ---------------------------------------------------------------------------
// config.json
// ---------------------------------------------------------------------------

/// 读取 Sidekick 配置：文件不存在返回 `Ok(None)`，空文件视为未配置。
pub fn read_config(path: &Path) -> Result<Option<DshHookConfig>, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("读取 DSH 联动配置失败: {error}")),
    };
    if text.trim().is_empty() {
        return Ok(None);
    }
    let config: DshHookConfig =
        serde_json::from_str(&text).map_err(|error| format!("DSH 联动配置格式无效: {error}"))?;
    if config.version != CONFIG_VERSION {
        return Err(format!(
            "DSH 联动配置版本 {} 不受支持（需要 {}）",
            config.version, CONFIG_VERSION
        ));
    }
    Ok(Some(config))
}

/// 原子写配置文件（临时文件 + rename），权限 0600。
pub fn write_config(path: &Path, config: &DshHookConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建配置目录失败: {error}"))?;
        #[cfg(unix)]
        set_mode(parent, 0o700)?;
    }
    let mut json = serde_json::to_vec_pretty(config)
        .map_err(|error| format!("序列化 DSH 联动配置失败: {error}"))?;
    json.push(b'\n');
    write_atomic(path, &json, Some(0o600))
}

// ---------------------------------------------------------------------------
// cordis.patch.yml 标记块
// ---------------------------------------------------------------------------

/// Sidekick 标记块的标准内容（含首尾标记行）。
pub fn patch_block() -> String {
    format!(
        "{MARKER_START}\n- insert:\n    - id: sidekick-hook\n      name: './plugins/{PLUGIN_FILE_NAME}'\n{MARKER_END}\n"
    )
}

/// patch 内容里是否已有完整的 Sidekick 标记对。
pub fn patch_has_marker(text: &str) -> bool {
    text.lines().any(|line| line.trim() == MARKER_START)
        && text.lines().any(|line| line.trim() == MARKER_END)
}

/// 在 patch 里插入（或原位替换）Sidekick 标记块。
///
/// - 已有完整标记对：原位替换；
/// - 空文件 / 只有注释：追加；
/// - 只有 `[]`：把 `[]` 换成标记块（保留注释）；
/// - 块状 YAML 列表（首个有效行以 `-` 开头）：追加；
/// - 其它内容（不是列表）：返回 `Err`，调用方不得写文件。
pub fn insert_marker(text: &str) -> Result<String, String> {
    if text.contains(MARKER_START) || text.contains(MARKER_END) {
        return replace_marker_block(text);
    }

    match classify_patch(text)? {
        PatchShape::Empty => {
            let mut output = text.to_string();
            ensure_trailing_newline(&mut output);
            output.push_str(&patch_block());
            Ok(output)
        }
        PatchShape::EmptySequence => {
            let mut output = String::with_capacity(text.len() + patch_block().len());
            let mut replaced = false;
            for line in text.lines() {
                if !replaced && line.trim() == "[]" {
                    output.push_str(&patch_block());
                    replaced = true;
                } else {
                    output.push_str(line);
                    output.push('\n');
                }
            }
            if !replaced {
                ensure_trailing_newline(&mut output);
                output.push_str(&patch_block());
            }
            Ok(output)
        }
        PatchShape::Sequence => {
            let mut output = text.to_string();
            ensure_trailing_newline(&mut output);
            output.push_str(&patch_block());
            Ok(output)
        }
    }
}

/// 删除 Sidekick 标记块。返回 `(新内容, 是否有改动)`。
///
/// 删完后如果 patch 只剩空白/注释，写 `[]`（保留原注释）；如果还剩用户
/// 的 YAML 列表，则原样保留。
pub fn remove_marker(text: &str) -> Result<(String, bool), String> {
    if !text.contains(MARKER_START) && !text.contains(MARKER_END) {
        return Ok((text.to_string(), false));
    }
    if !(text.contains(MARKER_START) && text.contains(MARKER_END)) {
        return Err("cordis.patch.yml 里的 Sidekick 标记不完整，已跳过以免破坏配置".to_string());
    }

    let mut output = String::new();
    let mut inside = false;
    let mut skipped = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if !inside && trimmed == MARKER_START {
            if skipped {
                return Err(
                    "cordis.patch.yml 里有多组 Sidekick 标记，已跳过以免破坏配置".to_string(),
                );
            }
            inside = true;
            skipped = true;
            continue;
        }
        if inside && trimmed == MARKER_END {
            inside = false;
            continue;
        }
        if inside {
            continue;
        }
        output.push_str(line);
        output.push('\n');
    }
    if inside {
        return Err("cordis.patch.yml 里的 Sidekick 标记没有闭合，已跳过以免破坏配置".to_string());
    }

    match classify_patch(&output)? {
        PatchShape::Empty => {
            let mut output = output;
            ensure_trailing_newline(&mut output);
            output.push_str("[]\n");
            Ok((output, true))
        }
        PatchShape::EmptySequence | PatchShape::Sequence => Ok((output, true)),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PatchShape {
    /// 空白或只有注释。
    Empty,
    /// 只有 `[]`（可有注释）。
    EmptySequence,
    /// 块状 YAML 列表。
    Sequence,
}

fn classify_patch(text: &str) -> Result<PatchShape, String> {
    let significant: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty() && !line.starts_with('#') && *line != "---" && *line != "..."
        })
        .collect();

    if significant.is_empty() {
        return Ok(PatchShape::Empty);
    }
    if significant.len() == 1 && significant[0] == "[]" {
        return Ok(PatchShape::EmptySequence);
    }
    let first = significant[0];
    if first == "-" || first.starts_with("- ") || first.starts_with("-\t") {
        return Ok(PatchShape::Sequence);
    }
    Err(format!(
        "cordis.patch.yml 不是 YAML 列表（期望以 \"- \" 开头、只有 []、或为空/注释），已取消写入以免破坏你的配置：{first}"
    ))
}

fn replace_marker_block(text: &str) -> Result<String, String> {
    let mut output = String::with_capacity(text.len() + patch_block().len());
    let mut inside = false;
    let mut inserted = false;
    for line in text.lines() {
        let trimmed = line.trim();
        if !inside && trimmed == MARKER_START {
            if inserted {
                return Err(
                    "cordis.patch.yml 里有多组 Sidekick 标记，已跳过以免破坏配置".to_string(),
                );
            }
            output.push_str(&patch_block());
            inserted = true;
            inside = true;
            continue;
        }
        if inside && trimmed == MARKER_END {
            inside = false;
            continue;
        }
        if inside {
            continue;
        }
        output.push_str(line);
        output.push('\n');
    }
    if inside {
        return Err("cordis.patch.yml 里的 Sidekick 标记没有闭合，已跳过以免破坏配置".to_string());
    }
    if !inserted {
        return Err("cordis.patch.yml 里的 Sidekick 标记不完整，已跳过以免破坏配置".to_string());
    }
    Ok(output)
}

fn ensure_trailing_newline(text: &mut String) {
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
}

/// 备份路径（与原 patch 同目录）。
pub fn backup_path(patch_path: &Path) -> PathBuf {
    let mut name = patch_path.as_os_str().to_os_string();
    name.push(PATCH_BACKUP_SUFFIX);
    PathBuf::from(name)
}

// ---------------------------------------------------------------------------
// profile 检测
// ---------------------------------------------------------------------------

/// `profiles/` 下的一个 profile。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileEntry {
    pub name: String,
    pub installed: bool,
}

/// 扫描 `profiles/*/package.json`，返回存在的 profile（按名字排序）。
pub fn list_profiles(layout: &Layout) -> Vec<ProfileEntry> {
    let mut names = Vec::new();
    let Ok(entries) = fs::read_dir(layout.profiles_dir()) else {
        return Vec::new();
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() || !path.join("package.json").is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if validate_profile_name(name).is_err() {
            continue;
        }
        names.push(name.to_string());
    }
    names.sort();
    names
        .into_iter()
        .map(|name| ProfileEntry {
            installed: layout.plugin_installed(&name),
            name,
        })
        .collect()
}

/// 从 `ps -axo command` 输出里猜当前运行的 DSH profile。
///
/// 支持 `--profile <name>`、`--profile=<name>` 以及
/// `.../profiles/<name>/...` 两种形态；只匹配命令行里带 dsh 的进程。
pub fn parse_running_profile(ps_output: &str) -> Option<String> {
    let mut explicit = None;
    let mut path_hit = None;

    for line in ps_output.lines() {
        let dshish = line.to_ascii_lowercase().contains("dsh") || line.contains("/profiles/");
        if !dshish {
            continue;
        }

        let tokens: Vec<&str> = line.split_whitespace().collect();
        for (index, token) in tokens.iter().enumerate() {
            if *token == "--profile" {
                if let Some(next) = tokens.get(index + 1)
                    && let Some(name) = clean_profile_token(next)
                {
                    explicit.get_or_insert(name);
                }
            } else if let Some(value) = token.strip_prefix("--profile=")
                && let Some(name) = clean_profile_token(value)
            {
                explicit.get_or_insert(name);
            }
        }

        if let Some(index) = line.find("/profiles/") {
            let rest = &line[index + "/profiles/".len()..];
            let candidate = rest
                .split(['/', '\\', ' ', '\t', '\'', '"'])
                .next()
                .unwrap_or("");
            if let Some(name) = clean_profile_token(candidate) {
                path_hit.get_or_insert(name);
            }
        }
    }

    explicit.or(path_hit)
}

fn clean_profile_token(raw: &str) -> Option<String> {
    let trimmed =
        raw.trim_matches(|ch: char| matches!(ch, '"' | '\'' | ',' | ';' | '(' | ')' | '[' | ']'));
    if trimmed.is_empty() || trimmed.len() > 64 || trimmed.starts_with('-') {
        return None;
    }
    let valid = trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.');
    if valid {
        Some(trimmed.to_string())
    } else {
        None
    }
}

/// 通过 `ps` 猜当前运行的 profile；失败返回 `None`。
pub fn running_dsh_profile() -> Option<String> {
    let output = std::process::Command::new("ps")
        .arg("-axo")
        .arg("command")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    parse_running_profile(&text)
}

// ---------------------------------------------------------------------------
// 安装 / 卸载
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallReport {
    pub profile: String,
    pub plugin_path: PathBuf,
    pub patch_path: PathBuf,
    pub config_path: PathBuf,
    pub patch_updated: bool,
    pub backup_path: Option<PathBuf>,
}

/// 安装（或修复）指定 profile：插件脚本 + patch 标记块 + config。
///
/// 先计算好 patch 的新内容再落盘：如果用户 patch 不是 YAML 列表，直接
/// 返回 `Err`，不写任何文件。
pub fn install(
    layout: &Layout,
    profile: &str,
    config: &DshHookConfig,
) -> Result<InstallReport, String> {
    let profile = validate_profile_name(profile)?.to_string();
    let plugin_path = layout.plugin_path(&profile);
    let patch_path = layout.patch_path(&profile);

    let original = match fs::read_to_string(&patch_path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(format!("读取 cordis.patch.yml 失败: {error}")),
    };
    let updated = insert_marker(&original)?;

    write_plugin(&plugin_path)?;

    let mut patch_updated = false;
    let mut backup = None;
    if updated != original {
        if patch_path.exists() {
            backup = backup_patch(&patch_path, &original)?;
        }
        write_atomic(&patch_path, updated.as_bytes(), Some(0o644))?;
        patch_updated = true;
    }

    let mut config = config.clone();
    config.version = CONFIG_VERSION;
    config.profile = profile.clone();
    write_config(&layout.config_path(), &config)?;

    Ok(InstallReport {
        profile,
        plugin_path,
        patch_path,
        config_path: layout.config_path(),
        patch_updated,
        backup_path: backup,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UninstallReport {
    pub profiles: Vec<String>,
    pub removed_patch: bool,
    pub removed_plugin: bool,
    pub removed_config: bool,
    pub backups: Vec<PathBuf>,
}

/// 卸载：先移除 patch 标记块，再删插件脚本，最后删 config。
///
/// 即使 config 损坏也会继续清理（从 `profiles/` 里找残留的插件/标记），
/// 保证用户能一键恢复到未安装状态。
pub fn uninstall(layout: &Layout) -> Result<UninstallReport, String> {
    let config_path = layout.config_path();
    let config = match read_config(&config_path) {
        Ok(config) => config,
        Err(error) => {
            eprintln!("[dsh-hook] 卸载时配置读取失败，继续清理: {error}");
            None
        }
    };

    let mut profiles = Vec::new();
    if let Some(config) = &config
        && validate_profile_name(&config.profile).is_ok()
    {
        profiles.push(config.profile.clone());
    }
    for name in dirty_profiles(layout) {
        if !profiles.contains(&name) {
            profiles.push(name);
        }
    }

    let mut report = UninstallReport {
        profiles: profiles.clone(),
        removed_patch: false,
        removed_plugin: false,
        removed_config: false,
        backups: Vec::new(),
    };

    for profile in &profiles {
        let patch_path = layout.patch_path(profile);
        match fs::read_to_string(&patch_path) {
            Ok(original) => {
                let (updated, changed) = remove_marker(&original)?;
                if changed && updated != original {
                    if let Some(backup) = backup_patch(&patch_path, &original)? {
                        report.backups.push(backup);
                    }
                    write_atomic(&patch_path, updated.as_bytes(), Some(0o644))?;
                    report.removed_patch = true;
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("读取 cordis.patch.yml 失败: {error}")),
        }

        let plugin_path = layout.plugin_path(profile);
        match fs::remove_file(&plugin_path) {
            Ok(()) => {
                report.removed_plugin = true;
                let _ = fs::remove_dir(plugin_path.parent().unwrap_or(&plugin_path));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("删除插件脚本失败: {error}")),
        }
    }

    match fs::remove_file(&config_path) {
        Ok(()) => report.removed_config = true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("删除 DSH 联动配置失败: {error}")),
    }

    Ok(report)
}

fn dirty_profiles(layout: &Layout) -> Vec<String> {
    let mut names = Vec::new();
    let Ok(entries) = fs::read_dir(layout.profiles_dir()) else {
        return names;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if validate_profile_name(name).is_err() {
            continue;
        }
        if layout.plugin_installed(name) || layout.patch_installed(name) {
            names.push(name.to_string());
        }
    }
    names.sort();
    names
}

// ---------------------------------------------------------------------------
// 文件工具
// ---------------------------------------------------------------------------

fn write_plugin(path: &Path) -> Result<(), String> {
    let bytes = PLUGIN_SOURCE.as_bytes();
    if let Ok(existing) = fs::read(path)
        && existing == bytes
    {
        return Ok(());
    }
    write_atomic(path, bytes, Some(0o644))
}

fn backup_patch(patch_path: &Path, original: &str) -> Result<Option<PathBuf>, String> {
    if !patch_path.exists() {
        return Ok(None);
    }
    let backup = backup_path(patch_path);
    if backup.exists() {
        return Ok(Some(backup));
    }
    write_atomic(&backup, original.as_bytes(), Some(0o644))?;
    Ok(Some(backup))
}

fn write_atomic(path: &Path, bytes: &[u8], mode: Option<u32>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建目录失败: {error}"))?;
    }
    let temporary = temporary_path(path);
    fs::write(&temporary, bytes).map_err(|error| format!("写入文件失败: {error}"))?;
    #[cfg(unix)]
    if let Some(mode) = mode {
        set_mode(&temporary, mode)?;
    }
    #[cfg(not(unix))]
    let _ = mode;
    fs::rename(&temporary, path).map_err(|error| format!("替换文件失败: {error}"))?;
    Ok(())
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(format!(".{}.tmp", std::process::id()));
    PathBuf::from(name)
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
        .map_err(|error| format!("设置文件权限失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static SEQUENCE: AtomicU64 = AtomicU64::new(1);

    fn temp_layout() -> (Layout, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "sidekick-dsh-install-test-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        (Layout::new(root.clone()), root)
    }

    fn sample_config() -> DshHookConfig {
        DshHookConfig {
            version: CONFIG_VERSION,
            enabled: true,
            profile: "desktop".to_string(),
            endpoint: "http://127.0.0.1:47815/hook/dsh".to_string(),
            token: "0123456789abcdef".to_string(),
        }
    }

    #[test]
    fn inserts_block_into_empty_patch() {
        assert_eq!(insert_marker("").unwrap(), patch_block());
        assert_eq!(
            insert_marker("   \n\n").unwrap(),
            "   \n\n".to_string() + &patch_block()
        );
    }

    #[test]
    fn appends_block_after_comments() {
        let original = "# 用户自己的注释\n# 保留\n";
        let output = insert_marker(original).unwrap();
        assert!(output.starts_with(original));
        assert_eq!(output.matches(MARKER_START).count(), 1);
        assert!(output.contains("- id: sidekick-hook"));
    }

    #[test]
    fn replaces_empty_sequence() {
        let output = insert_marker("[]\n").unwrap();
        assert_eq!(output, patch_block());
        assert!(!output.contains("[]"));

        let with_comment = insert_marker("# keep\n[]\n").unwrap();
        assert!(with_comment.starts_with("# keep\n"));
        assert!(with_comment.contains(MARKER_START));
        assert!(!with_comment.contains("[]"));
    }

    #[test]
    fn appends_block_after_existing_sequence() {
        let original = "- insert:\n    - id: other\n      name: './other.mjs'\n";
        let output = insert_marker(original).unwrap();
        assert!(output.starts_with(original));
        assert!(output.contains("- id: other"));
        assert!(output.contains("- id: sidekick-hook"));
    }

    #[test]
    fn rejects_non_sequence_patch() {
        let error = insert_marker("title: hello\n").unwrap_err();
        assert!(error.contains("不是 YAML 列表"));
        assert!(insert_marker("{\"foo\": 1}\n").is_err());
    }

    #[test]
    fn insert_is_idempotent() {
        let once = insert_marker("- insert:\n    - id: other\n").unwrap();
        let twice = insert_marker(&once).unwrap();
        assert_eq!(once, twice);
        assert_eq!(twice.matches(MARKER_START).count(), 1);
    }

    #[test]
    fn rejects_broken_markers() {
        let broken = format!("{MARKER_START}\n- id: sidekick-hook\n");
        assert!(insert_marker(&broken).is_err());
        assert!(remove_marker(&broken).is_err());
    }

    #[test]
    fn removes_block_and_restores_empty_patch() {
        let patched = insert_marker("").unwrap();
        let (removed, changed) = remove_marker(&patched).unwrap();
        assert!(changed);
        assert_eq!(removed, "[]\n");
        assert!(!removed.contains(MARKER_START));
    }

    #[test]
    fn removes_block_and_keeps_comments() {
        let patched = insert_marker("# keep\n[]\n").unwrap();
        let (removed, changed) = remove_marker(&patched).unwrap();
        assert!(changed);
        assert!(removed.starts_with("# keep\n"));
        assert_eq!(removed.matches(MARKER_START).count(), 0);
        assert!(removed.contains("[]"));
    }

    #[test]
    fn removes_block_and_keeps_user_sequence() {
        let original = "- insert:\n    - id: other\n      name: './other.mjs'\n";
        let patched = insert_marker(original).unwrap();
        let (removed, changed) = remove_marker(&patched).unwrap();
        assert!(changed);
        assert_eq!(removed, original);
    }

    #[test]
    fn remove_without_marker_is_noop() {
        let (removed, changed) = remove_marker("- id: other\n").unwrap();
        assert!(!changed);
        assert_eq!(removed, "- id: other\n");
    }

    #[test]
    fn install_writes_plugin_patch_and_config() {
        let (layout, root) = temp_layout();
        let report = install(&layout, "desktop", &sample_config()).unwrap();
        assert_eq!(report.profile, "desktop");
        assert!(report.patch_updated);
        assert!(layout.plugin_path("desktop").is_file());
        assert!(layout.patch_path("desktop").is_file());
        assert!(layout.config_path().is_file());
        assert!(layout.installed("desktop"));

        let plugin = fs::read_to_string(layout.plugin_path("desktop")).unwrap();
        assert!(plugin.contains("sidekick-hook"));

        let patch = fs::read_to_string(layout.patch_path("desktop")).unwrap();
        assert!(patch.contains(MARKER_START));
        assert!(patch.contains("- id: sidekick-hook"));
        assert!(patch.contains("name: './plugins/sidekick-hook.mjs'"));

        let config = read_config(&layout.config_path()).unwrap().unwrap();
        assert_eq!(config, sample_config());

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(layout.config_path())
                .unwrap()
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
            let dir_mode = fs::metadata(layout.config_path().parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(dir_mode, 0o700);
        }

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn second_install_is_idempotent_and_keeps_backup() {
        let (layout, root) = temp_layout();
        fs::create_dir_all(layout.profile_dir("desktop")).unwrap();
        let original = "- insert:\n    - id: user\n      name: './user.mjs'\n";
        fs::write(layout.patch_path("desktop"), original).unwrap();

        install(&layout, "desktop", &sample_config()).unwrap();
        let patched = fs::read_to_string(layout.patch_path("desktop")).unwrap();
        assert!(patched.contains("- id: user"));
        assert!(patched.contains("- id: sidekick-hook"));

        let backup = fs::read_to_string(backup_path(&layout.patch_path("desktop"))).unwrap();
        assert_eq!(backup, original);

        let report = install(&layout, "desktop", &sample_config()).unwrap();
        assert!(!report.patch_updated);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn install_refuses_non_sequence_patch_without_writing() {
        let (layout, root) = temp_layout();
        fs::create_dir_all(layout.profile_dir("desktop")).unwrap();
        let original = "title: hello\n";
        fs::write(layout.patch_path("desktop"), original).unwrap();

        let error = install(&layout, "desktop", &sample_config()).unwrap_err();
        assert!(error.contains("不是 YAML 列表"));
        assert_eq!(
            fs::read_to_string(layout.patch_path("desktop")).unwrap(),
            original
        );
        assert!(!layout.plugin_path("desktop").exists());
        assert!(!layout.config_path().exists());
        assert!(!backup_path(&layout.patch_path("desktop")).exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn install_rejects_path_traversal_profile() {
        let (layout, root) = temp_layout();
        assert!(install(&layout, "../evil", &sample_config()).is_err());
        assert!(!layout.home().join("evil").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn uninstall_restores_patch_and_removes_files() {
        let (layout, root) = temp_layout();
        fs::create_dir_all(layout.profile_dir("desktop")).unwrap();
        let original = "- insert:\n    - id: user\n      name: './user.mjs'\n";
        fs::write(layout.patch_path("desktop"), original).unwrap();

        install(&layout, "desktop", &sample_config()).unwrap();
        let report = uninstall(&layout).unwrap();
        assert_eq!(report.profiles, vec!["desktop".to_string()]);
        assert!(report.removed_patch);
        assert!(report.removed_plugin);
        assert!(report.removed_config);
        assert!(!layout.plugin_path("desktop").exists());
        assert!(!layout.config_path().exists());
        assert_eq!(
            fs::read_to_string(layout.patch_path("desktop")).unwrap(),
            original
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn uninstall_writes_empty_sequence_for_empty_patch() {
        let (layout, root) = temp_layout();
        install(&layout, "desktop", &sample_config()).unwrap();
        uninstall(&layout).unwrap();
        assert_eq!(
            fs::read_to_string(layout.patch_path("desktop")).unwrap(),
            "[]\n"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn uninstall_tolerates_missing_files() {
        let (layout, root) = temp_layout();
        let report = uninstall(&layout).unwrap();
        assert!(report.profiles.is_empty());
        assert!(!report.removed_patch);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn lists_profiles_with_installed_flag() {
        let (layout, root) = temp_layout();
        for name in ["work", "desktop"] {
            fs::create_dir_all(layout.profile_dir(name)).unwrap();
            fs::write(layout.profile_dir(name).join("package.json"), "{}").unwrap();
        }
        fs::create_dir_all(layout.profile_dir("not-a-profile")).unwrap();

        let profiles = list_profiles(&layout);
        assert_eq!(
            profiles
                .iter()
                .map(|entry| entry.name.as_str())
                .collect::<Vec<_>>(),
            vec!["desktop", "work"]
        );
        assert!(profiles.iter().all(|entry| !entry.installed));

        install(&layout, "desktop", &sample_config()).unwrap();
        let profiles = list_profiles(&layout);
        assert!(
            profiles
                .iter()
                .any(|entry| entry.name == "desktop" && entry.installed)
        );
        assert!(
            profiles
                .iter()
                .any(|entry| entry.name == "work" && !entry.installed)
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn validates_profile_names() {
        assert_eq!(validate_profile_name(" desktop ").unwrap(), "desktop");
        assert_eq!(validate_profile_name("work-2").unwrap(), "work-2");
        assert!(validate_profile_name("").is_err());
        assert!(validate_profile_name("..").is_err());
        assert!(validate_profile_name("../evil").is_err());
        assert!(validate_profile_name("/etc/passwd").is_err());
        assert!(validate_profile_name("a/b").is_err());
    }

    #[test]
    fn labels_profiles() {
        assert_eq!(profile_label("desktop"), "Desktop");
        assert_eq!(profile_label("work"), "Work");
        assert_eq!(profile_label("2fast"), "2fast");
    }

    #[test]
    fn parses_running_profile_from_ps() {
        let ps = "\
node /usr/local/bin/dsh --profile work
node /opt/dsh/bin.js
";
        assert_eq!(parse_running_profile(ps), Some("work".to_string()));

        let ps = "/usr/local/bin/node /Users/me/.dsh/profiles/alpha/bin.js --foo\n";
        assert_eq!(parse_running_profile(ps), Some("alpha".to_string()));

        let ps = "\
node /usr/local/bin/dsh --profile=night_owl
";
        assert_eq!(parse_running_profile(ps), Some("night_owl".to_string()));

        assert_eq!(parse_running_profile(""), None);
        assert_eq!(parse_running_profile("/usr/bin/foo --bar\n"), None);
        assert_eq!(parse_running_profile("node dsh --profile --weird\n"), None);
    }

    #[test]
    fn explicit_profile_wins_over_path() {
        let ps = "\
node /Users/me/.dsh/profiles/alpha/bin.js
node /usr/local/bin/dsh --profile beta
";
        assert_eq!(parse_running_profile(ps), Some("beta".to_string()));
    }

    #[test]
    fn read_config_handles_missing_and_broken_files() {
        let (layout, root) = temp_layout();
        assert_eq!(read_config(&layout.config_path()).unwrap(), None);

        fs::create_dir_all(layout.config_path().parent().unwrap()).unwrap();
        fs::write(layout.config_path(), "  \n").unwrap();
        assert_eq!(read_config(&layout.config_path()).unwrap(), None);

        fs::write(layout.config_path(), "{ not json").unwrap();
        assert!(read_config(&layout.config_path()).is_err());

        let mut config = sample_config();
        config.version = 9;
        fs::write(layout.config_path(), serde_json::to_vec(&config).unwrap()).unwrap();
        assert!(read_config(&layout.config_path()).is_err());

        let _ = fs::remove_dir_all(root);
    }
}
