import { describe, expect, it } from "vitest";
import {
  computeLevel,
  createSessionId,
  createStreamingResampler,
  floatToPcm16,
  pcmToBase64,
} from "./voice-recorder";

describe("voice recorder helpers", () => {
  it("creates RFC 4122 session ids", () => {
    expect(createSessionId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("converts float samples to clamped PCM16", () => {
    const pcm = floatToPcm16(new Float32Array([-2, -1, 0, 0.5, 1, 2]));
    expect(Array.from(pcm)).toEqual([-32768, -32768, 0, 16384, 32767, 32767]);
  });

  it("keeps phase across resampled chunks", () => {
    const resample = createStreamingResampler(48_000, 16_000);
    const first = resample(new Float32Array(2048).fill(0.5));
    const second = resample(new Float32Array(2048).fill(0.5));
    expect(first.length + second.length).toBeGreaterThan(1300);
    expect(first.length + second.length).toBeLessThan(1400);
    expect(Array.from(first).every((value) => Math.abs(value - 0.5) < 0.001)).toBe(true);
    expect(Array.from(second).every((value) => Math.abs(value - 0.5) < 0.001)).toBe(true);
  });

  it("passes samples through at the target rate", () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    expect(createStreamingResampler(16_000, 16_000)(input)).toBe(input);
  });

  it("computes a bounded level and base64 output", () => {
    expect(computeLevel(new Float32Array([0, 0, 0]))).toBe(0);
    expect(computeLevel(new Float32Array([1, -1, 1, -1]))).toBe(1);

    const pcm = floatToPcm16(new Float32Array([0, 0]));
    expect(atob(pcmToBase64(pcm)).length).toBe(4);
  });
});
