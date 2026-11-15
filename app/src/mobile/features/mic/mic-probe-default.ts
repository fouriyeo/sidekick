import { decodePcm16Base64, type MicProbeLabClip } from "./mic-probe";
import { createSessionId, pcmToBase64, startVoiceRecording } from "./voice-recorder";

/**
 * 用现有 WebView / 系统链路录一段，作为「自动（默认）」试听。
 *
 * 这条路径和按住说话完全一致（getUserMedia + AEC/NS/AGC），不指定具体设备；
 * 多麦是否融合由系统/HAL 决定。只有顶部/底部试听才走原生单麦。
 */
export async function recordDefaultClip(seconds = 3): Promise<MicProbeLabClip> {
  const chunks: Int16Array[] = [];
  const session = await startVoiceRecording({
    sessionId: createSessionId(),
    onFrame: (pcm) => {
      chunks.push(decodePcm16Base64(pcm));
    },
  });

  let durationMs = 0;
  try {
    await new Promise<void>((resolve) => window.setTimeout(resolve, seconds * 1000));
  } finally {
    durationMs = (await session.stop()).durationMs;
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (total === 0) throw new Error("没有读到音频数据");

  const merged = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  let sum = 0;
  let peak = 0;
  for (let index = 0; index < merged.length; index += 1) {
    const value = (merged[index] ?? 0) / 32768;
    sum += value * value;
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
  }

  return {
    pcmBase64: pcmToBase64(merged),
    sampleRate: 16_000,
    samples: merged.length,
    sourceUsed: 7,
    routedAddress: "default",
    preferredApplied: true,
    rms: Math.sqrt(sum / merged.length),
    peak,
    elapsedMs: durationMs,
    auto: true,
  };
}
