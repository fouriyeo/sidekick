import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordUsageStats } from "@/protocol/words";

const api = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordDelete: vi.fn(),
  wordGenerate: vi.fn(),
  wordUsage: vi.fn(),
  wordStatus: vi.fn(),
  wordConsent: vi.fn(),
  wordSyncNow: vi.fn(),
}));

vi.mock("@/shared/lib/tauri", () => ({
  ...api,
  normalizeError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

import { WordUsage } from "./word-usage";
import { useWordsStore } from "./words-store";

function usage(): WordUsageStats {
  return {
    today: {
      calls: 2,
      promptTokens: 300,
      completionTokens: 200,
      costCnyMicros: 1200,
      ttsCalls: 2,
      ttsCharacters: 80,
      ttsCostCnyMicros: 400,
    },
    last30Days: {
      calls: 9,
      promptTokens: 1000,
      completionTokens: 900,
      costCnyMicros: 5800,
      ttsCalls: 7,
      ttsCharacters: 300,
      ttsCostCnyMicros: 1800,
    },
    days: [
      {
        date: "2026-11-09",
        calls: 2,
        promptTokens: 300,
        completionTokens: 200,
        costCnyMicros: 1200,
      },
    ],
    priceNote: "qwen3.8-flash · 估算（浏览器 mock）",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useWordsStore.getState().reset();
  api.wordUsage.mockResolvedValue(usage());
});

afterEach(cleanup);

describe("英语角用量页", () => {
  it("展示今日/近 30 天次数与估算花费", async () => {
    render(<WordUsage onBack={() => undefined} />);

    expect(await screen.findByText("今天")).toBeInTheDocument();
    expect(screen.getByText("近 30 天")).toBeInTheDocument();
    expect(screen.getAllByText("估算")).toHaveLength(2);
    expect(screen.getAllByText("<¥0.01")).toHaveLength(2);
    expect(screen.getByText("约 500 Token")).toBeInTheDocument();
    expect(screen.getByText("2026-11-09")).toBeInTheDocument();
    expect(screen.getByText(/qwen3.8-flash · 估算/)).toBeInTheDocument();
    // 语音合成单独一行，次数/字符/估算花费。
    expect(screen.getByText(/语音合成 2 次 · 80 字符/)).toBeInTheDocument();
    expect(screen.getByText(/语音合成 7 次 · 300 字符/)).toBeInTheDocument();
  });

  it("读取失败显示错误与重试", async () => {
    api.wordUsage.mockRejectedValue(new Error("timeout"));
    render(<WordUsage onBack={() => undefined} />);

    expect(await screen.findByText(/等太久没有回应/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
