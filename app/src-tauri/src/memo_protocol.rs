//! 语音备忘录音频分块（WS 二进制帧）。
//!
//! 布局：`SK02` + 备忘录 id 长度(u16 LE) + id(UTF-8) + offset(u64 LE) + PCM/WAV 分块。
//! 与麦克风的 `SK01` 区分，桌面服务端靠 magic 分流。

pub const MAGIC: &[u8; 4] = b"SK02";

pub fn build(memo_id: &str, offset: u64, payload: &[u8]) -> Option<Vec<u8>> {
    let id = memo_id.as_bytes();
    if id.is_empty() || id.len() > u16::MAX as usize {
        return None;
    }
    let mut out = Vec::with_capacity(4 + 2 + id.len() + 8 + payload.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&(id.len() as u16).to_le_bytes());
    out.extend_from_slice(id);
    out.extend_from_slice(&offset.to_le_bytes());
    out.extend_from_slice(payload);
    Some(out)
}

pub fn parse(data: &[u8]) -> Option<(String, u64, &[u8])> {
    if data.len() < 6 || &data[0..4] != MAGIC {
        return None;
    }
    let id_len = u16::from_le_bytes([data[4], data[5]]) as usize;
    let id_end = 6 + id_len;
    if data.len() < id_end + 8 {
        return None;
    }
    let memo_id = std::str::from_utf8(&data[6..id_end]).ok()?.to_string();
    let offset = u64::from_le_bytes(data[id_end..id_end + 8].try_into().ok()?);
    Some((memo_id, offset, &data[id_end + 8..]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let frame = build("memo-1", 64, b"pcm").unwrap();
        let (id, offset, payload) = parse(&frame).unwrap();
        assert_eq!(id, "memo-1");
        assert_eq!(offset, 64);
        assert_eq!(payload, b"pcm");
    }

    #[test]
    fn rejects_bad_frames() {
        assert!(parse(b"SK01").is_none());
        assert!(parse(b"SK02\x05\x00ab").is_none());
        assert!(build("", 0, b"x").is_none());
    }
}
