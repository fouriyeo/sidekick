import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBackHandlers } from "@/mobile/system-back";
import type { WordDetail, WordSummary } from "@/protocol/words";

const api = vi.hoisted(() => ({
  wordList: vi.fn(),
  wordGet: vi.fn(),
  wordAdd: vi.fn(),
  wordExplain: vi.fn(),
  wordDelete: vi.fn(),
  wordExportMarkdown: vi.fn(),
  wordSetNote: vi.fn(),
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

import { WordReview } from "./word-review";

function summary(word: string, status: WordSummary["status"] = "ready"): WordSummary {
  return {
    id: word,
    word,
    status,
    source: "manual",
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now() - 60_000,
    firstDefinition: `${word} 的旧释义`,
  };
}

function detail(word: string): WordDetail {
  return {
    ...summary(word),
    firstDefinition: "第一条释义",
    explanation: {
      word,
      definitions: [{ zh: "第一条释义" }],
      examples: [{ en: "Example sentence.", zh: "例句翻译。" }],
    },
  };
}

const WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];

beforeEach(() => {
  vi.clearAllMocks();
  clearBackHandlers();
  api.wordGet.mockImplementation(async (word: string) => detail(word));
});

afterEach(() => {
  cleanup();
  clearBackHandlers();
});

describe("今天复习卡", () => {
  it("没有 ready 词时整卡隐藏", () => {
    render(<WordReview items={[summary("alpha", "pending")]} />);
    expect(screen.queryByRole("region", { name: "今天复习" })).toBeNull();
  });

  it("随机抽 5 个：看释义 → 下一个，5 个过完显示复习完成，可再来一组", async () => {
    render(<WordReview items={WORDS.map((word) => summary(word))} />);

    expect(screen.getByRole("region", { name: "今天复习" })).toBeInTheDocument();
    expect(screen.getByText("第 1 / 5 个")).toBeInTheDocument();

    for (let step = 0; step < 5; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "看释义" }));
      // 首条释义 + 第一条例句（详情异步回包）。
      expect(await screen.findByText("第一条释义")).toBeInTheDocument();
      expect(screen.getByText("Example sentence. · 例句翻译。")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "下一个" }));
    }

    expect(await screen.findByText("复习完成")).toBeInTheDocument();
    expect(screen.getByText("5 个词")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "再来一组" }));
    expect(screen.getByText("第 1 / 5 个")).toBeInTheDocument();
    expect(screen.queryByText("复习完成")).toBeNull();
  });

  it("释义读取失败按错误码提示，仍可继续下一个", async () => {
    api.wordGet.mockRejectedValue(new Error("timeout"));
    render(<WordReview items={WORDS.map((word) => summary(word))} />);

    fireEvent.click(screen.getByRole("button", { name: "看释义" }));
    expect(await screen.findByText(/等太久没有回应/)).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "下一个" }));
    });
    expect(screen.getByText("第 2 / 5 个")).toBeInTheDocument();
  });
});
