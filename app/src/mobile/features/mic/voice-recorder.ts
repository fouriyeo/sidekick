const TARGET_RATE = 16_000;
const CHUNK_SIZE = 2048;

export type VoiceSession = {
  sessionId: string;
  stop: () => Promise<{ durationMs: number }>;
  cancel: () => Promise<void>;
  getLevel: () => number;
  getElapsedMs: () => number;
};

export type StartVoiceOptions = {
  sessionId: string;
  onFrame: (pcmBase64: string) => void;
  onLost?: () => void;
};

export function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

export function floatToPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    pcm[index] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
  }
  return pcm;
}

export function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const chunk = bytes.subarray(start, start + chunkSize);
    for (const byte of chunk) binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function computeLevel(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1, rms * 10);
}

/**
 * 连续线性重采样：保留跨 chunk 的相位，避免每个分片各算各的造成爆音。
 */
export function createStreamingResampler(
  fromRate: number,
  toRate: number,
): (input: Float32Array) => Float32Array {
  if (fromRate === toRate) {
    return (input) => input;
  }

  const step = fromRate / toRate;
  let buffer = new Float32Array(0);
  let phase = 0;

  return (input) => {
    const merged = new Float32Array(buffer.length + input.length);
    merged.set(buffer);
    merged.set(input, buffer.length);

    const output: number[] = [];
    let position = phase;
    while (position + 1 < merged.length) {
      const lower = Math.floor(position);
      const fraction = position - lower;
      const first = merged[lower] ?? 0;
      const second = merged[lower + 1] ?? first;
      output.push(first + (second - first) * fraction);
      position += step;
    }

    if (merged.length === 0) return new Float32Array(0);

    const keepFrom = Math.min(Math.floor(position), merged.length - 1);
    buffer = merged.slice(keepFrom);
    phase = position - keepFrom;
    return Float32Array.from(output);
  };
}

async function openMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: TARGET_RATE,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
}

/** 首次按下前请求一次权限，立即释放麦克风，不产生录音。 */
export async function primeMicrophone(): Promise<void> {
  const stream = await openMicrophone();
  for (const track of stream.getTracks()) track.stop();
}

export async function startVoiceRecording(options: StartVoiceOptions): Promise<VoiceSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前设备不支持麦克风");
  }

  const stream = await openMicrophone();
  const context = (() => {
    try {
      return new AudioContext({ sampleRate: TARGET_RATE });
    } catch {
      return new AudioContext();
    }
  })();

  if (context.state === "suspended") await context.resume();

  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(CHUNK_SIZE, 1, 1);
  const silentGain = context.createGain();
  silentGain.gain.value = 0;

  const resampler = createStreamingResampler(context.sampleRate, TARGET_RATE);
  const startedAt = performance.now();
  let closed = false;
  let samplesSent = 0;
  let level = 0;

  const handleFrame = (input: Float32Array) => {
    const resampled = resampler(input);
    if (resampled.length === 0) return;

    samplesSent += resampled.length;
    try {
      options.onFrame(pcmToBase64(floatToPcm16(resampled)));
    } catch {
      // 发送失败由上层取消会话，避免在音频回调里抛错。
    }
  };

  processor.onaudioprocess = (event) => {
    if (closed) return;
    const input = event.inputBuffer.getChannelData(0);
    level = Math.min(1, level * 0.55 + computeLevel(input) * 0.45);
    handleFrame(input);
  };

  const track = stream.getAudioTracks()[0];
  const handleEnded = () => {
    if (!closed) options.onLost?.();
  };
  track?.addEventListener("ended", handleEnded);

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    track?.removeEventListener("ended", handleEnded);
    processor.onaudioprocess = null;
    processor.disconnect();
    source.disconnect();
    silentGain.disconnect();
    for (const mediaTrack of stream.getTracks()) mediaTrack.stop();
    await context.close().catch(() => undefined);
  };

  return {
    sessionId: options.sessionId,
    stop: async () => {
      const elapsed = performance.now() - startedAt;
      await cleanup();
      if (samplesSent === 0) return { durationMs: 0 };
      const audioMs = Math.round((samplesSent / TARGET_RATE) * 1000);
      return { durationMs: Math.max(audioMs, Math.round(elapsed)) };
    },
    cancel: async () => {
      await cleanup();
      samplesSent = 0;
    },
    getLevel: () => level,
    getElapsedMs: () => Math.max(0, Math.round(performance.now() - startedAt)),
  };
}
