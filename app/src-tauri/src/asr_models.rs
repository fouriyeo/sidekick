use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::app_paths;

const EVENT_PROGRESS: &str = "model-progress";
const MAX_TRANSCRIPT_CHARS: usize = 2000;
const MIN_SAMPLES: usize = 1600;

struct Preset {
    id: &'static str,
    label: &'static str,
    approx_bytes: u64,
    note: &'static str,
}

const PRESETS: &[Preset] = &[
    Preset {
        id: "tiny",
        label: "Tiny",
        approx_bytes: 77_691_713,
        note: "最快，准确率低",
    },
    Preset {
        id: "base",
        label: "Base",
        approx_bytes: 147_951_465,
        note: "平衡，推荐起步",
    },
    Preset {
        id: "small",
        label: "Small",
        approx_bytes: 487_601_967,
        note: "更准，体积更大",
    },
    Preset {
        id: "medium",
        label: "Medium",
        approx_bytes: 1_533_774_201,
        note: "最准，占用较大",
    },
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrModelInfo {
    pub id: String,
    pub label: String,
    pub file_name: String,
    pub approx_bytes: u64,
    pub size_bytes: u64,
    pub downloaded: bool,
    pub selected: bool,
    pub note: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrDownloadInfo {
    pub id: String,
    pub received: u64,
    pub total: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrStatus {
    pub dir: String,
    pub selected: Option<String>,
    pub models: Vec<AsrModelInfo>,
    pub downloading: Option<AsrDownloadInfo>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelProgress {
    model_id: String,
    received: u64,
    total: u64,
    state: &'static str,
    message: Option<String>,
}

struct CachedEngine {
    id: String,
    context: WhisperContext,
}

struct DownloadControl {
    cancel: AtomicBool,
    received: AtomicU64,
    total: AtomicU64,
}

struct DownloadState {
    id: String,
    control: Arc<DownloadControl>,
}

pub struct ModelManager {
    app: AppHandle,
    dir: PathBuf,
    selected: Mutex<Option<String>>,
    download: Mutex<Option<DownloadState>>,
    engine: Mutex<Option<CachedEngine>>,
}

pub struct Transcript {
    pub text: String,
    pub truncated: bool,
}

#[derive(Debug)]
pub enum TranscribeFailure {
    ModelMissing,
    Empty,
    Cancelled,
    Failed(String),
}

impl TranscribeFailure {
    pub fn code(&self) -> &'static str {
        match self {
            Self::ModelMissing => "model_missing",
            Self::Empty => "empty_transcript",
            Self::Cancelled => "asr_timeout",
            Self::Failed(_) => "asr_failed",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::ModelMissing => "还没有可用的语音模型".to_string(),
            Self::Empty => "没有识别到文字".to_string(),
            Self::Cancelled => "转写超时".to_string(),
            Self::Failed(detail) => detail.clone(),
        }
    }
}

impl ModelManager {
    pub fn new(app: AppHandle) -> Self {
        let dir = app_paths::models_dir();
        let _ = fs::create_dir_all(&dir);
        cleanup_part_files(&dir);

        let selected = load_selected(&dir).or_else(|| default_selected(&dir));
        Self {
            app,
            dir,
            selected: Mutex::new(selected),
            download: Mutex::new(None),
            engine: Mutex::new(None),
        }
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn status(&self) -> AsrStatus {
        let selected = self.selected.lock().unwrap().clone();
        let models = scan_models(&self.dir, selected.as_deref());

        let downloading = self
            .download
            .lock()
            .unwrap()
            .as_ref()
            .map(|state| AsrDownloadInfo {
                id: state.id.clone(),
                received: state.control.received.load(Ordering::Relaxed),
                total: state.control.total.load(Ordering::Relaxed),
            });

        AsrStatus {
            dir: self.dir.to_string_lossy().to_string(),
            selected,
            models,
            downloading,
        }
    }

    pub fn selected_id(&self) -> Option<String> {
        self.selected.lock().unwrap().clone()
    }

    pub fn selected_available(&self) -> bool {
        let selected = self.selected.lock().unwrap().clone();
        selected
            .and_then(|id| preset(&id))
            .map(|item| self.dir.join(file_name(item.id)).is_file())
            .unwrap_or(false)
    }

    pub fn prewarm(self: &Arc<Self>) {
        let manager = Arc::clone(self);
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(error) = manager.ensure_engine() {
                eprintln!("[asr] prewarm skipped: {}", error.message());
            }
        });
    }

    fn ensure_engine(&self) -> Result<(), TranscribeFailure> {
        let selected = self.selected.lock().unwrap().clone();
        let Some(id) = selected else {
            return Err(TranscribeFailure::ModelMissing);
        };
        let Some(item) = preset(&id) else {
            return Err(TranscribeFailure::ModelMissing);
        };
        let path = self.dir.join(file_name(item.id));
        if !path.is_file() {
            return Err(TranscribeFailure::ModelMissing);
        }

        let mut engine = self.engine.lock().unwrap();
        let needs_load = engine
            .as_ref()
            .map(|cached| cached.id != id)
            .unwrap_or(true);
        if needs_load {
            let mut parameters = WhisperContextParameters::default();
            parameters.use_gpu(true);
            let context = WhisperContext::new_with_params(&path, parameters)
                .map_err(|error| TranscribeFailure::Failed(error.to_string()))?;
            *engine = Some(CachedEngine { id, context });
        }
        Ok(())
    }

    pub fn select(&self, id: &str) -> Result<(), String> {
        let item = preset(id).ok_or_else(|| "未知模型".to_string())?;
        if !self.dir.join(file_name(item.id)).is_file() {
            return Err("模型还没下载".to_string());
        }

        *self.selected.lock().unwrap() = Some(item.id.to_string());
        *self.engine.lock().unwrap() = None;
        write_selected(&self.dir, item.id)
    }

    pub fn start_download(self: &Arc<Self>, id: String) -> Result<(), String> {
        let item = preset(&id).ok_or_else(|| "未知模型".to_string())?;
        if self.dir.join(file_name(item.id)).is_file() {
            return Err("模型已经下载".to_string());
        }

        {
            let download = self.download.lock().unwrap();
            if let Some(state) = download.as_ref() {
                return Err(format!("正在下载 {}", state.id));
            }
        }

        let control = Arc::new(DownloadControl {
            cancel: AtomicBool::new(false),
            received: AtomicU64::new(0),
            total: AtomicU64::new(0),
        });

        {
            let mut download = self.download.lock().unwrap();
            *download = Some(DownloadState {
                id: id.clone(),
                control: control.clone(),
            });
        }

        let manager = Arc::clone(self);
        tauri::async_runtime::spawn_blocking(move || {
            manager.run_download(&id, control);
        });

        Ok(())
    }

    pub fn cancel_download(&self) {
        if let Some(state) = self.download.lock().unwrap().as_ref() {
            state.control.cancel.store(true, Ordering::Relaxed);
        }
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        if let Some(state) = self.download.lock().unwrap().as_ref() {
            if state.id == id {
                return Err("正在下载这个模型".to_string());
            }
        }

        let item = preset(id).ok_or_else(|| "未知模型".to_string())?;
        let path = self.dir.join(file_name(item.id));
        if path.is_file() {
            fs::remove_file(&path).map_err(|error| format!("删除失败: {error}"))?;
        }

        if self.selected.lock().unwrap().as_deref() == Some(item.id) {
            *self.selected.lock().unwrap() = default_selected(&self.dir);
            *self.engine.lock().unwrap() = None;
            if let Some(next) = self.selected.lock().unwrap().clone() {
                write_selected(&self.dir, &next)?;
            } else {
                let _ = fs::remove_file(selected_path(&self.dir));
            }
        }

        Ok(())
    }

    fn run_download(&self, id: &str, control: Arc<DownloadControl>) {
        let Some(item) = preset(id) else {
            self.emit_progress(id, &control, "error", Some("未知模型".to_string()));
            self.finish_download(id);
            return;
        };

        let target = self.dir.join(file_name(item.id));
        let part = part_path(&target);
        let client = match reqwest::blocking::Client::builder()
            .user_agent("Sidekick/0.1")
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                self.emit_progress(id, &control, "error", Some(error.to_string()));
                self.finish_download(id);
                return;
            }
        };

        for url in model_urls(item.id) {
            if control.cancel.load(Ordering::Relaxed) {
                let _ = fs::remove_file(&part);
                self.emit_progress(id, &control, "cancelled", None);
                self.finish_download(id);
                return;
            }

            let started = Instant::now();
            let response = client.get(&url).send();
            let mut response = match response {
                Ok(response) if response.status().is_success() => response,
                _ => continue,
            };

            let total = response.content_length().unwrap_or(0);
            control.total.store(total, Ordering::Relaxed);
            control.received.store(0, Ordering::Relaxed);
            self.emit_progress(id, &control, "downloading", None);

            let mut file = match fs::File::create(&part) {
                Ok(file) => file,
                Err(error) => {
                    self.emit_progress(id, &control, "error", Some(error.to_string()));
                    self.finish_download(id);
                    return;
                }
            };

            let mut buffer = [0u8; 64 * 1024];
            let mut received = 0u64;
            let mut last_emit = Instant::now();
            let mut failed = false;

            loop {
                if control.cancel.load(Ordering::Relaxed) {
                    let _ = fs::remove_file(&part);
                    self.emit_progress(id, &control, "cancelled", None);
                    self.finish_download(id);
                    return;
                }

                let read = match response.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(read) => read,
                    Err(error) => {
                        let _ = fs::remove_file(&part);
                        self.emit_progress(id, &control, "error", Some(error.to_string()));
                        self.finish_download(id);
                        return;
                    }
                };

                if let Err(error) = file.write_all(&buffer[..read]) {
                    let _ = fs::remove_file(&part);
                    self.emit_progress(id, &control, "error", Some(error.to_string()));
                    self.finish_download(id);
                    return;
                }

                received += read as u64;
                control.received.store(received, Ordering::Relaxed);
                if last_emit.elapsed() >= Duration::from_millis(200) {
                    self.emit_progress(id, &control, "downloading", None);
                    last_emit = Instant::now();
                }

                if received > 4_000_000_000 {
                    failed = true;
                    break;
                }
            }

            let _ = file.flush();
            drop(file);

            if failed || (total > 0 && received != total) {
                let _ = fs::remove_file(&part);
                continue;
            }

            if let Err(error) = fs::rename(&part, &target) {
                let _ = fs::remove_file(&part);
                self.emit_progress(id, &control, "error", Some(error.to_string()));
                self.finish_download(id);
                return;
            }

            {
                let mut selected = self.selected.lock().unwrap();
                if selected.is_none() {
                    *selected = Some(item.id.to_string());
                    let _ = write_selected(&self.dir, item.id);
                }
            }

            control.total.store(received, Ordering::Relaxed);
            control.received.store(received, Ordering::Relaxed);
            eprintln!(
                "[asr] model {} downloaded in {:?}",
                item.id,
                started.elapsed()
            );
            self.emit_progress(id, &control, "done", None);
            self.finish_download(id);
            return;
        }

        let _ = fs::remove_file(&part);
        self.emit_progress(
            id,
            &control,
            "error",
            Some("下载失败，请检查网络后重试".to_string()),
        );
        self.finish_download(id);
    }

    fn finish_download(&self, id: &str) {
        let mut download = self.download.lock().unwrap();
        if download.as_ref().map(|state| state.id.as_str()) == Some(id) {
            *download = None;
        }
    }

    fn emit_progress(
        &self,
        id: &str,
        control: &DownloadControl,
        state: &'static str,
        message: Option<String>,
    ) {
        let payload = ModelProgress {
            model_id: id.to_string(),
            received: control.received.load(Ordering::Relaxed),
            total: control.total.load(Ordering::Relaxed),
            state,
            message,
        };
        let _ = self.app.emit(EVENT_PROGRESS, payload);
    }

    pub fn transcribe(
        &self,
        pcm16: &[u8],
        cancel: &AtomicBool,
    ) -> Result<Transcript, TranscribeFailure> {
        let samples: Vec<f32> = pcm16
            .chunks_exact(2)
            .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]) as f32 / 32_768.0)
            .collect();
        if samples.len() < MIN_SAMPLES {
            return Err(TranscribeFailure::Empty);
        }
        if cancel.load(Ordering::Relaxed) {
            return Err(TranscribeFailure::Cancelled);
        }

        self.ensure_engine()?;

        let engine = self.engine.lock().unwrap();
        let cached = engine.as_ref().unwrap();
        let mut state = cached
            .context
            .create_state()
            .map_err(|error| TranscribeFailure::Failed(error.to_string()))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 5 });
        params.set_language(Some("zh"));
        params.set_initial_prompt("以下是普通话的句子，请用简体中文转写。");
        params.set_translate(false);
        params.set_no_context(true);
        params.set_single_segment(false);
        params.set_suppress_blank(true);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_n_threads(4);
        params.set_temperature(0.0);

        state
            .full(params, &samples)
            .map_err(|error| TranscribeFailure::Failed(error.to_string()))?;

        if cancel.load(Ordering::Relaxed) {
            return Err(TranscribeFailure::Cancelled);
        }

        let segments = state.full_n_segments();
        let mut raw = String::new();
        for index in 0..segments {
            if let Some(segment) = state.get_segment(index) {
                if let Ok(text) = segment.to_str_lossy() {
                    raw.push_str(&text);
                    raw.push(' ');
                }
            }
        }
        drop(state);
        drop(engine);

        let (text, truncated) = normalize_transcript(&raw);
        if text.is_empty() {
            return Err(TranscribeFailure::Empty);
        }

        Ok(Transcript { text, truncated })
    }
}

fn preset(id: &str) -> Option<&'static Preset> {
    PRESETS.iter().find(|item| item.id == id)
}

fn file_name(id: &str) -> String {
    format!("ggml-{id}.bin")
}

fn part_path(target: &Path) -> PathBuf {
    PathBuf::from(format!("{}.part", target.to_string_lossy()))
}

fn selected_path(dir: &Path) -> PathBuf {
    dir.join("selected.json")
}

fn model_urls(id: &str) -> [String; 2] {
    let file = file_name(id);
    [
        format!("https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/{file}"),
        format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{file}"),
    ]
}

fn scan_models(dir: &Path, selected: Option<&str>) -> Vec<AsrModelInfo> {
    PRESETS
        .iter()
        .map(|item| {
            let path = dir.join(file_name(item.id));
            let size_bytes = path.metadata().map(|meta| meta.len()).unwrap_or(0);
            let downloaded = size_bytes > 1_000_000;
            AsrModelInfo {
                id: item.id.to_string(),
                label: item.label.to_string(),
                file_name: file_name(item.id),
                approx_bytes: item.approx_bytes,
                size_bytes,
                downloaded,
                selected: downloaded && selected == Some(item.id),
                note: item.note.to_string(),
            }
        })
        .collect()
}

fn default_selected(dir: &Path) -> Option<String> {
    ["base", "small", "tiny", "medium"]
        .iter()
        .find(|id| dir.join(file_name(id)).is_file())
        .map(|id| id.to_string())
}

fn load_selected(dir: &Path) -> Option<String> {
    let text = fs::read_to_string(selected_path(dir)).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let id = value.get("id")?.as_str()?;
    let item = preset(id)?;
    if dir.join(file_name(item.id)).is_file() {
        Some(item.id.to_string())
    } else {
        None
    }
}

fn write_selected(dir: &Path, id: &str) -> Result<(), String> {
    let path = selected_path(dir);
    app_paths::ensure_parent(&path).map_err(|error| format!("创建模型目录失败: {error}"))?;
    let bytes = serde_json::to_vec(&serde_json::json!({ "id": id }))
        .map_err(|error| format!("序列化模型配置失败: {error}"))?;
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, bytes).map_err(|error| format!("写入模型配置失败: {error}"))?;
    set_private_permissions(&temp);
    fs::rename(&temp, &path).map_err(|error| format!("保存模型配置失败: {error}"))
}

fn cleanup_part_files(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.to_string_lossy().ends_with(".part") {
            let _ = fs::remove_file(path);
        }
    }
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) {}

pub fn normalize_transcript(raw: &str) -> (String, bool) {
    let single_line: String = raw
        .chars()
        .map(|character| {
            if character == '\n' || character == '\r' {
                ' '
            } else {
                character
            }
        })
        .collect();
    let collapsed = single_line.split_whitespace().collect::<Vec<_>>().join(" ");
    let truncated = collapsed.chars().count() > MAX_TRANSCRIPT_CHARS;
    let text = collapsed
        .chars()
        .take(MAX_TRANSCRIPT_CHARS)
        .collect::<String>();
    (text, truncated)
}

#[tauri::command]
pub fn asr_status(manager: State<'_, Arc<ModelManager>>) -> AsrStatus {
    manager.status()
}

#[tauri::command]
pub fn asr_select_model(
    manager: State<'_, Arc<ModelManager>>,
    id: String,
) -> Result<AsrStatus, String> {
    manager.select(&id)?;
    Arc::clone(manager.inner()).prewarm();
    Ok(manager.status())
}

#[tauri::command]
pub fn asr_download_model(manager: State<'_, Arc<ModelManager>>, id: String) -> Result<(), String> {
    Arc::clone(manager.inner()).start_download(id)
}

#[tauri::command]
pub fn asr_cancel_download(manager: State<'_, Arc<ModelManager>>) {
    manager.cancel_download();
}

#[tauri::command]
pub fn asr_delete_model(
    manager: State<'_, Arc<ModelManager>>,
    id: String,
) -> Result<AsrStatus, String> {
    manager.delete(&id)?;
    Ok(manager.status())
}

#[tauri::command]
pub fn asr_reveal_dir(manager: State<'_, Arc<ModelManager>>) -> Result<(), String> {
    let dir = manager.dir().to_path_buf();
    std::fs::create_dir_all(&dir).map_err(|error| format!("创建模型目录失败: {error}"))?;
    std::process::Command::new("open")
        .arg(&dir)
        .status()
        .map_err(|error| format!("打开模型目录失败: {error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_transcript() {
        let (text, truncated) = normalize_transcript("  hello\r\nworld \n");
        assert_eq!(text, "hello world");
        assert!(!truncated);

        let long = "a".repeat(MAX_TRANSCRIPT_CHARS + 20);
        let (text, truncated) = normalize_transcript(&long);
        assert_eq!(text.chars().count(), MAX_TRANSCRIPT_CHARS);
        assert!(truncated);
    }

    #[test]
    fn builds_model_urls() {
        let urls = model_urls("base");
        assert!(urls[0].starts_with("https://hf-mirror.com/"));
        assert!(urls[0].ends_with("ggml-base.bin"));
    }
}
