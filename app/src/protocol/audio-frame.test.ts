import { describe, expect, it } from "vitest";
import {
  AUDIO_HEADER_LEN,
  bytesToSessionId,
  encodeAudioFrame,
  parseAudioFrame,
  sessionIdToBytes,
} from "./audio-frame";

const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("audio frame", () => {
  it("round-trips the session id", () => {
    const bytes = sessionIdToBytes(SESSION);
    expect(bytes).not.toBeNull();
    expect(bytesToSessionId(bytes as Uint8Array)).toBe(SESSION);
    expect(sessionIdToBytes("nope")).toBeNull();
  });

  it("encodes and parses a PCM16 frame", () => {
    const payload = new Uint8Array([1, 0, 2, 0]);
    const frame = encodeAudioFrame(SESSION, 42, payload);
    expect(frame.byteLength).toBe(AUDIO_HEADER_LEN + payload.byteLength);

    const parsed = parseAudioFrame(frame);
    expect(parsed?.session).toBe(SESSION);
    expect(parsed?.sequence).toBe(42);
    expect(Array.from(parsed?.payload ?? [])).toEqual([1, 0, 2, 0]);
  });

  it("rejects invalid frames", () => {
    const frame = encodeAudioFrame(SESSION, 0, new Uint8Array([0, 0]));
    new Uint8Array(frame)[0] = 0x58;
    expect(parseAudioFrame(frame)).toBeNull();

    expect(() => encodeAudioFrame(SESSION, 0, new Uint8Array([1]))).toThrow("even");
    expect(() => encodeAudioFrame("bad", 0, new Uint8Array([0, 0]))).toThrow("invalid session");
  });
});
