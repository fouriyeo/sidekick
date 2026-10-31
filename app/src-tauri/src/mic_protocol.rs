use serde::{Deserialize, Serialize};

pub const AUDIO_MAGIC: &[u8; 4] = b"SK01";
pub const AUDIO_VERSION: u8 = 1;
pub const AUDIO_HEADER_LEN: usize = 28;
pub const MAX_FRAME_PAYLOAD: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MicStopReason {
    Release,
    Cancel,
    Timeout,
    Background,
    Disconnect,
    MicLost,
}

impl MicStopReason {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "release" => Some(Self::Release),
            "cancel" => Some(Self::Cancel),
            "timeout" => Some(Self::Timeout),
            "background" => Some(Self::Background),
            "disconnect" => Some(Self::Disconnect),
            "mic_lost" => Some(Self::MicLost),
            _ => None,
        }
    }

    pub fn should_transcribe(self) -> bool {
        matches!(self, Self::Release | Self::Timeout)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MicStartMessage {
    pub v: u8,
    #[serde(rename = "type")]
    pub kind: String,
    pub session: String,
    pub codec: String,
    pub sample_rate: u32,
    pub channels: u8,
    pub frame_ms: u32,
    pub max_ms: u32,
    pub ts: u64,
}

impl MicStartMessage {
    pub fn from_value(value: &serde_json::Value) -> Result<Self, &'static str> {
        let message: Self =
            serde_json::from_value(value.clone()).map_err(|_| "invalid mic.start")?;
        if message.v != 1 || message.kind != "mic.start" {
            return Err("unsupported mic.start");
        }
        if message.codec != "pcm16" {
            return Err("unsupported codec");
        }
        if message.sample_rate != 16_000 || message.channels != 1 {
            return Err("unsupported audio format");
        }
        if message.max_ms == 0 || message.max_ms > 120_000 {
            return Err("invalid max duration");
        }
        if parse_session_id(&message.session).is_none() {
            return Err("invalid session");
        }
        Ok(message)
    }
}

#[derive(Debug, Clone)]
pub struct AudioFrame<'a> {
    pub session: [u8; 16],
    pub sequence: u32,
    pub flags: u8,
    pub payload: &'a [u8],
}

impl AudioFrame<'_> {
    pub fn session_string(&self) -> String {
        session_id_string(&self.session)
    }
}

pub fn parse_session_id(value: &str) -> Option<[u8; 16]> {
    let compact: String = value.chars().filter(|c| *c != '-').collect();
    if compact.len() != 32 || !compact.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    let mut bytes = [0u8; 16];
    for index in 0..16 {
        bytes[index] = u8::from_str_radix(&compact[index * 2..index * 2 + 2], 16).ok()?;
    }
    Some(bytes)
}

pub fn session_id_string(bytes: &[u8; 16]) -> String {
    let hex = bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

#[cfg(any(mobile, test))]
pub fn build_audio_frame(session: &str, sequence: u32, payload: &[u8]) -> Result<Vec<u8>, String> {
    let session = parse_session_id(session).ok_or("invalid session")?;
    if payload.len() > MAX_FRAME_PAYLOAD {
        return Err("frame too large".to_string());
    }
    if payload.len() % 2 != 0 {
        return Err("pcm16 payload must be even".to_string());
    }

    let mut frame = Vec::with_capacity(AUDIO_HEADER_LEN + payload.len());
    frame.extend_from_slice(AUDIO_MAGIC);
    frame.push(AUDIO_VERSION);
    frame.push(0);
    frame.extend_from_slice(&[0, 0]);
    frame.extend_from_slice(&session);
    frame.extend_from_slice(&sequence.to_be_bytes());
    frame.extend_from_slice(payload);
    Ok(frame)
}

#[derive(Debug, PartialEq, Eq)]
pub enum FrameError {
    TooShort,
    BadMagic,
    BadVersion,
    TooLarge,
    OddPcm,
}

pub fn parse_audio_frame(data: &[u8]) -> Result<AudioFrame<'_>, FrameError> {
    if data.len() < AUDIO_HEADER_LEN {
        return Err(FrameError::TooShort);
    }
    if &data[0..4] != AUDIO_MAGIC {
        return Err(FrameError::BadMagic);
    }
    if data[4] != AUDIO_VERSION {
        return Err(FrameError::BadVersion);
    }

    let payload = &data[AUDIO_HEADER_LEN..];
    if payload.len() > MAX_FRAME_PAYLOAD {
        return Err(FrameError::TooLarge);
    }
    if payload.len() % 2 != 0 {
        return Err(FrameError::OddPcm);
    }

    let mut session = [0u8; 16];
    session.copy_from_slice(&data[8..24]);
    let sequence = u32::from_be_bytes([data[24], data[25], data[26], data[27]]);

    Ok(AudioFrame {
        session,
        sequence,
        flags: data[5],
        payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SESSION: &str = "0f8fad5b-d9cb-469f-a165-70867728950e";

    #[test]
    fn session_round_trip() {
        let bytes = parse_session_id(SESSION).unwrap();
        assert_eq!(session_id_string(&bytes), SESSION);
        assert!(parse_session_id("nope").is_none());
    }

    #[test]
    fn audio_frame_round_trip() {
        let payload = [0x01, 0x00, 0x02, 0x00];
        let frame = build_audio_frame(SESSION, 42, &payload).unwrap();
        assert_eq!(frame.len(), AUDIO_HEADER_LEN + payload.len());

        let parsed = parse_audio_frame(&frame).unwrap();
        assert_eq!(parsed.sequence, 42);
        assert_eq!(parsed.payload, payload);
        assert_eq!(parsed.session_string(), SESSION);
    }

    #[test]
    fn rejects_bad_frames() {
        assert_eq!(
            parse_audio_frame(&[0u8; 4]).unwrap_err(),
            FrameError::TooShort
        );

        let mut frame = build_audio_frame(SESSION, 0, &[0, 0]).unwrap();
        frame[0] = b'X';
        assert_eq!(parse_audio_frame(&frame).unwrap_err(), FrameError::BadMagic);

        let mut frame = build_audio_frame(SESSION, 0, &[0, 0]).unwrap();
        frame[4] = 2;
        assert_eq!(
            parse_audio_frame(&frame).unwrap_err(),
            FrameError::BadVersion
        );

        let mut frame = build_audio_frame(SESSION, 0, &[0, 0]).unwrap();
        frame.push(1);
        assert_eq!(parse_audio_frame(&frame).unwrap_err(), FrameError::OddPcm);
    }

    #[test]
    fn validates_mic_start() {
        let value = serde_json::json!({
            "v": 1,
            "type": "mic.start",
            "session": SESSION,
            "codec": "pcm16",
            "sampleRate": 16000,
            "channels": 1,
            "frameMs": 128,
            "maxMs": 60000,
            "ts": 1730000000000u64,
        });
        let message = MicStartMessage::from_value(&value).unwrap();
        assert_eq!(message.session, SESSION);
        assert_eq!(
            MicStopReason::parse("release"),
            Some(MicStopReason::Release)
        );
        assert!(MicStopReason::Release.should_transcribe());
        assert!(!MicStopReason::Cancel.should_transcribe());
    }
}
