import { describe, expect, it } from "vitest";
import type { MicProbeDevice } from "@/shared/lib/tauri";
import {
  clipSummary,
  decodePcm16Base64,
  levelFromRms,
  MIC_PROBE_AUTO,
  micDeviceLabel,
  micSourceLabel,
  readPreferredMic,
  sortMicDevices,
} from "./mic-probe";

function device(id: number, address: string): MicProbeDevice {
  return {
    id,
    address,
    productName: "RMX3370",
    channelCounts: [1, 2],
    sampleRates: [16000],
  };
}

describe("mic-probe 纯函数", () => {
  it("解码 little-endian PCM16", () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768]);
    const bytes = new Uint8Array(pcm.buffer);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);

    expect(Array.from(decodePcm16Base64(btoa(binary)))).toEqual(Array.from(pcm));
  });

  it("拒绝奇数字节", () => {
    expect(() => decodePcm16Base64(btoa("\x01"))).toThrow("PCM 字节数不是偶数");
  });

  it("地址映射与顶部优先排序", () => {
    expect(micDeviceLabel(MIC_PROBE_AUTO)).toBe("自动（默认）");
    expect(micDeviceLabel("default")).toBe("系统默认");
    expect(micDeviceLabel("back")).toBe("顶部麦克风");
    expect(micDeviceLabel("bottom")).toBe("底部麦克风");
    expect(micDeviceLabel("front")).toBe("麦克风 front");
    expect(micDeviceLabel("")).toBe("麦克风");

    const sorted = sortMicDevices([device(2, "bottom"), device(1, "back"), device(3, "front")]);
    expect(sorted.map((item) => item.address)).toEqual(["back", "bottom", "front"]);
  });

  it("RMS 映射到 0..1 且不越界", () => {
    expect(levelFromRms(0)).toBe(0);
    expect(levelFromRms(-1)).toBe(0);
    expect(levelFromRms(1)).toBe(1);
    expect(levelFromRms(0.01)).toBeGreaterThan(0);
    expect(levelFromRms(0.01)).toBeLessThan(1);
  });

  it("未设置/非法偏好时默认自动", () => {
    localStorage.clear();
    expect(readPreferredMic()).toBe(MIC_PROBE_AUTO);
    localStorage.setItem("sidekick:mic-probe:preferred:v2", "back");
    expect(readPreferredMic()).toBe("back");
    localStorage.setItem("sidekick:mic-probe:preferred:v2", "nope");
    expect(readPreferredMic()).toBe(MIC_PROBE_AUTO);
  });

  it("采集源与摘要用中文", () => {
    expect(micSourceLabel(9)).toBe("原声");
    expect(micSourceLabel(6)).toBe("语音识别");
    expect(micSourceLabel(1)).toBe("默认");
    expect(micSourceLabel(42)).toBe("源 42");

    expect(
      clipSummary({
        pcmBase64: "",
        sampleRate: 16000,
        samples: 48000,
        sourceUsed: 9,
        routedAddress: "back",
        preferredApplied: true,
        rms: 0.01,
        peak: 0.02,
        elapsedMs: 3000,
      }),
    ).toContain("实际路由：顶部麦克风（back） · 原声 · 3.0s");

    expect(
      clipSummary({
        pcmBase64: "",
        sampleRate: 16000,
        samples: 48000,
        sourceUsed: 7,
        routedAddress: "default",
        preferredApplied: true,
        rms: 0.01,
        peak: 0.02,
        elapsedMs: 3000,
        auto: true,
      }),
    ).toContain("实际路由：系统默认（未单独指定） · 系统处理 · 3.0s");
  });
});
