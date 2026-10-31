export const AUDIO_MAGIC = new Uint8Array([0x53, 0x4b, 0x30, 0x31]);
export const AUDIO_VERSION = 1;
export const AUDIO_HEADER_LEN = 28;
export const MAX_FRAME_PAYLOAD = 64 * 1024;

export type AudioFrame = {
  session: string;
  sequence: number;
  flags: number;
  payload: Uint8Array;
};

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function sessionIdToBytes(session: string): Uint8Array | null {
  const compact = session.split("-").join("");
  if (compact.length !== 32 || !/^[0-9a-f]+$/i.test(compact)) return null;

  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) {
    bytes[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToSessionId(bytes: Uint8Array): string {
  const value = hex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

export function encodeAudioFrame(session: string, sequence: number, pcm: Uint8Array): ArrayBuffer {
  const sessionBytes = sessionIdToBytes(session);
  if (!sessionBytes) throw new Error("invalid session");
  if (pcm.byteLength > MAX_FRAME_PAYLOAD) throw new Error("frame too large");
  if (pcm.byteLength % 2 !== 0) throw new Error("pcm16 payload must be even");

  const buffer = new ArrayBuffer(AUDIO_HEADER_LEN + pcm.byteLength);
  const view = new DataView(buffer);
  view.setUint8(0, AUDIO_MAGIC[0]);
  view.setUint8(1, AUDIO_MAGIC[1]);
  view.setUint8(2, AUDIO_MAGIC[2]);
  view.setUint8(3, AUDIO_MAGIC[3]);
  view.setUint8(4, AUDIO_VERSION);
  view.setUint8(5, 0);
  view.setUint16(6, 0, false);
  new Uint8Array(buffer, 8, 16).set(sessionBytes);
  view.setUint32(24, sequence >>> 0, false);
  new Uint8Array(buffer, AUDIO_HEADER_LEN).set(pcm);
  return buffer;
}

export function parseAudioFrame(data: ArrayBuffer): AudioFrame | null {
  if (data.byteLength < AUDIO_HEADER_LEN) return null;
  const view = new DataView(data);
  for (let index = 0; index < 4; index += 1) {
    if (view.getUint8(index) !== AUDIO_MAGIC[index]) return null;
  }
  if (view.getUint8(4) !== AUDIO_VERSION) return null;

  const payloadLength = data.byteLength - AUDIO_HEADER_LEN;
  if (payloadLength > MAX_FRAME_PAYLOAD || payloadLength % 2 !== 0) return null;

  const session = bytesToSessionId(new Uint8Array(data, 8, 16));
  return {
    session,
    sequence: view.getUint32(24, false),
    flags: view.getUint8(5),
    payload: new Uint8Array(data, AUDIO_HEADER_LEN),
  };
}
