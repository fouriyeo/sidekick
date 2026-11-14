//! 全局快捷键：把「双击右 Ctrl / 按住组合键」变成桌面端的录音开关。
//!
//! 为什么不用 global-shortcut 插件：用户要的是**裸修饰键**（右 Ctrl / 右 Shift），
//! 系统级热键注册大多要求「修饰键 + 普通键」；而裸修饰键只能靠旁听键盘事件实现。
//!
//! 实现选择：`NSEvent` 的全局 + 本地 monitor（objc2-app-kit，项目已有依赖）。
//! - 全局 monitor 覆盖「其它 App 在前台」的绝大多数场景；本地 monitor 覆盖本 App
//!   在前台时（设置页里试键）；
//! - **旁听不吞键**：本地 monitor 原样把事件传回去，右 Ctrl 在别的 App 里该干嘛干嘛；
//! - 权限：全局键盘监听要求「辅助功能」，本项目为了合成 Cmd+V 本来就要这个授权，
//!   不新增 TCC 项目（真机若发现还需要「输入监控」，设置卡会有对应引导）。
//!
//! 纯判定逻辑（`Detector`）与 AppKit 解耦，单测不碰 UI。

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

/// 设置卡与 HUD 的「配置变更」事件。
pub const EVENT_CHANGED: &str = "hotkey-changed";
/// Esc 的硬件 keyCode（macOS）。
const CANCEL_KEY_CODE: u16 = 53;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BareKey {
    LeftControl,
    RightControl,
    LeftShift,
    RightShift,
    LeftOption,
    RightOption,
    LeftCommand,
    RightCommand,
}

impl BareKey {
    pub fn key_code(self) -> u16 {
        match self {
            Self::LeftControl => 59,
            Self::RightControl => 62,
            Self::LeftShift => 56,
            Self::RightShift => 60,
            Self::LeftOption => 58,
            Self::RightOption => 61,
            Self::LeftCommand => 55,
            Self::RightCommand => 54,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::LeftControl => "左 Control",
            Self::RightControl => "右 Control",
            Self::LeftShift => "左 Shift",
            Self::RightShift => "右 Shift",
            Self::LeftOption => "左 Option",
            Self::RightOption => "右 Option",
            Self::LeftCommand => "左 Command",
            Self::RightCommand => "右 Command",
        }
    }

    fn is_down(self, mods: Mods) -> bool {
        match self {
            Self::LeftControl | Self::RightControl => mods.control,
            Self::LeftShift | Self::RightShift => mods.shift,
            Self::LeftOption | Self::RightOption => mods.option,
            Self::LeftCommand | Self::RightCommand => mods.command,
        }
    }
}

/// 平台无关的修饰键状态（AppKit 的 flags 先翻译成它，判定逻辑才能单测）。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Mods {
    pub control: bool,
    pub shift: bool,
    pub option: bool,
    pub command: bool,
}

impl Mods {
    fn matches(self, required: Self) -> bool {
        self.control == required.control
            && self.shift == required.shift
            && self.option == required.option
            && self.command == required.command
    }

    fn is_empty(self) -> bool {
        !self.control && !self.shift && !self.option && !self.command
    }
}

/// macOS 上会单独产生 `flagsChanged` 的修饰键（keyCode）。
fn is_modifier_key(key_code: u16) -> bool {
    matches!(key_code, 54..=56 | 58..=63)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Binding {
    /// 单键：修饰键（左/右 Command、Control、Shift、Option）。按一下就切换。
    Bare { key: BareKey },
    /// 单键：普通键（F13、字母等）。按一下就切换，按住其它修饰键时不触发。
    #[serde(rename_all = "camelCase")]
    Single { key_code: u16, label: String },
    /// 组合键：按一下切换，或按住说话。
    #[serde(rename_all = "camelCase")]
    Combo {
        key_code: u16,
        label: String,
        control: bool,
        shift: bool,
        option: bool,
        command: bool,
    },
}

impl Binding {
    fn describe(&self, mode: TriggerMode) -> String {
        match self {
            Self::Bare { key } => format!("按一下 {}", key.label()),
            Self::Single { label, .. } => format!("按一下 {label}"),
            Self::Combo { label, .. } => {
                if mode == TriggerMode::Hold {
                    format!("按住 {label}")
                } else {
                    format!("按一下 {label}")
                }
            }
        }
    }

    fn modifiers(&self) -> Mods {
        match self {
            Self::Bare { .. } | Self::Single { .. } => Mods::default(),
            Self::Combo {
                control,
                shift,
                option,
                command,
                ..
            } => Mods {
                control: *control,
                shift: *shift,
                option: *option,
                command: *command,
            },
        }
    }

    fn bare_code(&self) -> Option<u16> {
        match self {
            Self::Bare { key } => Some(key.key_code()),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TriggerMode {
    /// 按一下开始，再按一下结束。
    Toggle,
    /// 按住说话，松开结束（仅组合键；单键自动退回 Toggle）。
    Hold,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyConfig {
    pub enabled: bool,
    pub binding: Binding,
    pub mode: TriggerMode,
}

impl Default for HotkeyConfig {
    fn default() -> Self {
        Self {
            // 默认关闭：全局热键接管键盘属于侵入性设置，开源分发时不能装了就生效。
            enabled: false,
            binding: Binding::Bare {
                key: BareKey::RightCommand,
            },
            mode: TriggerMode::Toggle,
        }
    }
}

impl HotkeyConfig {
    /// 单键没有「按住」语义，读配置时就地归一，避免 UI 与行为不一致。
    pub fn normalized(mut self) -> Self {
        if !matches!(self.binding, Binding::Combo { .. }) {
            self.mode = TriggerMode::Toggle;
        }
        self
    }
}

/// 送给 `mic_remote` 的动作。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    Trigger,
    Release,
    Cancel,
}

/// 纯判定：吃键盘事件，吐动作。不碰 AppKit / Tauri，可单测。
///
/// 单键语义是「按一下就切换」，不是双击；但会剔除两种情况：
/// 1. 按住修饰键时按了别的键（⌘C 的 ⌘ 不算一次点按）；
/// 2. 已经按着别的键再按修饰键。
pub struct Detector {
    config: HotkeyConfig,
    recording: bool,
    bare_down: bool,
    bare_dirty: bool,
    /// 当前按着的普通键（用来判断「先按着别的键再点修饰键」）。
    others: std::collections::HashSet<u16>,
    combo_down: bool,
}

impl Detector {
    pub fn new(config: HotkeyConfig) -> Self {
        Self {
            config: config.normalized(),
            recording: false,
            bare_down: false,
            bare_dirty: false,
            others: std::collections::HashSet::new(),
            combo_down: false,
        }
    }

    pub fn set_config(&mut self, config: HotkeyConfig) {
        self.config = config.normalized();
        self.bare_down = false;
        self.bare_dirty = false;
        self.others.clear();
        self.combo_down = false;
    }

    /// 录音状态只影响 Esc 是否生效。
    pub fn set_recording(&mut self, recording: bool) {
        self.recording = recording;
    }

    /// 修饰键状态变化（flagsChanged）：单键修饰键的按下/松开在这里看出来。
    pub fn on_flags(&mut self, key_code: u16, mods: Mods, _now: Instant) -> Option<Action> {
        if !self.config.enabled {
            return None;
        }
        let Binding::Bare { key } = self.config.binding else {
            return None;
        };
        if key_code != key.key_code() {
            // 单键修饰键按住期间又按了另一个修饰键：不算点按。
            if self.bare_down && is_modifier_key(key_code) {
                self.bare_dirty = true;
            }
            return None;
        }

        if key.is_down(mods) {
            if self.bare_down {
                return None;
            }
            self.bare_down = true;
            self.bare_dirty = !self.others.is_empty();
            None
        } else {
            if !self.bare_down {
                return None;
            }
            self.bare_down = false;
            if self.bare_dirty {
                self.bare_dirty = false;
                return None;
            }
            Some(Action::Trigger)
        }
    }

    /// 普通键按下/抬起：单键、组合键与 Esc 取消。
    pub fn on_key(
        &mut self,
        key_code: u16,
        mods: Mods,
        is_repeat: bool,
        pressed: bool,
        _now: Instant,
    ) -> Option<Action> {
        if !self.config.enabled {
            return None;
        }
        if key_code == CANCEL_KEY_CODE {
            if pressed && !is_repeat && self.recording {
                return Some(Action::Cancel);
            }
            return None;
        }

        if !is_modifier_key(key_code) {
            if pressed {
                if !is_repeat {
                    self.others.insert(key_code);
                }
            } else {
                self.others.remove(&key_code);
            }
        }

        // 单键修饰键按住期间按了别的键 → 这次按不算点按（⌘C / ⌘V 不误触发）。
        if self.bare_down {
            self.bare_dirty = true;
        }

        match &self.config.binding {
            Binding::Bare { .. } => None,
            Binding::Single {
                key_code: bound, ..
            } => {
                if *bound != key_code || !pressed || is_repeat {
                    return None;
                }
                // 普通单键只在「干净地按它」时触发，带修饰键的组合留给自己用。
                if !mods.is_empty() {
                    return None;
                }
                Some(Action::Trigger)
            }
            Binding::Combo {
                key_code: bound, ..
            } => {
                if *bound != key_code {
                    return None;
                }
                if self.config.mode == TriggerMode::Hold {
                    if pressed {
                        if is_repeat
                            || self.combo_down
                            || !mods.matches(self.config.binding.modifiers())
                        {
                            return None;
                        }
                        self.combo_down = true;
                        Some(Action::Trigger)
                    } else {
                        if !self.combo_down {
                            return None;
                        }
                        self.combo_down = false;
                        Some(Action::Release)
                    }
                } else {
                    if !pressed || is_repeat || !mods.matches(self.config.binding.modifiers()) {
                        return None;
                    }
                    Some(Action::Trigger)
                }
            }
        }
    }
}

/// 设置页/`hotkey_status` 的返回体。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyStatus {
    pub enabled: bool,
    pub binding: Binding,
    pub label: String,
    pub mode: TriggerMode,
    /// 辅助功能是否已授权（全局键盘监听的硬前提）。
    pub trusted: bool,
    /// 监听器是否已装好（非 macOS 恒为 false）。
    pub listening: bool,
    pub platform: String,
    pub hint: Option<String>,
}

pub struct HotkeyState {
    detector: Mutex<Detector>,
}

impl HotkeyState {
    fn new(config: HotkeyConfig) -> Self {
        Self {
            detector: Mutex::new(Detector::new(config)),
        }
    }
}

pub fn config_path() -> PathBuf {
    crate::app_paths::data_dir().join("hotkey.json")
}

pub fn load_config() -> HotkeyConfig {
    let path = config_path();
    let Ok(text) = std::fs::read_to_string(&path) else {
        return HotkeyConfig::default();
    };
    match serde_json::from_str::<HotkeyConfig>(&text) {
        Ok(config) => config.normalized(),
        Err(error) => {
            eprintln!("[hotkey] 读取 {path:?} 失败，使用默认配置: {error}");
            HotkeyConfig::default()
        }
    }
}

pub fn save_config(config: &HotkeyConfig) -> Result<(), String> {
    let path = config_path();
    crate::app_paths::ensure_parent(&path).map_err(|error| format!("创建配置目录失败: {error}"))?;
    let bytes = serde_json::to_vec_pretty(config).map_err(|error| format!("序列化失败: {error}"))?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, bytes).map_err(|error| format!("保存失败: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&temp, &path).map_err(|error| format!("保存失败: {error}"))
}

/// 启动时调用：装载配置并（macOS）安装键盘监听。
pub fn init(app: &AppHandle) {
    let config = load_config();
    app.manage(HotkeyState::new(config.clone()));

    #[cfg(target_os = "macos")]
    install_monitors(app);

    #[cfg(not(target_os = "macos"))]
    let _ = (app, config);
}

#[tauri::command]
pub fn hotkey_status(app: AppHandle, state: tauri::State<'_, HotkeyState>) -> HotkeyStatus {
    let config = state
        .detector
        .lock()
        .map(|detector| detector.config.clone())
        .unwrap_or_default();
    let _ = &app;
    build_status(&config)
}

#[tauri::command]
pub fn hotkey_save(
    app: AppHandle,
    state: tauri::State<'_, HotkeyState>,
    config: HotkeyConfig,
) -> Result<HotkeyStatus, String> {
    let config = config.normalized();
    if let Binding::Combo { label, .. } | Binding::Single { label, .. } = &config.binding {
        if label.trim().is_empty() {
            return Err("按键缺少显示名".to_string());
        }
    }
    save_config(&config)?;
    if let Ok(mut detector) = state.detector.lock() {
        detector.set_config(config.clone());
    }
    let status = build_status(&config);
    let _ = app.emit(EVENT_CHANGED, status.clone());
    Ok(status)
}

fn build_status(config: &HotkeyConfig) -> HotkeyStatus {
    let trusted = crate::desktop_mic::accessibility_trusted();
    let platform = std::env::consts::OS.to_string();
    let listening = cfg!(target_os = "macos") && MONITORS_INSTALLED.load(std::sync::atomic::Ordering::SeqCst);
    let hint = if !cfg!(target_os = "macos") {
        Some("快捷键目前只在 macOS 桌面端可用。".to_string())
    } else if config.enabled && !trusted {
        Some("需要「辅助功能」授权才能监听键盘；去系统设置打开后即可生效。".to_string())
    } else {
        None
    };
    HotkeyStatus {
        enabled: config.enabled,
        label: config.binding.describe(config.mode),
        binding: config.binding.clone(),
        mode: config.mode,
        trusted,
        listening,
        platform,
        hint,
    }
}

/// 由 `mic_remote` 在会话开始/结束时同步，用于判断 Esc 是否该生效。
pub fn set_recording(app: &AppHandle, recording: bool) {
    if let Some(state) = app.try_state::<HotkeyState>() {
        if let Ok(mut detector) = state.detector.lock() {
            detector.set_recording(recording);
        }
    }
}

static MONITORS_INSTALLED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

#[cfg(target_os = "macos")]
fn install_monitors(app: &AppHandle) {
    use std::ptr::NonNull;
    use std::sync::Once;

    use block2::StackBlock;
    use objc2_app_kit::{NSEvent, NSEventMask};

    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let mask = NSEventMask::FlagsChanged | NSEventMask::KeyDown | NSEventMask::KeyUp;

        // 全局：其它 App 在前台。系统会 copy 这个 block，所以 StackBlock 出栈也安全。
        let global_app = app.clone();
        let global = StackBlock::new(move |event: NonNull<NSEvent>| {
            forward(&global_app, unsafe { event.as_ref() });
        });
        let allowed =
            NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mask, &global).is_some();

        // 本地：本 App 在前台时。必须原样返回事件，不能吞键。
        let local_app = app.clone();
        let local = StackBlock::new(move |event: NonNull<NSEvent>| {
            forward(&local_app, unsafe { event.as_ref() });
            event.as_ptr()
        });
        let local_token =
            unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &local) };

        // 监听器生命周期与 App 相同：token 必须一直活着，所以刻意不释放。
        std::mem::forget(local_token);
        if !allowed {
            eprintln!("[hotkey] 全局键盘监听未生效：检查「辅助功能」授权");
        }
        MONITORS_INSTALLED.store(allowed, std::sync::atomic::Ordering::SeqCst);
        eprintln!("[hotkey] 键盘监听已安装（global={allowed}）");
    });
}

#[cfg(target_os = "macos")]
fn forward(app: &AppHandle, event: &objc2_app_kit::NSEvent) {
    let debug_events = std::env::var_os("SIDEKICK_HOTKEY_DEBUG").is_some();
    use objc2_app_kit::{NSEventModifierFlags, NSEventType};

    let key_code = event.keyCode();
    let flags = event.modifierFlags();
    let mods = Mods {
        control: flags.contains(NSEventModifierFlags::Control),
        shift: flags.contains(NSEventModifierFlags::Shift),
        option: flags.contains(NSEventModifierFlags::Option),
        command: flags.contains(NSEventModifierFlags::Command),
    };
    let kind = event.r#type();
    if debug_events {
        eprintln!("[hotkey] ev {kind:?} key={key_code} mods={mods:?}");
    }
    let now = Instant::now();

    let action = {
        let Some(state) = app.try_state::<HotkeyState>() else {
            return;
        };
        let Ok(mut detector) = state.detector.lock() else {
            return;
        };
        if kind == NSEventType::FlagsChanged {
            detector.on_flags(key_code, mods, now)
        } else if kind == NSEventType::KeyDown {
            detector.on_key(key_code, mods, event.isARepeat(), true, now)
        } else {
            detector.on_key(key_code, mods, false, false, now)
        }
    };

    if let Some(action) = action {
        dispatch(app, action);
    }
}

fn dispatch(app: &AppHandle, action: Action) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(remote) = app.try_state::<Arc<crate::mic_remote::RemoteMic>>() else {
            return;
        };
        let remote = remote.inner().clone();
        match action {
            Action::Trigger => remote.on_trigger(),
            Action::Release => remote.on_release(),
            Action::Cancel => remote.on_cancel(),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bare(key: BareKey) -> HotkeyConfig {
        HotkeyConfig {
            enabled: true,
            binding: Binding::Bare { key },
            mode: TriggerMode::Toggle,
        }
    }

    fn combo(mode: TriggerMode) -> HotkeyConfig {
        HotkeyConfig {
            enabled: true,
            binding: Binding::Combo {
                key_code: 49,
                label: "⌃⌥Space".to_string(),
                control: true,
                shift: false,
                option: true,
                command: false,
            },
            mode,
        }
    }

    fn command(down: bool) -> Mods {
        Mods {
            command: down,
            ..Mods::default()
        }
    }

    fn ctrl_opt() -> Mods {
        Mods {
            control: true,
            option: true,
            ..Mods::default()
        }
    }

    #[test]
    fn single_tap_modifier_toggles_once() {
        let mut detector = Detector::new(bare(BareKey::RightCommand));
        let now = Instant::now();
        assert_eq!(detector.on_flags(54, command(true), now), None);
        assert_eq!(detector.on_flags(54, command(false), now), Some(Action::Trigger));
    }

    #[test]
    fn cmd_c_is_not_a_split_tap() {
        let mut detector = Detector::new(bare(BareKey::RightCommand));
        let now = Instant::now();
        detector.on_flags(54, command(true), now);
        // 按住 Command 时按 C：这次按 Command 不算点按
        detector.on_key(8, command(true), false, true, now);
        detector.on_key(8, command(true), false, false, now);
        assert_eq!(detector.on_flags(54, command(false), now), None);
    }

    #[test]
    fn holding_other_key_then_modifier_is_not_a_tap() {
        let mut detector = Detector::new(bare(BareKey::RightCommand));
        let now = Instant::now();
        detector.on_key(8, Mods::default(), false, true, now);
        assert_eq!(detector.on_flags(54, command(true), now), None);
        detector.on_key(8, command(true), false, false, now);
        assert_eq!(detector.on_flags(54, command(false), now), None);
    }

    #[test]
    fn only_the_bound_side_triggers() {
        let mut detector = Detector::new(bare(BareKey::RightCommand));
        let now = Instant::now();
        // 左 Command（55）不是绑定的那个键
        detector.on_flags(55, command(true), now);
        assert_eq!(detector.on_flags(55, command(false), now), None);
    }

    #[test]
    fn bare_binding_forces_toggle_and_describes_as_tap() {
        let config = HotkeyConfig {
            enabled: true,
            binding: Binding::Bare {
                key: BareKey::RightShift,
            },
            mode: TriggerMode::Hold,
        }
        .normalized();
        assert_eq!(config.mode, TriggerMode::Toggle);
        assert_eq!(config.binding.describe(config.mode), "按一下 右 Shift");
    }

    #[test]
    fn single_plain_key_requires_no_modifiers() {
        let config = HotkeyConfig {
            enabled: true,
            binding: Binding::Single {
                key_code: 105,
                label: "F13".to_string(),
            },
            mode: TriggerMode::Toggle,
        };
        let mut detector = Detector::new(config);
        let now = Instant::now();
        assert_eq!(
            detector.on_key(105, Mods::default(), false, true, now),
            Some(Action::Trigger)
        );
        // 带修饰键的同键（如 ⌘F13）不触发
        assert_eq!(detector.on_key(105, command(true), false, true, now), None);
        // 自动重复不触发
        assert_eq!(detector.on_key(105, Mods::default(), true, true, now), None);
    }

    #[test]
    fn combo_hold_emits_trigger_then_release() {
        let mut detector = Detector::new(combo(TriggerMode::Hold));
        let now = Instant::now();
        assert_eq!(
            detector.on_key(49, ctrl_opt(), false, true, now),
            Some(Action::Trigger)
        );
        assert_eq!(
            detector.on_key(49, Mods::default(), false, false, now),
            Some(Action::Release)
        );
    }

    #[test]
    fn combo_hold_requires_exact_modifiers() {
        let mut detector = Detector::new(combo(TriggerMode::Hold));
        let now = Instant::now();
        assert_eq!(detector.on_key(49, Mods::default(), false, true, now), None);
    }

    #[test]
    fn combo_toggle_is_a_single_press() {
        let mut detector = Detector::new(combo(TriggerMode::Toggle));
        let now = Instant::now();
        assert_eq!(
            detector.on_key(49, ctrl_opt(), false, true, now),
            Some(Action::Trigger)
        );
        // 自动重复不算第二次
        assert_eq!(detector.on_key(49, ctrl_opt(), true, true, now), None);
    }

    #[test]
    fn esc_only_cancels_while_recording() {
        let mut detector = Detector::new(bare(BareKey::RightCommand));
        let now = Instant::now();
        assert_eq!(detector.on_key(53, Mods::default(), false, true, now), None);
        detector.set_recording(true);
        assert_eq!(
            detector.on_key(53, Mods::default(), false, true, now),
            Some(Action::Cancel)
        );
        assert_eq!(detector.on_key(53, Mods::default(), true, true, now), None);
    }

    #[test]
    fn disabled_config_ignores_everything() {
        let mut detector = Detector::new(HotkeyConfig {
            enabled: false,
            ..bare(BareKey::RightCommand)
        });
        let now = Instant::now();
        detector.on_flags(54, command(true), now);
        assert_eq!(detector.on_flags(54, command(false), now), None);
    }

    #[test]
    fn config_round_trips_through_json() {
        for config in [
            bare(BareKey::RightCommand),
            HotkeyConfig {
                enabled: true,
                binding: Binding::Single {
                    key_code: 105,
                    label: "F13".to_string(),
                },
                mode: TriggerMode::Toggle,
            },
            combo(TriggerMode::Hold),
        ] {
            let text = serde_json::to_string(&config).unwrap();
            let parsed: HotkeyConfig = serde_json::from_str(&text).unwrap();
            assert_eq!(parsed, config);
        }
        let text = serde_json::to_string(&combo(TriggerMode::Hold)).unwrap();
        assert!(text.contains("\"kind\":\"combo\""));
        assert!(text.contains("\"keyCode\""));
    }
}
