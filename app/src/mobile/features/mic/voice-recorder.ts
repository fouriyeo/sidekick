const TARGET_RATE = 16_000;
const MIN_SAMPLES = 800;

export type VoiceRecording = {
  base64: string;
  sampleRate: number;
  durationMs: number;
};

export type VoiceSession = {
  stop: () => Promise<VoiceRecording | null>;
  cancel: () => Promise<void>;
};

function mergeChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;

  const ratio = fromRate / toRate;
  const length = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(length);

  for (let index = 0; index < length; index += 1) {
    const position = index * ratio;
    const lower = Math.floor(position);
    const fraction = position - lower;
    const first = input[lower] ?? 0;
    const second = input[lower + 1] ?? first;
    output[index] = first + (second - first) * fraction;
  }

  return output;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let start = 0; start < bytes.length; start += chunkSize) {
    const chunk = bytes.subarray(start, start + chunkSize);
    for (const byte of chunk) binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

export async function startVoiceRecording(): Promise<VoiceSession> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前设备不支持麦克风");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: TARGET_RATE,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const context = new AudioContext({ sampleRate: TARGET_RATE });
  if (context.state === "suspended") await context.resume();

  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(2048, 1, 1);
  const silentGain = context.createGain();
  silentGain.gain.value = 0;

  const chunks: Float32Array[] = [];
  const startedAt = performance.now();
  let closed = false;

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(input));
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  const cleanup = async () => {
    if (closed) return;
    closed = true;

    processor.onaudioprocess = null;
    processor.disconnect();
    source.disconnect();
    silentGain.disconnect();
    for (const track of stream.getTracks()) track.stop();
    await context.close().catch(() => undefined);
  };

  const stop = async (): Promise<VoiceRecording | null> => {
    const sourceRate = context.sampleRate;
    const elapsedMs = performance.now() - startedAt;
    await cleanup();

    const merged = mergeChunks(chunks);
    if (merged.length < MIN_SAMPLES) return null;

    const samples = sourceRate === TARGET_RATE ? merged : resample(merged, sourceRate, TARGET_RATE);
    const durationMs = Math.round((samples.length / TARGET_RATE) * 1000);

    return {
      base64: bytesToBase64(encodeWav(samples, TARGET_RATE)),
      sampleRate: TARGET_RATE,
      durationMs: Math.max(
        durationMs,
        Math.round(elapsedMs) > 0 ? Math.round(elapsedMs) : durationMs,
      ),
    };
  };

  const cancel = async () => {
    await cleanup();
    chunks.length = 0;
  };

  return { stop, cancel };
}
