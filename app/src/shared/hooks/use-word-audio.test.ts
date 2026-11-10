import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWordAudio } from "./use-word-audio";

const wordTts = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

vi.mock("@/shared/lib/tauri", () => ({
  wordTts: (...args: unknown[]) => wordTts(...args),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

type FakeAudio = {
  src: string;
  onended: (() => void) | null;
  onerror: (() => void) | null;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
};

const audioInstances: FakeAudio[] = [];

class MockAudio implements FakeAudio {
  src = "";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => undefined);
  pause = vi.fn(() => undefined);

  constructor(src?: string) {
    this.src = src ?? "";
    audioInstances.push(this);
  }
}

beforeEach(() => {
  audioInstances.length = 0;
  wordTts.mockReset();
  vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useWordAudio", () => {
  it("合成成功后进入播放态，路径走 convertFileSrc", async () => {
    wordTts.mockResolvedValue({
      path: "/tmp/a.mp3",
      characters: 5,
      cached: false,
      fallback: false,
    });
    const { result } = renderHook(() => useWordAudio());

    await act(async () => {
      await result.current.play("resilient", "word");
    });

    expect(wordTts).toHaveBeenCalledWith("resilient", "word");
    expect(result.current.pending).toBeNull();
    expect(result.current.playing).toBe("resilient");
    expect(result.current.error).toBeNull();
    expect(audioInstances).toHaveLength(1);
    expect(audioInstances[0].src).toContain("asset://localhost//tmp/a.mp3");
  });

  it("合成中再点同一条会取消，不重复合成、不报错", async () => {
    let resolveFirst: (value: unknown) => void = () => undefined;
    wordTts.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { result } = renderHook(() => useWordAudio());

    act(() => {
      void result.current.play("throughput", "word");
    });
    await waitFor(() => expect(result.current.pending).toBe("throughput"));

    await act(async () => {
      await result.current.play("throughput", "word");
    });
    expect(result.current.pending).toBeNull();
    expect(wordTts).toHaveBeenCalledTimes(1);

    // 迟到的结果被令牌丢弃：不创建播放器、不报错。
    await act(async () => {
      resolveFirst({ path: "/tmp/a.mp3", characters: 5, cached: false, fallback: false });
    });
    expect(result.current.playing).toBeNull();
    expect(result.current.error).toBeNull();
    expect(audioInstances).toHaveLength(0);
  });

  it("停止时先摘事件再清 src，不会把主动停止误报成播放失败", async () => {
    wordTts.mockResolvedValue({
      path: "/tmp/a.mp3",
      characters: 5,
      cached: false,
      fallback: false,
    });
    const { result } = renderHook(() => useWordAudio());

    await act(async () => {
      await result.current.play("resilient", "word");
    });
    const audio = audioInstances[0];
    expect(audio.onerror).not.toBeNull();

    act(() => {
      result.current.stop();
    });

    expect(result.current.playing).toBeNull();
    expect(result.current.error).toBeNull();
    expect(audio.onerror).toBeNull();
    expect(audio.onended).toBeNull();
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe("");
  });

  it("桌面系统兜底（fallback）不创建播放器", async () => {
    wordTts.mockResolvedValue({ path: "", characters: 0, cached: false, fallback: true });
    const { result } = renderHook(() => useWordAudio());

    await act(async () => {
      await result.current.play("resilient", "word");
    });

    expect(result.current.playing).toBeNull();
    expect(result.current.pending).toBeNull();
    expect(result.current.error).toBeNull();
    expect(audioInstances).toHaveLength(0);
  });

  it("合成失败映射成中文提示", async () => {
    wordTts.mockRejectedValue(new Error("tts_failed"));
    const { result } = renderHook(() => useWordAudio());

    await act(async () => {
      await result.current.play("resilient", "word");
    });

    expect(result.current.error).toBe("语音合成失败，稍后重试。");
    expect(result.current.pending).toBeNull();
  });
});
