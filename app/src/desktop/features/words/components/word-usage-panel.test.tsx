import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordUsageStats } from "@/protocol/words";

const tauri = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordSetNote: vi.fn(),
  wordDelete: vi.fn(),
  wordGenerate: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

vi.mock("@/shared/lib/tauri", () => tauri);

import { useWordsStore } from "../words-store";
import { WordUsagePanel } from "./word-usage-panel";

const EMPTY = { calls: 0, promptTokens: 0, completionTokens: 0, costCnyMicros: 0 };

function makeUsage(overrides: Partial<WordUsageStats> = {}): WordUsageStats {
  return {
    today: {
      ...EMPTY,
      calls: 4,
      promptTokens: 700,
      completionTokens: 800,
      costCnyMicros: 2_746,
      ttsCalls: 4,
      ttsCharacters: 120,
      ttsCostCnyMicros: 1_200,
    },
    last30Days: {
      ...EMPTY,
      calls: 26,
      ttsCalls: 26,
      ttsCharacters: 3_400,
      ttsCostCnyMicros: 30_000,
    },
    days: [],
    priceNote: "按百炼价格估算。",
    ...overrides,
  };
}

beforeEach(() => {
  useWordsStore.getState().reset();
  vi.resetAllMocks();
});

afterEach(() => cleanup());

describe("WordUsagePanel 用量", () => {
  it("今日与近 30 天各显示一行语音合成：次数 · 字符 · 约 ¥", () => {
    useWordsStore.setState({ usage: makeUsage() });
    render(<WordUsagePanel />);

    expect(screen.getAllByText("语音合成")).toHaveLength(2);
    expect(screen.getByText(/4 次 · 120 字符 · 约 ¥0\.0012/)).toBeInTheDocument();
    expect(screen.getByText(/26 次 · 3,400 字符 · 约 ¥0\.03/)).toBeInTheDocument();
    expect(screen.getByText("估算 · 今日")).toBeInTheDocument();
    expect(screen.getByText("估算 · 近 30 天")).toBeInTheDocument();
  });

  it("旧数据没有 TTS 字段时按 0 显示", () => {
    useWordsStore.setState({
      usage: makeUsage({
        today: { ...EMPTY, calls: 4 },
        last30Days: { ...EMPTY, calls: 26 },
      }),
    });
    render(<WordUsagePanel />);

    expect(screen.getAllByText(/0 次 · 0 字符 · 约 ¥0\.00/)).toHaveLength(2);
  });
});
