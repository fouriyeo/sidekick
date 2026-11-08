use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// 最小 WAV 写入器：16k mono PCM16。
///
/// 录音开始时先写 44 字节占位头，边录边追加 PCM，结束时回填 RIFF/data 长度。
/// 这样进程被杀时磁盘上至少有一个可被 ffmpeg/浏览器识别的“残缺但可修”的文件。
pub struct WavWriter {
    file: File,
    path: PathBuf,
    data_bytes: u64,
}

impl WavWriter {
    pub fn create(path: &Path) -> std::io::Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut file = File::create(path)?;
        file.write_all(&header(0))?;
        file.flush()?;
        Ok(Self { file, path: path.to_path_buf(), data_bytes: 0 })
    }

    pub fn append(&mut self, pcm: &[u8]) -> std::io::Result<()> {
        self.file.write_all(pcm)?;
        self.data_bytes += pcm.len() as u64;
        Ok(())
    }

    /// 回填头并返回音频字节数；此后 writer 不可再用。
    pub fn finalize(mut self) -> std::io::Result<u64> {
        self.file.flush()?;
        self.file.seek(SeekFrom::Start(0))?;
        self.file.write_all(&header(self.data_bytes))?;
        self.file.flush()?;
        Ok(self.data_bytes)
    }

    pub fn data_bytes(&self) -> u64 {
        self.data_bytes
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

/// 修复一个被中断的 WAV：按文件实际长度回填头。
pub fn repair(path: &Path) -> std::io::Result<u64> {
    let mut file = std::fs::OpenOptions::new().read(true).write(true).open(path)?;
    let len = file.metadata()?.len();
    let data_bytes = len.saturating_sub(44);
    file.seek(SeekFrom::Start(0))?;
    file.write_all(&header(data_bytes))?;
    file.flush()?;
    Ok(data_bytes)
}

fn header(data_bytes: u64) -> [u8; 44] {
    let bytes = data_bytes.min(u32::MAX as u64) as u32;
    let mut out = [0u8; 44];
    out[0..4].copy_from_slice(b"RIFF");
    out[4..8].copy_from_slice(&(36 + bytes).to_le_bytes());
    out[8..12].copy_from_slice(b"WAVE");
    out[12..16].copy_from_slice(b"fmt ");
    out[16..20].copy_from_slice(&16u32.to_le_bytes());
    out[20..22].copy_from_slice(&1u16.to_le_bytes()); // PCM
    out[22..24].copy_from_slice(&1u16.to_le_bytes()); // mono
    out[24..28].copy_from_slice(&16_000u32.to_le_bytes());
    out[28..32].copy_from_slice(&32_000u32.to_le_bytes()); // byte rate
    out[32..34].copy_from_slice(&2u16.to_le_bytes()); // block align
    out[34..36].copy_from_slice(&16u16.to_le_bytes()); // bits
    out[36..40].copy_from_slice(b"data");
    out[40..44].copy_from_slice(&bytes.to_le_bytes());
    out
}

/// 读取 WAV 的 data 段（只支持我们写出的 44 字节头 PCM）。
pub fn read_pcm(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut file = File::open(path)?;
    let mut header = [0u8; 44];
    file.read_exact(&mut header)?;
    let mut data = Vec::new();
    file.read_to_end(&mut data)?;
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(label: &str) -> PathBuf {
        let unique = format!(
            "sidekick-memo-wav-{label}-{}-{}.wav",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        std::env::temp_dir().join(unique)
    }

    #[test]
    fn writes_header_and_repairs() {
        let path = temp_path("write");
        let mut writer = WavWriter::create(&path).unwrap();
        writer.append(&vec![0u8; 32_000]).unwrap();
        writer.append(&vec![0u8; 16_000]).unwrap();
        let bytes = writer.finalize().unwrap();
        assert_eq!(bytes, 48_000);

        let mut file = File::open(&path).unwrap();
        let mut head = [0u8; 44];
        file.read_exact(&mut head).unwrap();
        assert_eq!(&head[0..4], b"RIFF");
        assert_eq!(&head[8..12], b"WAVE");
        assert_eq!(u32::from_le_bytes(head[40..44].try_into().unwrap()), 48_000);

        // 模拟中途断电：只保留半段数据，再修复头。
        let broken = temp_path("broken");
        let mut raw = File::create(&broken).unwrap();
        raw.write_all(&header(999_999)).unwrap();
        raw.write_all(&vec![7u8; 16_000]).unwrap();
        drop(raw);
        let repaired = repair(&broken).unwrap();
        assert_eq!(repaired, 16_000);
        assert_eq!(read_pcm(&broken).unwrap().len(), 16_000);

        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(broken);
    }
}
