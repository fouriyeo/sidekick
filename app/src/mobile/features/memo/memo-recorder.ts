import { useCallback, useEffect, useRef, useState } from "react";
import type { MemoSummary } from "@/protocol/memo";
import {
  memoRecordingAppend,
  memoRecordingCancel,
  memoRecordingFinish,
  memoRecordingStart,
  normalizeError,
  setKeepScreenOn,
} from "@/shared/lib/tauri";

const TARGET_RATE = 16_000;
const CHUNK_SIZE = 2048;
const FLUSH_MS = 1000;
const MAX_MS = 2 * 60 * 60 * 1000;

export type MemoRecorderPhase = "idle" | "starting" | "recording" | "saving";

function pcmToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const chunk = 0x8000;
  for (let start = 0; start < bytes.length; start += chunk) {
    for (const byte of bytes.subarray(start, start + chunk)) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
}

/** 连续线性重采样，保留跨 chunk 相位；与语音输入同一套算法。 */
function createResampler(fromRate: number, toRate: number): (input: Float32Array) => Float32Array {
  if (fromRate === toRate) return (input) => input;
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

function toPcm16(samples: Float32Array): Int16Array {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    pcm[index] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
  }
  return pcm;
}

function levelOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.min(1, Math.sqrt(sum / samples.length) * 10);
}

type UseMemoRecorderOptions = {
  onSaved?: (memo: MemoSummary) => void;
  onError?: (message: string) => void;
};

export function useMemoRecorder(options: UseMemoRecorderOptions = {}) {
  const [phase, setPhase] = useState<MemoRecorderPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  /** 本次录音的峰值（0–1）；用于“太短且没声音”时丢弃。 */
  const [peak, setPeak] = useState(0);

  const sessionRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const partsRef = useRef<Int16Array[]>([]);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const phaseRef = useRef<MemoRecorderPhase>("idle");
  const peakRef = useRef(0);
  const mountedRef = useRef(true);
  const callbacksRef = useRef(options);

  callbacksRef.current = options;

  const setPhaseSafe = useCallback((next: MemoRecorderPhase) => {
    phaseRef.current = next;
    if (mountedRef.current) setPhase(next);
  }, []);

  const cleanupAudio = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const processor = processorRef.current;
    if (processor) processor.onaudioprocess = null;
    processor?.disconnect();
    sourceRef.current?.disconnect();
    gainRef.current?.disconnect();
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    const context = contextRef.current;
    processorRef.current = null;
    sourceRef.current = null;
    gainRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
    await context?.close().catch(() => undefined);
    void setKeepScreenOn(false).catch(() => undefined);
  }, []);

  const stopRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const queueFlush = useCallback(() => {
    const session = sessionRef.current;
    if (!session || partsRef.current.length === 0) return chainRef.current;
    const merged = partsRef.current.reduce((total, part) => total + part.length, 0);
    const pcm = new Int16Array(merged);
    let offset = 0;
    for (const part of partsRef.current) {
      pcm.set(part, offset);
      offset += part.length;
    }
    partsRef.current = [];
    const base64 = pcmToBase64(pcm);
    chainRef.current = chainRef.current
      .then(async () => {
        const result = await memoRecordingAppend(session, base64);
        if (result.reachedMax) {
          callbacksRef.current.onError?.("已达到单次录音上限（2 小时），正在保存");
          void stopRef.current();
        }
      })
      .catch((error: unknown) => {
        callbacksRef.current.onError?.(normalizeError(error));
        void stopRef.current();
      });
    return chainRef.current;
  }, []);

  const stopInternal = useCallback(
    async (save: boolean) => {
      if (phaseRef.current !== "recording") return;
      setPhaseSafe("saving");
      await queueFlush();
      await chainRef.current.catch(() => undefined);
      await cleanupAudio();
      const session = sessionRef.current;
      sessionRef.current = null;
      try {
        if (!save) {
          await memoRecordingCancel();
          return;
        }
        if (!session) return;
        const memo = await memoRecordingFinish();
        callbacksRef.current.onSaved?.(memo);
      } catch (error) {
        callbacksRef.current.onError?.(normalizeError(error));
      } finally {
        setPhaseSafe("idle");
        if (mountedRef.current) {
          setElapsedMs(0);
          setLevel(0);
          setPeak(0);
        }
      }
    },
    [cleanupAudio, queueFlush, setPhaseSafe],
  );

  const stop = useCallback(async () => {
    await stopInternal(true);
  }, [stopInternal]);

  const cancel = useCallback(async () => {
    await stopInternal(false);
  }, [stopInternal]);

  stopRef.current = stop;

  const start = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    setPhaseSafe("starting");
    let started: Awaited<ReturnType<typeof memoRecordingStart>> | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前设备不支持麦克风");
      started = await memoRecordingStart();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: TARGET_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      // 仅前台录音：权限弹窗/显卡等待期间用户可能已经切走，这时不要偷偷开录。
      if (document.hidden) {
        for (const track of stream.getTracks()) track.stop();
        await memoRecordingCancel().catch(() => undefined);
        setPhaseSafe("idle");
        callbacksRef.current.onError?.("需要保持 App 在前台才能录音");
        return;
      }
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
      const gain = context.createGain();
      gain.gain.value = 0;
      const resampler = createResampler(context.sampleRate, TARGET_RATE);

      sessionRef.current = started.sessionId;
      streamRef.current = stream;
      contextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      gainRef.current = gain;
      partsRef.current = [];
      chainRef.current = Promise.resolve();
      startedAtRef.current = performance.now();
      peakRef.current = 0;
      if (mountedRef.current) setPeak(0);

      processor.onaudioprocess = (event) => {
        if (phaseRef.current !== "recording") return;
        const input = event.inputBuffer.getChannelData(0);
        const nextLevel = levelOf(input);
        if (nextLevel > peakRef.current) peakRef.current = nextLevel;
        if (mountedRef.current) {
          setLevel(nextLevel);
          setPeak(peakRef.current);
        }
        const resampled = resampler(input);
        if (resampled.length === 0) return;
        partsRef.current.push(toPcm16(resampled));
      };

      const track = stream.getAudioTracks()[0];
      track?.addEventListener("ended", () => {
        void stopRef.current();
      });

      source.connect(processor);
      processor.connect(gain);
      gain.connect(context.destination);

      void setKeepScreenOn(true).catch(() => undefined);
      setPhaseSafe("recording");
      timerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAtRef.current;
        if (mountedRef.current) setElapsedMs(elapsed);
        if (elapsed >= MAX_MS) {
          callbacksRef.current.onError?.("已达到单次录音上限（2 小时），正在保存");
          void stopRef.current();
          return;
        }
        void queueFlush();
      }, FLUSH_MS);
    } catch (error) {
      if (started) {
        await memoRecordingCancel().catch(() => undefined);
      }
      await cleanupAudio();
      setPhaseSafe("idle");
      callbacksRef.current.onError?.(normalizeError(error));
    }
  }, [cleanupAudio, queueFlush, setPhaseSafe]);

  useEffect(() => {
    mountedRef.current = true;
    const onVisibility = () => {
      if (document.hidden && phaseRef.current === "recording") {
        void stopRef.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (phaseRef.current === "recording") {
        void stopRef.current();
      }
    };
  }, []);

  return { phase, elapsedMs, level, peak, start, stop, cancel };
}
