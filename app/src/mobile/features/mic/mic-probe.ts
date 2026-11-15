import type { MicProbeClip, MicProbeDevice } from "@/shared/lib/tauri";

/** 偏好只记录，不接采集；等原生选麦接入按住说话后再生效。 */
export const MIC_PROBE_PREFERRED_KEY = "sidekick:mic-probe:preferred:v2";

/** 自动 = 不指定设备，走现有 WebView/系统链路（可能由 HAL 多麦合成）。 */
export const MIC_PROBE_AUTO = "auto";

/** 试听卡片用：auto 为 true 表示这一段来自系统默认链路，不是原生单麦。 */
export type MicProbeLabClip = MicProbeClip & { auto?: boolean };

/** 把 base64 的 PCM16（little-endian）解成 Int16Array。 */
export function decodePcm16Base64(value: string): Int16Array {
  const binary = atob(value);
  if (binary.length % 2 !== 0) {
    throw new Error("PCM 字节数不是偶数");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Int16Array(bytes.buffer, 0, bytes.byteLength / 2);
}

/** 系统地址 → 用户能懂的名字；其他机型地址未知时原样回退。 */
export function micDeviceLabel(address: string): string {
  if (address === MIC_PROBE_AUTO) return "自动（默认）";
  if (address === "default") return "系统默认";
  if (address === "bottom") return "底部麦克风";
  if (address === "back") return "顶部麦克风";
  return address ? `麦克风 ${address}` : "麦克风";
}

export function micDeviceSubtitle(address: string): string {
  if (address === MIC_PROBE_AUTO) return "系统处理链，保留多麦/降噪";
  if (address === "default") return "系统默认链路";
  if (address === "back") return "背部/摄像头侧，视频常用";
  if (address === "bottom") return "底部主麦";
  return "系统暴露的内置麦克风";
}

/** 顶部优先、底部其次；未知地址排后面，同组按 id 稳定排序。 */
export function sortMicDevices(devices: MicProbeDevice[]): MicProbeDevice[] {
  const rank = (address: string): number => {
    if (address === "back") return 0;
    if (address === "bottom") return 1;
    return 2;
  };
  return [...devices].sort((left, right) => {
    const difference = rank(left.address) - rank(right.address);
    return difference !== 0 ? difference : left.id - right.id;
  });
}

/** 采集源 → 中文短标签；数值来自 Android MediaRecorder.AudioSource。 */
export function micSourceLabel(source: number): string {
  switch (source) {
    case 9:
      return "原声";
    case 6:
      return "语音识别";
    case 5:
      return "摄像机";
    case 7:
      return "通话";
    case 1:
      return "默认";
    default:
      return `源 ${source}`;
  }
}

/** RMS（0..1）→ -80..-20 dB 的 0..1 电平条；原声麦偏小，范围太窄会一直是空条。 */
export function levelFromRms(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  const decibels = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (decibels + 80) / 60));
}

/** 播放一段 PCM16；用完即关 AudioContext，避免占着音频通道。 */
export async function playPcm16(pcm: Int16Array, sampleRate: number): Promise<void> {
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("当前设备不支持音频播放");

  const context = new Ctor({ sampleRate });
  try {
    const buffer = context.createBuffer(1, pcm.length, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < pcm.length; index += 1) {
      channel[index] = (pcm[index] ?? 0) / 32768;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    // 试听必须由用户手势触发；少数 WebView 会先 suspended，resume 失败也不阻塞卡片复位。
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    const fallbackMs = (pcm.length / sampleRate) * 1000 + 800;
    await Promise.race([
      new Promise<void>((resolve) => {
        source.onended = () => resolve();
        source.start();
      }),
      new Promise<void>((resolve) => window.setTimeout(resolve, fallbackMs)),
    ]);
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function readPreferredMic(): string {
  try {
    const value = window.localStorage.getItem(MIC_PROBE_PREFERRED_KEY);
    if (value === MIC_PROBE_AUTO || value === "back" || value === "bottom") return value;
    return MIC_PROBE_AUTO;
  } catch {
    return MIC_PROBE_AUTO;
  }
}

export function writePreferredMic(address: string): void {
  try {
    window.localStorage.setItem(MIC_PROBE_PREFERRED_KEY, address);
  } catch {
    // 隐私模式/存储被禁时静默；偏好不是录音链路的必要条件。
  }
}

/** 给卡片用的一行摘要，避免 UI 里散落格式化逻辑。 */
export function clipSummary(clip: MicProbeLabClip): string {
  const source = clip.auto ? "系统处理" : micSourceLabel(clip.sourceUsed);
  if (clip.auto) {
    return `实际路由：系统默认（未单独指定） · ${source} · ${(clip.elapsedMs / 1000).toFixed(1)}s`;
  }
  const route = clip.routedAddress
    ? `${micDeviceLabel(clip.routedAddress)}（${clip.routedAddress}）`
    : "未报告";
  return `实际路由：${route} · ${source} · ${(clip.elapsedMs / 1000).toFixed(1)}s`;
}
