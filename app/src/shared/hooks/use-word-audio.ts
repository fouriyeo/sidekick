import { convertFileSrc } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeError, wordTts } from "@/shared/lib/tauri";

/** 朗读类型：单词读慢一点、句子自然语速（Rust 侧决定音色与语速）。 */
export type WordAudioKind = "word" | "sentence";

const ERROR_TEXT: Record<string, string> = {
  need_consent: "先同意隐私说明再朗读。",
  no_key: "还没有百炼 API Key，先在「语音」页配置。",
  not_paired: "手机还没有和电脑配对。",
  invalid_word: "这段内容不能朗读。",
  tts_too_long: "这段内容太长了，先缩短一点。",
  tts_timeout: "语音合成超时，稍后重试。",
  tts_failed: "语音合成失败，稍后重试。",
  speak_failed: "发音失败，稍后重试。",
};

function audioErrorText(error: unknown): string {
  const raw = normalizeError(error).trim();
  const code = raw.split(/[:\s]/)[0]?.toLowerCase() ?? "";
  return ERROR_TEXT[code] ?? (raw || "语音播放失败，稍后重试。");
}

export type WordAudioState = {
  /** 正在合成（还没开始播放）的文本；null 表示没有合成中的请求。 */
  pending: string | null;
  /** 正在朗读的文本；null 表示空闲。 */
  playing: string | null;
  error: string | null;
  /** 播放（同一文本再点一次会停止；合成中再点会取消）。`fallback` 时桌面已用系统语音朗读。 */
  play: (text: string, kind?: WordAudioKind) => Promise<void>;
  stop: () => void;
  clearError: () => void;
};

/**
 * 英语角朗读：合成走 Rust（qwen-audio-3.1-tts-plus + 本地缓存），
 * 前端只负责把本地音频路径转成可播放 URL 并管理播放状态。
 * 同一时刻只播一条；重复点同一条 = 停止/取消；用请求令牌丢弃过期结果，
 * 停止时先摘掉事件再清 src，避免 WebView 把主动停止误报成播放失败。
 */
export function useWordAudio(): WordAudioState {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef(0);
  const [pending, setPending] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    // 让所有在途请求的结果失效。
    requestRef.current += 1;
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
    }
    setPending(null);
    setPlaying(null);
  }, []);

  useEffect(
    () => () => {
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.src = "";
      }
    },
    [],
  );

  const play = useCallback(
    async (text: string, kind: WordAudioKind = "word") => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setError(null);
      // 同一条正在合成或正在播放：再点 = 停止/取消。
      if (pending === trimmed || playing === trimmed) {
        stop();
        return;
      }
      stop();
      const token = ++requestRef.current;
      setPending(trimmed);
      try {
        const result = await wordTts(trimmed, kind);
        if (requestRef.current !== token) return;
        setPending(null);
        // 桌面云端失败时已用系统 say 朗读，没有音频文件。
        if (result.fallback || !result.path) return;
        const audio = new Audio(convertFileSrc(result.path));
        audioRef.current = audio;
        setPlaying(trimmed);
        audio.onended = () => {
          if (requestRef.current !== token) return;
          setPlaying((current) => (current === trimmed ? null : current));
        };
        audio.onerror = () => {
          if (requestRef.current !== token) return;
          setPlaying(null);
          setError("语音播放失败，稍后重试。");
        };
        await audio.play();
      } catch (err) {
        if (requestRef.current !== token) return;
        setPending(null);
        setPlaying(null);
        setError(audioErrorText(err));
      }
    },
    [pending, playing, stop],
  );

  return {
    pending,
    playing,
    error,
    play,
    stop,
    clearError: () => setError(null),
  };
}
